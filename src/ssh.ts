import { connect, type Socket } from 'cloudflare:sockets';

/**
 * Cloudflare Worker 直连 SSH 客户端（零依赖）：
 * - TCP：cloudflare:sockets connect()
 * - KEX：curve25519-sha256（WebCrypto X25519）
 * - 主机密钥：ssh-ed25519（WebCrypto Ed25519 验签，SHA256 指纹 TOFU）
 * - 加密：aes256-gcm@openssh.com / aes128-gcm（RFC 5647 SSH AEAD）
 * - 认证：password / keyboard-interactive / ssh-ed25519 公钥（OpenSSH 私钥格式解析）
 * - 通道：session + exec 单命令
 *
 * 限制：服务器需支持 curve25519 KEX、ssh-ed25519 主机密钥与 GCM AEAD（OpenSSH 7.x+ 默认均支持）。
 */

export type SshAuth = { kind: 'password'; password: string } | { kind: 'key'; privateKey: string };

export interface SshConfig {
  host: string;
  port: number;
  user: string;
  auth: SshAuth;
  /** 已记录的主机指纹（SHA256:xxx）；不传则首次连接 TOFU 接受并返回指纹 */
  expectedFingerprint?: string;
  timeoutMs?: number;
  /** 外部中断信号（用户 Ctrl+C 时立即关闭 SSH 会话） */
  signal?: AbortSignal;
  /** 诊断模式：失败时附带回包 hex（调试用） */
  debug?: boolean;
}

export interface SshExecResult {
  code: number;
  stdout: string;
  stderr: string;
  /** 本次连接实际见到的主机指纹（供 TOFU 记录） */
  hostFingerprint: string;
}

const MAX_OUTPUT = 256 * 1024;
const TE = new TextEncoder();
const TD = new TextDecoder();

/** 字节序列（兼容 ArrayBufferLike 来源，如流式读取） */
type Bytes = Uint8Array<ArrayBufferLike>;
/** 自有 ArrayBuffer 的字节序列（new Uint8Array 产物） */
type OwnedBytes = Uint8Array<ArrayBuffer>;
/** WebCrypto 密钥类型（不直接引用 CryptoKey 名字，兼容 Node/@types 与 Workers lib 两套声明） */
type SubtleKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

/* ---------- 字节工具 ---------- */

function u32(n: number): OwnedBytes {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, false);
  return b;
}

function readU32(b: Bytes, off = 0): number {
  return new DataView(b.buffer, b.byteOffset + off, 4).getUint32(0, false);
}

function concat(...parts: Bytes[]): OwnedBytes {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function str(s: string | Bytes): OwnedBytes {
  const bytes = typeof s === 'string' ? TE.encode(s) : s;
  return concat(u32(bytes.length), bytes);
}

/** mpint 编码：字节按大端整数解释，去前导零，最高位为 1 时补 0x00（paramiko/babeld 语义） */
function mpintFromBytes(x: Bytes): OwnedBytes {
  let be = new Uint8Array(x);
  while (be.length > 1 && be[0] === 0) be = be.slice(1);
  if ((be[0]! & 0x80) !== 0) be = concat(new Uint8Array([0]), be);
  return be;
}

function base64Decode(s: string): Uint8Array {
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let bits = 0;
  let acc = 0;
  const out: number[] = [];
  for (const ch of s) {
    if (ch === '=' || /\s/.test(ch)) continue;
    const v = ALPHA.indexOf(ch);
    if (v < 0) throw new Error('非法的 base64 内容');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function base64NoPad(bytes: Uint8Array): string {
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += ALPHA[b0 >> 2]! + ALPHA[((b0 & 3) << 4) | (b1 >> 4)]!;
    out += i + 1 < bytes.length ? ALPHA[((b1 & 15) << 2) | (b2 >> 6)]! : '';
    out += i + 2 < bytes.length ? ALPHA[b2 & 63]! : '';
  }
  return out;
}

async function sha256(...parts: Bytes[]): Promise<OwnedBytes> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', concat(...parts)));
}

/** SSH KDF：HASH(K || H || letter || session_id)，取前 length 字节 */
async function kdf(K: Bytes, H: Bytes, letter: string, length: number): Promise<OwnedBytes> {
  const h = await sha256(K, H, TE.encode(letter), H);
  return h.slice(0, length) as OwnedBytes;
}

/* ---------- 缓冲读取 ---------- */

class ByteReader {
  private queue: Bytes = new Uint8Array(0);
  private done = false;
  private error: Error | null = null;
  private waiters: (() => void)[] = [];

  constructor(private reader: ReadableStreamDefaultReader<Uint8Array>) {}

  start(): void {
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await this.reader.read();
          if (done) break;
          if (value.length) {
            this.queue = this.queue.length ? concat(this.queue, value) : value;
            for (const w of this.waiters) w();
            this.waiters = [];
          }
        }
      } catch (e) {
        this.error = e instanceof Error ? e : new Error(String(e));
      } finally {
        this.done = true;
        for (const w of this.waiters) w();
        this.waiters = [];
      }
    })();
  }

  async readExactly(n: number): Promise<Bytes> {
    while (this.queue.length < n) {
      if (this.done) {
        if (this.error) throw this.error;
        throw new Error('SSH 连接意外关闭');
      }
      await new Promise<void>((resolvePromise) => this.waiters.push(resolvePromise));
    }
    const out = this.queue.slice(0, n);
    this.queue = this.queue.slice(n);
    return out;
  }

  async readU32(): Promise<number> {
    return readU32(await this.readExactly(4));
  }
}

/* ---------- OpenSSH 私钥解析 ---------- */

function parseOpenSshPrivateKey(pem: string): { seed: OwnedBytes } {
  const body = pem
    .replace(/-----BEGIN OPENSSH PRIVATE KEY-----/, '')
    .replace(/-----END OPENSSH PRIVATE KEY-----/, '')
    .trim();
  const raw = base64Decode(body);
  let off = 0;
  const readStr = (): Uint8Array => {
    const len = readU32(raw, off);
    off += 4;
    const s = raw.slice(off, off + len);
    off += len;
    return s;
  };
  if (TD.decode(raw.slice(off, off + 15)) !== 'openssh-key-v1\0') throw new Error('不是 OpenSSH 私钥格式');
  off += 15;
  const cipher = TD.decode(readStr());
  const kdfName = TD.decode(readStr());
  if (cipher !== 'none' || kdfName !== 'none') throw new Error('私钥已加密（请使用无 passphrase 的密钥）');
  readStr(); // kdfoptions
  const numKeys = readU32(raw, off);
  off += 4;
  if (numKeys !== 1) throw new Error('仅支持单密钥文件');
  readStr(); // public key blob
  const priv = readStr();
  let p = 8; // 跳过两个 checkint
  const readPrivStr = (): Uint8Array => {
    const len = readU32(priv, p);
    p += 4;
    const s = priv.slice(p, p + len);
    p += len;
    return s;
  };
  const keyType = TD.decode(readPrivStr());
  if (keyType !== 'ssh-ed25519') throw new Error(`不支持的密钥类型: ${keyType}（仅支持 ssh-ed25519）`);
  readPrivStr(); // public
  const seedPub = readPrivStr(); // 64 字节: seed(32) || pub(32)
  if (seedPub.length !== 64) throw new Error('私钥结构异常');
  return { seed: new Uint8Array(seedPub.slice(0, 32)) };
}

/* ---------- SSH 会话核心 ---------- */

type PacketHandler = (payload: Uint8Array) => void;

class SshSession {
  private sock: Socket;
  readonly reader: ByteReader;
  readonly writer: WritableStreamDefaultWriter<Uint8Array>;
  private c2sSeq = 0;
  private s2cSeq = 0;
  private encKey: SubtleKey | null = null;
  private encIv: Uint8Array | null = null;
  private decKey: SubtleKey | null = null;
  private decIv: Uint8Array | null = null;
  private handlers = new Map<number, PacketHandler[]>();
  private buffered = new Map<number, Uint8Array[]>();
  private pending = new Map<number, { resolve: (p: Uint8Array) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private closed = false;
  sessionId = new Uint8Array(0);
  /** GCM nonce 约定（OpenSSH 9.x cipher.c + OpenSSL EVP 实测语义）：
   *  EVP_CTRL_GCM_SET_IV_FIXED(-1) 拷贝整个 12 字节 IV，每次包处理 EVP_CTRL_GCM_IV_GEN
   *  后对 IV 末 8 字节做 64 位大端自增——即 RFC 5647：fixed(4) || counter(8)，按包递增。
   *  fixed8+counter4 方案保留给未知实现兜底。以服务器 banner 区分 */
  opensslGcm = false;
  private c2sBlocks = 0;
  private s2cBlocks = 0;

  /** 收到服务器 NEWKEYS 后，在解密密钥装好前到达的加密包必须等待（否则会被当明文解析） */
  expectEncrypted = false;
  private decReady: Promise<void> = Promise.resolve();
  private resolveDecReady: () => void = () => {};
  /* 诊断字段：GCM 解密失败时随错误信息带回 */
  dbgH: Bytes = new Uint8Array(0);
  dbgK: Bytes = new Uint8Array(0);
  dbgShared: Bytes = new Uint8Array(0);
  dbgERaw: Bytes = new Uint8Array(0);
  dbgF: Bytes = new Uint8Array(0);

  constructor(cfg: SshConfig) {
    this.sock = connect({ hostname: cfg.host, port: cfg.port }, { secureTransport: 'off' });
    this.reader = new ByteReader(this.sock.readable.getReader());
    this.reader.start();
    this.writer = this.sock.writable.getWriter();
    // nonce 约定自适应：等待首个认证通过的 s2c 解密来锁定
    this.nonceLatched = new Promise((resolve) => {
      this.latchNonce = resolve;
    });
    this.decReady = new Promise((resolve) => {
      this.resolveDecReady = resolve;
    });
  }

  /** 版本交换完成后启动收包循环（不能在构造时启动：会把服务器 banner 当成包长度） */
  startRecvLoop(): void {
    if (this.loopStarted) return;
    this.loopStarted = true;
    void this.recvLoop();
  }

  private loopStarted = false;

  /** 注册一个永久监听；返回 disposer 用于移除。等待器（waitFor/waitAny）必须用 disposer
   *  在完成/超时时移除自身，否则会吃掉后续同类型包 */
  on(type: number, handler: PacketHandler): () => void {
    const arr = this.handlers.get(type);
    if (arr) arr.push(handler);
    else this.handlers.set(type, [handler]);
    return () => {
      const cur = this.handlers.get(type);
      if (!cur) return;
      const i = cur.indexOf(handler);
      if (i >= 0) cur.splice(i, 1);
      if (cur.length === 0) this.handlers.delete(type);
    };
  }

  /** 等待一个类型的包；返回 payload（不含 type 字节）。到达早于注册的包会被缓冲而不是丢弃 */
  waitFor(type: number, timeoutMs: number): Promise<Uint8Array> {
    const early = this.buffered.get(type);
    if (early && early.length) return Promise.resolve(early.shift()!);
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error('SSH 会话已关闭'));
        return;
      }
      let off = (): void => {};
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = (): void => {
        if (done) return;
        done = true;
        if (timer !== undefined) clearTimeout(timer);
        off();
        this.pending.delete(type);
      };
      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`SSH 响应超时 (msg=${type})`));
      }, timeoutMs);
      this.pending.set(type, { resolve, reject, timer });
      off = this.on(type, (p) => {
        if (done) return;
        cleanup();
        resolve(p);
      });
      // 二次查缓冲：封包可能落在「初查」与「注册」之间被缓冲（消除竞态）
      const again = this.buffered.get(type);
      if (again && again.length && !done) {
        cleanup();
        resolve(again.shift()!);
      }
    });
  }

  /** 等待若干类型中的任意一个（竞态自动清理；同样先查缓冲） */
  waitAny(types: number[], timeoutMs: number): Promise<{ type: number; payload: Uint8Array }> {
    for (const t of types) {
      const early = this.buffered.get(t);
      if (early && early.length) return Promise.resolve({ type: t, payload: early.shift()! });
    }
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error('SSH 会话已关闭'));
        return;
      }
      const offs: (() => void)[] = [];
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = (): void => {
        if (done) return;
        done = true;
        if (timer !== undefined) clearTimeout(timer);
        for (const off of offs) off();
        for (const t of types) this.pending.delete(t);
      };
      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`SSH 响应超时 (msg∈[${types.join(',')}])`));
      }, timeoutMs);
      for (const t of types) {
        this.pending.set(t, {
          resolve: (p: Uint8Array) => {
            if (done) return;
            cleanup();
            resolve({ type: t, payload: p });
          },
          reject,
          timer,
        });
        offs.push(
          this.on(t, (p) => {
            if (done) return;
            cleanup();
            resolve({ type: t, payload: p });
          }),
        );
      }
      // 二次查缓冲：封包可能落在「初查」与「注册」之间被缓冲（消除竞态）
      for (const t of types) {
        const again = this.buffered.get(t);
        if (again && again.length && !done) {
          cleanup();
          resolve({ type: t, payload: again.shift()! });
          break;
        }
      }
    });
  }

  private failAll(e: Error): void {
    for (const [, w] of this.pending) {
      clearTimeout(w.timer);
      w.reject(e);
    }
    this.pending.clear();
  }

  private async recvLoop(): Promise<void> {
    try {
      for (;;) {
        const len = await this.reader.readU32();
        // 服务器 NEWKEYS 后：等解密密钥就绪再消费密文（EXT_INFO 可能先于 installDecKey 到达）
        if (this.expectEncrypted && !this.decKey) await this.decReady;
        if (this.decKey && this.decIv) {
          const ct = new Uint8Array(await this.reader.readExactly(len + 16));
          // nonce 约定自适应：尝试候选方案，首个通过 GCM 认证的即锁定（OpenSSH 与 babeld 的
          // GCM nonce 布局不同且无法从协商得知，只能实测）
          const candidates =
            this.nonceScheme === 'auto'
              ? this.opensslGcm
                ? (['rfc5647', 'openssl-init-blocks', 'openssl-zero-blocks'] as const)
                : (['rfc5647', 'openssl-init-blocks', 'openssl-zero-blocks'] as const)
              : [this.nonceScheme];
          let pt: Uint8Array | null = null;
          let lastErr: unknown = null;
          for (let attempt = 0; attempt < 6 && !pt; attempt++) {
            const scheme = candidates[attempt % candidates.length]!;
            this.nonceOffset = Math.floor(attempt / candidates.length);
            try {
              const nonce = this.nonce('recv', this.decIv, scheme);
              pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: u32(len) }, this.decKey, ct));
              if (this.nonceScheme === 'auto') {
                this.nonceScheme = scheme;
                this.latchNonce();
              }
            } catch (e) {
              lastErr = e;
            }
          }
          this.nonceOffset = 0;
          if (!pt) {
            const err = lastErr instanceof Error ? lastErr : new Error(String(lastErr));
            // 诊断：把 KDF 输入与首个密文带回，便于本地复算定位（仅出错时附加）
            try {
              err.message += ` [gcm-dbg] len=${len} ct=${hex(ct.slice(0, 48))} decIv=${hex(this.decIv!)}` +
                ` H=${hex(this.dbgH)} K=${hex(this.dbgK)} shared=${hex(this.dbgShared)} e=${hex(this.dbgERaw)} f=${hex(this.dbgF)}`;
            } catch {
              /* ignore */
            }
            throw err;
          }
          this.s2cSeq++;
          this.s2cBlocks += (ct.length - 16) / 16;
          this.dispatch(pt);
        } else {
          const block = await this.reader.readExactly(len);
          this.dispatch(block);
        }
      }
    } catch (e) {
      if (!this.closed) this.failAll(e instanceof Error ? e : new Error(String(e)));
    }
  }

  private dispatch(block: Uint8Array): void {
    const padlen = block[0]!;
    const payload = block.slice(1, block.length - padlen);
    if (payload.length === 0) return;
    const type = payload[0]!;
    // 服务器 NEWKEYS 一到，后续包必然加密（下一轮 readU32 之前就要生效，避免竞态）
    if (type === 21) this.expectEncrypted = true;
    const hs = this.handlers.get(type);
    if (hs && hs.length > 0) {
      for (const h of [...hs]) h(payload.slice(1));
    } else {
      // 无等待者：缓冲（KEXINIT 等可能在注册等待前就到达）
      const arr = this.buffered.get(type) ?? [];
      arr.push(payload.slice(1));
      this.buffered.set(type, arr);
    }
  }

  private nonce(dir: 'send' | 'recv', iv: Uint8Array, scheme = this.nonceScheme): OwnedBytes {
    const n = new Uint8Array(12);
    const offset = this.nonceOffset;
    if (scheme === 'openssl-init-blocks' || scheme === 'openssl-zero-blocks') {
      // OpenSSH/OpenSSL：fixed(8) || counter(4)；计数器按 16 字节块递增
      n.set(iv.slice(0, 8), 0);
      const base = scheme === 'openssl-init-blocks' ? readU32(iv, 8) : 0;
      const blocks = dir === 'send' ? this.c2sBlocks : this.s2cBlocks;
      n.set(u32((base + blocks + offset) >>> 0), 8);
      return n;
    }
    // RFC 5647：fixed(4) || counter(8)；计数器初值 = IV 后 8 字节，每包递增
    n.set(iv.slice(0, 4), 0);
    const base =
      BigInt(iv[4]!) * 2n ** 56n +
      BigInt(iv[5]!) * 2n ** 48n +
      BigInt(iv[6]!) * 2n ** 40n +
      BigInt(iv[7]!) * 2n ** 32n +
      BigInt(iv[8]!) * 2n ** 24n +
      BigInt(iv[9]!) * 2n ** 16n +
      BigInt(iv[10]!) * 2n ** 8n +
      BigInt(iv[11]!);
    const counter = base + BigInt(dir === 'send' ? this.c2sSeq : this.s2cSeq) + BigInt(offset);
    new DataView(n.buffer).setBigUint64(4, counter, false);
    return n;
  }

  /** nonce 计数器偏移（自适应阶段尝试 0/1/2） */
  nonceOffset = 0;

  /** nonce 约定：未知时由首个认证通过的 s2c 解密锁定；c2s 加密复用同一约定 */
  nonceScheme: 'auto' | 'rfc5647' | 'openssl-init-blocks' | 'openssl-zero-blocks' = 'auto';
  nonceLatched: Promise<void> = Promise.resolve();
  private latchNonce: () => void = () => {};

  async send(type: number, payload: Uint8Array): Promise<void> {
    // 包体 = type 字节 + payload
    const body = new Uint8Array(1 + payload.length);
    body[0] = type;
    body.set(payload, 1);
    // 填充对齐（RFC 4253：总长含 4 字节长度字段必须是块大小的倍数）：
    // 明文包块大小 8 → 包体 ≡ 4 (mod 8)；GCM 加密包明文为 16 的倍数 → 包体 ≡ 0 (mod 16)；填充至少 4
    if (this.encKey && this.encIv) {
      let padlen = 4;
      while ((1 + body.length + padlen) % 16 !== 0) padlen++;
      this.writePlain(type, body, padlen);
    } else {
      let padlen = 4;
      while ((1 + body.length + padlen) % 8 !== 4) padlen++;
      this.writePlain(type, body, padlen);
    }
  }

  private async writePlain(type: number, body: Uint8Array, padlen: number): Promise<void> {
    void type;
    const plain = new Uint8Array(1 + body.length + padlen);
    plain[0] = padlen;
    plain.set(body, 1);
    if (this.encKey && this.encIv) {
      const len = u32(plain.length);
      const nonce = this.nonce('send', this.encIv);
      this.c2sSeq++;
      this.c2sBlocks += plain.length / 16;
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: len }, this.encKey, plain));
      await this.writer.write(concat(len, ct));
    } else {
      await this.writer.write(concat(u32(plain.length), plain));
    }
  }

  /** 发送 NEWKEYS 后立刻启用 c2s 加密 */
  async installEncKey(K: Uint8Array, H: Uint8Array): Promise<void> {
    const key = await kdf(K, H, 'C', 32);
    const iv = await kdf(K, H, 'A', 12);
    this.encKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
    this.encIv = iv;
  }

  /** 收到服务器 NEWKEYS 后启用 s2c 解密 */
  async installDecKey(K: Uint8Array, H: Uint8Array): Promise<void> {
    const key = await kdf(K, H, 'D', 32);
    const iv = await kdf(K, H, 'B', 12);
    this.decKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
    this.decIv = iv;
    this.resolveDecReady();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.writer.close();
    } catch {
      /* ignore */
    }
    try {
      this.sock.close();
    } catch {
      /* ignore */
    }
    this.failAll(new Error('SSH 会话已关闭'));
  }
}

/* ---------- 主流程 ---------- */

const CLIENT_VERSION = 'SSH-2.0-meowfish_cloud';

async function readServerBanner(reader: ByteReader): Promise<Uint8Array> {
  const buf: number[] = [];
  for (;;) {
    const b = await reader.readExactly(1);
    if (b[0] === 0x0a) break;
    buf.push(b[0]!);
  }
  while (buf.length && buf[buf.length - 1] === 0x0d) buf.pop();
  return new Uint8Array(buf);
}

function kexNameLists(payload: Uint8Array): string[] {
  const out: string[] = [];
  let off = 16;
  for (let i = 0; i < 10; i++) {
    const len = readU32(payload, off);
    off += 4;
    out.push(TD.decode(payload.slice(off, off + len)));
    off += len;
  }
  return out;
}

function pickAlgorithm(clientList: string[], serverList: string): string | null {
  for (const c of clientList) if (serverList.split(',').includes(c)) return c;
  return null;
}

function hex(b: Bytes | Uint8Array): string {
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** 解析 server DISCONNECT(1) 的 reason 描述 */
function disconnectReason(payload: Uint8Array): string {
  try {
    if (payload.length < 4) return '';
    const len = readU32(payload, 4);
    return TD.decode(payload.slice(8, 8 + len));
  } catch {
    return '';
  }
}

export async function sshExec(cfg: SshConfig, command: string): Promise<SshExecResult> {
  const timeoutMs = cfg.timeoutMs ?? 60_000;
  const sess = new SshSession(cfg);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const watchdog = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(normalizeError(`SSH 操作超时（${Math.round(timeoutMs / 1000)}s）`)), timeoutMs);
  });
  // 外部中断（如用户 Ctrl+C）：立即关闭会话
  const onAbort = (): void => {
    void sess.close();
  };
  cfg.signal?.addEventListener('abort', onAbort, { once: true });

  // 主流程挂 catch，避免竞态落败方产生 unhandled rejection（否则 workerd 会泄露 "Stream was cancelled."）
  const flow = handshakeAndExec(sess, cfg, command, timeoutMs);
  flow.catch(() => {
    /* 竞态落败方：错误已由 watchdog / 主路径汇报 */
  });
  try {
    return await Promise.race([flow, watchdog]);
  } catch (e) {
    throw normalizeError(e instanceof Error ? e.message : String(e));
  } finally {
    cfg.signal?.removeEventListener('abort', onAbort);
    if (timer) clearTimeout(timer);
    await sess.close();
  }
}

/** 把底层晦涩的流错误归一化为可读文案 */
function normalizeError(msg: string): Error {
  if (/stream was cancelled|Stream was cancelled/i.test(msg)) return new Error('（连接被中断，请重试）');
  if (/aborted|abort/i.test(msg) && !/超时/.test(msg)) return new Error('（操作已中断）');
  return new Error(msg);
}

async function handshakeAndExec(sess: SshSession, cfg: SshConfig, command: string, timeoutMs: number): Promise<SshExecResult> {
  // 认证步可能较慢（服务器密码防爆破延迟可达 10s+），每步至少 10s；包一到立即继续，上限只兜底
  const step = Math.max(10_000, Math.floor(timeoutMs / 3));
  // 阶段标记：失败时把「断在哪一步」带进错误信息（诊断用）
  let phase = 'tcp-connect';

  try {
    // 服务器断开时给出可读错误
    sess.on(1, (p) => {
      const reason = disconnectReason(p);
      throw new Error(`服务器断开连接${reason ? `: ${reason}` : ''}`);
    });

    /* 1. 版本交换 */
    await sess.writer.write(TE.encode(`${CLIENT_VERSION}\r\n`));
    phase = 'banner';
    const serverBanner = await readServerBanner(sess.reader);
    sess.startRecvLoop();
    // GCM nonce：OpenSSH(OpenSSL EVP) 与 RFC 5647 实现同为 fixed(4)+counter(8) 按包递增；
    // 若自动锁定失败则统一按 RFC 5647 处理
    sess.opensslGcm = TD.decode(serverBanner).startsWith('SSH-2.0-OpenSSH');

    /* 2. KEXINIT */
    const cookie = new Uint8Array(16);
    crypto.getRandomValues(cookie);
    const nameList = (...names: string[]) => {
      const s = names.join(',');
      return concat(u32(s.length), TE.encode(s));
    };
    const kexInit = concat(
      cookie,
      nameList('curve25519-sha256', 'curve25519-sha256@libssh.org', 'ext-info-c', 'kex-strict-c-v00@openssh.com'),
      nameList('ssh-ed25519'),
      nameList('aes256-gcm@openssh.com', 'aes128-gcm@openssh.com'),
      nameList('aes256-gcm@openssh.com', 'aes128-gcm@openssh.com'),
      nameList('hmac-sha2-256'),
      nameList('hmac-sha2-256'),
      nameList('none', 'zlib@openssh.com', 'zlib'),
      nameList('none', 'zlib@openssh.com', 'zlib'),
      nameList(''),
      nameList(''),
      new Uint8Array([0]),
      u32(0),
    );
    await sess.send(20, kexInit);
    phase = 'kexinit';
    const serverKex = await sess.waitFor(20, step);
    const sLists = kexNameLists(serverKex);
    if (!pickAlgorithm(['curve25519-sha256', 'curve25519-sha256@libssh.org'], sLists[0]!)) throw new Error('服务器不支持 curve25519 KEX');
    if (!pickAlgorithm(['ssh-ed25519'], sLists[1]!)) throw new Error('服务器主机密钥不支持 ssh-ed25519（请用 OpenSSH 7.4+ 默认配置）');
    if (!pickAlgorithm(['aes256-gcm@openssh.com', 'aes128-gcm@openssh.com'], sLists[2]!)) throw new Error('服务器不支持 GCM 加密');
    // 严格 KEX（双方都声明 kex-strict-*-v00@openssh.com 时启用）：NEWKEYS 后序列号归零
    const strictKex = sLists[0]!.includes('kex-strict-s-v00@openssh.com');

  /* 3. X25519 + KEX_ECDH_REPLY */
  const pair = (await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])) as unknown as { publicKey: SubtleKey; privateKey: SubtleKey };
  const eRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  await sess.send(30, str(eRaw));
  phase = 'kex-reply';
  const reply = await sess.waitFor(31, step);

  let off = 0;
  const readReplyStr = (): Uint8Array => {
    const len = readU32(reply, off);
    off += 4;
    const s = reply.slice(off, off + len);
    off += len;
    return s;
  };
  const kS = readReplyStr();
  const f = readReplyStr();
  const sigBlob = readReplyStr();

  const kAlgLen = readU32(kS);
  const kAlg = TD.decode(kS.slice(4, 4 + kAlgLen));
  const kKeyLen = readU32(kS, 4 + kAlgLen);
  const hostKey = new Uint8Array(kS.slice(8 + kAlgLen, 8 + kAlgLen + kKeyLen));
  if (kAlg !== 'ssh-ed25519') throw new Error(`服务器主机密钥算法 ${kAlg} 暂不支持（仅支持 ssh-ed25519 主机密钥）`);

  const fingerprint = `SHA256:${base64NoPad(await sha256(kS))}`;
  if (cfg.expectedFingerprint && cfg.expectedFingerprint !== fingerprint) {
    throw new Error(`主机指纹不匹配！预期 ${cfg.expectedFingerprint}，实际 ${fingerprint}（可能是中间人攻击或服务器重装）`);
  }

  const serverPub = await crypto.subtle.importKey('raw', new Uint8Array(f), { name: 'X25519' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'X25519', public: serverPub }, pair.privateKey, 256));
  // 交换哈希（paramiko/babeld 实测语义，已用真实服务器签名验证）：
  // - 所有字段均为带长度前缀的字符串（含版本串）
  // - I_C / I_S 是完整 KEXINIT 消息（含消息类型字节 0x14）
  // - K 为完整 mpint 编码（字节按大端整数解释，去前导零，最高位补零）
  const K = str(mpintFromBytes(shared));
  const H = await sha256(
    str(TE.encode(CLIENT_VERSION)),
    str(serverBanner),
    str(concat(new Uint8Array([20]), kexInit)),
    str(concat(new Uint8Array([20]), serverKex)),
    str(kS),
    str(eRaw),
    str(f),
    K,
  );

  const sigAlgLen = readU32(sigBlob);
  const sigAlg = TD.decode(sigBlob.slice(4, 4 + sigAlgLen));
  const sigLen = readU32(sigBlob, 4 + sigAlgLen);
  const sig = new Uint8Array(sigBlob.slice(8 + sigAlgLen, 8 + sigAlgLen + sigLen));
  if (sigAlg !== 'ssh-ed25519' && sigAlg !== '') throw new Error(`不支持的主机签名算法: ${sigAlg}`);
  const hostPub = await crypto.subtle.importKey('raw', hostKey, { name: 'Ed25519' }, false, ['verify']);
  if (!(await crypto.subtle.verify({ name: 'Ed25519' }, hostPub, sig, H))) {
    const dbg = cfg.debug
      ? ` dbg={H:${hex(H)},VS:${hex(serverBanner)},IC:${hex(kexInit)},IS:${hex(serverKex)},KS:${hex(kS)},e:${hex(eRaw)},f:${hex(f)},K:${hex(shared)},sig:${hex(sig)}}`
      : '';
    throw new Error(`主机签名验证失败（指纹 ${fingerprint}，可能被中间人攻击）${dbg}`);
  }

  sess.sessionId = H;
  sess.dbgH = H;
  sess.dbgK = K;
  sess.dbgShared = shared;
  sess.dbgERaw = eRaw;
  sess.dbgF = f;

  /* 4. NEWKEYS：发完即切 c2s 加密；收到对端 NEWKEYS 后再切 s2c 解密。
     注意：严格 KEX 会重置「包序列号」，但 OpenSSH 的 GCM nonce 计数器（OpenSSL 内部 IV 计数器）
     跨 NEWKEYS 持续递增、不重置——我们 c2sSeq/s2cSeq 直接充当该计数器，因此不做重置。 */
  await sess.send(21, new Uint8Array(0));
  await sess.installEncKey(K, H);
  void strictKex;
  phase = 'newkeys';
  await sess.waitFor(21, step);
  sess.expectEncrypted = true;
  await sess.installDecKey(K, H);

  /* 5. 服务请求 + 认证 */
  // 先等服务器首个加密包（EXT_INFO 等）锁定 nonce 约定，再发 SERVICE_REQUEST（c2s 加密需要它）
  await Promise.race([sess.nonceLatched, new Promise((r) => setTimeout(r, 3000))]);
  if (sess.nonceScheme === 'auto') sess.nonceScheme = 'rfc5647';
  await sess.send(5, str('ssh-userauth'));
  phase = 'service-accept';
  await sess.waitFor(6, step);
  phase = 'auth';
  await authenticate(sess, cfg, step);

  /* 6. exec 通道 */
  phase = 'exec';
  return await execChannel(sess, command, step, fingerprint);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 附加阶段上下文，便于定位（连接被服务器关闭时尤为关键）
    throw new Error(`[${phase}] ${msg}`);
  }
}

async function authMethods(sess: SshSession, step: number): Promise<string[]> {
  const result = await sess.waitAny([51, 52], step);
  if (result.type === 52) throw new Error('认证流程异常（无需认证即通过）');
  const len = readU32(result.payload);
  return TD.decode(result.payload.slice(4, 4 + len)).split(',');
}

async function authenticate(sess: SshSession, cfg: SshConfig, step: number): Promise<void> {
  const user = cfg.user;

  // 探测可用方法
  await sess.send(50, concat(str(user), str('ssh-connection'), str('none')));
  let methods = await authMethods(sess, step);

  if (cfg.auth.kind === 'key') {
    if (methods.includes('publickey')) {
      const { seed } = parseOpenSshPrivateKey(cfg.auth.privateKey);
      const privKey = await crypto.subtle.importKey('raw', seed, { name: 'Ed25519' }, false, ['sign']);
      const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', privKey));
      const pubBlob = concat(str('ssh-ed25519'), str(pubRaw));
      await sess.send(50, concat(str(user), str('ssh-connection'), str('publickey'), new Uint8Array([0]), str('ssh-ed25519'), pubBlob));
      const probe = await sess.waitAny([60, 51], step);
      if (probe.type === 60) {
        const signed = concat(str(user), str('ssh-connection'), str('publickey'), new Uint8Array([1]), str('ssh-ed25519'), pubBlob);
        const signature = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, privKey, concat(sess.sessionId, signed)));
        await sess.send(50, concat(signed, str(concat(str('ssh-ed25519'), str(signature)))));
        const r = await sess.waitAny([51, 52], step);
        if (r.type === 52) return;
        methods = parseMethods(r.payload);
      }
    }
    throw new Error(`公钥认证被拒绝（请确认已把公钥加入服务器 authorized_keys；服务器支持: ${methods.join(', ')}）`);
  }

  if (methods.includes('password')) {
    await sess.send(50, concat(str(user), str('ssh-connection'), str('password'), new Uint8Array([0]), str(cfg.auth.password)));
    const r = await sess.waitAny([51, 52], step);
    if (r.type === 52) return;
    methods = parseMethods(r.payload);
  }

  if (methods.includes('keyboard-interactive')) {
    await sess.send(50, concat(str(user), str('ssh-connection'), str('keyboard-interactive'), str(''), str('')));
    const info = await sess.waitFor(60, step);
    // INFO_REQUEST: string name, string instruction, string lang, u32 num-prompts, (string prompt, bool echo)*
    let p = 0;
    const readStrAt = (b: Uint8Array, o: number): { s: string; next: number } => {
      const len = readU32(b, o);
      return { s: TD.decode(b.slice(o + 4, o + 4 + len)), next: o + 4 + len };
    };
    p = readStrAt(info, p).next;
    p = readStrAt(info, p).next;
    p = readStrAt(info, p).next;
    const numPrompts = readU32(info, p);
    p += 4;
    const answers: Uint8Array[] = [];
    for (let i = 0; i < numPrompts; i++) {
      const rp = readStrAt(info, p);
      p = rp.next + 1; // echo 布尔占 1 字节
      answers.push(str(cfg.auth.password));
    }
    await sess.send(61, concat(u32(answers.length), ...answers));
    const r = await sess.waitAny([51, 52], step);
    if (r.type === 52) return;
    methods = parseMethods(r.payload);
  }

  throw new Error(`认证失败（服务器支持: ${methods.join(', ')}；本客户端支持 password / keyboard-interactive / ssh-ed25519 公钥）`);
}

function parseMethods(payload: Uint8Array): string[] {
  const len = readU32(payload);
  return TD.decode(payload.slice(4, 4 + len)).split(',');
}

async function execChannel(sess: SshSession, command: string, step: number, fingerprint: string): Promise<SshExecResult> {
  const sender = 0;
  let stdout = '';
  let stderr = '';
  let exitCode: number | null = null;
  let gotExit = false;
  let gotEof = false;
  let gotClose = false;
  let resolveDone: ((code: number) => void) | null = null;
  const done = new Promise<number>((resolve) => {
    resolveDone = resolve;
  });
  const check = (): void => {
    if (gotExit || gotClose || (gotEof && exitCode === null)) {
      // EOF 后通常跟 exit-status；EOF+CLOSE 而无 exit-status 时视为 0
      if (gotExit) resolveDone?.(exitCode!);
      else if (gotClose) resolveDone?.(-1);
      else resolveDone?.(0);
    }
  };

  sess.on(94, (p) => {
    const len = readU32(p, 4);
    const data = p.slice(8, 8 + len);
    if (stdout.length < MAX_OUTPUT) stdout += TD.decode(data);
  });
  sess.on(95, (p) => {
    const len = readU32(p, 8);
    const data = p.slice(12, 12 + len);
    if (stderr.length < MAX_OUTPUT) stderr += TD.decode(data);
  });
  sess.on(98, (p) => {
    const reqLen = readU32(p, 4);
    const req = TD.decode(p.slice(8, 8 + reqLen));
    if (req === 'exit-status') {
      exitCode = readU32(p, 9 + reqLen);
      gotExit = true;
      check();
    }
  });
  sess.on(96, () => {
    gotEof = true;
    check();
  });
  sess.on(97, () => {
    gotClose = true;
    check();
  });
  sess.on(100, () => {
    // CHANNEL_FAILURE：exec 被拒
    exitCode = -1;
    gotClose = true;
    check();
  });
  sess.on(92, () => {
    throw new Error('服务器拒绝打开通道');
  });

  await sess.send(90, concat(str('session'), u32(sender), u32(1 << 20), u32(32768)));
  await sess.waitFor(91, step);
  await sess.send(98, concat(u32(sender), str('exec'), new Uint8Array([1]), str(command)));
  let execTimer: ReturnType<typeof setTimeout> | null = null;
  const execTimeout = new Promise<never>((_, reject) => {
    execTimer = setTimeout(() => reject(new Error('命令执行超时')), Math.max(step * 3, 30_000));
  });
  execTimeout.catch(() => {
    /* 竞态落败方：忽略 */
  });
  try {
    const code = await Promise.race([done, execTimeout]);
    return { code, stdout, stderr, hostFingerprint: fingerprint };
  } finally {
    if (execTimer) clearTimeout(execTimer);
  }
}

import { BUILTIN_THEMES, findTheme } from './ui/themes-core.js';
import { WebUi } from './webui.js';
import { mimoAsr, mimoTts } from './llm/mimo.js';
import { CfDriver } from './driver.js';
import { MemoryStores } from './stores.js';

/**
 * Cloudflare Worker 入口：所有请求与 SSE 连接都路由到同一个 Durable Object 实例（idFromName('app')），
 * 驱动状态/UI/SSE 客户端集只存在于这一个实例里——避免多 isolate 各自为政导致
 * 「消息被别的 isolate 处理、界面不更新、会话重复」的问题。
 *
 * 云端零持久化：Durable Object 只有内存态；会话/角色卡/配置全部由各浏览器的 localStorage 持有，
 * 连接时经 /ui/sync 上传恢复，变更经 sync 事件写回浏览器。按 deviceId 隔离不同浏览器的数据。
 * 静态前端（assets binding）+ SSE 事件流 + /ui/* 交互端点，协议与本地 WebServer 完全一致。
 */

interface Env {
  ASSETS: Fetcher;
  MEOWFISH: DurableObjectNamespace;
  TOOL_SERVER_URL?: string;
  TOOL_SERVER_TOKEN?: string;
}

interface AppState {
  ui: WebUi;
  driver: CfDriver;
  clients: Set<ReadableStreamDefaultController<Uint8Array>>;
}

const encoder = new TextEncoder();

/** 设备隔离 Cookie 名（浏览器持久的不可伪造设备凭据；URL 中的 device= 参数不再被信任） */
export const DEVICE_COOKIE = 'mf_device';

/** 从请求 Cookie 头解析设备凭据；格式非法视为未提供 */
export function readDeviceCookie(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === DEVICE_COOKIE) {
      const value = part.slice(eq + 1).trim();
      return /^[a-f0-9-]{16,64}$/i.test(value) ? value : null;
    }
  }
  return null;
}

/** 构造设备 Cookie（HTTPS 下带 Secure；HttpOnly 防脚本窃取） */
export function deviceCookieHeader(deviceId: string, https: boolean): string {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=31536000'];
  if (https) attrs.push('Secure');
  return `${DEVICE_COOKIE}=${deviceId}; ${attrs.join('; ')}`;
}

export class MeowFishApp {
  private apps = new Map<string, Promise<AppState>>();

  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}

  private getApp(deviceId: string): Promise<AppState> {
    let p = this.apps.get(deviceId);
    if (!p) {
      p = this.boot().catch((e: unknown) => {
        this.apps.delete(deviceId);
        throw e;
      });
      this.apps.set(deviceId, p);
    }
    return p;
  }

  private async boot(): Promise<AppState> {
    const stores = new MemoryStores();
    const ui = new WebUi({
      theme: findTheme(BUILTIN_THEMES, '浅滩'),
      modelLabel: '',
      modeLabel: 'RP',
      title: 'MeowFish',
      userName: '你',
      assistantName: '喵鱼',
    });
    const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
    ui.attachEmit((event) => {
      const data = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
      for (const c of clients) {
        try {
          c.enqueue(data);
        } catch {
          clients.delete(c);
        }
      }
    });
    const driver = new CfDriver(ui, stores, {
      toolServerConfigured: Boolean(this.env.TOOL_SERVER_URL && this.env.TOOL_SERVER_TOKEN),
      toolCall: async (tool, args, authorized) => {
        if (!this.env.TOOL_SERVER_URL || !this.env.TOOL_SERVER_TOKEN) {
          return { ok: false, output: '（未配置 SSH 且未配置工具服务器：请在网页输入 /ssh 配置远程服务器，或在 wrangler.toml 设置 TOOL_SERVER_URL / TOOL_SERVER_TOKEN 走旧版工具守护）' };
        }
        try {
          const res = await fetch(this.env.TOOL_SERVER_URL.replace(/\/+$/, '') + '/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: this.env.TOOL_SERVER_TOKEN, tool, args, authorized }),
          });
          if (!res.ok) return { ok: false, output: `（工具服务器 HTTP ${res.status}）` };
          return (await res.json()) as { ok: boolean; output: string };
        } catch {
          return { ok: false, output: '（工具服务器不可达）' };
        }
      },
    });
    await driver.init();
    return { ui, driver, clients };
  }

  private sseResponse(state: AppState): Response {
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'snapshot', state: state.ui.snapshot() })}\n\n`));
        state.clients.add(controller);
        heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'ping' })}\n\n`));
          } catch {
            if (heartbeat) clearInterval(heartbeat);
            heartbeat = null;
            state.clients.delete(controller);
          }
        }, 25_000);
      },
      cancel: (controller) => {
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        state.clients.delete(controller);
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // 设备隔离凭据只信任 HttpOnly Cookie（客户端随机生成、由浏览器持有；URL 查询参数可被日志/代理泄露）
    const existing = readDeviceCookie(request.headers.get('Cookie'));
    const deviceId = existing ?? crypto.randomUUID();
    let res: Response;
    if (url.pathname === '/auth-check') res = json({ ok: true });
    else if (url.pathname === '/events') res = this.sseResponse(await this.getApp(deviceId));
    else if (url.pathname.startsWith('/ui/')) res = await this.uiRoute(url.pathname, request, await this.getApp(deviceId));
    // 静态资源（前端三件套，assets binding）
    else res = await this.env.ASSETS.fetch(request);
    // 首次访问下发设备 Cookie（所有响应都带上，保证静态页/SSE/接口拿到同一凭据）
    if (!existing) {
      const headers = new Headers(res.headers);
      headers.append('Set-Cookie', deviceCookieHeader(deviceId, url.protocol === 'https:'));
      res = new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
    return res;
  }

  private async uiRoute(path: string, request: Request, state: AppState): Promise<Response> {
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      /* 空 body */
    }
    const { ui, driver } = state;
    const action = path.slice(4);
    switch (action) {
      case 'send':
        if (typeof body.text === 'string') this.state.waitUntil(driver.send(body.text, body.voice === true));
        return json({ ok: true });
      case 'command':
        if (typeof body.line === 'string') this.state.waitUntil(driver.command(body.line));
        return json({ ok: true });
      case 'abort':
        driver.abort();
        return json({ ok: true });
      case 'exit':
        return json({ ok: true });
      case 'pick': {
        const id = String(body.id ?? '');
        const value = typeof body.value === 'string' ? body.value : null;
        return ui.resolveDialog(id, value === null ? 'cancel' : 'pick', value) ? json({ ok: true }) : json({ ok: false }, 404);
      }
      case 'multi': {
        const id = String(body.id ?? '');
        const values = Array.isArray(body.values) ? body.values.filter((x): x is string => typeof x === 'string') : null;
        return ui.resolveDialog(id, values === null ? 'cancel' : 'multi', values) ? json({ ok: true }) : json({ ok: false }, 404);
      }
      case 'confirm': {
        const id = String(body.id ?? '');
        const key = typeof body.key === 'string' ? body.key : null;
        return ui.resolveDialog(id, key === null ? 'cancel' : 'confirm', key) ? json({ ok: true }) : json({ ok: false }, 404);
      }
      case 'form': {
        const id = String(body.id ?? '');
        const values = Array.isArray(body.values) ? body.values : null;
        return ui.resolveDialog(id, values === null ? 'cancel' : 'form', values) ? json({ ok: true }) : json({ ok: false }, 404);
      }
      case 'close': {
        const id = String(body.id ?? '');
        return ui.resolveDialog(id, 'cancel', null) ? json({ ok: true }) : json({ ok: false }, 404);
      }
      case 'load-session':
        if (typeof body.id === 'string') this.state.waitUntil(driver.loadSession(body.id));
        return json({ ok: true });
      case 'delete-session':
        if (typeof body.id === 'string') this.state.waitUntil(driver.deleteSession(body.id));
        return json({ ok: true });
      case 'delete-sessions':
        if (Array.isArray(body.ids)) this.state.waitUntil(driver.deleteSessions(body.ids.filter((x): x is string => typeof x === 'string')));
        return json({ ok: true });
      case 'toggle-pin':
        if (typeof body.id === 'string') this.state.waitUntil(driver.togglePin(body.id));
        return json({ ok: true });
      case 'voice-stt': {
        // 语音识别：浏览器上传 wav base64，MiMo key 由浏览器随请求头携带（零持久化）
        const key = request.headers.get('x-mimo-key') || '';
        const audio = typeof body.audio === 'string' ? body.audio : '';
        if (!key || !audio) return json({ ok: false, error: '缺少 MiMo API Key 或音频' }, 400);
        try {
          const text = await mimoAsr(key, audio, { language: 'auto' });
          return json({ ok: true, text });
        } catch (e) {
          return json({ ok: false, error: e instanceof Error ? e.message : '识别失败' }, 500);
        }
      }
      case 'voice-tts': {
        // 语音合成：SSE 流式返回 PCM16 base64 分片（voice 音色 / style 情感风格）
        const key = request.headers.get('x-mimo-key') || '';
        const text = typeof body.text === 'string' ? body.text : '';
        if (!key || !text) return json({ ok: false, error: '缺少 MiMo API Key 或文本' }, 400);
        const voice = typeof body.voice === 'string' && body.voice ? body.voice : 'mimo_default';
        const style = typeof body.style === 'string' && body.style ? body.style : undefined;
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              await mimoTts(key, text, { voice, style, stream: true }, (pcm) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ pcm })}\n\n`));
              });
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            } catch (e) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: e instanceof Error ? e.message : '合成失败' })}\n\n`));
            }
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      }
      case 'local-config':
        // 浏览器推送本地用户配置（模型/用户设定/SSH 凭据，存 localStorage）
        driver.applyLocalConfig(body.config);
        return json({ ok: true });
      case 'sync': {
        // 浏览器连接时上传本地数据（会话/角色卡/当前会话），云端只保留内存态
        const raw = (body as Record<string, unknown>).data;
        this.state.waitUntil(driver.applyLocalData((raw as Record<string, unknown> | null) ?? null));
        return json({ ok: true });
      }
      default:
        return json({ ok: false }, 404);
    }
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

interface TermHandle {
  send(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
}

/** Web SSH 终端：Worker 级 WebSocket（不进 DO，连接存续期间 Worker 保持活跃），
 *  浏览器首条消息携带连接配置（与 /ssh 同样的凭据，仅内存使用），SSH shell 通道直连远程服务器 */
async function sshTermUpgrade(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const deviceId = readDeviceCookie(request.headers.get('Cookie'));
  if (String(request.headers.get('Upgrade') ?? '').toLowerCase() !== 'websocket') {
    return json({ ok: false, error: '需要 WebSocket 升级' }, 426);
  }
  if (!deviceId) return json({ ok: false, error: '缺少设备 Cookie，请刷新页面' }, 403);

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();

  let term: TermHandle | null = null;
  let closed = false;
  const send = (payload: unknown): void => {
    if (!closed) {
      try {
        server.send(JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    }
  };
  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    term?.close();
    term = null;
  };

  server.addEventListener('message', (ev) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
    } catch {
      return;
    }
    if (msg.type === 'connect') {
      if (term) return;
      void (async () => {
        try {
          const [{ parseSshTermConfig, sshShell }, { cloudflareTcp }] = await Promise.all([import('./ssh.js'), import('./socket.js')]);
          const parsed = parseSshTermConfig(msg.cfg, cloudflareTcp);
          if (!parsed.ok) {
            send({ type: 'error', message: parsed.error });
            return;
          }
          term = await sshShell(parsed.value, {
            cols: typeof msg.cols === 'number' ? msg.cols : undefined,
            rows: typeof msg.rows === 'number' ? msg.rows : undefined,
            onFingerprint: (fp) => send({ type: 'fingerprint', fingerprint: fp }),
            onData: (text) => send({ type: 'data', data: text }),
            onExit: (code) => send({ type: 'exit', code }),
            onError: (message) => send({ type: 'error', message }),
          });
          send({ type: 'ready' });
        } catch (e) {
          send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
        }
      })();
      return;
    }
    if (msg.type === 'input' && typeof msg.data === 'string') term?.send(msg.data);
    else if (msg.type === 'resize' && typeof msg.cols === 'number' && typeof msg.rows === 'number') term?.resize(msg.cols, msg.rows);
    else if (msg.type === 'close') cleanup();
  });
  server.addEventListener('close', cleanup);
  server.addEventListener('error', cleanup);

  void url;
  return new Response(null, { status: 101, webSocket: client } as unknown as ResponseInit);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Web SSH 终端走 Worker 级 WebSocket（连接存续期间 Worker 不休眠）
    if (url.pathname === '/ssh-term') return sshTermUpgrade(request);
    // 其余请求进入同一个 Durable Object 实例，保证驱动/SSE 状态全局唯一
    const id = env.MEOWFISH.idFromName('app');
    return env.MEOWFISH.get(id).fetch(request);
  },
};

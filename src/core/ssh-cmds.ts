/**
 * SSH 命令构造纯函数（环境无关：本地 Node 与 Cloudflare Worker 共用）。
 * 目标机为 Linux/macOS（cat/printf/base64/find/grep 均存在）；Windows 目标文件工具暂不支持。
 */

export interface SshTarget {
  user: string;
  host: string;
  port: number;
}

export interface SshExecResult {
  code: number;
  stdout: string;
}

/** 解析 user@host[:port] */
export function parseSshTarget(target: string): SshTarget {
  const m = /^(?:([^@\s]+)@)?([^:\s]+)(?::(\d+))?$/.exec(target.trim());
  if (!m || !m[2]) throw new Error(`无效的 SSH 目标: ${target}（格式 user@host[:port]）`);
  return { user: m[1] || '', host: m[2], port: m[3] ? Number(m[3]) : 22 };
}

/** shell 单引号安全包裹（远程路径含空格/引号时使用） */
export function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** 字节 → base64（纯 JS，无 Buffer 依赖，Node/Worker 通用） */
export function bytesToBase64(bytes: Uint8Array): string {
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += ALPHA[b0 >> 2]! + ALPHA[((b0 & 3) << 4) | (b1 >> 4)]!;
    out += i + 1 < bytes.length ? ALPHA[(b1 & 15) << 2 | (b2 >> 6)]! : '=';
    out += i + 2 < bytes.length ? ALPHA[b2 & 63]! : '=';
  }
  return out;
}

/** Linux 目标：读文件 */
export function buildReadCmd(path: string): string {
  return `cat -- ${shq(path)}`;
}

/** Linux 目标：写文件（base64 分块，避免命令行长度限制；空内容清空文件） */
export function buildWriteCmd(path: string, content: string): string[] {
  const b64 = bytesToBase64(new TextEncoder().encode(content));
  const cmds: string[] = [];
  if (b64.length === 0) {
    return [`: > ${shq(path)}`];
  }
  const CHUNK = 48_000; // base64 每块 < ~48KB，安全低于常见 ARG_MAX
  for (let i = 0; i < b64.length; i += CHUNK) {
    const chunk = b64.slice(i, i + CHUNK);
    const op = i === 0 ? '>' : '>>';
    cmds.push(`printf '%s' '${chunk}' | base64 -d ${op} ${shq(path)}`);
  }
  return cmds;
}

/** Linux 目标：列文件 */
export function buildListCmd(path: string): string {
  return `find ${shq(path)} -type f 2>/dev/null | head -500`;
}

/** Linux 目标：grep */
export function buildGrepCmd(pattern: string, path: string): string {
  return `grep -rIn -- ${shq(pattern)} ${shq(path)} 2>/dev/null | head -100`;
}

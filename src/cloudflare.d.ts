/** Cloudflare Workers 最小类型声明（避免引入 workers-types 依赖） */

interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<D1Result>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/** Durable Object 最小类型声明（应用状态单实例化，避免多 isolate 状态分裂） */
interface DurableObjectId {
  toString(): string;
}

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
}

interface DurableObjectState {
  waitUntil(promise: Promise<unknown>): void;
  storage: DurableObjectStorage;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

/** WebSocket（Web SSH 终端用；Worker 全局 WebSocketPair） */
interface WebSocket {
  accept(): void;
  addEventListener(type: 'message', listener: (event: { data: string | ArrayBuffer }) => void): void;
  addEventListener(type: 'close' | 'error', listener: (event: unknown) => void): void;
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
}

declare class WebSocketPair {
  readonly 0: WebSocket;
  readonly 1: WebSocket;
}

/** 出站 TCP socket（cloudflare:sockets connect，Worker 直连 SSH 用） */
declare module 'cloudflare:sockets' {
  export interface SocketAddress {
    hostname: string;
    port: number;
  }
  export interface SocketOptions {
    secureTransport?: 'off' | 'on' | 'starttls';
    allowHalfOpen?: boolean;
  }
  export interface SocketInfo {
    remoteAddress?: string;
    localAddress?: string;
  }
  export interface Socket {
    get readable(): ReadableStream<Uint8Array>;
    get writable(): WritableStream<Uint8Array>;
    get closed(): Promise<void>;
    get opened(): Promise<SocketInfo>;
    close(): Promise<void>;
  }
  export function connect(address: string | SocketAddress, options?: SocketOptions): Socket;
}

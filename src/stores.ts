import type { ChatMessage, Usage } from './llm/types.js';

/** Cloudflare 侧存储：纯内存实现（云端零持久化，数据全部由浏览器 localStorage 持有，
 *  每次连接经 /ui/sync 上传恢复；Durable Object 回收后由浏览器重新上传） */

export interface CfSessionRow {
  id: string;
  type: 'rp' | 'agent';
  title: string;
  model: string;
  character?: string;
  updatedAt: number;
  messages: ChatMessage[];
  usage: Usage;
}

export interface CfStores {
  listSessions(): Promise<CfSessionRow[]>;
  loadSession(id: string): Promise<CfSessionRow | null>;
  saveSession(row: CfSessionRow): Promise<void>;
  deleteSession(id: string): Promise<void>;
}

/** 内存实现（生产 + 无头测试共用） */
export class MemoryStores implements CfStores {
  private sessions = new Map<string, CfSessionRow>();

  async listSessions(): Promise<CfSessionRow[]> {
    return [...this.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async loadSession(id: string): Promise<CfSessionRow | null> {
    return this.sessions.get(id) ?? null;
  }

  async saveSession(row: CfSessionRow): Promise<void> {
    this.sessions.set(row.id, { ...row, messages: row.messages.map((m) => ({ ...m })) });
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }
}

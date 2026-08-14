import type { ChatMessage, Usage } from './llm/types.js';

/** Cloudflare 侧存储：纯内存实现（云端零持久化，数据全部由浏览器 localStorage 持有，
 *  每次连接经 /ui/sync 上传恢复；Durable Object 回收后由浏览器重新上传） */

export interface CfSessionRow {
  id: string;
  type: 'rp' | 'agent';
  title: string;
  model: string;
  character?: string;
  /** 创建时间（旧数据可能缺失，回退 updatedAt） */
  createdAt?: number;
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
    // 按创建时间排序（新创建的在上）；旧数据无 createdAt 时用 updatedAt 兜底。
    // 不用 updatedAt 排序：切换会话/发消息会更新它，导致列表乱跳
    return [...this.sessions.values()].sort(
      (a, b) => (b.createdAt ?? b.updatedAt) - (a.createdAt ?? a.updatedAt),
    );
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

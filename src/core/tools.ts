import type { ToolDef } from '../llm/types.js';

/** 电脑权限工具集 */

export interface ToolResult {
  ok: boolean;
  output: string;
  /** 结果过长被截断 */
  truncated?: boolean;
}

export interface ToolCtx {
  cwd: string;
  /** 用户中断信号（工具实现可据此中止耗时操作，如联网请求） */
  signal?: AbortSignal;
}

export type ToolImpl = {
  def: ToolDef;
  run: (args: Record<string, unknown>, ctx: ToolCtx) => Promise<ToolResult>;
};

export class ToolRegistry {
  private tools = new Map<string, ToolImpl>();

  register(tool: ToolImpl): void {
    this.tools.set(tool.def.function.name, tool);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  defs(): ToolDef[] {
    return [...this.tools.values()].map((t) => t.def);
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  async run(name: string, args: Record<string, unknown>, ctx: ToolCtx): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, output: `未知工具: ${name}` };
    try {
      return await tool.run(args, ctx);
    } catch (e) {
      return { ok: false, output: `工具执行出错: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

/** 解析模型返回的 JSON 参数，失败时返回空对象 */
export function parseArgs(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json);
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    // 参数是纯文本而不是 JSON（部分模型会这样）→ 放入 content 字段
    return { content: json };
  }
}

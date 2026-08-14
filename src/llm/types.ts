/** LLM 层共享类型（OpenAI 兼容协议） */

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: Role;
  content: string;
  /** 可选的名字标记（角色扮演场景，多数后端会忽略） */
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ModelProfile {
  name: string;
  baseUrl: string;
  /** 字面 API key，或 secrets.json 中的键名，或 "env:VAR" */
  apiKey?: string;
  apiKeyEnv?: string;
  model: string;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  maxTokens?: number;
  /** 用于历史裁剪的上下文预算（token 数） */
  contextLength?: number;
  /** 输出格式（DeepSeek response_format: text / json_object） */
  responseFormat?: 'text' | 'json_object';
  /** 思考模式（DeepSeek thinking: enabled / disabled；不设置则不发该参数） */
  thinking?: boolean;
  /** 思考强度（DeepSeek reasoning_effort: low / high / max） */
  thinkingLevel?: 'low' | 'high' | 'max';
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
}

export interface StreamEvent {
  delta?: string;
  /** 思维链增量（DeepSeek reasoner 等模型的 reasoning_content） */
  reasoningDelta?: string;
  /** 流式累积中的 tool call 片段（按 index 分组的增量） */
  toolCallDeltas?: { index: number; id?: string; name?: string; arguments?: string }[];
  finish?: string | null;
  usage?: Partial<Usage>;
}

export function estimateTokens(text: string): number {
  // 粗略估算：CJK 字符约 0.7 token/字，其余约 3.5 字符/token
  let cjk = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3000 && c <= 0x30ff)) cjk++;
  }
  const other = text.length - cjk;
  return Math.ceil(cjk * 0.7 + other / 3.5);
}

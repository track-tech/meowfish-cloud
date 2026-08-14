import { estimateTokens, type ChatMessage, type ModelProfile, type StreamEvent, type ToolCall, type ToolDef, type Usage } from './types.js';

export class LlmError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export interface ChatResult {
  message: ChatMessage;
  usage: Usage;
  finish: string | null;
  /** 思维链（reasoning_content 累积，无则为空串） */
  reasoning: string;
}

export interface ChatOptions {
  profile: ModelProfile;
  apiKey?: string;
  tools?: ToolDef[];
  signal?: AbortSignal;
  onEvent?: (ev: StreamEvent) => void;
}

interface ProviderChunk {
  choices?: {
    index?: number;
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
      tool_calls?: {
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
    message?: { content?: string | null; tool_calls?: unknown[] };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

function endpoint(profile: ModelProfile): string {
  const base = profile.baseUrl.replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

function headers(apiKey: string | undefined): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) h['Authorization'] = `Bearer ${apiKey}`;
  return h;
}

function buildBody(profile: ModelProfile, messages: ChatMessage[], tools: ToolDef[] | undefined, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: profile.model,
    messages,
    stream,
  };
  if (profile.temperature !== undefined) body.temperature = profile.temperature;
  if (profile.topP !== undefined) body.top_p = profile.topP;
  if (profile.frequencyPenalty !== undefined) body.frequency_penalty = profile.frequencyPenalty;
  if (profile.presencePenalty !== undefined) body.presence_penalty = profile.presencePenalty;
  if (profile.maxTokens) body.max_tokens = profile.maxTokens;
  if (profile.responseFormat) body.response_format = { type: profile.responseFormat };
  if (profile.thinking !== undefined) body.thinking = { type: profile.thinking ? 'enabled' : 'disabled' };
  if (profile.thinking && profile.thinkingLevel) body.reasoning_effort = profile.thinkingLevel;
  if (tools?.length) body.tools = tools;
  return body;
}

async function errorFromResponse(res: Response): Promise<LlmError> {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as ProviderChunk;
      detail = j.error?.message ?? text.slice(0, 300);
    } catch {
      detail = text.slice(0, 300);
    }
  } catch {
    /* ignore */
  }
  return new LlmError(`模型请求失败 (HTTP ${res.status})${detail ? `: ${detail}` : ''}`, res.status);
}

/** SSE 流式请求。部分后端不支持 stream 时自动降级为非流式。 */
async function streamRequest(opts: ChatOptions, messages: ChatMessage[]): Promise<ChatResult> {
  const { profile, apiKey, tools, signal, onEvent } = opts;
  const res = await fetch(endpoint(profile), {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(buildBody(profile, messages, tools, true)),
    signal,
  });
  if (!res.ok) {
    const err = await errorFromResponse(res);
    // 后端不支持 stream 时降级非流式；其他 4xx 直接抛
    if (err.status && err.status >= 400 && err.status < 500 && err.message.toLowerCase().includes('stream')) {
      return nonStreamRequest(opts, messages);
    }
    throw err;
  }
  if (!res.body) throw new LlmError('响应没有 body');

  let content = '';
  let reasoning = '';
  let finish: string | null = null;
  let usage: Usage = { promptTokens: 0, completionTokens: 0 };
  const toolFragments = new Map<number, { id: string; name: string; args: string }>();
  let sawAny = false;

  /** 处理一行 SSE data：返回是否需要触发 onEvent（主循环与残余缓冲共用同一逻辑） */
  const processLine = (line: string): void => {
    const s = line.trim();
    if (!s.startsWith('data:')) return;
    const data = s.slice(5).trim();
    if (data === '[DONE]') return;
    let chunk: ProviderChunk;
    try {
      chunk = JSON.parse(data) as ProviderChunk;
    } catch {
      return;
    }
    if (chunk.error) throw new LlmError(chunk.error.message ?? '模型返回错误');
    sawAny = true;
    const ev: StreamEvent = {};
    const choice = chunk.choices?.[0];
    if (choice) {
      const rd = choice.delta?.reasoning_content ?? choice.delta?.reasoning;
      if (rd) {
        ev.reasoningDelta = rd;
        reasoning += rd;
      }
      if (choice.delta?.content) {
        ev.delta = choice.delta.content;
        content += choice.delta.content;
      }
      if (choice.delta?.tool_calls) {
        ev.toolCallDeltas = choice.delta.tool_calls.map((tc) => {
          const idx = tc.index ?? 0;
          const frag = toolFragments.get(idx) ?? { id: '', name: '', args: '' };
          if (tc.id) frag.id = tc.id;
          if (tc.function?.name) frag.name += tc.function.name;
          if (tc.function?.arguments) frag.args += tc.function.arguments;
          toolFragments.set(idx, frag);
          return {
            index: idx,
            id: tc.id ?? undefined,
            name: tc.function?.name ?? undefined,
            arguments: tc.function?.arguments ?? undefined,
          };
        });
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }
    if (chunk.usage) {
      if (chunk.usage.prompt_tokens !== undefined) usage.promptTokens = chunk.usage.prompt_tokens;
      if (chunk.usage.completion_tokens !== undefined) usage.completionTokens = chunk.usage.completion_tokens;
    }
    if (ev.delta !== undefined || ev.reasoningDelta !== undefined || ev.toolCallDeltas !== undefined) onEvent?.(ev);
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const part of parts) {
        for (const line of part.split('\n')) processLine(line);
      }
    }
    // 处理残余缓冲（流结束前未以空行收尾的数据）
    buf += decoder.decode();
    for (const line of buf.split('\n')) processLine(line);
  } finally {
    reader.releaseLock();
  }

  if (!sawAny && !content) throw new LlmError('模型返回了空响应');
  if (usage.promptTokens === 0) usage.promptTokens = estimateTokens(messages.map((m) => m.content).join('\n'));
  if (usage.completionTokens === 0 && content) usage.completionTokens = estimateTokens(content);

  const message: ChatMessage = { role: 'assistant', content };
  const result: ChatResult = { message, usage, finish, reasoning };
  if (toolFragments.size > 0) {
    // Map 按首次出现的顺序插入，即 index 顺序
    const toolCalls: ToolCall[] = [...toolFragments.values()].map((f) => ({
      id: f.id || `call_${Math.random().toString(36).slice(2)}`,
      type: 'function' as const,
      function: { name: f.name, arguments: f.args },
    }));
    message.tool_calls = toolCalls;
  }
  return result;
}

async function nonStreamRequest(opts: ChatOptions, messages: ChatMessage[]): Promise<ChatResult> {
  const { profile, apiKey, tools, signal } = opts;
  const res = await fetch(endpoint(profile), {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(buildBody(profile, messages, tools, false)),
    signal,
  });
  if (!res.ok) throw await errorFromResponse(res);
  const j = (await res.json()) as ProviderChunk;
  const choice = j.choices?.[0];
  const content = choice?.message?.content ?? '';
  const usage: Usage = {
    promptTokens: j.usage?.prompt_tokens ?? estimateTokens(messages.map((m) => m.content).join('\n')),
    completionTokens: j.usage?.completion_tokens ?? estimateTokens(content),
  };
  const message: ChatMessage = { role: 'assistant', content };
  const reasoning = (choice?.message as { reasoning_content?: string } | undefined)?.reasoning_content ?? '';
  const rawCalls = choice?.message?.tool_calls;
  if (Array.isArray(rawCalls) && rawCalls.length) {
    message.tool_calls = rawCalls.map((tc, i) => {
      const t = tc as { id?: string; function?: { name?: string; arguments?: string } };
      return {
        id: t.id ?? `call_${i}`,
        type: 'function' as const,
        function: { name: t.function?.name ?? '', arguments: t.function?.arguments ?? '{}' },
      };
    });
  }
  return { message, usage, finish: choice?.finish_reason ?? null, reasoning };
}

/** 入口：优先流式，自动降级非流式 */
export async function chat(opts: ChatOptions, messages: ChatMessage[]): Promise<ChatResult> {
  try {
    return await streamRequest(opts, messages);
  } catch (e) {
    if (e instanceof LlmError) throw e;
    // fetch 网络层错误
    const raw = e instanceof Error ? e.message : String(e);
    // workerd 流被取消等底层晦涩错误 → 转成可读文案（用户主动中断由驱动层按 signal 单独处理）
    if (/stream was cancelled/i.test(raw)) throw new LlmError('连接被中断（网络或代理不稳定），请重试');
    throw new LlmError(`请求失败: ${raw}`);
  }
}

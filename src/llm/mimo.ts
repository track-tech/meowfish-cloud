/**
 * 小米 MiMo 语音客户端（ASR 识别 + 流式 TTS 合成）
 * 接口 OpenAI 兼容：POST https://api.xiaomimimo.com/v1/chat/completions
 * 鉴权头：api-key: <key>
 * - mimo-v2.5-asr：user 消息携带 input_audio（wav/mp3 base64，≤10MB）
 * - mimo-v2.5-tts：assistant 消息放合成文本，user 消息放风格指令（可选）
 *   audio: { format: 'pcm16', voice } + stream:true → SSE 返回 24kHz PCM16 分片
 * 纯 fetch 实现：本地 Node 与 Cloudflare Worker 通用。
 */

const MIMO_BASE = 'https://api.xiaomimimo.com/v1/chat/completions';

export interface MimoAsrOptions {
  language?: 'auto' | 'zh' | 'en';
}

export interface MimoTtsOptions {
  voice?: string;
  /** 自然语言风格指令（如「轻快活泼一些」），不传则用默认语调 */
  style?: string;
  /** 是否流式返回音频分片；false 时一次性返回完整 PCM16 */
  stream?: boolean;
}

export class MimoError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

function mimoHeaders(apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'api-key': apiKey };
}

async function errorFromResponse(res: Response): Promise<MimoError> {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { error?: { message?: string } };
      detail = j.error?.message ?? text.slice(0, 300);
    } catch {
      detail = text.slice(0, 300);
    }
  } catch {
    /* ignore */
  }
  return new MimoError(`MiMo 请求失败 (HTTP ${res.status})${detail ? `: ${detail}` : ''}`, res.status);
}

interface MimoChunk {
  choices?: {
    delta?: {
      audio?: { data?: string; transcript?: string };
      content?: string | null;
    };
    message?: {
      audio?: { data?: string; transcript?: string };
      content?: string | null;
    };
    finish_reason?: string | null;
  }[];
  error?: { message?: string };
}

/** 语音识别：把 wav 音频（base64，data URL 或纯 base64）转成文本 */
export async function mimoAsr(apiKey: string, wavBase64: string, opts: MimoAsrOptions = {}): Promise<string> {
  const body: Record<string, unknown> = {
    model: 'mimo-v2.5-asr',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'input_audio',
            input_audio: { data: `data:audio/wav;base64,${wavBase64}` },
          },
        ],
      },
    ],
  };
  if (opts.language) body.asr_options = { language: opts.language };
  const res = await fetch(MIMO_BASE, {
    method: 'POST',
    headers: mimoHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await errorFromResponse(res);
  const j = (await res.json()) as MimoChunk;
  const text = j.choices?.[0]?.message?.content ?? '';
  return typeof text === 'string' ? text.trim() : '';
}

/**
 * 语音合成：返回 PCM16（24kHz 单声道）base64 块。
 * stream=true 时通过 onChunk 逐块回调（每块一段 base64）；否则一次性返回完整数据。
 */
export async function mimoTts(
  apiKey: string,
  text: string,
  opts: MimoTtsOptions = {},
  onChunk?: (pcmBase64: string) => void,
): Promise<void> {
  const messages: Record<string, unknown>[] = [];
  if (opts.style) messages.push({ role: 'user', content: opts.style });
  messages.push({ role: 'assistant', content: text });
  const stream = opts.stream !== false;
  const body: Record<string, unknown> = {
    model: 'mimo-v2.5-tts',
    messages,
    audio: { format: 'pcm16', voice: opts.voice ?? 'mimo_default' },
    stream,
  };
  const res = await fetch(MIMO_BASE, {
    method: 'POST',
    headers: mimoHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await errorFromResponse(res);
  if (!stream) {
    const j = (await res.json()) as MimoChunk;
    const data = j.choices?.[0]?.message?.audio?.data;
    if (data) onChunk?.(data);
    return;
  }
  const reader = res.body?.getReader();
  if (!reader) throw new MimoError('MiMo 流式响应无内容');
  const decoder = new TextDecoder();
  let buf = '';
  // SSE 解析：按 \n\n 分帧，逐行处理 data:
  const handleLine = (line: string): void => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const chunk = JSON.parse(payload) as MimoChunk;
      if (chunk.error?.message) throw new MimoError(chunk.error.message);
      const data = chunk.choices?.[0]?.delta?.audio?.data;
      if (data) onChunk?.(data);
    } catch (e) {
      if (e instanceof MimoError) throw e;
      /* 跳过坏帧 */
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of frame.split('\n')) handleLine(line);
    }
  }
  // 处理流结束前未以空行收尾的残余数据
  buf += decoder.decode();
  for (const line of buf.split('\n')) handleLine(line);
}

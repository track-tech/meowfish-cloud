import type { ModelProfile } from './types.js';

export interface AppConfig {
  general: {
    theme: string;
    kaomojiStyle: string;
    defaultModel: string;
    defaultCharacter: string;
    mode: 'rp' | 'agent';
    /** 电脑权限开关：开启后角色可读写文件/执行命令（需授权） */
    tools: boolean;
    /** 联网搜索开关：关闭后角色看不到 web_search/web_fetch 工具（缺省视为开） */
    webSearch?: boolean;
    /** 用户称呼（角色扮演中你的名字） */
    userName: string;
    /** 用户设定描述（告诉角色你是谁，可留空） */
    userDescription: string;
    /** 界面语言（Web UI 双语：zh / en；缺省视为 zh） */
    lang?: 'zh' | 'en';
    /** MiMo 语音 API Key（实时对话：识别 + 合成；云端存浏览器 localStorage，本地可存 secrets.json） */
    mimoKey?: string;
    /** 语音对话模式开关（云端零持久化：随配置存浏览器 localStorage，DO 回收后可恢复） */
    voiceChat?: boolean;
    /** yolo 全部放行模式开关（云端零持久化：随配置存浏览器 localStorage，DO 回收后可恢复） */
    yolo?: boolean;
  };
  permissions: {
    allow: string[];
    deny: string[];
  };
  profiles: ModelProfile[];
}

export const DEFAULT_CONFIG: AppConfig = {
  general: {
    theme: '浅滩',
    kaomojiStyle: '活泼风',
    defaultModel: '',
    defaultCharacter: '喵鱼',
    mode: 'rp',
    tools: false,
    webSearch: true,
    lang: 'zh',
    userName: '你',
    userDescription: '',
  },
  permissions: { allow: [], deny: [] },
  profiles: [],
};

/** 模型提供商预设：/models 表单里「提供商」下拉直选，自动填充 BaseUrl / 模型名等 */
export interface ModelPreset {
  label: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  thinking?: boolean;
  thinkingLevel?: 'low' | 'high' | 'max';
}

export const MODEL_PRESETS: Record<string, ModelPreset> = {
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', temperature: 1, thinking: true, thinkingLevel: 'high' },
  'opencode-zen': { label: 'OpenCode Zen', baseUrl: 'https://opencode.ai/zen/v1', model: 'deepseek-v4-flash', temperature: 1, thinking: true, thinkingLevel: 'high' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat' },
  ollama: { label: 'Ollama（本地）', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' },
  kimi: { label: 'Kimi（月之暗面）', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  qwen: { label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
};

/** 根据 baseUrl 反查预设 key（编辑表单回显用） */
export function presetKeyOf(baseUrl: string): string | null {
  for (const [key, p] of Object.entries(MODEL_PRESETS)) {
    if (p.baseUrl.replace(/\/+$/, '') === baseUrl.replace(/\/+$/, '')) return key;
  }
  return null;
}


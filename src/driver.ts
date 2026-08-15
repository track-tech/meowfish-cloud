import { chat, LlmError } from './llm/client.js';
import type { ChatMessage, ModelProfile, ToolDef } from './llm/types.js';
import { MODEL_PRESETS, presetKeyOf, type AppConfig } from './llm/profiles-core.js';
import { emptyCard, parseCardJson, type CharacterCard } from './rp/card-core.js';
import { buildRpSystem, buildToolSection, buildVoiceSection, type RpUser } from './rp/prompt.js';
import { webSearch, type SearchResult } from './core/web.js';
import { buildGrepCmd, buildListCmd, buildReadCmd, buildWriteCmd } from './core/ssh-cmds.js';
import { globToRegExp } from './core/glob.js';
import { aboutText, APP_VERSION } from './core/meta.js';
import { isReadOnlyCommand, matchesRule } from './core/permissions.js';
import { BUILTIN_PACKS } from './ui/packs-core.js';
import { BUILTIN_THEMES, themeIsLight } from './ui/themes-core.js';
import { WebUi } from './webui.js';
import type { DisplayMsg } from './ui/host.js';
import { MEOWFISH_CARD } from './cards.js';
import type { CfSessionRow, CfStores } from './stores.js';
import type { SshConfig } from './ssh.js';

/** Cloudflare 侧驱动：复用 WebUi 协议与提示词层；工具经 Worker 直连 SSH 在远程服务器执行（或转发工具守护兜底） */

export interface CfEnv {
  /** 远程工具执行（ToolServer /run）——未配置 SSH 时的兜底通道 */
  toolCall: (tool: string, args: Record<string, unknown>, authorized: boolean) => Promise<{ ok: boolean; output: string }>;
  /** 是否配置了远程工具守护（旧部署方式）；false 且无 SSH 时给用户 /ssh 引导而不是 wrangler 报错 */
  toolServerConfigured?: boolean;
}

/** SSH 服务器配置（随用户本地配置一起存浏览器 localStorage） */
export interface CloudSshConfig {
  host: string;
  port: number;
  user: string;
  authKind: 'password' | 'key';
  password: string;
  privateKey: string;
  /** TOFU 已记录的主机指纹（SHA256:xxx） */
  fingerprint: string;
}

export type CloudConfig = AppConfig & { ssh?: CloudSshConfig };

/** 云端默认配置：喵鱼卡 + 主人 + DeepSeek 预设（API key 留空，用户在 /models 填写，存浏览器本地） */
const CLOUD_DEFAULTS: CloudConfig = {
  general: {
    theme: '浅滩',
    kaomojiStyle: '活泼风',
    defaultModel: 'deepseek',
    defaultCharacter: '喵鱼',
    mode: 'rp',
    tools: false,
    webSearch: true,
    lang: 'zh',
    userName: '主人',
    userDescription: '',
  },
  permissions: { allow: [], deny: [] },
  profiles: [
    {
      name: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      temperature: 1,
      contextLength: 1000000,
      thinking: true,
      thinkingLevel: 'high',
    },
    {
      name: 'opencode-zen',
      baseUrl: 'https://opencode.ai/zen/v1',
      model: 'deepseek-v4-flash',
      temperature: 1,
      contextLength: 1000000,
      thinking: true,
      thinkingLevel: 'high',
    },
  ],
};

const TOOL_DEFS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取远程服务器上的文件内容。参数: path（文件路径）',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '在远程服务器上写入文件（覆盖或新建）。需用户授权。参数: path、content',
      parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: '对远程服务器文件做精确替换。需用户授权。参数: path、old_string、new_string、replace_all',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' }, replace_all: { type: 'boolean' } },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description: '在远程服务器按通配模式查找文件（** 匹配任意层级）。参数: pattern',
      parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: '在远程服务器文件内容中搜索正则。参数: pattern、path、glob',
      parameters: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' }, glob: { type: 'string' } }, required: ['pattern'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bash',
      description: '在远程服务器执行 shell 命令。需用户授权（只读命令自动放行）。参数: command',
      parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '联网搜索最新信息（多引擎聚合去重：Bing/百度/搜狗优先，Google/Brave 补充；可传 page 翻页追问）。参数: query、count、page',
      parameters: { type: 'object', properties: { query: { type: 'string' }, count: { type: 'number' }, page: { type: 'number' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: '抓取网页正文文本。参数: url',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
];

const READ_TOOLS = new Set(['read_file', 'glob', 'grep', 'web_search', 'web_fetch']);

/** 电脑权限关闭时也提供的工具：仅联网（web_search / web_fetch 在 Worker 直连执行，无需授权） */
const WEB_ONLY_TOOL_DEFS = TOOL_DEFS.filter(
  (t) => t.function.name === 'web_search' || t.function.name === 'web_fetch',
);

/** 命令帮助（双语） */
function helpText(lang: 'zh' | 'en'): string {
  return lang === 'en'
    ? `meowfish cloud edition — quick reference
━━ General ━━
  /model        Switch model profile (manage at bottom)
  /models       Model manager: add / edit / delete / set default
  /search       Web search (query → results + summary)
  /websearch    Toggle web search (independent of computer access, on by default)
  /tools        Toggle computer access (SSH tools, approval required)
  /ssh          Configure SSH server (direct remote control)
  /config       Settings panel
  /theme        Switch color theme
  /daynight     Day / Night one-key toggle (Shoal ↔ Deep Sea)
  /kaomoji      Switch kaomoji style
  /new          Start a new chat
  /sessions     Browse & load past sessions (clean to bulk delete)
  /export       Export current session as Markdown
  /cost         View token usage
  /help         Show this help
━━ Roleplay ━━
  /character    Character manager: pick / new / edit / import(JSON) / delete
  /profile      Set your name & persona
  /swipe        Regenerate last reply
  /edit [n] <text>   Replace the n-th last message
  /del [n]      Delete the n-th last message
━━ With computer access ━━
  !command      Run shell on the remote server (approval required)
  @file         Reference a remote file (picker)
  /permissions  View approval rules
  /yolo         Toggle "allow everything" mode`
    : `meowfish 云端版 命令速查
━━ 通用 ━━
  /model        快速切换模型 profile（底部含管理入口）
  /models       模型管理：添加 / 编辑 / 删除 / 设为默认
  /search       联网搜索（关键词 → 结果 + 角色总结回答）
  /websearch    开关「联网搜索」（独立于电脑权限，默认开）
  /tools        开关电脑权限（SSH 远程服务器工具，需授权）
  /ssh          配置 SSH 服务器（云端直连控制远程电脑）
  /config       设置面板
  /theme        切换配色
  /daynight     白日 / 暗夜一键切换（浅滩 ↔ 深海）
  /kaomoji      切换颜文字风格
  /new          开启新对话
  /sessions     浏览并加载历史会话（clean 批量清理）
  /export       导出当前会话为 Markdown
  /cost         查看 token 用量
  /help         显示本帮助
━━ 角色扮演 ━━
  /character    角色管理：选择 / 新建 / 编辑 / 粘贴导入(JSON) / 删除
  /profile      设置你的称呼与设定
  /swipe        重新生成上一条回复
  /edit [n] <新内容>   替换倒数第 n 条消息
  /del [n]      删除倒数第 n 条消息
━━ 电脑权限开启时 ━━
  !命令         在远程服务器执行 shell（需授权）
  @文件         引用远程服务器文件（弹选择器）
  /permissions  查看授权规则
  /yolo         开关"全部放行"模式`;
}

export class CfDriver {
  config: CloudConfig = structuredClone(CLOUD_DEFAULTS) as CloudConfig;
  profile: ModelProfile | null = null;
  session: CfSessionRow | null = null;
  card: CharacterCard | null = null;
  cards: { name: string; data: CharacterCard }[] = [];
  private abortCtrl: AbortController | null = null;
  private yolo = false;
  /** 实时语音对话模式（免提语音：注入语音规则，回复走 TTS 朗读） */
  private voiceChat = false;

  /** 开启/关闭语音对话模式（前端进入/退出语音视图时调用；状态随配置持久化到浏览器，DO 回收不丢） */
  setVoiceChat(on: boolean): void {
    if (this.voiceChat === on) return;
    this.voiceChat = on;
    this.config.general.voiceChat = on;
    this.emitConfig();
    this.ui.pushSystem(on ? '语音对话模式已开启 —— 回复将口语化并带语音标记' : '语音对话模式已关闭');
  }

  constructor(
    private ui: WebUi,
    private stores: CfStores,
    private env: CfEnv,
  ) {}

  /* ---------- 初始化 ---------- */

  async init(): Promise<void> {
    // 云端零持久化：数据全部由浏览器 localStorage 持有，连接时经 /ui/sync 上传恢复。
    // DO 冷启动时只有内置喵鱼卡，等待浏览器同步。
    this.cards = [{ name: MEOWFISH_CARD.data.name, data: MEOWFISH_CARD }];
    this.profile = this.config.profiles.find((p) => p.name === this.config.general.defaultModel) ?? this.config.profiles[0] ?? null;
    const wanted = this.config.general.defaultCharacter;
    this.card = (this.cards.find((c) => c.name === wanted) ?? this.cards[0])?.data ?? null;

    this.session = (await this.stores.listSessions())[0] ?? null;
    if (!this.session) {
      this.session = this.newSession(this.card?.data.name ?? '喵鱼');
    }
    // 从浏览器配置恢复跨请求开关（零持久化红线：不能只存 DO 内存）
    this.yolo = this.config.general.yolo === true;
    this.voiceChat = this.config.general.voiceChat === true;
    this.ui.setModeLabel(this.toolsOn ? 'AGENT' : 'RP');
    this.ui.setToolsBadge?.(this.toolsOn);
    this.ui.setWebSearchBadge?.(this.webSearchOn);
    this.ui.setYoloBadge(this.yolo);
    this.ui.setModelLabel(this.modelLabel);
    this.ui.setTitle(this.session.title);
    this.ui.setTokens(this.tokensLabel());
    this.syncDisplay();
    this.ui.pushSystem(this.lang === 'en' ? 'ฅ(^•ω•^)ฅ Meow～ Welcome to MeowFish Cloud!' : 'ฅ(^•ω•^)ฅ 喵呜～欢迎使用 MeowFish 云端版！');
    this.ui.pushSystem(
      this.lang === 'en'
        ? `Character: ${this.card?.data.name ?? 'none'} · Model: ${this.modelLabel} · Computer access: ${this.toolsOn ? 'ON (SSH server)' : 'OFF (/tools to enable)'}${this.sshLabel() ? ` · SSH: ${this.sshLabel()}` : ''}`
        : `角色: ${this.card?.data.name ?? '未选择'} · 模型: ${this.modelLabel} · 电脑权限: ${this.toolsOn ? '开（SSH 远程服务器）' : '关（/tools 开启）'}${this.sshLabel() ? ` · SSH: ${this.sshLabel()}` : ''}`,
    );
    await this.syncSessionList();
  }

  /** 应用浏览器推送的本地用户配置（/ui/local-config） */
  applyLocalConfig(raw: unknown): void {
    if (!raw || typeof raw !== 'object') {
      // 浏览器首次访问无本地配置 → 回推默认配置，让浏览器缓存
      this.emitConfig();
      return;
    }
    const cfg = raw as Partial<CloudConfig>;
    const cp = (cfg.permissions ?? {}) as { allow?: unknown; deny?: unknown };
    this.config = {
      general: { ...this.config.general, ...(cfg.general ?? {}) },
      permissions: {
        allow: Array.isArray(cp.allow) ? cp.allow.map(String) : this.config.permissions.allow,
        deny: Array.isArray(cp.deny) ? cp.deny.map(String) : this.config.permissions.deny,
      },
      profiles: Array.isArray(cfg.profiles) && cfg.profiles.length
        ? (cfg.profiles as Partial<ModelProfile>[]).filter(
            (p): p is ModelProfile => !!p && typeof p.name === 'string' && typeof p.baseUrl === 'string' && typeof p.model === 'string',
          )
        : this.config.profiles,
      ...(cfg.ssh !== undefined ? { ssh: cfg.ssh } : {}),
    };
    this.profile = this.config.profiles.find((p) => p.name === this.config.general.defaultModel) ?? this.config.profiles[0] ?? null;
    if (this.session) this.session.model = this.profile?.name ?? '';
    const wanted = this.config.general.defaultCharacter;
    const cardHit = this.cards.find((c) => c.name === wanted) ?? this.cards[0];
    if (cardHit && cardHit.data.data.name !== this.card?.data.name) {
      this.card = cardHit.data;
      this.ui.pushSystem(`角色: ${this.card.data.name}`);
    }
    // 恢复浏览器配置中的跨请求开关（yolo / 语音模式）
    this.yolo = this.config.general.yolo === true;
    this.voiceChat = this.config.general.voiceChat === true;
    this.ui.setYoloBadge(this.yolo);
    this.ui.setModelLabel(this.modelLabel);
    this.ui.setModeLabel(this.toolsOn ? 'AGENT' : 'RP');
    this.ui.setToolsBadge?.(this.toolsOn);
    this.ui.setWebSearchBadge?.(this.webSearchOn);
    this.syncDisplay();
    this.emitConfig();
  }

  /** 把当前配置推给浏览器缓存（localStorage） */
  private emitConfig(): void {
    this.ui.emitEvent({ type: 'config', config: this.config });
  }

  private newSession(title: string): CfSessionRow {
    const now = Date.now();
    return {
      id: crypto.randomUUID(),
      type: 'rp',
      title,
      model: this.profile?.name ?? '',
      character: title,
      createdAt: now,
      updatedAt: now,
      messages: [],
      usage: { promptTokens: 0, completionTokens: 0 },
    };
  }

  /* ---------- 派生状态 ---------- */

  private get toolsOn(): boolean {
    return this.config.general.tools;
  }

  private get webSearchOn(): boolean {
    return this.config.general.webSearch ?? true;
  }

  /** 界面语言（Web UI 双语） */
  private get lang(): 'zh' | 'en' {
    return this.config.general.lang === 'en' ? 'en' : 'zh';
  }

  private get userName(): string {
    return this.config.general.userName || '你';
  }

  private get rpUser(): RpUser {
    return { name: this.userName, description: this.config.general.userDescription };
  }

  private get assistantName(): string {
    return this.card?.data.name ?? '喵鱼';
  }

  private get modelLabel(): string {
    return this.profile ? `${this.profile.name}/${this.profile.model}` : '（未配置模型）';
  }

  private get busy(): boolean {
    return this.abortCtrl !== null;
  }

  private tokensLabel(): string {
    const n = (this.session?.usage.promptTokens ?? 0) + (this.session?.usage.completionTokens ?? 0);
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k tok` : `${n} tok`;
  }

  private async saveConfig(): Promise<void> {
    // 配置保存在浏览器本地：推送给客户端缓存即可，不写 D1
    this.emitConfig();
  }

  private async saveCards(): Promise<void> {
    // 角色卡存浏览器本地：推送 sync 事件即可（云端零持久化）
    this.emitSync();
  }

  private async saveSession(touch = true): Promise<void> {
    if (!this.session) return;
    if (touch) this.session.updatedAt = Date.now();
    await this.stores.saveSession(this.session);
    await this.syncSessionList();
    this.emitSync();
  }

  /* ---------- 浏览器本地数据同步（云端零持久化） ---------- */

  /** 连接时浏览器上传本地数据（会话/角色卡/当前会话），重建 DO 内存态 */
  async applyLocalData(raw: Record<string, unknown> | null): Promise<void> {
    if (!raw || typeof raw !== 'object') return;
    if (Array.isArray(raw.sessions)) {
      for (const s of raw.sessions) {
        const row = s as Partial<CfSessionRow> | null;
        if (row && typeof row === 'object' && typeof row.id === 'string' && Array.isArray(row.messages)) {
          const usage =
            row.usage && typeof row.usage === 'object' && typeof row.usage.promptTokens === 'number' && typeof row.usage.completionTokens === 'number'
              ? row.usage
              : { promptTokens: 0, completionTokens: 0 };
          await this.stores.saveSession({ ...row, usage } as CfSessionRow);
        }
      }
    }
    if (Array.isArray(raw.cards)) {
      const stored = (raw.cards as { name?: unknown; data?: CharacterCard }[])
        .filter(
          (c): c is { name: string; data: CharacterCard } =>
            !!c && typeof c === 'object' && typeof c.name === 'string' && !!c.data && !!c.data.data && typeof c.data.data.name === 'string' && c.name !== MEOWFISH_CARD.data.name,
        );
      this.cards = [{ name: MEOWFISH_CARD.data.name, data: MEOWFISH_CARD }, ...stored];
      const wanted = this.config.general.defaultCharacter;
      this.card = (this.cards.find((c) => c.name === wanted) ?? this.cards[0])?.data ?? null;
    }
    if (typeof raw.currentId === 'string' && raw.currentId) {
      const s = await this.stores.loadSession(raw.currentId);
      if (s) this.session = s;
    }
    this.ui.setModeLabel(this.toolsOn ? 'AGENT' : 'RP');
    this.ui.setToolsBadge?.(this.toolsOn);
    this.ui.setWebSearchBadge?.(this.webSearchOn);
    this.ui.setTitle(this.session?.title ?? 'MeowFish');
    this.syncDisplay();
    await this.syncSessionList();
    this.emitSync();
  }

  /** 把完整数据快照推给浏览器持久化（会话全量 + 角色卡 + 当前会话 id） */
  private async emitSync(): Promise<void> {
    const sessions = await this.stores.listSessions();
    this.ui.emitEvent({
      type: 'sync',
      data: { sessions, cards: this.cards, currentId: this.session?.id ?? '' },
    });
  }

  private async syncSessionList(): Promise<void> {
    const list = await this.stores.listSessions();
    this.ui.setSessions(list.map((s) => ({ id: s.id, type: s.type, title: s.title, model: s.model, updatedAt: s.updatedAt, pinned: s.pinned === true })), this.session?.id ?? '');
  }

  private syncDisplay(): void {
    this.ui.clearMessages();
    for (const m of this.session?.messages ?? []) this.ui.pushMessage(this.toDisplay(m));
  }

  private toDisplay(m: ChatMessage): DisplayMsg {
    switch (m.role) {
      case 'user':
        return { role: 'user', name: this.userName, content: m.content };
      case 'assistant':
        return { role: 'assistant', name: this.assistantName, content: m.content };
      case 'tool':
        return { role: 'tool', toolLabel: m.content.split('\n')[0]?.slice(0, 60) ?? '工具', content: m.content };
      default:
        return { role: 'system', content: m.content };
    }
  }

  /* ---------- 工具执行（Worker 直连 SSH） ---------- */

  private sshCfg(): SshConfig | null {
    const s = this.config.ssh;
    if (!s?.host || !s.user) return null;
    return {
      host: s.host,
      port: s.port || 22,
      user: s.user,
      auth: s.authKind === 'key' ? { kind: 'key', privateKey: s.privateKey } : { kind: 'password', password: s.password },
      expectedFingerprint: s.fingerprint || undefined,
    };
  }

  private sshLabel(): string {
    const s = this.config.ssh;
    if (!s?.host) return '';
    return `${s.user}@${s.host}${s.port && s.port !== 22 ? `:${s.port}` : ''}`;
  }

  /** 单条远程命令执行（含 TOFU 指纹记录与超时；用户中断时立即断开） */
  private async sshRun(cmd: string, timeoutMs = 60_000): Promise<string> {
    const ssh = this.sshCfg();
    if (!ssh) return '（未配置 SSH 服务器：用 /ssh 配置后即可控制远程服务器）';
    const { sshExec } = await import('./ssh.js');
    const { cloudflareTcp } = await import('./socket.js');
    const r = await sshExec({ ...ssh, timeoutMs, signal: this.abortCtrl?.signal, transport: cloudflareTcp }, cmd);
    if (!this.config.ssh!.fingerprint && r.hostFingerprint) {
      // 首次连接：记录主机指纹（TOFU）
      this.config.ssh!.fingerprint = r.hostFingerprint;
      this.emitConfig();
      this.ui.pushSystem(`首次连接 ${this.sshLabel()}，已记录主机指纹: ${r.hostFingerprint}（后续连接会校验，防止中间人攻击）`);
    }
    if (r.code !== 0) {
      const body = (r.stdout + (r.stdout && r.stderr ? '\n' : '') + r.stderr).trim();
      return `（远程命令退出码 ${r.code}）${body ? `\n${body}` : ''}`;
    }
    return r.stdout;
  }

  /** 文件/bash 工具经 SSH 执行 */
  private async sshTool(name: string, args: Record<string, unknown>): Promise<string> {
    switch (name) {
      case 'bash':
        return this.sshRun(String(args.command ?? ''), 120_000);
      case 'read_file':
        return this.sshRun(buildReadCmd(String(args.path ?? '')), 30_000);
      case 'write_file': {
        const path = String(args.path ?? '');
        const content = String(args.content ?? '');
        for (const c of buildWriteCmd(path, content)) {
          const out = await this.sshRun(c, 30_000);
          if (out.startsWith('（')) return out;
        }
        return `已写入 ${path}（${content.length} 字符）`;
      }
      case 'edit_file': {
        const path = String(args.path ?? '');
        const oldStr = String(args.old_string ?? '');
        const newStr = String(args.new_string ?? '');
        const replaceAll = args.replace_all === true;
        const original = await this.sshRun(buildReadCmd(path), 30_000);
        if (original.startsWith('（')) return original;
        const count = original.split(oldStr).length - 1;
        if (count === 0) return `未找到匹配内容: ${oldStr.slice(0, 80)}`;
        if (count > 1 && !replaceAll) return `old_string 出现了 ${count} 次，不唯一。请加长上下文使其唯一，或设置 replace_all: true`;
        const updated = replaceAll ? original.split(oldStr).join(newStr) : original.replace(oldStr, newStr);
        for (const c of buildWriteCmd(path, updated)) {
          const out = await this.sshRun(c, 30_000);
          if (out.startsWith('（')) return out;
        }
        return `已修改 ${path}（替换 ${count} 处）`;
      }
      case 'glob': {
        const pattern = String(args.pattern ?? '*').split('\\').join('/');
        const base = String(args.path ?? '.');
        const out = await this.sshRun(buildListCmd(base), 30_000);
        if (out.startsWith('（')) return out;
        const re = globToRegExp(pattern);
        const matched = out.split('\n').map((l) => l.trim()).filter((l) => l && re.test(l)).slice(0, 200);
        return matched.length ? matched.join('\n') : '（无匹配文件）';
      }
      case 'grep':
        return this.sshRun(buildGrepCmd(String(args.pattern ?? ''), String(args.path ?? '.')), 60_000);
      default:
        return `未知工具: ${name}`;
    }
  }

  private async callTool(name: string, args: Record<string, unknown>, authorized: boolean): Promise<string> {
    if (name === 'web_search' || name === 'web_fetch') {
      // 联网工具直接在 Worker 执行（CF 网络无墙）
      if (name === 'web_search') {
        const results = await webSearch(String(args.query ?? ''), Number(args.count ?? 5), this.abortCtrl?.signal, Number(args.page ?? 1));
        return results.length
          ? results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n')
          : '（没有搜到结果）';
      }
      const url = String(args.url ?? '');
      const { webFetchPage } = await import('./core/web.js');
      return webFetchPage(url);
    }
    // 纵深防御：即使调用方漏判，未授权的写操作/命令也不得执行
    if (!authorized && !READ_TOOLS.has(name)) return '（操作未获用户授权）';
    if (this.sshCfg()) return this.sshTool(name, args);
    // 未配置 SSH 且未配置工具守护：直接给模型可执行的 /ssh 引导，避免它去猜 wrangler.toml
    if (!this.env.toolServerConfigured) {
      return this.lang === 'en'
        ? '（No SSH server configured yet. Ask the user to run /ssh and fill in host / port / user / password (or ed25519 private key) — all tools then run over Worker→SSH directly, no TOOL_SERVER_URL needed.）'
        : '（还没有配置 SSH 服务器：请让用户输入 /ssh，填写主机 / 端口 / 用户名 / 密码或 ed25519 私钥。配置完成后所有工具都由 Worker 直连 SSH 执行，不需要 TOOL_SERVER_URL / TOOL_SERVER_TOKEN。）';
    }
    // 未配置 SSH：走工具守护兜底（旧部署方式）
    const r = await this.env.toolCall(name, args, authorized);
    return r.output;
  }

  private confirmTool(tool: string, detail: string): Promise<'once' | 'always' | 'deny'> {
    return new Promise((resolvePromise) => {
      // DO 空闲约 30s 会被回收：授权确认必须在回收前有确定结果，否则等待它的请求永久挂起、busy 卡死
      const timer = setTimeout(() => {
        this.ui.cancelConfirm();
        this.ui.setStatus('idle');
        resolvePromise('deny');
      }, 20_000);
      this.ui.setStatus('waiting');
      this.ui.openConfirm({
        title: this.lang === 'en' ? 'Permission required' : '权限确认',
        detail: `${this.lang === 'en' ? (tool === 'bash' ? 'Run command on the remote server' : 'Modify files on the remote server') : tool === 'bash' ? '即将在远程服务器执行命令' : '即将修改远程服务器文件'}:\n${detail}`,
        options: [
          { key: 'y', label: this.lang === 'en' ? 'Allow once' : '允许一次' },
          { key: 'a', label: this.lang === 'en' ? 'Always allow' : '总是允许' },
          { key: 'd', label: this.lang === 'en' ? 'Deny' : '拒绝' },
        ],
        onChoose: (opt) => {
          clearTimeout(timer);
          resolvePromise(opt.key === 'y' ? 'once' : opt.key === 'a' ? 'always' : 'deny');
        },
        onCancel: () => {
          clearTimeout(timer);
          resolvePromise('deny');
        },
      });
    });
  }

  /** 云端权限判定：yolo / 只读 / 已存规则 / 用户确认；「总是允许」会写入浏览器本地配置 */
  private async checkPermission(tool: string, detail: string): Promise<{ allowed: boolean; output?: string }> {
    if (this.yolo || READ_TOOLS.has(tool)) return { allowed: true };
    const perms = this.config.permissions ?? (this.config.permissions = { allow: [], deny: [] });
    const deny = Array.isArray(perms.deny) ? perms.deny : [];
    if (deny.some((r) => matchesRule(r, detail))) return { allowed: false, output: '（操作被拒绝规则拦截）' };
    const allow = Array.isArray(perms.allow) ? perms.allow : (perms.allow = []);
    if (allow.some((r) => matchesRule(r, detail))) return { allowed: true };
    if (tool === 'bash' && isReadOnlyCommand(detail)) return { allowed: true };
    const decision = await this.confirmTool(tool, detail);
    if (decision === 'always') {
      if (!allow.some((r) => matchesRule(r, detail))) allow.push(detail);
      this.emitConfig();
      return { allowed: true };
    }
    if (decision === 'once') return { allowed: true };
    return { allowed: false, output: '（用户拒绝了该操作）' };
  }

  /* ---------- 主流程 ---------- */

  async send(text: string, voice = false): Promise<void> {
    // 消息级语音标记：语音识别发送时带上（DO 会被回收，不能只依赖 /voice 命令的易失状态）
    if (voice && !this.voiceChat) {
      this.voiceChat = true;
      this.config.general.voiceChat = true;
      this.emitConfig();
    }
    if (this.busy || !this.session) return;
    if (this.toolsOn && text.startsWith('!')) {
      await this.directBash(text.slice(1).trim());
      return;
    }
    let resolved = text;
    try {
      if (this.toolsOn) resolved = await this.resolveAtRefs(text);
    } catch (e) {
      this.ui.pushSystem(`⚠ 文件引用失败: ${e instanceof Error ? e.message : String(e)}`);
    }
    this.session.messages.push({ role: 'user', content: resolved });
    this.ui.pushMessage({ role: 'user', name: this.userName, content: text });
    await this.generate();
  }

  /** @文件引用：远程文件（经工具服务器读取） */
  private async resolveAtRefs(text: string): Promise<string> {
    const re = /@([^\s@]+)/g;
    let m: RegExpExecArray | null;
    let out = text;
    const seen = new Set<string>();
    while ((m = re.exec(text)) !== null) {
      const ref = m[1]!;
      if (seen.has(ref)) continue;
      seen.add(ref);
      const content = await this.callTool('read_file', { path: ref }, false);
      out = out.replace(new RegExp(`@${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), `[文件 ${ref}]\n${content}\n[文件结束]`);
    }
    return out;
  }

  private async directBash(command: string): Promise<void> {
    if (!command) return;
    this.abortCtrl = new AbortController();
    try {
      this.ui.pushMessage({ role: 'tool', toolLabel: command.slice(0, 60), content: '运行中…' });
      this.ui.setStatus('tool', command);
      const check = await this.checkPermission('bash', command);
      const output = check.allowed
        ? await this.callTool('bash', { command }, true)
        : (check.output ?? '（用户拒绝了该操作）');
      this.ui.replaceLastMessage({ role: 'tool', toolLabel: output.split('\n')[0]?.slice(0, 60) ?? '', content: output });
      this.session!.messages.push({ role: 'user', content: `!${command}` }, { role: 'assistant', content: `命令输出:\n${output}` });
      this.ui.setStatus('idle');
      await this.saveSession();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.ui.replaceLastMessage({ role: 'tool', toolLabel: '执行出错', content: msg });
      this.ui.setStatus('error', msg);
    } finally {
      this.abortCtrl = null;
    }
  }

  private async generate(): Promise<void> {
    if (!this.profile || !this.session) {
      this.ui.pushSystem(this.lang === 'en' ? 'No model configured — use /models to add (name/BaseUrl/API Key/model)' : '还没有配置模型——用 /models 添加（名称/BaseUrl/API Key/模型名）');
      return;
    }
    if (!this.card) {
      this.ui.pushSystem(this.lang === 'en' ? 'No character card — use /character to create or import (JSON)' : '还没有角色卡——用 /character 新建或粘贴导入(JSON)');
      return;
    }
    const card = this.card;
    this.abortCtrl = new AbortController();
    this.ui.setStatus('thinking');
    try {
      // 工具暴露：电脑权限开 → 全部；仅联网开关开 → 仅 web 工具；都关 → 无工具
      const defs = this.toolsOn ? TOOL_DEFS : this.webSearchOn ? WEB_ONLY_TOOL_DEFS : [];
      await this.toolLoop(card, defs);
      this.ui.finalizeStreaming();
      this.ui.setTokens(this.tokensLabel());
      this.ui.setStatus('idle');
      await this.saveSession();
    } catch (e) {
      const aborted = this.abortCtrl.signal.aborted;
      if (aborted) {
        this.ui.failStreaming('（已中断）');
        this.ui.setStatus('idle');
      } else {
        const msg = e instanceof LlmError ? e.message : e instanceof Error ? e.message : String(e);
        this.ui.failStreaming(`⚠ ${msg}`);
        this.ui.setStatus('error', msg);
      }
    } finally {
      this.abortCtrl = null;
    }
  }

  /** 工具循环（本地实现，不依赖 node 环境）。toolDefs 决定暴露哪些工具：
   *  默认全部（电脑权限开）；传 WEB_ONLY_TOOL_DEFS 则仅联网工具 */
  private async toolLoop(card: CharacterCard, toolDefs: ToolDef[] = TOOL_DEFS): Promise<void> {
    const systemMsg: ChatMessage = {
      role: 'system',
      content: buildRpSystem(card, this.rpUser) + '\n\n' + buildToolSection(toolDefs.map((t) => t.function.name), this.sshCfg() ? `SSH 远程服务器 ${this.sshLabel()}` : '（未配置 SSH 服务器）') + (this.voiceChat ? '\n\n' + buildVoiceSection() : ''),
    };
    const messages: ChatMessage[] = [...this.session!.messages];
    let streaming = false;
    let streamingContent = false;
    let streamingReasoning = false;
    for (let iter = 0; iter < 25; iter++) {
      const reqMessages: ChatMessage[] = [systemMsg, ...messages];
      // 语音对话模式：关闭思考（reasoner 首字太慢，语音场景禁用）
      const genProfile = this.voiceChat ? { ...this.profile!, thinking: false } : this.profile!;
      const result = await chat(
        {
          profile: genProfile,
          apiKey: genProfile.apiKey,
          tools: toolDefs,
          signal: this.abortCtrl!.signal,
          onEvent: (ev) => {
            if (ev.reasoningDelta) {
              if (!streaming) {
                this.ui.beginStreaming(this.assistantName);
                streaming = true;
              }
              streamingReasoning = true;
              this.ui.appendReasoning?.(ev.reasoningDelta);
            }
            if (ev.delta) {
              if (!streaming) {
                this.ui.setStatus('streaming');
                this.ui.beginStreaming(this.assistantName);
                streaming = true;
              }
              streamingContent = true;
              this.ui.appendDelta(ev.delta);
            }
          },
        },
        reqMessages,
      );
      this.session!.usage.promptTokens += result.usage.promptTokens;
      this.session!.usage.completionTokens += result.usage.completionTokens;
      messages.push(result.message);
      if (!result.message.tool_calls?.length) break;
      for (const call of result.message.tool_calls) {
        if (streaming) {
          if (!streamingContent && !streamingReasoning) this.ui.removeLastMessage();
          else this.ui.finalizeStreaming();
          streaming = false;
          streamingContent = false;
          streamingReasoning = false;
        }
        const name = call.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          args = { content: call.function.arguments };
        }
        const label = name === 'bash' ? String(args.command ?? '').slice(0, 120) : String(args.path ?? args.pattern ?? args.url ?? '');
        const detail = name === 'bash' ? String(args.command ?? '') : label;
        this.ui.setStatus('tool', label);
        this.ui.pushMessage({ role: 'tool', toolLabel: `${name}${label ? ': ' + label : ''}`, content: '运行中…' });
        const check = await this.checkPermission(name, detail);
        let output: string;
        try {
          output = check.allowed
            ? await this.callTool(name, args, true)
            : (check.output ?? '（用户拒绝了该操作）');
        } catch (e) {
          output = `工具执行出错: ${e instanceof Error ? e.message : String(e)}`;
        }
        this.ui.replaceLastMessage({ role: 'tool', toolLabel: output.split('\n')[0]?.slice(0, 60) ?? '', content: output });
        messages.push({ role: 'tool', content: output, tool_call_id: call.id });
      }
    }
    this.session!.messages = messages;
  }

  abort(): void {
    this.ui.cancelConfirm();
    this.abortCtrl?.abort();
  }

  /* ---------- 会话管理 ---------- */

  async loadSession(id: string): Promise<void> {
    const row = await this.stores.loadSession(id);
    if (!row) {
      this.ui.pushSystem(this.lang === 'en' ? 'Failed to load session' : '会话加载失败');
      return;
    }
    // 切换会话不保存旧会话：会话已在消息变更时落库，这里保存会刷新 updatedAt（列表时间变「刚刚」且触发重排）
    this.session = row;
    const cardName = row.character;
    this.card = this.cards.find((c) => c.name === cardName)?.data ?? this.card;
    this.ui.setTitle(row.title);
    this.ui.setTokens(this.tokensLabel());
    this.syncDisplay();
    await this.syncSessionList();
    await this.emitSync();
    this.ui.pushSystem(this.lang === 'en' ? `Session loaded: ${row.title}` : `已加载会话: ${row.title}`);
  }

  async deleteSession(id: string): Promise<void> {
    if (id === this.session?.id) {
      this.ui.pushSystem(this.lang === 'en' ? 'Cannot delete the current session — switch first' : '不能删除当前会话，请先切换到其他会话');
      return;
    }
    await this.stores.deleteSession(id);
    await this.syncSessionList();
    await this.emitSync();
    this.ui.pushSystem(this.lang === 'en' ? 'Session deleted' : '已删除会话');
  }

  /** 置顶/取消置顶会话（侧边栏 📌） */
  async togglePin(id: string): Promise<void> {
    const row = await this.stores.loadSession(id);
    if (!row) {
      this.ui.pushSystem(this.lang === 'en' ? 'Session not found' : '会话不存在');
      return;
    }
    row.pinned = !(row.pinned === true);
    await this.stores.saveSession(row);
    // 若置顶的是当前会话，内存态同步 pinned 且不刷新 updatedAt
    if (this.session && this.session.id === id) {
      this.session.pinned = row.pinned;
    }
    await this.syncSessionList();
    await this.emitSync();
    this.ui.pushSystem(
      row.pinned
        ? (this.lang === 'en' ? `Pinned: ${row.title}` : `已置顶: ${row.title}`)
        : (this.lang === 'en' ? `Unpinned: ${row.title}` : `已取消置顶: ${row.title}`),
    );
  }

  async deleteSessions(ids: string[]): Promise<void> {
    const targets = [...new Set(ids)].filter((id) => id !== this.session?.id);
    if (!targets.length) {
      this.ui.pushSystem(this.lang === 'en' ? 'Nothing to delete (current session excluded)' : '没有可删除的会话（当前会话除外）');
      return;
    }
    for (const id of targets) await this.stores.deleteSession(id);
    await this.syncSessionList();
    await this.emitSync();
    this.ui.pushSystem(this.lang === 'en' ? `Cleaned ${targets.length} session(s)` : `已清理 ${targets.length} 个会话`);
  }

  /* ---------- 斜杠命令 ---------- */

  async command(line: string): Promise<void> {
    const [cmd, ...args] = line.slice(1).split(/\s+/);
    const rest = (i: number) => args.slice(i).join(' ');
    switch (cmd) {
      case 'help':
        this.ui.openHelp({ title: this.lang === 'en' ? 'meowfish help' : 'meowfish 帮助', text: helpText(this.lang) });
        return;
      case 'about':
        this.ui.openHelp({ title: 'About', text: aboutText(this.lang) });
        return;
      case 'model':
        this.openModel();
        return;
      case 'models':
        this.openModelManager();
        return;
      case 'tools':
        this.toggleTools();
        return;
      case 'websearch':
        this.toggleWebSearch();
        return;
      case 'voice':
        this.setVoiceChat(args[0] !== 'off');
        return;
      case 'ssh':
        this.openSshForm();
        return;
      case 'config':
        this.openConfigPanel();
        return;
      case 'theme':
        this.ui.openPicker({
          title: this.lang === 'en' ? 'Switch theme' : '切换主题',
          items: BUILTIN_THEMES.map((t) => ({ label: t.name, detail: t.id, value: t.id })),
          onSelect: (id) => {
            const t = BUILTIN_THEMES.find((x) => x.id === id);
            if (!t) return;
            this.ui.setTheme(t);
            this.config.general.theme = t.id;
            void this.saveConfig();
            this.ui.pushSystem(this.lang === 'en' ? `Theme switched: ${t.name}` : `已切换主题: ${t.name}`);
          },
        });
        return;
      case 'daynight':
        this.toggleDayNight();
        return;
      case 'kaomoji':
        this.ui.openPicker({
          title: this.lang === 'en' ? 'Kaomoji style' : '颜文字风格',
          items: BUILTIN_PACKS.map((p) => ({ label: p.name, detail: p.id, value: p.id })),
          onSelect: (id) => {
            const p = BUILTIN_PACKS.find((x) => x.id === id);
            if (!p) return;
            this.ui.setPack(p);
            this.config.general.kaomojiStyle = p.id;
            void this.saveConfig();
            this.ui.pushSystem(this.lang === 'en' ? `Kaomoji style: ${p.name} ${p.states.idle[0] ?? ''}` : `已切换颜文字风格: ${p.name} ${p.states.idle[0] ?? ''}`);
          },
        });
        return;
      case 'new':
        await this.newChat();
        return;
      case 'sessions': {
        if (args[0] === 'clean') {
          const others = (await this.stores.listSessions()).filter((s) => s.id !== this.session?.id);
          if (!others.length) {
            this.ui.pushSystem(this.lang === 'en' ? '（nothing to clean）' : '（没有可清理的会话）');
            return;
          }
          this.ui.openConfirm({
            title: '批量清理',
            detail: `将删除除当前会话外的全部 ${others.length} 个历史会话，不可恢复。`,
            options: [
              { key: 'y', label: '删除' },
              { key: 'd', label: '取消' },
            ],
            onChoose: (opt) => {
              if (opt.key === 'y') void this.deleteSessions(others.map((o) => o.id));
            },
          });
          return;
        }
        const list = await this.stores.listSessions();
        if (!list.length) {
          this.ui.pushSystem(this.lang === 'en' ? '（no past sessions）' : '（没有历史会话）');
          return;
        }
        this.ui.openPicker({
          title: '历史会话',
          items: list.map((s) => ({
            label: `${s.id === this.session?.id ? '● ' : ''}${s.title}`,
            detail: `${s.id === this.session?.id ? '当前 · ' : ''}${s.model} · ${new Date(s.updatedAt).toLocaleString()}`,
            value: s.id,
          })),
          onSelect: (id) => void this.loadSession(id),
        });
        return;
      }
      case 'export': {
        const s = this.session;
        if (!s) return;
        const lines = [
          `# ${s.title}`,
          '',
          `- 模型: ${s.model}`,
          `- 导出时间: ${new Date().toISOString()}`,
          '',
          '---',
          '',
        ];
        for (const m of s.messages) {
          if (m.role === 'user') lines.push(`**${this.userName}**: ${m.content}`, '');
          else if (m.role === 'assistant') lines.push(`**${s.character ?? '角色'}**: ${m.content}`, '');
          else if (m.role === 'tool') lines.push('```', m.content, '```', '');
        }
        this.ui.pushMessage({ role: 'tool', toolLabel: '会话导出', content: lines.join('\n') });
        return;
      }
      case 'cost':
        this.ui.pushSystem(`本次会话用量: ${this.session?.usage.promptTokens ?? 0} prompt + ${this.session?.usage.completionTokens ?? 0} completion tokens`);
        return;
      case 'permissions': {
        const r = this.config.permissions;
        this.ui.pushSystem(`授权规则（yolo: ${this.yolo ? '开' : '关'}）\n总是允许: ${r.allow.length ? r.allow.join(' | ') : '（无）'}\n总是拒绝: ${r.deny.length ? r.deny.join(' | ') : '（无）'}\n（规则由 Worker 权限层执行：直连 SSH，未配置 SSH 时经工具守护兜底）`);
        return;
      }
      case 'yolo':
        this.yolo = !this.yolo;
        this.config.general.yolo = this.yolo;
        this.ui.setYoloBadge(this.yolo);
        this.emitConfig();
        this.ui.pushSystem(this.yolo ? 'yolo 模式已开启 —— 所有操作放行' : 'yolo 模式已关闭，操作需要授权');
        return;
      case 'swipe':
        await this.swipe();
        return;
      case 'continue':
        await this.continueLast();
        return;
      case 'edit': {
        const n = args[0] !== undefined && /^\d+$/.test(args[0]) ? parseInt(args[0], 10) : 1;
        const text = /^\d+$/.test(args[0] ?? '') ? rest(1) : rest(0);
        if (!text) {
          this.ui.pushSystem('用法: /edit [n] <新内容>');
          return;
        }
        await this.editMessage(n, text);
        return;
      }
      case 'del': {
        const n = args[0] !== undefined && /^\d+$/.test(args[0]) ? parseInt(args[0], 10) : 1;
        await this.deleteMessage(n);
        return;
      }
      case 'character':
        await this.characterCommand(args);
        return;
      case 'profile':
        this.openProfileForm();
        return;
      case 'search': {
        const query = rest(0);
        if (!query) {
          this.openSearchForm();
          return;
        }
        void this.runSearch(query);
        return;
      }
      case 'at':
        await this.openFilePicker();
        return;
      default:
        this.ui.pushSystem(this.lang === 'en' ? `Unknown command: /${cmd}. Type /help.` : `未知命令: /${cmd}。输入 /help 查看帮助。`);
        return;
    }
  }

  /* ---------- 模型管理 ---------- */

  private openModel(): void {
    const items = this.config.profiles.map((p) => ({
      label: p.name,
      detail: `${p.model}${p.name === this.profile?.name ? ' · 当前' : ''}`,
      value: p.name,
    }));
    items.push({ label: '⚙ 管理模型…', detail: '添加 / 编辑 / 删除', value: '__manage__' });
    this.ui.openPicker({
      title: '切换模型',
      items,
      filterable: true,
      onSelect: (v) => {
        if (v === '__manage__') this.openModelManager();
        else this.useModel(v);
      },
    });
  }

  private useModel(name: string): void {
    const p = this.config.profiles.find((x) => x.name === name);
    if (!p) return;
    this.profile = p;
    if (this.session) this.session.model = name;
    this.ui.setModelLabel(this.modelLabel);
    this.config.general.defaultModel = name;
    void this.saveConfig();
    this.ui.pushSystem(this.lang === 'en' ? `Model switched: ${this.modelLabel} ฅ(^•ω•^)ฅ` : `已切换模型: ${this.modelLabel} ฅ(^•ω•^)ฅ`);
  }

  private openModelManager(): void {
    const L = this.lang;
    const items = this.config.profiles.map((p) => ({
      label: `${p.name}${p.name === this.config.general.defaultModel ? ' ★' : ''}${p.name === this.profile?.name ? ' ●' : ''}`,
      detail: p.model,
      value: p.name,
    }));
    items.push({ label: L === 'en' ? '＋ Add model' : '＋ 添加新模型', detail: L === 'en' ? 'form wizard' : '表单向导', value: '__add__' });
    this.ui.openPicker({
      title: L === 'en' ? 'Model manager' : '模型管理',
      items,
      onSelect: (v) => {
        if (v === '__add__') this.openModelForm();
        else this.openModelActions(v);
      },
    });
  }

  private openModelActions(name: string): void {
    const L = this.lang;
    const p = this.config.profiles.find((x) => x.name === name);
    if (!p) return;
    this.ui.openPicker({
      title: L === 'en' ? `Model "${p.name}"` : `模型「${p.name}」`,
      items: [
        { label: L === 'en' ? 'Use this model' : '使用此模型', value: 'use' },
        { label: L === 'en' ? 'Set as default' : '设为默认', value: 'default' },
        { label: L === 'en' ? 'Edit' : '编辑', value: 'edit' },
        { label: L === 'en' ? 'Delete' : '删除', value: 'delete' },
        { label: L === 'en' ? 'Back to list' : '返回列表', value: 'back' },
      ],
      onSelect: (action) => {
        switch (action) {
          case 'use':
            this.useModel(name);
            break;
          case 'default':
            this.config.general.defaultModel = name;
            void this.saveConfig();
            this.ui.pushSystem(L === 'en' ? `Default model set: ${name}` : `默认模型已设为: ${name}`);
            break;
          case 'edit':
            this.openModelForm(p);
            break;
          case 'delete':
            this.ui.openConfirm({
              title: L === 'en' ? 'Delete model' : '删除模型',
              detail: L === 'en' ? `Delete profile "${name}"?` : `确定删除 profile「${name}」吗？`,
              options: [
                { key: 'y', label: L === 'en' ? 'Delete' : '删除' },
                { key: 'd', label: L === 'en' ? 'Cancel' : '取消' },
              ],
              onChoose: (opt) => {
                if (opt.key === 'y') {
                  this.config.profiles = this.config.profiles.filter((x) => x.name !== name);
                  if (this.profile?.name === name) this.profile = this.config.profiles[0] ?? null;
                  void this.saveConfig();
                  this.ui.pushSystem(L === 'en' ? `Model deleted: ${name}` : `已删除模型: ${name}`);
                }
              },
            });
            break;
          case 'back':
            this.openModelManager();
            break;
        }
      },
    });
  }

  private openModelForm(existing?: ModelProfile): void {
    const L = this.lang;
    const fmt = (v: number | undefined, d = '') => (v !== undefined ? String(v) : d);
    const pKey = existing ? presetKeyOf(existing.baseUrl) : 'deepseek';
    const preset = pKey ? MODEL_PRESETS[pKey] : null;
    const levelLabel = (lv: 'low' | 'high' | 'max'): string =>
      L === 'en' ? (lv === 'low' ? 'Low' : lv === 'high' ? 'High' : 'Max') : lv === 'low' ? '低' : lv === 'high' ? '高' : '最高';
    const onOff = (v: boolean | undefined, d = ''): string => (v === undefined ? d : v ? (L === 'en' ? 'On' : '开') : L === 'en' ? 'Off' : '关');
    const presetOptions = [L === 'en' ? 'Custom' : '自定义', ...Object.values(MODEL_PRESETS).map((p) => p.label)];
    this.ui.openForm({
      title: existing ? (L === 'en' ? `Edit model "${existing.name}"` : `编辑模型「${existing.name}」`) : L === 'en' ? 'Add model' : '添加模型',
      fields: [
        { label: L === 'en' ? 'Provider' : '提供商', value: preset?.label ?? presetOptions[0]!, options: presetOptions, placeholder: L === 'en' ? 'Pick a preset to autofill' : '选预设自动填下方字段' },
        { label: 'Name', value: existing?.name ?? (preset ? pKey! : ''), placeholder: L === 'en' ? 'short name, e.g. deepseek' : '如 deepseek（切换用短名）' },
        { label: 'BaseUrl', value: existing?.baseUrl ?? preset?.baseUrl ?? '', placeholder: 'https://api.deepseek.com' },
        { label: 'API Key', value: existing?.apiKey ?? '', placeholder: L === 'en' ? 'plain key (stored in your browser only)' : '直接写 key（存浏览器本地）' },
        { label: 'Model', value: existing?.model ?? preset?.model ?? '', placeholder: 'deepseek-v4-flash' },
        { label: 'Temperature', value: fmt(existing?.temperature, preset?.temperature !== undefined ? String(preset.temperature) : '1.0'), placeholder: '0~2' },
        { label: 'Top P', value: fmt(existing?.topP, '1.0'), placeholder: '0~1' },
        { label: L === 'en' ? 'Max output' : '最大输出', value: fmt(existing?.maxTokens), placeholder: L === 'en' ? 'default 4096' : '默认 4096' },
        { label: L === 'en' ? 'Context length' : '上下文长度', value: fmt(existing?.contextLength, '64000'), placeholder: L === 'en' ? 'tokens' : 'token 数' },
        { label: L === 'en' ? 'Thinking' : '思考', value: onOff(existing?.thinking, preset?.thinking !== undefined ? onOff(preset.thinking) : ''), placeholder: L === 'en' ? 'On / Off, empty = unset' : '开 / 关，留空不设置' },
        { label: L === 'en' ? 'Thinking level' : '思考强度', value: existing?.thinkingLevel ? levelLabel(existing.thinkingLevel) : preset?.thinkingLevel ? levelLabel(preset.thinkingLevel) : '', placeholder: L === 'en' ? 'Low / High / Max' : '低 / 高 / 最高' },
      ],
      presets: {
        selector: 0,
        map: Object.fromEntries(
          Object.entries(MODEL_PRESETS).map(([key, p]) => [
            p.label,
            [
              { field: 2, value: p.baseUrl },
              { field: 4, value: p.model },
              ...(p.temperature !== undefined ? [{ field: 5, value: String(p.temperature) }] : []),
              ...(p.thinking !== undefined ? [{ field: 9, value: onOff(p.thinking) }] : []),
              ...(p.thinkingLevel ? [{ field: 10, value: levelLabel(p.thinkingLevel) }] : []),
            ],
          ]),
        ),
      },
      onSubmit: (values) => {
        const [, name, baseUrl, apiKey, model, temperature, topP, maxTokens, contextLength, thinking, thinkingLevel] = values as string[];
        const nameT = name.trim();
        const baseT = baseUrl.trim().replace(/\/+$/, '');
        const modelT = model.trim();
        if (!nameT || !baseT || !modelT) {
          this.ui.pushSystem(this.lang === 'en' ? '⚠ Name / BaseUrl / Model are required' : '⚠ 名称 / BaseUrl / 模型名 必填');
          return;
        }
        if ((!existing || existing.name !== nameT) && this.config.profiles.some((x) => x.name === nameT)) {
          this.ui.pushSystem(this.lang === 'en' ? `⚠ Profile "${nameT}" already exists` : `⚠ 已存在同名 profile「${nameT}」`);
          return;
        }
        const profile: ModelProfile = { name: nameT, baseUrl: baseT, model: modelT };
        if (apiKey.trim()) profile.apiKey = apiKey.trim();
        const num = (v: string) => {
          const n = Number(v);
          return Number.isNaN(n) ? undefined : n;
        };
        const temp = num(temperature);
        if (temp !== undefined) profile.temperature = temp;
        const tp = num(topP);
        if (tp !== undefined) profile.topP = tp;
        const mt = num(maxTokens);
        if (mt !== undefined && mt > 0) profile.maxTokens = Math.floor(mt);
        const ctx = num(contextLength);
        if (ctx !== undefined && ctx > 0) profile.contextLength = Math.floor(ctx);
        const thinkRaw = thinking.trim().toLowerCase();
        if (thinkRaw && ['开', 'true', '1', 'on', 'enabled'].includes(thinkRaw)) profile.thinking = true;
        else if (thinkRaw && ['关', 'false', '0', 'off', 'disabled'].includes(thinkRaw)) profile.thinking = false;
        const levelRaw = thinkingLevel.trim().toLowerCase();
        if (['低', 'low'].includes(levelRaw)) profile.thinkingLevel = 'low';
        else if (['高', 'high'].includes(levelRaw)) profile.thinkingLevel = 'high';
        else if (['最高', 'max'].includes(levelRaw)) profile.thinkingLevel = 'max';
        if (existing) {
          this.config.profiles = this.config.profiles.map((x) => (x.name === existing.name ? profile : x));
        } else {
          this.config.profiles.push(profile);
          this.config.general.defaultModel = this.config.general.defaultModel || nameT;
        }
        if (this.profile?.name === (existing?.name ?? nameT)) {
          this.profile = profile;
          this.ui.setModelLabel(this.modelLabel);
        }
        void this.saveConfig();
        this.ui.pushSystem(`已${existing ? '更新' : '添加'}模型: ${nameT} (◕‿◕✿)`);
      },
    });
  }

  /* ---------- 角色管理 ---------- */

  private async characterCommand(args: string[]): Promise<void> {
    const L = this.lang;
    if (args[0] === 'info') {
      const d = this.card?.data;
      if (!d) {
        this.ui.pushSystem(L === 'en' ? 'No character selected' : '当前没有选中角色');
        return;
      }
      this.ui.pushSystem(
        L === 'en'
          ? `【${d.name}】\n${d.description}\nPersonality: ${d.personality}\nScenario: ${d.scenario}`
          : `【${d.name}】\n${d.description}\n性格: ${d.personality}\n场景: ${d.scenario}`,
      );
      return;
    }
    const items = this.cards.map((c) => ({ label: c.name, detail: 'JSON', value: c.name }));
    items.push({ label: L === 'en' ? '＋ New character' : '＋ 新建角色卡', detail: L === 'en' ? 'form wizard' : '表单向导', value: '__new__' });
    items.push({ label: L === 'en' ? '⇩ Import (JSON)' : '⇩ 粘贴导入(JSON)', detail: L === 'en' ? 'paste character JSON' : '复制角色卡 JSON', value: '__paste__' });
    items.push({ label: L === 'en' ? '🗑 Batch manage' : '🗑 批量管理', detail: L === 'en' ? 'multi-select delete' : '多选删除', value: '__batch__' });
    this.ui.openPicker({
      title: L === 'en' ? 'Character manager' : '角色管理',
      items,
      filterable: true,
      onSelect: (v) => {
        if (v === '__new__') this.openCharacterForm();
        else if (v === '__paste__') this.openCharacterPaste();
        else if (v === '__batch__') this.openCharacterBatch();
        else this.openCharacterActions(v);
      },
    });
  }

  /** 批量管理角色：多选列表 → 确认删除 */
  private openCharacterBatch(): void {
    const L = this.lang;
    if (!this.ui.openMultiSelect) {
      this.ui.pushSystem(L === 'en' ? 'Batch manage is not supported in this UI — use the Web UI' : '当前界面不支持批量管理（请用 Web 界面）');
      return;
    }
    this.ui.openMultiSelect({
      title: L === 'en' ? 'Batch manage characters' : '批量管理角色',
      items: this.cards.map((c) => ({
        label: c.name,
        detail: this.card?.data.name === c.name ? (L === 'en' ? 'in use' : '使用中') : 'JSON',
        value: c.name,
      })),
      onConfirm: (values) => {
        if (!values.length) {
          this.ui.pushSystem(L === 'en' ? 'Nothing selected' : '未选择任何角色');
          return;
        }
        this.ui.openConfirm({
          title: L === 'en' ? 'Delete characters' : '删除角色',
          detail: L === 'en' ? `Delete ${values.length} character(s): ${values.join('、')}?` : `确定删除选中的 ${values.length} 个角色吗？\n${values.join('、')}`,
          options: [
            { key: 'y', label: L === 'en' ? 'Delete' : '删除' },
            { key: 'd', label: L === 'en' ? 'Cancel' : '取消' },
          ],
          onChoose: (opt) => {
            if (opt.key !== 'y') return;
            const removing = new Set(values);
            this.cards = this.cards.filter((c) => !removing.has(c.name));
            if (this.card && removing.has(this.card.data.name)) {
              this.card = this.cards.find((c) => c.name === this.config.general.defaultCharacter)?.data ?? this.cards[0]?.data ?? null;
            }
            void this.saveCards();
            this.ui.pushSystem(L === 'en' ? `Deleted ${values.length} character(s)` : `已删除 ${values.length} 个角色`);
          },
          onCancel: () => {},
        });
      },
    });
  }

  /** 角色操作菜单：使用 / 查看设定 / 编辑 / 删除 */
  private openCharacterActions(name: string): void {
    const L = this.lang;
    const entry = this.cards.find((c) => c.name === name);
    if (!entry) {
      this.ui.pushSystem(L === 'en' ? `Character "${name}" not found` : `没有找到角色「${name}」`);
      return;
    }
    this.ui.openPicker({
      title: L === 'en' ? `Character "${name}"` : `角色「${name}」`,
      items: [
        { label: L === 'en' ? 'Use this character' : '使用此角色', value: 'use' },
        { label: L === 'en' ? 'View details' : '查看设定', value: 'info' },
        { label: L === 'en' ? 'Edit' : '编辑', value: 'edit' },
        { label: L === 'en' ? 'Delete' : '删除', value: 'delete' },
        { label: L === 'en' ? 'Back to list' : '返回列表', value: 'back' },
      ],
      onSelect: (action) => {
        switch (action) {
          case 'use':
            this.useCharacter(name);
            break;
          case 'info': {
            const d = entry.data.data;
            this.ui.pushSystem(
              L === 'en'
                ? `【${d.name}】\n${d.description}\nPersonality: ${d.personality}\nScenario: ${d.scenario}`
                : `【${d.name}】\n${d.description}\n性格: ${d.personality}\n场景: ${d.scenario}`,
            );
            break;
          }
          case 'edit':
            this.openCharacterForm(entry.data);
            break;
          case 'delete':
            this.ui.openConfirm({
              title: L === 'en' ? 'Delete character' : '删除角色',
              detail: L === 'en' ? `Delete character "${name}"?` : `确定删除角色「${name}」吗？`,
              options: [
                { key: 'y', label: L === 'en' ? 'Delete' : '删除' },
                { key: 'd', label: L === 'en' ? 'Cancel' : '取消' },
              ],
              onChoose: (opt) => {
                if (opt.key === 'y') {
                  this.cards = this.cards.filter((c) => c.name !== name);
                  if (this.card?.data.name === name) this.card = this.cards.find((c) => c.name === this.config.general.defaultCharacter)?.data ?? this.cards[0]?.data ?? null;
                  void this.saveCards();
                  this.ui.pushSystem(L === 'en' ? `Character deleted: ${name}` : `已删除角色: ${name}`);
                }
              },
            });
            break;
          case 'back':
            void this.characterCommand([]);
            break;
        }
      },
    });
  }

  private useCharacter(name: string): void {
    const entry = this.cards.find((c) => c.name === name);
    if (!entry) {
      this.ui.pushSystem(this.lang === 'en' ? `Character "${name}" not found` : `没有找到角色「${name}」`);
      return;
    }
    this.card = entry.data;
    void this.newChat();
    this.ui.pushSystem(this.lang === 'en' ? `Current character: ${this.card.data.name} (/character info for details)` : `当前角色: ${this.card.data.name}（/character info 查看设定）`);
  }

  private openCharacterForm(existing?: CharacterCard): void {
    const L = this.lang;
    const d = existing?.data ?? emptyCard('');
    const pick = (s: string): string => (s && s.trim() ? s.trim() : '');
    this.ui.openForm({
      title: existing ? (L === 'en' ? `Edit character "${d.name}"` : `编辑角色「${d.name}」`) : L === 'en' ? 'New character' : '新建角色卡',
      fields: [
        { label: L === 'en' ? 'Name' : '名称', value: existing ? d.name : '', placeholder: L === 'en' ? 'required' : '必填' },
        { label: L === 'en' ? 'Description' : '背景描述', value: pick(d.description), multiline: true },
        { label: L === 'en' ? 'Personality' : '性格', value: pick(d.personality), multiline: true },
        { label: L === 'en' ? 'Scenario' : '场景', value: pick(d.scenario), multiline: true },
        { label: L === 'en' ? 'First message' : '开场白', value: pick(d.first_mes), multiline: true },
        { label: L === 'en' ? 'Extra rules' : '额外规则', value: pick(d.system_prompt), multiline: true },
      ],
      onSubmit: (values) => {
        const [name, description, personality, scenario, firstMes, sysPrompt] = values as string[];
        const nameT = name.trim();
        if (!nameT) {
          this.ui.pushSystem(L === 'en' ? '⚠ Name is required' : '⚠ 名称必填');
          return;
        }
        if ((!existing || existing.data.name !== nameT) && this.cards.some((c) => c.name === nameT)) {
          this.ui.pushSystem(L === 'en' ? `⚠ Character "${nameT}" already exists` : `⚠ 已存在同名角色「${nameT}」`);
          return;
        }
        const card: CharacterCard = {
          spec: 'chara_card_v2',
          spec_version: '2.0',
          data: {
            ...emptyCard(nameT),
            description: description.trim(),
            personality: personality.trim(),
            scenario: scenario.trim(),
            first_mes: firstMes.trim(),
            system_prompt: sysPrompt.trim(),
            creator: 'meowfish-cf',
          },
        };
        if (existing) {
          this.cards = this.cards.map((c) => (c.name === existing.data.name ? { name: nameT, data: card } : c));
          if (this.card?.data.name === existing.data.name) this.card = card;
        } else {
          this.cards.push({ name: nameT, data: card });
        }
        void this.saveCards();
        this.ui.pushSystem(
          existing
            ? L === 'en'
              ? `Character updated: ${nameT}`
              : `已更新角色卡: ${nameT}`
            : L === 'en'
              ? `Character created: ${nameT} (pick it in /character to start a new chat)`
              : `已创建角色卡: ${nameT}（用 /character 选择后开始新对话）`,
        );
      },
    });
  }

  private openCharacterPaste(): void {
    const L = this.lang;
    this.ui.openForm({
      title: L === 'en' ? 'Import character (JSON)' : '粘贴导入角色卡',
      fields: [{ label: L === 'en' ? 'JSON content' : 'JSON 内容', value: '', multiline: true, placeholder: L === 'en' ? 'paste character V2 JSON (must contain data.name)' : '粘贴角色卡 V2 JSON（含 data.name）' }],
      onSubmit: (values) => {
        try {
          const card = parseCardJson(values[0]!);
          const name = card.data.name;
          if (this.cards.some((c) => c.name === name)) {
            this.ui.pushSystem(L === 'en' ? `⚠ Character "${name}" already exists — delete it first` : `⚠ 已存在同名角色「${name}」，先删除旧卡`);
            return;
          }
          this.cards.push({ name, data: card });
          void this.saveCards();
          this.ui.pushSystem(L === 'en' ? `Character imported: ${name} (◕‿◕✿)` : `已导入角色卡: ${name} (◕‿◕✿)`);
        } catch (e) {
          this.ui.pushSystem(L === 'en' ? `Import failed: ${e instanceof Error ? e.message : e}` : `导入失败: ${e instanceof Error ? e.message : e}`);
        }
      },
    });
  }

  /* ---------- 其他表单与操作 ---------- */

  private openProfileForm(): void {
    const L = this.lang;
    this.ui.openForm({
      title: L === 'en' ? 'User profile' : '用户设定',
      fields: [
        { label: L === 'en' ? 'Your name' : '称呼', value: this.config.general.userName, placeholder: L === 'en' ? 'how the character calls you' : '角色怎么称呼你' },
        { label: L === 'en' ? 'Description' : '设定', value: this.config.general.userDescription, placeholder: L === 'en' ? 'tell the character about yourself (optional)' : '告诉角色你是谁，可留空' },
      ],
      onSubmit: (values) => {
        this.config.general.userName = values[0]!.trim() || (L === 'en' ? 'You' : '你');
        this.config.general.userDescription = values[1]!.trim();
        void this.saveConfig();
        this.ui.pushSystem(L === 'en' ? `Profile updated: ${this.config.general.userName}` : `用户设定已更新: ${this.config.general.userName}`);
      },
    });
  }

  private openSearchForm(): void {
    this.ui.openForm({
      title: '联网搜索',
      fields: [{ label: '关键词', value: '', placeholder: '要搜索的内容' }],
      onSubmit: (values) => {
        const q = values[0]!.trim();
        if (q) void this.runSearch(q);
      },
    });
  }

  private async runSearch(query: string): Promise<void> {
    let results: SearchResult[];
    try {
      results = await webSearch(query, 5);
    } catch (e) {
      this.ui.pushSystem(`⚠ 搜索失败: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const text = results.length
      ? results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n')
      : `（没有搜到「${query}」的结果）`;
    this.ui.pushMessage({ role: 'tool', toolLabel: `联网搜索: ${query}`, content: text });
    this.session?.messages.push({
      role: 'user',
      content: `[联网搜索] 用户搜索了「${query}」，结果：\n${text}\n[搜索结束] 请基于结果用中文简要回答。`,
    });
    await this.generate();
  }

  private async openFilePicker(): Promise<void> {
    let output: string;
    try {
      output = await this.callTool('glob', { pattern: '**/*' }, false);
    } catch (e) {
      this.ui.pushSystem(`⚠ 无法读取远程文件列表: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const files = output
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('（'));
    if (!files.length) {
      this.ui.pushSystem('远程服务器上没有可引用的文件');
      return;
    }
    this.ui.openPicker({
      title: '引用远程文件',
      items: files.slice(0, 300).map((f) => ({ label: f, value: f })),
      filterable: true,
      onSelect: (path) => {
        this.ui.insertInputText(path);
        this.ui.pushSystem(`已引用 ${path}（发送时读取远程内容进上下文）`);
      },
    });
  }

  private toggleTools(): void {
    const L = this.lang;
    this.config.general.tools = !this.config.general.tools;
    void this.saveConfig();
    this.ui.setToolsBadge?.(this.config.general.tools);
    this.ui.setModeLabel(this.config.general.tools ? 'AGENT' : 'RP');
    this.ui.pushSystem(
      this.config.general.tools
        ? this.sshCfg()
          ? L === 'en'
            ? `Computer access ON — ${this.assistantName} can operate ${this.sshLabel()} files & run commands via SSH (approval required). Use !command, @file`
            : `电脑权限已开启 —— ${this.assistantName} 现在可以经 SSH 操作 ${this.sshLabel()} 的文件、执行命令（需授权）。输入 !命令 直接执行，@文件 引用`
          : L === 'en'
            ? `Computer access ON, but no SSH server yet — run /ssh to configure (Worker connects directly)`
            : `电脑权限已开启，但还没有配置 SSH 服务器 —— 用 /ssh 配置（云端将直接 SSH 连接你的服务器执行工具）`
        : L === 'en'
          ? 'Computer access OFF — chat only (◕‿◕)'
          : '电脑权限已关闭 —— 纯聊天模式 (◕‿◕)',
    );
  }

  /** 开关联网搜索（独立于电脑权限；web_search/web_fetch 在 Worker 直连执行，无需授权） */
  private toggleWebSearch(): void {
    const L = this.lang;
    const next = !this.webSearchOn;
    this.config.general.webSearch = next;
    void this.saveConfig();
    this.ui.setWebSearchBadge?.(next);
    this.ui.pushSystem(
      next
        ? L === 'en'
          ? 'Web search ON — the character can search the latest info (Bing/Yandex/DuckDuckGo, no approval)'
          : '联网搜索已开启 —— 角色可以搜索最新信息（Bing/Yandex/DuckDuckGo，无需授权）'
        : L === 'en'
          ? 'Web search OFF — the character answers from model knowledge only'
          : '联网搜索已关闭 —— 角色不再调用网络工具，仅凭模型知识回答',
    );
  }

  /** 白日/暗夜一键切换：浅色主题 ↔ 浅滩/深海 */
  private toggleDayNight(): void {
    const L = this.lang;
    const current = BUILTIN_THEMES.find((t) => t.id === this.config.general.theme) ?? BUILTIN_THEMES[0]!;
    const target = themeIsLight(current)
      ? (BUILTIN_THEMES.find((t) => t.id === 'deep-sea') ?? BUILTIN_THEMES[0]!)
      : (BUILTIN_THEMES.find((t) => t.id === 'shoal') ?? BUILTIN_THEMES[1]!);
    this.config.general.theme = target.id;
    this.ui.setTheme(target);
    void this.saveConfig();
    this.ui.pushSystem(
      L === 'en'
        ? `Switched to ${target.name} (${themeIsLight(target) ? 'Day' : 'Night'} mode)`
        : `已切换到${target.name}（${themeIsLight(target) ? '白日' : '暗夜'}模式）`,
    );
  }

  /** SSH 服务器配置表单（配置随用户本地配置存浏览器 localStorage） */
  private openSshForm(): void {
    const L = this.lang;
    const s = this.config.ssh;
    const keyLabel = L === 'en' ? 'ed25519 key' : 'ed25519 密钥';
    const passLabel = L === 'en' ? 'Password' : '密码';
    this.ui.openForm({
      title: L === 'en' ? 'SSH Server Config' : 'SSH 服务器配置',
      fields: [
        { label: L === 'en' ? 'Host' : '主机', value: s?.host ?? '', placeholder: L === 'en' ? 'server IP or domain (e.g. 1.2.3.4)' : '服务器 IP 或域名（如 1.2.3.4）' },
        { label: L === 'en' ? 'Port' : '端口', value: s?.port ? String(s.port) : '22' },
        { label: L === 'en' ? 'Username' : '用户名', value: s?.user ?? 'root' },
        { label: L === 'en' ? 'Auth method' : '认证方式', value: s?.authKind === 'key' ? keyLabel : passLabel, options: [passLabel, keyLabel] },
        { label: passLabel, value: s?.authKind === 'key' ? '' : s?.password ?? '', placeholder: L === 'en' ? 'for password auth (mutually exclusive with key)' : '密码认证用（与密钥二选一）' },
        { label: L === 'en' ? 'Private key (OpenSSH)' : '私钥(OpenSSH)', value: s?.authKind === 'key' ? s.privateKey : '', multiline: true, placeholder: L === 'en' ? 'paste full id_ed25519 (-----BEGIN OPENSSH PRIVATE KEY----- ...), no passphrase' : '粘贴 id_ed25519 的完整内容（-----BEGIN OPENSSH PRIVATE KEY----- ...），须无 passphrase' },
      ],
      onSubmit: async (values) => {
        const [host, port, user, authKind, password, privateKey] = values as string[];
        const hostT = host.trim();
        if (!hostT) {
          this.ui.pushSystem(L === 'en' ? '⚠ Host is required' : '⚠ 主机必填');
          return;
        }
        const isKey = authKind === keyLabel;
        if (isKey && !privateKey.includes('BEGIN OPENSSH PRIVATE KEY')) {
          this.ui.pushSystem(L === 'en' ? '⚠ Invalid private key: paste the full OpenSSH key (no passphrase)' : '⚠ 私钥格式不对：请粘贴完整的 OpenSSH 私钥内容（无 passphrase）');
          return;
        }
        if (!isKey && !password.trim()) {
          this.ui.pushSystem(L === 'en' ? '⚠ Password is required for password auth' : '⚠ 密码认证需要填写密码');
          return;
        }
        const ssh: CloudSshConfig = {
          host: hostT,
          port: Number(port) || 22,
          user: user.trim() || 'root',
          authKind: isKey ? 'key' : 'password',
          password: isKey ? '' : password,
          privateKey: isKey ? privateKey.trim() : '',
          fingerprint: s?.host === hostT && s?.user === (user.trim() || 'root') ? s.fingerprint : '', // 换目标时重置指纹
        };
        this.config.ssh = ssh;
        this.emitConfig();
        this.ui.pushSystem(
          L === 'en'
            ? `SSH config saved: ${this.sshLabel()} (stored in your browser) · testing connection…`
            : `已保存 SSH 配置: ${this.sshLabel()}（配置存在浏览器本地）· 正在测试连接…`,
        );
        try {
          const out = await this.sshRun('echo meowfish-ok && uname -a', 20_000);
          if (out.includes('meowfish-ok')) this.ui.pushSystem(`✓ SSH ${L === 'en' ? 'connection OK!' : '连接成功！'}\n${out.trim()}`);
          else this.ui.pushSystem(`⚠ SSH ${L === 'en' ? 'test failed' : '测试失败'}: ${out.split('\n')[0]?.slice(0, 120)}`);
        } catch (e) {
          this.ui.pushSystem(`⚠ SSH ${L === 'en' ? 'test error' : '测试异常'}: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    });
  }

  private openConfigPanel(): void {
    const L = this.lang;
    this.ui.openPicker({
      title: L === 'en' ? 'Settings' : '设置',
      items: [
        { label: L === 'en' ? 'Model manager' : '模型管理', detail: `${this.config.profiles.length} profiles`, value: 'models' },
        { label: 'SSH Server', detail: this.sshLabel() || (L === 'en' ? 'not set (/ssh)' : '未配置（/ssh）'), value: 'ssh' },
        { label: L === 'en' ? 'User profile' : '用户设定', detail: this.config.general.userName, value: 'profile' },
        { label: L === 'en' ? 'Color theme' : '配色主题', detail: this.config.general.theme, value: 'theme' },
        { label: L === 'en' ? 'Kaomoji style' : '颜文字风格', detail: this.config.general.kaomojiStyle, value: 'kaomoji' },
        { label: L === 'en' ? 'Computer access' : '电脑权限', detail: this.config.general.tools ? (L === 'en' ? 'on' : '开（SSH 远程服务器工具）') : L === 'en' ? 'off' : '关（纯聊天）', value: 'tools' },
        { label: L === 'en' ? 'Voice (MiMo)' : '实时语音（MiMo）', detail: this.config.general.mimoKey ? '✓ key' : L === 'en' ? 'set API key' : '未设置 API key', value: 'voice' },
        { label: 'Language / 语言', detail: L === 'en' ? 'English' : '中文', value: 'lang' },
        { label: L === 'en' ? 'About' : '关于', detail: APP_VERSION, value: 'about' },
      ],
      onSelect: (v) => {
        switch (v) {
          case 'models':
            this.openModelManager();
            break;
          case 'ssh':
            this.openSshForm();
            break;
          case 'profile':
            this.openProfileForm();
            break;
          case 'theme':
            void this.command('/theme');
            break;
          case 'kaomoji':
            void this.command('/kaomoji');
            break;
          case 'tools':
            this.toggleTools();
            break;
          case 'voice':
            this.openVoiceSettings();
            break;
          case 'lang':
            this.openLangPicker();
            break;
          case 'about':
            void this.command('/about');
            break;
        }
      },
    });
  }

  /** 语音设置：MiMo API Key（存浏览器 localStorage，云端零持久化） */
  private openVoiceSettings(): void {
    const L = this.lang;
    this.ui.openForm({
      title: L === 'en' ? 'Voice (MiMo)' : '实时语音（MiMo）',
      fields: [
        { label: 'API Key', value: this.config.general.mimoKey ?? '', placeholder: 'platform.xiaomimimo.com 申请的 key' },
      ],
      onSubmit: (values) => {
        const key = (values[0] ?? '').trim();
        if (key) this.config.general.mimoKey = key;
        else delete this.config.general.mimoKey;
        void this.saveConfig();
        this.ui.pushSystem(
          key
            ? (L === 'en' ? 'MiMo API Key saved (local browser only)' : 'MiMo API Key 已保存（仅存于本浏览器）')
            : (L === 'en' ? 'MiMo API Key cleared' : 'MiMo API Key 已清除'),
        );
      },
    });
  }

  /** 语言选择（中文 / English） */
  private openLangPicker(): void {
    const L = this.lang;
    this.ui.openPicker({
      title: L === 'en' ? 'Language' : '语言',
      items: [
        { label: '中文', detail: L === 'en' ? 'Chinese' : '简体中文', value: 'zh' },
        { label: 'English', detail: L === 'en' ? 'English' : '英文', value: 'en' },
      ],
      onSelect: (id) => {
        this.config.general.lang = id === 'en' ? 'en' : 'zh';
        void this.saveConfig();
        this.ui.pushSystem(L === 'en' ? `Language set to ${id === 'en' ? 'English' : 'Chinese'}` : `已切换语言: ${id === 'en' ? 'English' : '中文'}`);
      },
    });
  }

  private async newChat(): Promise<void> {
    if (this.session) await this.saveSession();
    if (!this.card) {
      this.ui.pushSystem('还没有角色卡，用 /character 选择。');
      return;
    }
    this.session = this.newSession(this.card.data.name);
    const greeting = this.card.data.first_mes || '你好呀。';
    this.session.messages.push({ role: 'assistant', content: greeting });
    this.ui.setTitle(this.card.data.name);
    this.syncDisplay();
    this.ui.setTokens(this.tokensLabel());
    await this.saveSession();
    this.ui.pushSystem(this.lang === 'en' ? `New chat · ${this.card.data.name} (◕‿◕✿)` : `新对话开始 · ${this.card.data.name} (◕‿◕✿)`);
  }

  private async swipe(): Promise<void> {
    if (this.busy) return;
    const session = this.session;
    if (!session) return;
    const last = session.messages[session.messages.length - 1];
    if (!last || last.role !== 'assistant') {
      this.ui.pushSystem('上一条不是角色回复，无法重新生成');
      return;
    }
    session.messages.pop();
    this.ui.removeLastMessage();
    await this.generate();
  }

  private async continueLast(): Promise<void> {
    if (this.busy) return;
    const session = this.session;
    if (!session) return;
    const last = session.messages[session.messages.length - 1];
    if (!last || last.role !== 'assistant') {
      this.ui.pushSystem('上一条不是角色回复，无法续写');
      return;
    }
    const oldText = last.content;
    session.messages.pop();
    this.ui.removeLastMessage();
    const before = session.messages.length;
    await this.generate();
    if (session.messages.length === before + 1) {
      const gen = session.messages[session.messages.length - 1]!;
      gen.content = oldText + gen.content;
      this.ui.replaceLastMessage({ role: 'assistant', name: this.assistantName, content: gen.content });
      await this.saveSession();
    }
  }

  private async editMessage(n: number, text: string): Promise<void> {
    const session = this.session;
    if (!session) return;
    const idx = session.messages.length - n;
    const m = session.messages[idx];
    if (!m) {
      this.ui.pushSystem(`没有倒数第 ${n} 条消息`);
      return;
    }
    m.content = text;
    this.ui.replaceMessageFromEnd(n, this.toDisplay(m));
    await this.saveSession();
  }

  private async deleteMessage(n: number): Promise<void> {
    const session = this.session;
    if (!session) return;
    const idx = session.messages.length - n;
    if (!session.messages[idx]) {
      this.ui.pushSystem(`没有倒数第 ${n} 条消息`);
      return;
    }
    session.messages.splice(idx, 1);
    this.ui.removeMessageFromEnd(n);
    await this.saveSession();
  }
}

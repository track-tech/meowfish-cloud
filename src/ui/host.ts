import type { AnimState, KaomojiPack } from './packs-core.js';
import type { Theme } from './themes-core.js';

/** UI 宿主接口：TUI（终端 App）与 WebUI（图形界面）各自实现，驱动层只依赖此接口 */

export interface DisplayMsg {
  role: 'user' | 'assistant' | 'tool' | 'system';
  name?: string;
  content: string;
  toolLabel?: string;
  streaming?: boolean;
  error?: boolean;
  /** 思维链（reasoning_content），存在时折叠显示 */
  reasoning?: string;
}

export interface PickerItem {
  label: string;
  detail?: string;
  value: string;
}

export interface PickerOpts {
  title: string;
  items: PickerItem[];
  filterable?: boolean;
  onSelect: (value: string) => void;
}

/** 多选列表（批量管理：勾选若干项后确认） */
export interface MultiSelectOpts {
  title: string;
  items: PickerItem[];
  /** 默认勾选项（value 列表） */
  selected?: string[];
  onConfirm: (values: string[]) => void;
  onCancel?: () => void;
}

export interface ConfirmOpts {
  title: string;
  detail: string;
  options: { key: string; label: string }[];
  onChoose: (opt: { key: string; label: string }) => void;
  onCancel?: () => void;
}

export interface FormField {
  label: string;
  value: string;
  placeholder?: string;
  /** 多行字段：TUI 用 Ctrl+J 换行，Web 渲染为 textarea */
  multiline?: boolean;
  /** 下拉选项：Web 渲染为 select，TUI 用 ←/→ 循环选择 */
  options?: string[];
}

/** 预设联动：select 字段变化时自动填充其他字段（如选「DeepSeek」自动填 BaseUrl/模型名） */
export interface FormPresetLink {
  selector: number;
  map: Record<string, { field: number; value: string }[]>;
}

export interface FormOpts {
  title: string;
  fields: FormField[];
  presets?: FormPresetLink;
  onSubmit: (values: string[]) => void;
  onCancel?: () => void;
}

export interface HelpOpts {
  title: string;
  text: string;
}

/** 侧边栏会话列表项（结构兼容 SessionMeta） */
export interface SessionListItem {
  id: string;
  type: 'rp' | 'agent';
  title: string;
  model: string;
  updatedAt: number;
}

export interface UiHost {
  start(): void;
  dispose(): void;
  pushMessage(msg: DisplayMsg): void;
  pushSystem(text: string): void;
  clearMessages(): void;
  replaceLastMessage(msg: DisplayMsg): void;
  removeLastMessage(): void;
  removeMessageFromEnd(n: number): void;
  replaceMessageFromEnd(n: number, msg: DisplayMsg): void;
  beginStreaming(name?: string, role?: DisplayMsg['role']): void;
  appendDelta(delta: string): void;
  /** 思维链增量（附加到当前流式消息） */
  appendReasoning?(delta: string): void;
  finalizeStreaming(): void;
  failStreaming(errText: string): void;
  setStatus(status: AnimState, text?: string): void;
  getStatus(): AnimState;
  setModelLabel(label: string): void;
  setModeLabel(label: string): void;
  setTitle(title: string): void;
  setYoloBadge(on: boolean): void;
  setToolsBadge?(on: boolean): void;
  /** 联网搜索开关状态（顶栏第二个开关） */
  setWebSearchBadge?(on: boolean): void;
  setTokens(text: string): void;
  /** 向输入框插入文本（@ 文件引用等） */
  insertInputText(text: string): void;
  openPicker(opts: PickerOpts): void;
  /** 多选列表（Web UI 支持；TUI/纯文本可省略，调用方需降级提示） */
  openMultiSelect?(opts: MultiSelectOpts): void;
  openConfirm(opts: ConfirmOpts): void;
  openForm(opts: FormOpts): void;
  openHelp(opts: HelpOpts): void;
  closeOverlays(): void;
  cancelConfirm(): void;
  setTheme(theme: Theme): void;
  setPack(pack: KaomojiPack): void;
  /** 同步会话列表（WebUI 侧边栏；TUI/纯文本模式可忽略） */
  setSessions?(list: SessionListItem[], currentId: string): void;
}

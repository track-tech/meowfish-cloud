import type { ConfirmOpts, DisplayMsg, FormOpts, HelpOpts, MultiSelectOpts, PickerOpts, SessionListItem, UiHost } from './ui/host.js';
import type { AnimState, KaomojiPack } from './ui/packs-core.js';
import type { Theme } from './ui/themes-core.js';

/** 图形 WebUI：与 TUI App 实现同一份 UiHost，状态经 SSE 推给浏览器 */

type Emit = (event: Record<string, unknown>) => void;

interface DialogBase {
  id: string;
  kind: 'picker' | 'confirm' | 'form' | 'help' | 'multi';
}

export class WebUi implements UiHost {
  messages: DisplayMsg[] = [];
  status: AnimState = 'idle';
  statusText = '';
  modelLabel = '';
  modeLabel = '';
  title = '';
  userName = '';
  assistantName = '';
  yolo = false;
  tools = false;
  /** 联网搜索开关：关闭后角色看不到 web_search/web_fetch 工具 */
  webSearch = true;
  tokens = '';
  theme: Theme;
  private emit: Emit = () => {};
  private dialogs = new Map<string, DialogBase>();
  private dialogSeq = 0;

  constructor(opts: { theme: Theme; modelLabel: string; modeLabel: string; title: string; userName: string; assistantName: string }) {
    this.theme = opts.theme;
    this.modelLabel = opts.modelLabel;
    this.modeLabel = opts.modeLabel;
    this.title = opts.title;
    this.userName = opts.userName;
    this.assistantName = opts.assistantName;
  }

  /** 服务器注入广播函数 */
  attachEmit(emit: Emit): void {
    this.emit = emit;
  }

  start(): void {}

  dispose(): void {}

  snapshot(): Record<string, unknown> {
    return {
      messages: this.messages.map((m) => ({ ...m })),
      status: this.status,
      statusText: this.statusText,
      modelLabel: this.modelLabel,
      modeLabel: this.modeLabel,
      title: this.title,
      userName: this.userName,
      assistantName: this.assistantName,
      yolo: this.yolo,
      tools: this.tools,
      webSearch: this.webSearch,
      tokens: this.tokens,
      sessions: this.sessions,
      sessionId: this.sessionId,
      theme: {
        name: this.theme.name,
        bg: this.theme.bg,
        fg: this.theme.fg,
        dim: this.theme.dim,
        accent: this.theme.accent,
        user: this.theme.user,
        assistant: this.theme.assistant,
        tool: this.theme.tool,
        error: this.theme.error,
        warning: this.theme.warning,
        border: this.theme.border,
        selection: this.theme.selection,
      },
    };
  }

  /* ---------- 消息 ---------- */

  pushMessage(msg: DisplayMsg): void {
    this.messages.push({ ...msg });
    this.emit({ type: 'msg', msg });
  }

  pushSystem(text: string): void {
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      this.messages.push({ role: 'system', content: line });
      this.emit({ type: 'msg', msg: { role: 'system', content: line } });
    }
  }

  clearMessages(): void {
    this.messages = [];
    this.emit({ type: 'clear' });
  }

  replaceLastMessage(msg: DisplayMsg): void {
    if (this.messages.length) this.messages[this.messages.length - 1] = { ...msg };
    else this.messages.push({ ...msg });
    this.emit({ type: 'replaceLast', msg });
  }

  removeLastMessage(): void {
    this.messages.pop();
    this.emit({ type: 'removeLast' });
  }

  removeMessageFromEnd(n: number): void {
    const idx = this.messages.length - n;
    if (idx >= 0) this.messages.splice(idx, 1);
    this.emit({ type: 'removeN', n });
  }

  replaceMessageFromEnd(n: number, msg: DisplayMsg): void {
    const idx = this.messages.length - n;
    if (idx >= 0) this.messages[idx] = { ...msg };
    this.emit({ type: 'replaceN', n, msg });
  }

  beginStreaming(name?: string, role: DisplayMsg['role'] = 'assistant'): void {
    this.messages.push({ role, name, content: '', streaming: true });
    this.emit({ type: 'streamStart', name, role });
  }

  appendDelta(delta: string): void {
    const last = this.messages[this.messages.length - 1];
    if (last?.streaming) last.content += delta;
    this.emit({ type: 'delta', text: delta });
  }

  finalizeStreaming(): void {
    const last = this.messages[this.messages.length - 1];
    if (last?.streaming) last.streaming = false;
    this.emit({ type: 'streamEnd' });
  }

  appendReasoning(delta: string): void {
    const last = this.messages[this.messages.length - 1];
    if (last?.streaming) last.reasoning = (last.reasoning ?? '') + delta;
    this.emit({ type: 'reasonDelta', text: delta });
  }

  failStreaming(errText: string): void {
    const last = this.messages[this.messages.length - 1];
    if (last?.streaming) {
      last.streaming = false;
      if (!last.content) last.content = errText;
      last.error = true;
    }
    this.emit({ type: 'streamFail', text: errText });
  }

  /* ---------- 状态 ---------- */

  setStatus(status: AnimState, text = ''): void {
    this.status = status;
    this.statusText = text;
    this.emit({ type: 'status', status, text });
  }

  getStatus(): AnimState {
    return this.status;
  }

  setModelLabel(label: string): void {
    this.modelLabel = label;
    this.emitMeta();
  }

  setModeLabel(label: string): void {
    this.modeLabel = label;
    this.emitMeta();
  }

  setTitle(title: string): void {
    this.title = title;
    this.emitMeta();
  }

  setYoloBadge(on: boolean): void {
    this.yolo = on;
    this.emitMeta();
  }

  setToolsBadge(on: boolean): void {
    this.tools = on;
    this.emitMeta();
  }

  setWebSearchBadge(on: boolean): void {
    this.webSearch = on;
    this.emitMeta();
  }

  setTokens(text: string): void {
    this.tokens = text;
    this.emitMeta();
  }

  sessions: SessionListItem[] = [];
  sessionId = '';

  setSessions(list: SessionListItem[], currentId: string): void {
    this.sessions = list.map((s) => ({ ...s }));
    this.sessionId = currentId;
    this.emit({ type: 'sessions', list: this.sessions, currentId });
  }

  insertInputText(text: string): void {
    this.emit({ type: 'insert', text });
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.emitMeta();
  }

  setPack(pack: KaomojiPack): void {
    void pack;
    this.emitMeta();
  }

  private emitMeta(): void {
    // 只取元信息字段，不构建含全部消息的完整快照（元信息高频更新，避免无谓的数组拷贝）
    this.emit({
      type: 'meta',
      modelLabel: this.modelLabel,
      modeLabel: this.modeLabel,
      title: this.title,
      userName: this.userName,
      assistantName: this.assistantName,
      yolo: this.yolo,
      tools: this.tools,
      webSearch: this.webSearch,
      tokens: this.tokens,
      sessionId: this.sessionId,
      theme: {
        name: this.theme.name,
        bg: this.theme.bg,
        fg: this.theme.fg,
        dim: this.theme.dim,
        accent: this.theme.accent,
        user: this.theme.user,
        assistant: this.theme.assistant,
        tool: this.theme.tool,
        error: this.theme.error,
        warning: this.theme.warning,
        border: this.theme.border,
        selection: this.theme.selection,
      },
    });
  }

  /* ---------- 对话框 ---------- */

  openPicker(opts: PickerOpts): void {
    const id = `d${++this.dialogSeq}`;
    this.dialogs.set(id, { id, kind: 'picker', ...opts });
    this.emit({ type: 'dialog', id, kind: 'picker', title: opts.title, items: opts.items, filterable: opts.filterable ?? false });
  }

  openMultiSelect(opts: MultiSelectOpts): void {
    const id = `d${++this.dialogSeq}`;
    this.dialogs.set(id, { id, kind: 'multi', ...opts });
    this.emit({ type: 'dialog', id, kind: 'multi', title: opts.title, items: opts.items, selected: opts.selected ?? [] });
  }

  openConfirm(opts: ConfirmOpts): void {
    const id = `d${++this.dialogSeq}`;
    this.dialogs.set(id, { id, kind: 'confirm', ...opts });
    this.emit({ type: 'dialog', id, kind: 'confirm', title: opts.title, detail: opts.detail, options: opts.options });
  }

  openForm(opts: FormOpts): void {
    const id = `d${++this.dialogSeq}`;
    this.dialogs.set(id, { id, kind: 'form', ...opts });
    this.emit({
      type: 'dialog',
      id,
      kind: 'form',
      title: opts.title,
      fields: opts.fields.map((f) => ({ label: f.label, value: f.value, placeholder: f.placeholder, multiline: f.multiline ?? false, options: f.options })),
      presets: opts.presets,
    });
  }

  /** 驱动层直接广播自定义事件（如配置变更推给浏览器缓存） */
  emitEvent(event: Record<string, unknown>): void {
    this.emit(event);
  }

  openHelp(opts: HelpOpts): void {
    const id = `d${++this.dialogSeq}`;
    this.dialogs.set(id, { id, kind: 'help', ...opts });
    this.emit({ type: 'dialog', id, kind: 'help', title: opts.title, text: opts.text });
  }

  closeOverlays(): void {
    for (const id of [...this.dialogs.keys()]) {
      this.dialogs.delete(id);
      this.emit({ type: 'dialogClose', id });
    }
  }

  cancelConfirm(): void {
    for (const [id, d] of [...this.dialogs.entries()]) {
      if (d.kind === 'confirm') {
        this.dialogs.delete(id);
        this.emit({ type: 'dialogClose', id });
        (d as { onCancel?: () => void }).onCancel?.();
      }
    }
  }

  /** 浏览器回传对话框结果 */
  resolveDialog(id: string, result: 'pick' | 'confirm' | 'form' | 'multi' | 'cancel', payload: unknown): boolean {
    const d = this.dialogs.get(id);
    if (!d) return false;
    this.dialogs.delete(id);
    this.emit({ type: 'dialogClose', id });
    switch (d.kind) {
      case 'picker': {
        const picker = d as unknown as PickerOpts & DialogBase;
        if (result === 'pick' && typeof payload === 'string') picker.onSelect(payload);
        break;
      }
      case 'multi': {
        const multi = d as unknown as MultiSelectOpts & DialogBase;
        if (result === 'multi' && Array.isArray(payload)) multi.onConfirm(payload.map(String));
        else if (result === 'cancel') multi.onCancel?.();
        break;
      }
      case 'confirm': {
        const confirm = d as unknown as ConfirmOpts & DialogBase;
        if (result === 'confirm' && typeof payload === 'string') {
          const opt = confirm.options.find((o) => o.key === payload);
          if (opt) confirm.onChoose(opt);
        } else if (result === 'cancel') {
          confirm.onCancel?.();
        }
        break;
      }
      case 'form': {
        const form = d as unknown as FormOpts & DialogBase;
        if (result === 'form' && Array.isArray(payload)) form.onSubmit(payload.map(String));
        else if (result === 'cancel') form.onCancel?.();
        break;
      }
      case 'help':
        break;
    }
    return true;
  }
}

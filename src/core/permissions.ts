/** 权限确认引擎：Pi 本身没有权限层，这里补上（Claude Code 风格） */

export type PermissionDecision = 'once' | 'always' | 'deny';

export interface PermissionRequest {
  tool: string;
  /** 展示给用户的详情（命令/路径） */
  detail: string;
}

export type ConfirmFn = (req: PermissionRequest) => Promise<PermissionDecision>;

export interface PermissionManagerOpts {
  /** 初始规则 */
  allow: string[];
  deny: string[];
  /** 规则变更时回调（用于持久化） */
  onRulesChange?: (allow: string[], deny: string[]) => void;
  /** --yolo：跳过全部确认 */
  yolo?: boolean;
  /** 确认交互（由 UI 提供） */
  confirm: ConfirmFn;
}

/** 读操作：永远放行 */
const READ_TOOLS = new Set(['read_file', 'glob', 'grep', 'web_search', 'web_fetch']);

/** 视为"只读安全"的命令前缀 */
const READONLY_PREFIXES = [
  'ls', 'dir', 'cat', 'type', 'more', 'head', 'tail', 'pwd', 'cd', 'echo', 'find',
  'grep', 'findstr', 'where', 'which', 'git status', 'git log', 'git diff', 'git show',
  'git branch', 'git remote', 'node -v', 'npm -v', 'python --version', 'python -V',
  'java -version', 'tree', 'wc', 'sort', 'uniq', 'du', 'df', 'whoami', 'hostname', 'date', 'time',
];

export function isReadOnlyCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  // 任何 shell 元字符都可能改变命令树语义（管道/分隔符/重定向/反引号/命令替换），一律不算只读
  if (/[|;&<>`]/.test(trimmed) || trimmed.includes('$(')) return false;
  const lower = trimmed.toLowerCase();
  // find -exec/-execdir 会执行任意命令，不算只读
  if (lower.startsWith('find ') && /(^|\s)-exec(dir)?\b/.test(lower)) return false;
  return READONLY_PREFIXES.some((p) => lower === p || lower.startsWith(p + ' '));
}

/** 规则匹配：只匹配完整命令词或路径分量，避免 `ls` 命中 `ls; rm -rf /`、`rm` 误伤 `rmdir` */
export function matchesRule(rule: string, target: string): boolean {
  if (!rule) return false;
  if (target === rule) return true;
  if (!target.startsWith(rule)) return false;
  const next = target.charAt(rule.length);
  return next === ' ' || next === '\t' || next === '/' || next === '\\';
}

export class PermissionManager {
  private allow: string[];
  private deny: string[];
  private yolo: boolean;
  private confirm: ConfirmFn;
  private onRulesChange?: (allow: string[], deny: string[]) => void;

  constructor(opts: PermissionManagerOpts) {
    this.allow = [...opts.allow];
    this.deny = [...opts.deny];
    this.yolo = opts.yolo ?? false;
    this.confirm = opts.confirm;
    this.onRulesChange = opts.onRulesChange;
  }

  setYolo(v: boolean): void {
    this.yolo = v;
  }

  isYolo(): boolean {
    return this.yolo;
  }

  rules(): { allow: string[]; deny: string[] } {
    return { allow: [...this.allow], deny: [...this.deny] };
  }

  private match(rules: string[], target: string): boolean {
    return rules.some((r) => matchesRule(r, target));
  }

  /** 判断某次工具调用是否需要确认，以及是否被规则自动拒绝 */
  async check(req: PermissionRequest): Promise<{ allowed: boolean; output?: string }> {
    if (this.yolo || READ_TOOLS.has(req.tool)) return { allowed: true };
    if (req.tool === 'bash') {
      if (this.match(this.deny, req.detail)) return { allowed: false, output: '（命令被拒绝规则拦截）' };
      if (this.match(this.allow, req.detail)) return { allowed: true };
      if (isReadOnlyCommand(req.detail)) return { allowed: true };
    } else {
      // 写文件 / 编辑
      if (this.match(this.deny, req.detail)) return { allowed: false, output: '（操作被拒绝规则拦截）' };
      if (this.match(this.allow, req.detail)) return { allowed: true };
    }
    const decision = await this.confirm(req);
    if (decision === 'always') {
      this.allow.push(req.detail);
      this.persist();
      return { allowed: true };
    }
    if (decision === 'once') return { allowed: true };
    return { allowed: false, output: '（用户拒绝了该操作）' };
  }

  /** 用户显式要求"总是允许"某个前缀 */
  allowAlways(prefix: string): void {
    if (!this.allow.includes(prefix)) {
      this.allow.push(prefix);
      this.persist();
    }
  }

  denyAlways(prefix: string): void {
    if (!this.deny.includes(prefix)) {
      this.deny.push(prefix);
      this.persist();
    }
  }

  resetRules(): void {
    this.allow = [];
    this.deny = [];
    this.persist();
  }

  private persist(): void {
    this.onRulesChange?.(this.allow, this.deny);
  }
}

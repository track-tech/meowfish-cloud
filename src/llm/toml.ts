/**
 * 迷你 TOML 解析器（子集）：足以解析我们的 config.toml 与主题文件。
 * 支持：注释、[table]、[[array-of-tables]]、key = "str"/'str'/数字/布尔/数组、a.b = 1
 */

export type TomlValue = string | number | boolean | TomlValue[] | Record<string, unknown>;

export class TomlError extends Error {
  constructor(msg: string, line: number) {
    super(`TOML 第 ${line} 行: ${msg}`);
  }
}

function unescape(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** 去掉行尾注释（引号内的 # 不是注释：URL 片段、描述文本等场景常见） */
function stripComment(line: string): string {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === '\\' && quote === '"') {
        i++; // 跳过转义字符
        continue;
      }
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseScalar(raw: string): string | number | boolean {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);
  return v; // 裸字符串兜底
}

function parseValue(raw: string, lineNo: number): TomlValue {
  const v = raw.trim();
  if (v.startsWith('"')) {
    const end = v.lastIndexOf('"');
    if (end <= 0) throw new TomlError('字符串未闭合', lineNo);
    return unescape(v.slice(1, end));
  }
  if (v.startsWith("'")) {
    const end = v.lastIndexOf("'");
    if (end <= 0) throw new TomlError('字符串未闭合', lineNo);
    return v.slice(1, end);
  }
  if (v.startsWith('[')) {
    if (!v.endsWith(']')) throw new TomlError('数组未闭合', lineNo);
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((p) => {
      const pv = parseValue(p, lineNo);
      if (typeof pv === 'object') throw new TomlError('数组元素必须是标量', lineNo);
      return pv;
    });
  }
  return parseScalar(v);
}

function setPath(root: Record<string, unknown>, path: string[], value: TomlValue): void {
  let cur = root;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    const next = cur[k];
    if (typeof next === 'object' && next !== null && !Array.isArray(next)) {
      cur = next as Record<string, unknown>;
    } else {
      const fresh: Record<string, unknown> = {};
      cur[k] = fresh;
      cur = fresh;
    }
  }
  cur[path[path.length - 1]] = value;
}

export function parseToml(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let current: Record<string, unknown> = root;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = stripComment(line).trim();
    if (!stripped) continue;

    const tableMatch = /^\[\[(.+)\]\]$/.exec(stripped);
    if (tableMatch) {
      const path = tableMatch[1].trim().split('.');
      // 沿路径导航（不覆盖已有数组），末段为 array-of-tables
      let cur: Record<string, unknown> = root;
      for (let j = 0; j < path.length - 1; j++) {
        const k = path[j]!;
        const n = cur[k];
        if (typeof n === 'object' && n !== null && !Array.isArray(n)) {
          cur = n as Record<string, unknown>;
        } else {
          const fresh: Record<string, unknown> = {};
          cur[k] = fresh;
          cur = fresh;
        }
      }
      const last = path[path.length - 1]!;
      const existing = cur[last];
      let arr: Record<string, unknown>[];
      if (Array.isArray(existing)) {
        arr = existing as Record<string, unknown>[];
      } else {
        arr = [];
        cur[last] = arr;
      }
      arr.push({});
      current = arr[arr.length - 1]!;
      continue;
    }
    const singleMatch = /^\[(.+)\]$/.exec(stripped);
    if (singleMatch) {
      setPath(root, singleMatch[1].trim().split('.'), {});
      let cur: Record<string, unknown> = root;
      for (const k of singleMatch[1].trim().split('.')) {
        const n = cur[k];
        if (typeof n === 'object' && n !== null && !Array.isArray(n)) cur = n as Record<string, unknown>;
        else break;
      }
      current = cur;
      continue;
    }

    const eq = stripped.indexOf('=');
    if (eq < 0) throw new TomlError(`无法解析: "${stripped}"`, i + 1);
    const key = stripped.slice(0, eq).trim();
    const value = parseValue(stripped.slice(eq + 1), i + 1);
    setPath(current, key.split('.'), value);
  }
  return root;
}

/** 序列化（仅用于写回配置等简单场景） */
export function toToml(obj: Record<string, unknown>, depth = 0): string {
  const out: string[] = [];
  const ind = '  '.repeat(depth);
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      if (v.length === 0) {
        out.push(`${ind}${k} = []`);
      } else if (typeof v[0] === 'object' && v[0] !== null) {
        for (const item of v) {
          out.push(`${ind}[[${k}]]`);
          out.push(toToml(item as Record<string, unknown>, depth + 1));
        }
      } else {
        out.push(`${ind}${k} = [${v.map((x) => JSON.stringify(x)).join(', ')}]`);
      }
    } else if (typeof v === 'object' && v !== null) {
      out.push(`${ind}[${k}]`);
      out.push(toToml(v as Record<string, unknown>, depth + 1));
    } else {
      out.push(`${ind}${k} = ${JSON.stringify(v)}`);
    }
  }
  return out.join('\n');
}

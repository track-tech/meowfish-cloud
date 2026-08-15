import type { ToolImpl, ToolResult } from './tools.js';

/** 联网能力：web_search（DuckDuckGo 零密钥搜索）与 web_fetch（抓取网页正文） */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** 去掉 HTML 标签并解码实体（先解实体再去标签，保证 &lt;b&gt; 类的转义标签被正确清理） */
function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ensp;/g, ' ')
    .replace(/&emsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => {
      try {
        return String.fromCodePoint(Number(n));
      } catch {
        return ' ';
      }
    })
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** DDG 的跳转链接还原 */
function decodeDdgUrl(url: string): string {
  const m = /[?&]uddg=([^&]+)/.exec(url);
  if (m) {
    try {
      return decodeURIComponent(m[1]!);
    } catch {
      return m[1]!;
    }
  }
  return url;
}

/** 解析 lite.duckduckgo.com 的结果页 */
export function parseDdgLite(html: string, count: number): SearchResult[] {
  const results: SearchResult[] = [];
  const blockRe = /<a rel="nofollow" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class='result-snippet'>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null && results.length < count) {
    const url = decodeDdgUrl(m[1]!);
    const title = stripTags(m[2]!);
    const snippet = stripTags(m[3]!);
    if (title && url && !url.startsWith('javascript:')) results.push({ title, url, snippet });
  }
  return results;
}

/** 解析 html.duckduckgo.com 的结果页（lite 的兜底） */
export function parseDdgHtml(html: string, count: number): SearchResult[] {
  const results: SearchResult[] = [];
  const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snipRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  const links: { url: string; title: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null && links.length < count) {
    const url = decodeDdgUrl(m[1]!);
    const title = stripTags(m[2]!);
    if (title && url) links.push({ url, title });
  }
  const snips: string[] = [];
  while ((m = snipRe.exec(html)) !== null && snips.length < count) {
    snips.push(stripTags(m[1]!));
  }
  for (let i = 0; i < links.length; i++) {
    results.push({ title: links[i]!.title, url: links[i]!.url, snippet: snips[i] ?? '' });
  }
  return results;
}

/** 解析 Bing 结果页（www.bing.com，国内可达） */
export function parseBing(html: string, count: number): SearchResult[] {
  const results: SearchResult[] = [];
  const liRe = /<li class="b_algo"[\s\S]*?<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(html)) !== null && results.length < count) {
    const block = m[0]!;
    const a = /<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!a) continue;
    const url = decodeBingUrl(a[1]!);
    if (!url.startsWith('http')) continue;
    const title = stripTags(a[2]!);
    const p = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
    const snippet = p ? stripTags(p[1]!) : '';
    if (title) results.push({ title, url, snippet });
  }
  return results;
}

/** Bing 跳转链接还原（www.bing.com/ck/a?u=<base64url>；部分网络环境下 Bing 返回跳转而非直链）。
 *  注意 Bing 的 u= 参数带 "a1" 前缀，去掉后才是标准 base64url */
function decodeBingUrl(url: string): string {
  const m = /[?&]u=([^&]+)/.exec(url);
  if (m) {
    for (const c of [m[1]!, m[1]!.replace(/^a1/, '')]) {
      try {
        const decoded = decodeBase64(c);
        if (/^https?:\/\//i.test(decoded)) return decoded;
      } catch {
        /* 尝试下一个候选 */
      }
    }
  }
  return url;
}

/** 纯 JS base64(base64url) 解码（Node 与 Workers 通用） */
function decodeBase64(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  let out = '';
  let buf = 0;
  let bits = 0;
  for (const ch of b64 + pad) {
    if (ch === '=') break;
    const v = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.indexOf(ch);
    if (v < 0) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buf >> bits) & 0xff);
    }
  }
  try {
    return decodeURIComponent(escape(out));
  } catch {
    return out;
  }
}

/** Yandex 跳转链接还原（/clck/jsredir?text=<base64url> 或 u= 参数） */
export function decodeYandexUrl(url: string): string {
  for (const key of ['text', 'u']) {
    const m = new RegExp(`[?&]${key}=([^&]+)`).exec(url);
    if (m) {
      try {
        const decoded = decodeBase64(m[1]!);
        if (/^https?:\/\//i.test(decoded)) return decoded;
        // base64 解码失败时按普通 URL 解码
        const plain = decodeURIComponent(m[1]!);
        if (/^https?:\/\//i.test(plain)) return plain;
      } catch {
        /* 继续尝试下一个参数 */
      }
    }
  }
  return url;
}

/** 解析 Yandex 结果页（yandex.com/search） */
export function parseYandex(html: string, count: number): SearchResult[] {
  const results: SearchResult[] = [];
  const itemRe = /<li class="serp-item[^"]*"[\s\S]*?<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(html)) !== null && results.length < count) {
    const block = m[0]!;
    const a = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!a) continue;
    const url = decodeYandexUrl(a[1]!);
    if (!/^https?:\/\//i.test(url)) continue;
    const title = stripTags(a[2]!);
    if (!title) continue;
    const snipMatch = /<span class="OrganicTextContentSpan[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(block);
    let snippet = snipMatch ? stripTags(snipMatch[1]!) : '';
    if (!snippet) {
      const blockText = stripTags(block);
      snippet = blockText.replace(title, '').trim().slice(0, 300);
    }
    results.push({ title, url, snippet });
  }
  return results;
}

interface SearchProvider {
  name: string;
  buildUrl: (q: string) => string;
  parse: (html: string, n: number) => SearchResult[];
  timeoutMs: number;
}

/** 搜索引擎顺序：Bing 优先（国内可达），Yandex / DuckDuckGo 兜底 */
const SEARCH_PROVIDERS: SearchProvider[] = [
  { name: 'bing', buildUrl: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`, parse: parseBing, timeoutMs: 8000 },
  { name: 'yandex', buildUrl: (q) => `https://yandex.com/search/?text=${encodeURIComponent(q)}`, parse: parseYandex, timeoutMs: 8000 },
  { name: 'ddg-lite', buildUrl: (q) => `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`, parse: parseDdgLite, timeoutMs: 6000 },
  { name: 'ddg-html', buildUrl: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, parse: parseDdgHtml, timeoutMs: 6000 },
];

/** 联网搜索（无需 API key，自动切换可用引擎；signal 用于用户中断时立即中止） */
export async function webSearch(query: string, count = 5, signal?: AbortSignal): Promise<SearchResult[]> {
  const capped = Math.max(1, Math.min(10, count));
  for (const provider of SEARCH_PROVIDERS) {
    const ctrl = new AbortController();
    const combined = signal ? AbortSignal.any([signal, ctrl.signal]) : ctrl.signal;
    const timer = setTimeout(() => ctrl.abort(), provider.timeoutMs);
    try {
      const res = await fetch(provider.buildUrl(query), {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
        signal: combined,
      });
      if (!res.ok) continue;
      const html = await res.text();
      const results = provider.parse(html, capped);
      if (results.length) return results;
    } catch {
      /* 换下一个引擎 */
    } finally {
      clearTimeout(timer);
    }
  }
  return [];
}

/** 内网/保留地址防护（web_fetch 用，覆盖常见云元数据与内网段） */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h === '::1' || h === '::' || h === '0.0.0.0' || h.endsWith('.local')) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  // 云元数据/链路本地/CGNAT/文档与保留 IPv4
  if (/^169\.254\./.test(h)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true;
  if (/^192\.0\.0\./.test(h) || /^192\.0\.2\./.test(h) || /^198\.18\./.test(h) || /^198\.19\./.test(h)) return true;
  if (/^198\.51\.100\./.test(h) || /^203\.0\.113\./.test(h)) return true;
  if (/^22[4-9]\./.test(h) || /^23[0-9]\./.test(h) || /^24[0-9]\./.test(h) || /^25[0-5]\./.test(h)) return true;
  // IPv6 回环/链路本地/唯一本地/组播/文档段；IPv4 映射地址递归检查内网 IPv4
  if (h.includes(':')) {
    if (h.startsWith('::ffff:')) return isPrivateHost(h.slice(7));
    if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) return true;
    if (h.startsWith('ff') || h.startsWith('2001:db8:')) return true;
  }
  return false;
}

/** 抓取网页正文（去标签，截断到 maxChars；signal 用于用户中断时立即中止） */
export async function webFetchPage(url: string, maxChars = 4000, signal?: AbortSignal): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return '（仅支持 http/https 链接）';
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return '（无效的 URL）';
  }
  if (isPrivateHost(host)) return '（拒绝访问内网地址）';
  const ctrl = new AbortController();
  const combined = signal ? AbortSignal.any([signal, ctrl.signal]) : ctrl.signal;
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: combined });
    if (!res.ok) return `（HTTP ${res.status}）`;
    const html = await res.text();
    const text = stripTags(html);
    if (!text) return '（页面没有可提取的正文）';
    return text.length > maxChars ? text.slice(0, maxChars) + '\n…（已截断）' : text;
  } catch (e) {
    return `（抓取失败: ${e instanceof Error ? e.message : String(e)}）`;
  } finally {
    clearTimeout(timer);
  }
}

export function webSearchTool(): ToolImpl {
  return {
    def: {
      type: 'function',
      function: {
        name: 'web_search',
        description: '联网搜索最新信息（Bing/Yandex/DuckDuckGo，无需授权）。当问题需要实时/最新/事实性信息时使用。参数: query（搜索关键词）、count（结果数 1-10，默认 5）',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' }, count: { type: 'number' } },
          required: ['query'],
        },
      },
    },
    run: async (args, ctx): Promise<ToolResult> => {
      const query = String(args.query ?? '').trim();
      if (!query) return { ok: false, output: '搜索关键词不能为空' };
      const count = args.count !== undefined ? Number(args.count) : 5;
      const results = await webSearch(query, count, ctx.signal);
      if (!results.length) return { ok: true, output: `（没有搜到「${query}」的结果，试试其他关键词）` };
      return {
        ok: true,
        output: results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n'),
      };
    },
  };
}

export function webFetchTool(): ToolImpl {
  return {
    def: {
      type: 'function',
      function: {
        name: 'web_fetch',
        description: '抓取网页正文文本（最多 4000 字符，内网地址拒绝访问）。配合 web_search 使用，用于查看搜索结果的具体内容。参数: url',
        parameters: {
          type: 'object',
          properties: { url: { type: 'string' } },
          required: ['url'],
        },
      },
    },
    run: async (args, ctx): Promise<ToolResult> => {
      const url = String(args.url ?? '').trim();
      if (!url) return { ok: false, output: 'url 不能为空' };
      return { ok: true, output: await webFetchPage(url, 4000, ctx.signal) };
    },
  };
}

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

/** 解析百度结果页（www.baidu.com/s，国内直达；结果链接为百度跳转，展示时仍可用） */
export function parseBaidu(html: string, count: number): SearchResult[] {
  const results: SearchResult[] = [];
  const linkRe = /<h3[^>]*>\s*<a[^>]+href="([^"]*(?:www\.)?baidu\.com\/link\?[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snipRe = /<(?:div|span)[^>]+class="[^"]*(?:c-abstract|c-span-last)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span)>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null && results.length < count) {
    const title = stripTags(m[2]!).trim();
    if (!title) continue;
    const snip = snipRe.exec(html);
    results.push({ title, url: m[1]!, snippet: snip ? stripTags(snip[1]!).trim().slice(0, 300) : '' });
  }
  return results;
}

/** 解析搜狗结果页（www.sogou.com/web，国内直达） */
export function parseSogou(html: string, count: number): SearchResult[] {
  const results: SearchResult[] = [];
  const linkRe = /<h3[^>]*class="[^"]*vr-title[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snipRe = /<div[^>]+class="[^"]*(?:space-txt|text-layout)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null && results.length < count) {
    const title = stripTags(m[2]!).trim();
    if (!title) continue;
    const snip = snipRe.exec(html);
    results.push({ title, url: m[1]!, snippet: snip ? stripTags(snip[1]!).trim().slice(0, 300) : '' });
  }
  return results;
}

/** 解析 Google 结果页（/url?q= 还原直链） */
export function parseGoogle(html: string, count: number): SearchResult[] {
  const results: SearchResult[] = [];
  const links: { url: string; title: string }[] = [];
  const linkRe = /<a[^>]+href="\/url\?q=([^&"]+)[^"]*"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null && links.length < count) {
    const title = stripTags(m[2]!).trim();
    if (!title) continue;
    let url: string;
    try {
      url = decodeURIComponent(m[1]!);
    } catch {
      url = m[1]!;
    }
    if (!/^https?:/i.test(url)) continue;
    links.push({ url, title });
  }
  const snippets: string[] = [];
  const snipRe = /<span class="st">([\s\S]*?)<\/span>/gi;
  let s: RegExpExecArray | null;
  while ((s = snipRe.exec(html)) !== null) snippets.push(stripTags(s[1]!).trim().slice(0, 300));
  for (let i = 0; i < links.length; i++) results.push({ ...links[i]!, snippet: snippets[i] ?? '' });
  return results;
}

/** 解析 Brave 结果页（search.brave.com） */
export function parseBrave(html: string, count: number): SearchResult[] {
  const results: SearchResult[] = [];
  const blockRe = /<a[^>]+href="(https?:\/\/(?!search\.brave\.com)[^"]+)"[^>]*>[\s\S]*?<div[^>]+class="[^"]*snippet-title[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null && results.length < count) {
    const title = stripTags(m[2]!).trim();
    if (!title) continue;
    results.push({ title, url: m[1]!, snippet: '' });
  }
  const snipRe = /<div[^>]+class="[^"]*snippet-description[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let s: RegExpExecArray | null;
  let i = 0;
  while ((s = snipRe.exec(html)) !== null && i < results.length) {
    results[i]!.snippet = stripTags(s[1]!).trim().slice(0, 300);
    i++;
  }
  return results;
}

/** 标题归一化：跨引擎去重（百度/搜狗跳转链接域名相同，不能用域名去重） */
function titleKey(title: string): string {
  return title.toLowerCase().replace(/[\s\-_·:：()（）\[\]【】《》<>"“”'‘’!！?？。.,，、/\\|@#$%^&*+=~]+/g, '');
}

/** 多引擎结果去重：同标题（归一化）只保留优先级更高的引擎结果 */
export function dedupeSearchResults(results: SearchResult[]): SearchResult[] {
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    const k = titleKey(r.title);
    const key = k || r.url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

interface SearchProvider {
  name: string;
  buildUrl: (q: string) => string;
  parse: (html: string, n: number) => SearchResult[];
  timeoutMs: number;
}

/** 国内可达优先（并行返回即可用，不等待墙外引擎超时） */
const CN_SEARCH_PROVIDERS: SearchProvider[] = [
  { name: 'bing', buildUrl: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`, parse: parseBing, timeoutMs: 8000 },
  { name: 'baidu', buildUrl: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`, parse: parseBaidu, timeoutMs: 8000 },
  { name: 'sogou', buildUrl: (q) => `https://www.sogou.com/web?query=${encodeURIComponent(q)}`, parse: parseSogou, timeoutMs: 8000 },
];

/** 补充引擎：Cloudflare Worker 环境可用；国内直连失败时由国内引擎结果兜底 */
const GLOBAL_SEARCH_PROVIDERS: SearchProvider[] = [
  { name: 'google', buildUrl: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}&num=10`, parse: parseGoogle, timeoutMs: 6000 },
  { name: 'brave', buildUrl: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}`, parse: parseBrave, timeoutMs: 6000 },
  { name: 'yandex', buildUrl: (q) => `https://yandex.com/search/?text=${encodeURIComponent(q)}`, parse: parseYandex, timeoutMs: 6000 },
  { name: 'ddg-lite', buildUrl: (q) => `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`, parse: parseDdgLite, timeoutMs: 6000 },
  { name: 'ddg-html', buildUrl: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, parse: parseDdgHtml, timeoutMs: 6000 },
];

async function queryProvider(provider: SearchProvider, query: string, count: number, signal?: AbortSignal): Promise<SearchResult[]> {
  const ctrl = new AbortController();
  const combined = signal ? AbortSignal.any([signal, ctrl.signal]) : ctrl.signal;
  const timer = setTimeout(() => ctrl.abort(), provider.timeoutMs);
  try {
    const res = await fetch(provider.buildUrl(query), {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: combined,
    });
    if (!res.ok) return [];
    const html = await res.text();
    return provider.parse(html, count);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** 联网搜索（多引擎并行聚合去重；page 从 1 开始，供模型追问/翻页时多次调用；signal 用于用户中断） */
export async function webSearch(query: string, count = 5, signal?: AbortSignal, page = 1): Promise<SearchResult[]> {
  const capped = Math.max(1, Math.min(10, count));
  const p = Math.max(1, Math.trunc(Number(page) || 1));
  const needed = Math.min(10, capped * p);
  const collect = (settled: PromiseSettledResult<SearchResult[]>[]): SearchResult[] =>
    settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
  // ① 国内引擎并行（Bing/百度/搜狗），凑够目标页所需量就直接返回，避免被墙外引擎拖慢
  let merged = dedupeSearchResults(collect(await Promise.allSettled(CN_SEARCH_PROVIDERS.map((pr) => queryProvider(pr, query, needed, signal)))));
  if (merged.length < p * capped) {
    // ② 国内结果不足时补充 Google/Brave/Yandex/DDG（Worker 环境可用）
    merged = dedupeSearchResults([...merged, ...collect(await Promise.allSettled(GLOBAL_SEARCH_PROVIDERS.map((pr) => queryProvider(pr, query, needed, signal))))]);
  }
  const start = (p - 1) * capped;
  return merged.slice(start, start + capped);
}

/** 常见云元数据/链路本地主机名（域名形式绕过点分 IP 检查） */
const PRIVATE_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.google.com',
  'metadata',
  'instance-data',
  'instance-data.ec2.internal',
]);

/** 把 IPv6 地址规范化为 8 组小写十六进制（含嵌入 IPv4 与 :: 压缩），无法解析返回 null */
function normalizeIpv6(host: string): string | null {
  let h = host.toLowerCase();
  const tail = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h);
  if (tail) {
    const octets = tail[2]!.split('.').map((n) => Number(n));
    if (octets.some((n) => n < 0 || n > 255)) return null;
    h = tail[1]! + ((octets[0]! << 8) | octets[1]!).toString(16) + ':' + ((octets[2]! << 8) | octets[3]!).toString(16);
  }
  const halves = h.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0]!.split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1]!.split(':') : [];
  const valid = (g: string): boolean => /^[0-9a-f]{1,4}$/.test(g);
  if (!left.every(valid) || !right.every(valid)) return null;
  const fill = halves.length === 2 ? 8 - left.length - right.length : 8 - left.length;
  if (fill < 0 || (halves.length === 2 && fill < 1)) return null;
  const groups = halves.length === 2 ? [...left, ...Array<string>(fill).fill('0'), ...right] : left;
  if (groups.length !== 8) return null;
  return groups.map((g) => g.padStart(4, '0')).join(':');
}

/** 内网/保留地址防护（web_fetch 用，覆盖常见云元数据与内网段） */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  const bare = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;
  if (PRIVATE_HOSTNAMES.has(bare)) return true;
  // URL 解析器通常会把十进制/十六进制 IPv4 规范化为点分形式，这里再兜底
  if (/^\d+$/.test(bare) || /^0x[0-9a-f]+$/i.test(bare)) return true;
  if (bare === 'localhost' || bare === '::1' || bare === '::' || bare === '0.0.0.0' || bare.endsWith('.local')) return true;
  if (/^127\./.test(bare) || /^10\./.test(bare) || /^192\.168\./.test(bare)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(bare)) return true;
  // 云元数据/链路本地/CGNAT/文档与保留 IPv4
  if (/^169\.254\./.test(bare)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(bare)) return true;
  if (/^192\.0\.0\./.test(bare) || /^192\.0\.2\./.test(bare) || /^198\.18\./.test(bare) || /^198\.19\./.test(bare)) return true;
  if (/^198\.51\.100\./.test(bare) || /^203\.0\.113\./.test(bare)) return true;
  if (/^22[4-9]\./.test(bare) || /^23[0-9]\./.test(bare) || /^24[0-9]\./.test(bare) || /^25[0-5]\./.test(bare)) return true;
  if (bare.includes(':')) {
    const v6 = normalizeIpv6(bare);
    if (!v6) return true; // 无法解析的 IPv6 形式保守拒绝
    if (v6 === '0000:0000:0000:0000:0000:0000:0000:0000') return true; // ::
    if (v6 === '0000:0000:0000:0000:0000:0000:0000:0001') return true; // ::1
    const first = parseInt(v6.slice(0, 4), 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 唯一本地
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 链路本地
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 组播
    if (v6.startsWith('2001:0db8:')) return true; // 2001:db8::/32 文档段
    // IPv4 映射地址递归检查内网 IPv4
    const mapped = /^0000:0000:0000:0000:0000:ffff:([0-9a-f]{4}):([0-9a-f]{4})$/.exec(v6);
    if (mapped) {
      const a = parseInt(mapped[1]!, 16);
      const b = parseInt(mapped[2]!, 16);
      return isPrivateHost(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`);
    }
  }
  return false;
}

/** 抓取网页正文（去标签，截断到 maxChars；signal 用于用户中断时立即中止；逐跳校验重定向防 SSRF） */
export async function webFetchPage(url: string, maxChars = 4000, signal?: AbortSignal): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return '（仅支持 http/https 链接）';
  let current = url;
  for (let hop = 0; hop <= 3; hop++) {
    let host: string;
    try {
      host = new URL(current).hostname;
    } catch {
      return '（无效的 URL）';
    }
    if (isPrivateHost(host)) return '（拒绝访问内网地址）';
    const ctrl = new AbortController();
    const combined = signal ? AbortSignal.any([signal, ctrl.signal]) : ctrl.signal;
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(current, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: combined, redirect: 'manual' });
    } catch (e) {
      return `（抓取失败: ${e instanceof Error ? e.message : String(e)}）`;
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return `（HTTP ${res.status}）`;
      try {
        current = new URL(loc, current).toString();
      } catch {
        return '（无效的跳转地址）';
      }
      if (!/^https?:\/\//i.test(current)) return '（仅支持 http/https 链接）';
      continue;
    }
    if (!res.ok) return `（HTTP ${res.status}）`;
    const html = await res.text();
    const text = stripTags(html);
    if (!text) return '（页面没有可提取的正文）';
    return text.length > maxChars ? text.slice(0, maxChars) + '\n…（已截断）' : text;
  }
  return '（重定向次数过多）';
}

export function webSearchTool(): ToolImpl {
  return {
    def: {
      type: 'function',
      function: {
        name: 'web_search',
        description: '联网搜索最新信息（多引擎聚合去重：Bing/百度/搜狗优先，Google/Brave 补充，无需授权）。当问题需要实时/最新/事实性信息时使用；需要更多结果或追问时，可修改 query 并增加 page（从 1 开始）再次调用。参数: query（搜索关键词）、count（结果数 1-10，默认 5）、page（页码，默认 1）',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' }, count: { type: 'number' }, page: { type: 'number' } },
          required: ['query'],
        },
      },
    },
    run: async (args, ctx): Promise<ToolResult> => {
      const query = String(args.query ?? '').trim();
      if (!query) return { ok: false, output: '搜索关键词不能为空' };
      const count = args.count !== undefined ? Number(args.count) : 5;
      const page = args.page !== undefined ? Number(args.page) : 1;
      const results = await webSearch(query, count, ctx.signal, page);
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

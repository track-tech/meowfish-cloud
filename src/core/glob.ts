/** glob 通配匹配（环境无关纯函数：Node 与 Cloudflare Worker 共用） */

/** glob 通配 → 正则（** 跨目录、* 不跨、? 单字符）。批量匹配时先编译再复用 */
export function globToRegExp(pattern: string): RegExp {
  return new RegExp(
    '^' +
      pattern
        .split('/')
        .map((seg) => (seg === '**' ? '.*' : seg.replace(/([.+^${}()|[\]\\])/g, '\\$1').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')))
        .join('/') +
      '$',
  );
}

export function matchGlob(pattern: string, path: string): boolean {
  return globToRegExp(pattern).test(path);
}

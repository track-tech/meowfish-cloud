/** 应用元信息（版本 / 作者 / 主页）——本地版与云端 Worker 共用 */

export const APP_NAME = 'MeowFish';
export const APP_VERSION = '1.0.0';
/** GitHub 仓库地址（本地版仓库，发布后确认） */
export const APP_HOMEPAGE = 'https://github.com/track-tech/pi-meowfish-agent';
/** 作者署名 */
export const APP_AUTHOR = 'track-tech';

/** 「关于」对话框文本（双语，支持 help 分组渲染） */
export function aboutText(lang: 'zh' | 'en'): string {
  return lang === 'en'
    ? `━━ About MeowFish ฅ(^•ω•^)ฅ ━━
Version: ${APP_VERSION}
A lightweight AI roleplay & agent assistant — TUI + Web UI in one, zero runtime dependencies.
Web: ${APP_HOMEPAGE}
Author: ${APP_AUTHOR}
━━ Highlights ━━
  Roleplay (character cards V2) · computer access tools · web search
  Cloudflare Workers edition: zero persistent storage, per-browser isolated
  Bilingual UI (中文 / English) · day/night themes · mobile-friendly
━━ License ━━
GNU AGPL-3.0 — free to use, modify and share; commercial use must stay open source.`
    : `━━ 关于 MeowFish ฅ(^•ω•^)ฅ ━━
版本: ${APP_VERSION}
轻量 AI 角色扮演与 Agent 助手——终端 TUI 与图形 WebUI 双形态，零运行时依赖。
主页: ${APP_HOMEPAGE}
作者: ${APP_AUTHOR}
━━ 亮点 ━━
  角色扮演（角色卡 V2）· 电脑权限工具 · 联网搜索
  云端版（Cloudflare Workers）：零持久化存储，按浏览器隔离
  双语界面（中文 / English）· 白日/暗夜主题 · 移动端适配
━━ 许可 ━━
GNU AGPL-3.0——自由使用、修改与分享；商用必须保持开源。`;
}

# MeowFish 云端版 ☁️ ฅ(^•ω•^)ฅ

> **MeowFish**（[本地版仓库](https://github.com/track-tech/pi-meowfish-agent)）的 Cloudflare 部署项目，独立发布、独立部署。

![version](https://img.shields.io/badge/version-1.0.0-7dd3fc) ![license](https://img.shields.io/badge/license-AGPL--3.0-orange) ![runtime](https://img.shields.io/badge/runtime-Cloudflare%20Workers-f6821f)

UI / 聊天 / 角色扮演 / 模型代理跑在 Cloudflare Worker——**云端零持久化**：会话 / 角色卡 / 配置全部只存各浏览器 localStorage，按 deviceId 隔离，**可多人公用同一部署互不可见**。电脑权限工具经 **Worker 内置 SSH 客户端直连你的服务器**（或 HTTPS + token 转发到远程工具守护）。

## ✨ 特性

- 🎭 角色扮演（角色卡 V2）+ 聊天 + 会话管理，全部功能与本地版一致
- 🛠️ **Worker 内置 SSH 客户端**：零依赖实现 X25519 / Ed25519 / AES-256-GCM，`/ssh` 配置后直接控制远程服务器
- 🌐 联网搜索（Bing / Yandex / DuckDuckGo，Worker 直连，免授权）
- 🔒 **云端零持久化**：不绑定任何数据库，数据只在你自己的浏览器里
- 👥 多人公用：按 deviceId 隔离，互不可见
- 💬 双语界面（中文 / English）· 🌗 白日/暗夜主题 · 📱 移动端适配

## 🚀 部署

**环境要求**：Node.js ≥ 18 + 一个 Cloudflare 账号（免费计划即可，无需任何数据库）

```bash
# 1. 安装依赖
npm install

# 2. 登录 Cloudflare（浏览器授权）
npx wrangler login

# 3. 部署（输出 https://你的子域.workers.dev）
npx wrangler deploy
```

**部署后配置（3 步）**：

1. 浏览器打开 Worker 域名 → **菜单 → 模型管理** → 添加模型（选「DeepSeek」或「OpenCode Zen」预设，填你的 API key——只存本浏览器）
2. 开聊；要控制远程电脑 → `/ssh` 填服务器信息（密码或 ed25519 私钥，凭据只存浏览器本地）
3. （可选）绑定自定义域名：Cloudflare 面板 → Workers → 你的 Worker → 设置 → 域和路由 → 添加自定义域

**本地开发调试**：

```bash
npx wrangler dev --port 8787   # 打开 http://127.0.0.1:8787
```

## 🔧 与主项目同步

本目录由本地版仓库的 `node scripts/split-cf.mjs` 生成（复制纯模块并重写导入，保留已配置的 `wrangler.toml`、node_modules 与 git 历史）。主项目更新后重新运行该脚本，把变更提交到本仓库即可。

## 📁 目录结构

```
src/
├── index.ts          Worker 入口（SSE / /ui/* / 静态，按 deviceId 隔离内存态）
├── driver.ts         云端驱动（聊天/命令/工具转发/权限确认，sync 协议）
├── ssh.ts            Worker 内置 SSH 客户端（X25519/Ed25519/AES-256-GCM，零依赖）
├── stores.ts         纯内存存储（云端零持久化）
├── webui.ts          事件协议（与本地 WebUI 同源）
├── llm/ rp/ core/ ui/ 从主项目复制的纯模块
└── cloudflare.d.ts   Workers 类型声明
public/               前端三件套（液态玻璃界面，零改动）
```

## 📄 许可

**GNU AGPL-3.0**（与本地版统一）：自由使用、修改与分享；商用（含部署为网络服务）必须保持开源。详见 LICENSE。

# MeowFish 云端版（meowfish-cloud）—— 独立仓库

**MeowFish**（[本地版仓库](https://github.com/track-tech/pi-meowfish-agent)）的 Cloudflare 部署项目，
独立发布、独立部署：UI / 聊天 / 角色扮演 / 模型代理跑在 Cloudflare Worker（**云端零持久化**：
会话/角色卡/配置全部只存各浏览器 localStorage，按 deviceId 隔离，可多人公用同一部署），
电脑权限工具经 Worker 内置 SSH 直连或 HTTPS + token 转发到远程**工具守护**执行。

## 部署

1. **Cloudflare**（本目录，无需任何数据库）：

   ```bash
   npm install
   # 可选：未用 SSH 直连时配置工具守护地址 TOOL_SERVER_URL / TOOL_SERVER_TOKEN
   npx wrangler deploy
   ```

2. 浏览器打开 Worker 域名 → `/models` 添加模型（API key 存浏览器本地）→ 开聊；
   `/ssh` 配置服务器后工具调用经确认在目标机执行。

## 与主项目同步

本目录由主项目（本地版仓库）的 `node scripts/split-cf.mjs` 生成（复制纯模块并重写导入，
保留已配置的 `wrangler.toml`）。主项目更新了相关模块后，重新运行该脚本并把本目录变更提交到本仓库即可。

## 目录结构

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

## 许可

**GNU AGPL-3.0**（与本地版统一）：自由使用、修改与分享；商用（含部署为网络服务）必须保持开源。详见 LICENSE。

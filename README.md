# AI-Usage-Peek

[English README](./README.en.md)

一个用来盯 API 花费和订阅消耗的小浮窗。

它基于 Tauri v2，前端是 Vue 3 + TypeScript，后端是 Rust。打开后会常驻桌面角落，适合顺手看看 OpenAI、Anthropic、OpenRouter 这几个服务现在用了多少、还剩多少。

<img src="./src/assets/Overview.png" alt="应用概览" width="720" />

## 它能做什么

- 看 OpenAI、Anthropic、OpenRouter 的按量用量
- 看 OpenAI、Anthropic 的订阅窗口消耗
- 看速率限制和错误状态
- 从本地 Claude Code / Codex CLI 自动检测 OAuth Token
- 通过系统托盘显示、隐藏、刷新和打开设置
- 拖拽主界面卡片排序，并把顺序保存下来
- 调整窗口不透明度，主界面和设置页保持同步

## 支持情况

- 当前主要在 Windows 上开发和验证
- 交互实现尽量保持跨平台一致，目标兼容 Windows、macOS、Linux

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动前端

```bash
npm run dev
```

### 3. 启动桌面应用

```bash
npm run tauri dev
```

### 4. 基本检查

```bash
npx vue-tsc --noEmit
cargo check
```

如果 `cargo` 不在 PATH 里，可以先把 Rust 工具链补进去。

## 凭据来源

### API Key

你可以在设置页里填，也可以走环境变量。

| 服务商 | 环境变量 |
| --- | --- |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |

说明：

- Anthropic 的按量成本接口需要 Admin Key
- 环境变量优先级高于设置页里保存的值

### OAuth Token

订阅数据会优先从本地工具凭据里自动检测。

| 来源 | 文件路径 | 字段 |
| --- | --- | --- |
| Claude Code | `~/.claude/.credentials.json` | `claudeAiOauth.accessToken` |
| Codex CLI | `~/.codex/auth.json` | `tokens.access_token` |

说明：

- OpenAI 的 `tokens.access_token` 同时兼容字符串和索引对象两种格式
- OpenRouter 当前没有订阅 OAuth 查询

## 项目结构

```text
src/
  components/
  composables/
  stores/
  utils/

src-tauri/src/
  commands/
  config/
  providers/
  tray/
```

## CI

仓库带了一个最小 CI，会在 GitHub Actions 里检查：

- `npm ci`
- `npx vue-tsc --noEmit`
- `cargo check`

## 发布 Windows Release

仓库现在已经接入 GitHub Actions 自动发布 Windows 安装包。

当前规则：

- 触发方式是推送 `v*` 标签，例如 `v0.1.0`
- 发布产物是 Tauri `nsis` 安装包，会自动上传到 GitHub Release
- 发布前会校验 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 的版本号必须一致
- 标签名必须和应用版本一致，例如版本是 `0.1.0` 时，标签必须是 `v0.1.0`

一个最小发版流程：

```bash
git tag v0.1.0
git push origin v0.1.0
```

如果你先改了版本号，再推标签，GitHub Actions 会自动构建并发布 Windows 安装包。

## License

[MIT](./LICENSE)

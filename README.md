# PeekaUsage

[English README](./README.en.md)

一个试图缓解 AI Token 焦虑的小浮窗。好吧，它并不能真正解决焦虑。

<p align="center">
  <img src="./src/assets/Overview.png" alt="应用概览" width="300" />
  <img src="./src/assets/Overview1.png" alt="应用概览 1" width="300" />
  <img src="./src/assets/Overview2.png" alt="应用概览 2" width="300" />
</p>

不知道各位有没有像我一样的，同时用着Anthropic和openai的订阅来跑Claude Code、Codex、Openclaw，由于订阅的按时间窗口限额设计，跑一阵之后，想看用了多少，还得反复打开 CLI 敲 `/usage`、`/status` 或者去 Dashboard上看，又累又难受。

有时候为了多用一点，还得花钱买API Key，如果没有公司掏钱，这种花费对程序员来说还是太贵了，用着心疼。这个项目就是把这些信息钉到桌面角落里，至少少切几次终端，少受一点折磨。

它常驻桌面角落，方便时不时看看 OpenAI、Anthropic、OpenRouter 等现在用了多少、还剩多少。

## 它能做什么

- 看 OpenAI、Anthropic、OpenRouter 的按量用量
- 看 OpenAI、Anthropic 的订阅窗口消耗
- 从本地 Claude Code / Codex CLI 自动检测 OAuth Token
- 通过系统托盘显示、隐藏、刷新和打开设置

## 支持情况

- Windows
- Linux
- MacOS

## 为什么还没有支持所有模型提供商

因为懒哈哈。而且有的提供商没有官方API。

如果你刚好也在用某个还没接入的 provider，欢迎直接提 PR。最理想的是一起补这几部分：

- Rust 侧 provider 实现和类型定义
- 前端 provider 展示与设置项
- 必要的文档说明、环境变量、图标资源和验证步骤

只要数据来源可靠、行为边界清楚、不会把现有交互搞坏，我很愿意合并。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. Linux 额外依赖

如果你在 Ubuntu / Debian 上开发或打包，还需要先安装：

```bash
sudo apt-get update
sudo apt-get install -y build-essential curl file libfuse2 libgtk-3-dev libssl-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

### 3. macOS 构建说明

- macOS `app` / `dmg` 需要在 Mac 主机上构建
- 当前仓库已接入 GitHub Actions 的 macOS runner 来产出 `x86_64` 和 `arm64`
- 当前未接入 Apple Developer 签名与 notarization，所以下载后的首次打开可能需要手动放行

如果安装后提示“文件已损坏，无法打开”，可以在终端执行：

```bash
xattr -dr com.apple.quarantine <drag your app here>
```

最终命令通常类似这样：

```bash
xattr -dr com.apple.quarantine /Applications/PeekaUsage.app
```

### 4. 启动前端

```bash
npm run dev
```

### 5. 启动桌面应用

```bash
npm run tauri dev
```

### 6. 基本检查

```bash
npx tsc --noEmit
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

**注意**：Anthropic的订阅不能查的太频繁，会报429错误。

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

## License

[MIT](./LICENSE)


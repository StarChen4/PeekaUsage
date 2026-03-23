# PeekaUsage

[English README](./README.en.md)

> 一个常驻桌面角落的 AI 用量小浮窗。用来快速查看 OpenAI、Anthropic、OpenRouter 的订阅配额、API 用量、预算、余额和速率限制，少敲几次 `/usage`，少切几次 Dashboard。

<p align="center">
  <a href="https://github.com/StarChen4/PeekaUsage/releases/latest"><img alt="Latest Release" src="https://img.shields.io/github/v/release/StarChen4/PeekaUsage?label=release" /></a>
  <a href="https://github.com/StarChen4/PeekaUsage/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/StarChen4/PeekaUsage" /></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-blue" />
  <img alt="Built with" src="https://img.shields.io/badge/built%20with-Tauri%20%2B%20React-orange" />
</p>

<p align="center">
  <img src="./src/assets/Overview.png" alt="PeekaUsage 总览" width="280" />
  <img src="./src/assets/Overview1.png" alt="PeekaUsage 视图 1" width="280" />
  <img src="./src/assets/Overview2.png" alt="PeekaUsage 视图 2" width="280" />
  <img src="./src/assets/Overview3.png" alt="PeekaUsage 视图 3" width="280" />
</p>

## 它解决什么问题

如果你同时在用 Claude Code、Codex、OpenClaw，或者自己写脚本调 OpenAI / Anthropic / OpenRouter，大概率已经体验过这种日常折磨：

- 跑一会儿就想知道配额还剩多少
- 要反复打开 CLI 敲 `/usage`、`/status`
- 或者去不同供应商 Dashboard 来回切
- 还要担心速率限制、预算、余额和订阅窗口

PeekaUsage 干的事情很简单：**把这些信息钉在桌面角落里，变成一眼就能扫到的状态面板。**

它不是一个新的模型平台，也不是代理层。它就是一个轻量桌面 Widget，让你更快知道：

- 现在花了多少
- 还剩多少
- 哪家快打满了
- 要不要切 Key / 切账号 / 停手

## 适合谁用

- 同时订阅 OpenAI 和 Anthropic 的重度 AI 工具用户
- 一边用 Claude Code / Codex，一边还会直接调 API 的开发者
- 想在桌面常驻查看消耗，而不是反复切终端和网页的人
- 对成本、速率限制、订阅窗口比较敏感的个人开发者或小团队

## 核心特性

### 多供应商总览

- OpenAI、Anthropic、OpenRouter 的按量用量、预算、余额、速率限制
- OpenAI、Anthropic 的订阅窗口消耗
- 同一个桌面浮窗里统一查看，不用来回切页面

### OAuth 与 API Key 双通路

- 自动检测本地 Claude Code / Codex CLI 的 OAuth Token
- 提供官方获取入口，减少手工找配置的麻烦
- 支持每个供应商保存多个命名 API Key
- 支持校验、清理和一键切换当前系统环境变量

### 真正面向日常使用的小部件体验

- 主界面手动刷新、单卡刷新、托盘刷新
- 自动刷新 / 仅手动两种模式
- 刷新间隔可按秒或按分钟配置
- 支持按供应商独立刷新策略
- 卡片拖拽排序并持久化
- 详细 / 精简两种显示模式
- 浅色 / 深色 / 跟随系统主题
- 始终置顶、窗口透明度调节
- 系统托盘显示 / 隐藏 / 刷新 / 打开设置
- 简体中文、繁体中文、English 即时切换

## 为什么它可能值得 Star

因为它不是“又一个聊天壳子”或者“又一个模型聚合页”。

它更像是一个 **AI 配额监控小部件**：

- 对经常用 AI 编程工具的人有真实痛点
- 比起命令行和 Dashboard，查看路径更短
- 适合长期挂在桌面角落里当状态指示器
- 对多供应商混用场景尤其友好

如果你也有“AI Token 焦虑”，这玩意儿至少能让你焦虑得更高效一点。社畜式减负，多少算点减负。

## 下载与安装

### 直接下载已构建版本

前往 [GitHub Releases](https://github.com/StarChen4/PeekaUsage/releases/latest) 下载对应平台安装包。

当前仓库会产出：

- Windows：NSIS 安装包
- Linux：DEB / AppImage
- macOS：`app` / `dmg`（`x86_64` 与 `arm64`）

### macOS 说明

- macOS 安装包必须在 Mac 上构建
- 当前尚未接入 Apple Developer 签名与 notarization
- 首次打开如果被系统拦截，可能需要手动放行

如果提示“文件已损坏，无法打开”，可执行：

```bash
xattr -dr com.apple.quarantine /Applications/PeekaUsage.app
```

## 本地开发

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

### 3. 启动前端

```bash
npm run dev
```

### 4. 启动桌面应用

```bash
npm run tauri dev
```

### 5. 基本检查

```bash
npm run typecheck
cargo fmt --all --check
cargo check --manifest-path src-tauri/Cargo.toml
```

## 凭据来源

### API Key

你可以在设置页里填，也可以使用环境变量。

| 服务商 | 环境变量 |
| --- | --- |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |

说明：

- Anthropic 的按量成本接口需要 Admin Key
- 环境变量优先级高于设置页里保存的值
- 设置页支持把某个已保存的 Key 一键切换为当前系统环境变量
- Windows 会写入用户级环境变量；Linux / macOS 会同步当前进程并写入应用托管的 Shell 环境脚本，新开的终端会读取新值

### OAuth Token

订阅数据会优先从本地工具凭据里自动检测。

> 注意：Anthropic 订阅接口查得太频繁可能返回 HTTP 429。

| 来源 | 文件路径 | 字段 |
| --- | --- | --- |
| Claude Code | `~/.claude/.credentials.json` | `claudeAiOauth.accessToken` |
| Codex CLI | `~/.codex/auth.json` | `tokens.access_token` |

说明：

- OpenAI 的 `tokens.access_token` 同时兼容字符串和索引对象两种格式
- OpenRouter 当前没有订阅 OAuth 查询

## 支持平台

- Windows
- Linux
- macOS

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

## 为什么还没有支持所有模型提供商

因为有些提供商没有公开、稳定、可维护的官方接口；当然，也有一部分原因是作者精力有限，社畜下班后体力条见底。

如果你正在用某个还没接入的 provider，欢迎提 PR。比较理想的贡献包括：

- Rust 侧 provider 实现和类型定义
- 前端 provider 展示与设置项
- 对应文档、环境变量、图标资源和验证步骤

只要数据来源可靠、行为边界清楚、不会把现有交互搞坏，就很欢迎一起补。

## Roadmap

欢迎提 Issue / PR，比较值得继续做的方向包括：

- 接入更多支持官方用量接口的 provider
- 更完整的异常态与错误提示
- 更丰富的桌面 Widget 展示样式
- 更好的首启配置引导
- 已签名 / 已 notarize 的 macOS 发布流程

## 贡献

如果你想帮忙，Issue、PR、功能建议都欢迎。

如果这个项目对你有帮助，欢迎点个 Star —— 这玩意儿至少能让我知道不是只有我一个人在被配额折磨。

## License

[MIT](./LICENSE)

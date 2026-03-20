# How Much Have I Cost - AI 用量监控桌面浮窗

一个轻量级桌面浮窗应用，用于实时监控多个 AI 服务商的 API 用量和订阅计划消耗情况。

基于 **Tauri v2 + Vue 3 + TypeScript + Rust** 构建。

## 功能特性

- **多服务商支持**: OpenAI、Anthropic、OpenRouter
- **按量 API 监控**: 实时显示 API 调用费用、余额、速率限制
- **订阅计划监控**: 显示 ChatGPT Plus/Pro、Claude Pro/Max 等订阅的用量窗口和利用率
- **OAuth Token 自动检测**: 从本地 Claude Code / Codex CLI 凭据文件自动读取 Token
- **系统托盘**: 最小化到托盘，右键菜单控制显示/隐藏/刷新/设置
- **透明浮窗**: 无边框透明窗口，始终置顶，可调节透明度
- **定时轮询**: 可配置的自动刷新间隔（默认 5 分钟）
- **密钥安全存储**: API Key 加密存储 + 环境变量优先

## 前置要求

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://rustup.rs/) (通过 rustup 安装)
- [Git](https://git-scm.com/)

## 开发环境运行

```bash
# 1. 克隆项目
git clone <repo-url>
cd how-much-have-i-cost

# 2. 安装前端依赖
npm install

# 3. 确保 Rust 工具链在 PATH 中
# Windows 用户可能需要手动添加:
# export PATH="$PATH:$HOME/.cargo/bin"

# 4. 启动开发模式（同时启动 Vite 前端 + Tauri Rust 后端）
npm run tauri dev
```

首次运行会编译 Rust 依赖，耗时较长（约 1-3 分钟），后续增量编译会快很多。

启动成功后会出现一个 280x400 的透明浮窗。

## 构建生产版本

```bash
npm run tauri build
```

产物位于 `src-tauri/target/release/bundle/`，包含 NSIS 安装包（Windows）。

## 配置说明

### API Key 配置

在浮窗右下角点击齿轮图标进入设置面板，为各服务商填入 API Key：

| 服务商 | Key 格式 | 环境变量 |
|--------|---------|----------|
| OpenAI | `sk-...` | `OPENAI_API_KEY` |
| Anthropic | `sk-ant-admin-...`（需要 Admin Key） | `ANTHROPIC_API_KEY` |
| OpenRouter | `sk-or-...` | `OPENROUTER_API_KEY` |

> 环境变量优先级高于设置面板中保存的 Key。

### 订阅计划监控（OAuth Token）

订阅用量监控需要 OAuth Token，可通过以下方式获取：

- **Anthropic**: 安装并登录 [Claude Code](https://claude.ai/code)，Token 自动保存在 `~/.claude/.credentials.json`
- **OpenAI**: 安装并登录 [Codex CLI](https://github.com/openai/codex)，Token 自动保存在 `~/.codex/auth.json`

在设置面板中点击「自动检测」按钮可自动读取本地凭据。

## 项目结构

```
how-much-have-i-cost/
├── src-tauri/                # Rust 后端
│   └── src/
│       ├── lib.rs            # Tauri 应用入口 & 插件注册
│       ├── main.rs           # Windows 控制台隐藏
│       ├── commands/         # IPC 命令（前后端通信）
│       ├── config/           # 配置持久化 & 密钥存储
│       ├── providers/        # 服务商抽象层（trait + 实现）
│       ├── tray/             # 系统托盘
│       └── polling/          # 轮询占位（前端驱动）
├── src/                      # Vue 3 前端
│   ├── App.vue               # 根组件（视图切换 + 托盘事件监听）
│   ├── components/
│   │   ├── widget/           # 浮窗组件（卡片、进度条、徽章等）
│   │   ├── settings/         # 设置面板组件
│   │   └── common/           # 公共组件（标题栏）
│   ├── stores/               # Pinia 状态管理
│   ├── composables/          # 组合式函数（轮询、窗口控制）
│   ├── types/                # TypeScript 类型定义
│   └── utils/                # 工具函数（IPC 封装、格式化）
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 推荐 IDE 配置

- [VS Code](https://code.visualstudio.com/) + [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri v2 |
| 前端 | Vue 3 + TypeScript + Vite 6 |
| 样式 | Tailwind CSS v4 |
| 状态管理 | Pinia 3 |
| 后端 | Rust + Tokio + Reqwest |
| HTTP | reqwest (rustls-tls) |
| 打包 | NSIS (Windows) |

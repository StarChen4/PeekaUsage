# How Much Have I Cost

一个基于 Tauri v2 的桌面浮窗，用来监控 OpenAI、Anthropic、OpenRouter 的 API 用量和订阅计划消耗。

前端使用 Vue 3 + TypeScript，后端使用 Rust。主界面是一个常驻右上角风格的小组件窗口，支持托盘、轮询、订阅检测、设置面板和卡片拖拽排序。

## 当前能力

- 支持 OpenAI、Anthropic、OpenRouter 三个供应商
- 同时展示按量 API 用量、订阅窗口、速率限制和错误状态
- 支持从本地 Claude Code / Codex CLI 自动检测 OAuth Token
- 支持系统托盘显示、隐藏、刷新、打开设置
- 支持窗口透明度、始终置顶、启动项、轮询间隔等设置
- 支持在主界面拖动供应商卡片调整顺序，并在松手后持久化布局
- 支持设置页启用/停用供应商后立即同步到主界面
- 支持保存供应商配置时显示“保存中 / 成功 / 失败”反馈
- 支持在主界面和设置界面显示供应商官方图标

## 最近更新

### OAuth 检测修复

- OpenAI 的 `~/.codex/auth.json` 现在同时兼容两种 `tokens.access_token` 结构：
- 旧格式：按数字索引拆开的对象
- 新格式：直接字符串
- 检测逻辑位于 `src-tauri/src/commands/window_commands.rs`

### 设置保存与主界面同步修复

- 设置页取消勾选供应商后，主界面会在保存后同步移除对应卡片
- 清空 API Key / OAuth Token 并保存时，会真正清掉已存凭据，不再沿用旧值
- 保存按钮现在有明确的保存状态反馈

### 托盘修复

- 现在只创建一个托盘图标
- 托盘图标使用应用默认图标
- 左键单击不会再触发两次显示/隐藏切换
- 窗口最小化到任务栏后，也能通过托盘恢复
- 托盘创建完全由 Rust 控制，不再依赖 `tauri.conf.json` 自动创建

### 主界面拖拽排序

- 主界面供应商卡片支持拖拽换序
- 拖动过程中其余卡片会实时推挤避让
- 松手后会保存当前顺序
- 刷新数据、切换设置、重启应用后仍保持同一顺序

### 供应商图标

- 主界面卡片和设置页卡片都已接入供应商官方图标
- 图标资源统一放在 `src/assets/provider-icons`
- 当前命名约定是 `openai.svg`、`anthropic.png`、`openrouter.jpeg`
- 页面通过共享组件 `src/components/common/ProviderIcon.vue` 渲染

## 环境要求

- Node.js 18+
- Rust 工具链
- Windows 开发环境

如果 `cargo` 不在 PATH 中，先补上：

```bash
export PATH="$PATH:$HOME/.cargo/bin"
```

## 开发命令

```bash
# 安装依赖
npm install

# 仅启动前端
npm run dev

# 启动完整桌面应用
npm run tauri dev

# 构建生产版本
npm run tauri build

# 前端类型检查
npx vue-tsc --noEmit

# Rust 检查
cargo check
```

首次 `npm run tauri dev` 会触发完整 Rust 编译，通常比前端启动慢得多。

## 使用说明

### API Key

在设置页为供应商填写 API Key，或通过环境变量提供。

| 服务商 | Key 格式 | 环境变量 |
|--------|---------|----------|
| OpenAI | `sk-...` | `OPENAI_API_KEY` |
| Anthropic | `sk-ant-admin-...` | `ANTHROPIC_API_KEY` |
| OpenRouter | `sk-or-...` | `OPENROUTER_API_KEY` |

说明：

- Anthropic 的按量费用接口要求 Admin Key，普通 Key 无法获取成本数据
- 环境变量优先级高于设置页保存值

### OAuth Token

订阅计划监控依赖本地 OAuth Token。

| 来源 | 文件路径 | 读取字段 |
|------|---------|----------|
| Claude Code | `~/.claude/.credentials.json` | `claudeAiOauth.accessToken` |
| Codex CLI | `~/.codex/auth.json` | `tokens.access_token` |

说明：

- OpenAI 订阅数据来自 `chatgpt.com/backend-api/wham/usage`
- Anthropic 订阅数据来自 `api.anthropic.com/api/oauth/usage`
- 设置页“自动检测”会扫描本地上述凭据文件

## 交互说明

### 托盘

- 关闭主窗口默认不是退出，而是隐藏到托盘
- 左键单击托盘图标切换主窗口显示
- 右键托盘图标可打开菜单
- 菜单项支持显示/隐藏、刷新、打开设置、退出

### 主界面

- 右下角按钮可刷新数据和打开设置
- 供应商卡片支持直接拖拽换序
- 卡片顺序会持久化到本地配置文件

## 项目结构

```text
src/
  App.vue                         根组件，处理 widget/settings 视图切换
  components/
    common/
      ProviderIcon.vue           供应商图标共享组件
    widget/
      WidgetContainer.vue         主界面卡片列表、拖拽排序、底部状态
      ProviderCard.vue            单个供应商卡片
    settings/
      SettingsPanel.vue           设置页容器
      ProviderConfig.vue          单个供应商设置卡片
  assets/
    provider-icons/              供应商官方图标资源
  composables/
    useProviders.ts               主数据初始化与刷新编排
    usePolling.ts                 自动轮询
  stores/
    provider.ts                   用量数据状态
    settings.ts                   应用设置状态
  utils/
    ipc.ts                        前端 IPC 封装

src-tauri/src/
  lib.rs                          Tauri 命令注册与应用初始化
  commands/
    provider_commands.rs          供应商配置、保存顺序、拉取用量
    window_commands.rs            OAuth 检测、窗口相关命令
  config/
    app_config.rs                 配置文件与 provider_order 持久化
    encryption.rs                 密钥存储
  providers/
    mod.rs                        ProviderManager
    subscription.rs               订阅计划查询
    types.rs                      Rust 类型定义
  tray/
    mod.rs                        托盘创建与托盘事件
```

## 关键实现约束

- 前后端类型必须同步维护：
- Rust：`src-tauri/src/providers/types.rs`
- TypeScript：`src/types/provider.ts`
- 字段命名通过 serde 映射，Rust 使用 snake_case，TS 使用 camelCase

- 托盘只能保留 Rust 手动创建这一套：
- 不要在 `src-tauri/tauri.conf.json` 里重新加回自动托盘配置

- 供应商显示顺序由后端配置管理：
- `src-tauri/src/config/app_config.rs` 中的 `provider_order`
- `fetch_all_usage` 会按保存顺序返回结果

- 关闭窗口是隐藏到托盘，不是退出应用

## 新 Agent 接手建议

建议按这个顺序读代码：

1. `AGENTS.md`
2. `CLAUDE.md`
3. `src-tauri/src/lib.rs`
4. `src-tauri/src/config/app_config.rs`
5. `src-tauri/src/commands/provider_commands.rs`
6. `src-tauri/src/commands/window_commands.rs`
7. `src-tauri/src/tray/mod.rs`
8. `src/components/widget/WidgetContainer.vue`
9. `src/components/settings/ProviderConfig.vue`
10. `src/components/settings/SettingsPanel.vue`

## 验证清单

每次涉及前后端逻辑改动，至少执行：

```bash
npx vue-tsc --noEmit
cargo check
```

如果改了以下部分，建议额外手动验证：

- 托盘：验证单击、右键菜单、最小化后恢复
- 设置页：验证保存反馈、启停供应商同步、自动检测
- 主界面：验证拖拽推挤动画、松手保存、重启后顺序保持

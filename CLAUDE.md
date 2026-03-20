# CLAUDE.md - AI 用量监控桌面浮窗

## 项目概述

这是一个 Tauri v2 桌面应用，用于监控 OpenAI、Anthropic、OpenRouter 的 API 用量与订阅计划消耗。

- Rust 后端负责 provider 请求、配置持久化、密钥存储、托盘和窗口命令
- Vue 3 前端负责主界面、设置页、轮询和交互动画
- 当前 UI 形态是小尺寸透明浮窗，无路由，依赖 `App.vue` 内部切换 `widget / settings`

## 最近已落地的更新

### 1. OpenAI OAuth 自动检测兼容新旧格式

文件：`src-tauri/src/commands/window_commands.rs`

当前 `~/.codex/auth.json` 的 `tokens.access_token` 需要同时兼容：

- 旧格式：`{"0":"e","1":"y",...}`
- 新格式：`"eyJ..."`

不要再假设它一定是索引对象。现在由 `parse_codex_access_token()` 统一处理。

### 2. 设置保存链路修复

文件：

- `src/components/settings/ProviderConfig.vue`
- `src/components/settings/SettingsPanel.vue`
- `src-tauri/src/commands/provider_commands.rs`

当前行为：

- 设置页禁用供应商后，保存会同步影响主界面卡片
- 清空 API Key / OAuth Token 后保存，会真正清除已存值
- 保存时有明确状态反馈

### 3. 托盘逻辑修复

文件：

- `src-tauri/src/tray/mod.rs`
- `src-tauri/tauri.conf.json`

当前行为：

- 托盘只保留一份，由 Rust 手动创建
- 左键只处理一次点击，不再重复触发
- 托盘显示窗口前会先 `unminimize()`
- `tauri.conf.json` 中不要重新加回自动托盘配置

### 4. 主界面卡片拖拽排序

文件：

- `src/components/widget/WidgetContainer.vue`
- `src-tauri/src/config/app_config.rs`
- `src-tauri/src/commands/provider_commands.rs`
- `src/utils/ipc.ts`

当前行为：

- 主界面卡片支持拖拽换序
- 拖动中其他卡片会实时推挤
- 松手后保存排序
- 排序持久化到 `provider_order`
- 刷新和重启后维持顺序

### 5. 供应商官方图标接入

文件：

- `src/components/common/ProviderIcon.vue`
- `src/components/widget/ProviderCard.vue`
- `src/components/settings/ProviderConfig.vue`
- `src/assets/provider-icons/`

当前行为：

- 主界面和设置界面的供应商名称前都显示对应图标
- 图标资源统一由本地静态文件提供
- 图标文件命名约定为 `openai.*`、`anthropic.*`、`openrouter.*`
- 后续替换图标时优先只改 `src/assets/provider-icons/` 下的资源

## 开发命令

```bash
npm install
npm run dev
npm run tauri dev
npx vue-tsc --noEmit
cargo check
npm run tauri build
```

Windows 环境如果 `cargo` 不在 PATH 中，先执行：

```bash
export PATH="$PATH:$HOME/.cargo/bin"
```

## 架构要点

### Rust 后端

#### Provider 抽象

- `src-tauri/src/providers/traits.rs` 定义 `UsageProvider`
- `src-tauri/src/providers/mod.rs` 中的 `ProviderManager` 统一管理 provider 注册、用量拉取和校验
- `src-tauri/src/providers/subscription.rs` 负责 OAuth 订阅数据抓取

#### IPC 命令

- `src-tauri/src/commands/provider_commands.rs`
  - 获取配置
  - 保存供应商配置
  - 拉取用量
  - 保存供应商顺序
- `src-tauri/src/commands/window_commands.rs`
  - OAuth 自动检测
  - 窗口相关命令

#### 配置与密钥

- `src-tauri/src/config/app_config.rs`
  - 管理 `config.json`
  - 持久化应用设置、供应商启用状态、`provider_order`
- `src-tauri/src/config/encryption.rs`
  - 管理 key/token 存取

#### 托盘

- `src-tauri/src/tray/mod.rs`
  - 创建单一托盘
  - 处理左键显示/隐藏
  - 处理菜单刷新、打开设置、退出

### Vue 前端

#### 状态

- `src/stores/provider.ts` 管理主界面数据
- `src/stores/settings.ts` 管理设置页数据

#### 组合式逻辑

- `src/composables/useProviders.ts`
  - 初始化主数据
  - 手动刷新
  - 与轮询衔接
- `src/composables/usePolling.ts`
  - 周期性拉取用量

#### 主要组件

- `src/components/common/ProviderIcon.vue`
  - 统一渲染供应商图标
- `src/components/widget/WidgetContainer.vue`
  - 渲染主界面卡片列表
  - 拖拽排序
  - 排序保存反馈
- `src/components/settings/ProviderConfig.vue`
  - 单个供应商配置卡片
  - 保存状态反馈
- `src/components/settings/SettingsPanel.vue`
  - 设置页容器与保存编排

#### 静态资源

- `src/assets/provider-icons/`
  - 供应商官方图标资源
  - 当前已标准化命名，便于后续直接替换

## 当前数据流

```text
前端初始化 / 轮询
  -> IPC: fetch_all_usage
  -> AppConfig.get_enabled_providers()
  -> ProviderManager.fetch_usage()
  -> UsageSummary[]
  -> Pinia providerStore
  -> WidgetContainer / ProviderCard 渲染
```

排序数据流：

```text
WidgetContainer 拖拽结束
  -> ipc.saveProviderOrder(order)
  -> provider_commands.save_provider_order()
  -> AppConfig.save_provider_order()
  -> config.json.provider_order
  -> 下次 fetch_all_usage 按该顺序返回
```

## 关键类型与同步约束

关键类型：

- `ProviderId`
- `UsageData`
- `SubscriptionUsage`
- `SubscriptionWindow`
- `UsageSummary`

定义位置：

- Rust：`src-tauri/src/providers/types.rs`
- TypeScript：`src/types/provider.ts`

要求：

- 两边必须同步
- Rust 使用 snake_case
- TS 使用 camelCase
- 通过 serde `rename_all` 映射

## 配置文件与本地凭据

### 应用配置

`config.json` 当前至少包含：

- `settings`
- `providers`
- `provider_order`

### OAuth 凭据位置

| 来源 | 路径 | 字段 |
|------|------|------|
| Claude Code | `~/.claude/.credentials.json` | `claudeAiOauth.accessToken` |
| Codex CLI | `~/.codex/auth.json` | `tokens.access_token` |

## API 端点

### 按量 API

| 服务商 | 端点 | 认证 |
|--------|------|------|
| OpenAI | `/v1/organization/costs`、`/v1/dashboard/billing/subscription` | API Key |
| Anthropic | `/v1/organizations/cost_report` | Admin API Key |
| OpenRouter | `/api/v1/credits`、`/api/v1/key` | API Key |

### 订阅 OAuth

| 服务商 | 端点 | 认证 |
|--------|------|------|
| Anthropic | `api.anthropic.com/api/oauth/usage` | OAuth Token |
| OpenAI | `chatgpt.com/backend-api/wham/usage` | OAuth Token |

## 添加新 Provider 的步骤

1. 在 Rust `ProviderId` 添加新枚举值和辅助方法
2. 新建 provider 文件并实现 `UsageProvider`
3. 在 `ProviderManager::new()` 注册
4. 在 TS `ProviderId` 与相关类型中同步新增
5. 检查设置页与主界面是否依赖硬编码供应商列表
6. 如需支持拖拽顺序，更新 `save_provider_order()` 的允许列表和 `provider_rank()`

## 重要注意事项

- 不要把托盘重新配回 `tauri.conf.json`
- 不要假设 OpenAI OAuth token 一定是对象格式
- 不要忘记设置页保存后要刷新前端 provider 数据
- 不要只改前端排序，不改后端 `provider_order` 持久化
- 不要在多个组件里各自硬编码图标路径，统一走 `ProviderIcon.vue`
- 关闭窗口默认应隐藏到托盘，而不是退出
- Tauri v2 的 `WebviewWindow` 没有 `set_opacity()`，透明度由前端控制

## 常用排查入口

### 托盘异常

先看：

- `src-tauri/src/tray/mod.rs`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`

重点查：

- 是否重复创建托盘
- 是否处理了 `MouseButtonState::Up`
- 恢复窗口前是否 `unminimize()`

### 设置不同步

先看：

- `src/components/settings/ProviderConfig.vue`
- `src/components/settings/SettingsPanel.vue`
- `src-tauri/src/commands/provider_commands.rs`

重点查：

- 保存后是否刷新 provider store
- 空值是否真的清掉密钥
- disabled provider 是否仍被主界面保留

### 排序异常

先看：

- `src/components/widget/WidgetContainer.vue`
- `src-tauri/src/config/app_config.rs`
- `src/utils/ipc.ts`

重点查：

- 拖拽结束是否调用 `saveProviderOrder`
- `provider_order` 是否正确写入配置
- `fetch_all_usage` 返回顺序是否经过 `get_enabled_providers()`

## 建议验证

涉及逻辑改动时至少执行：

```bash
npx vue-tsc --noEmit
cargo check
```

涉及交互改动时建议再手动验证：

- 托盘左键、右键菜单、最小化后恢复
- 设置页保存反馈和启停同步
- OAuth 自动检测
- 主界面拖拽推挤、松手保存、重启后顺序保持

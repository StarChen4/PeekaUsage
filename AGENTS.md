# CLAUDE.md - AI 用量监控桌面浮窗

## 项目概述

Tauri v2 桌面应用，监控 OpenAI / Anthropic / OpenRouter 的 API 用量和订阅计划消耗。
Rust 后端处理 HTTP 请求、密钥存储、系统托盘；Vue 3 前端负责 UI 渲染和状态管理。

## 开发命令

```bash
# 开发模式（需要 cargo 在 PATH 中）
npm run tauri dev

# 构建生产版本
npm run tauri build

# 仅前端开发服务器
npm run dev

# 类型检查
npx vue-tsc --noEmit
```

Windows 环境下如果 cargo 不在 PATH 中，先执行：
```bash
export PATH="$PATH:$HOME/.cargo/bin"
```

## 架构要点

### Rust 后端 (src-tauri/src/)

- **Provider Trait 模式**: `providers/traits.rs` 定义 `UsageProvider` trait，每个服务商实现该 trait
- **ProviderManager** (`providers/mod.rs`): 注册表模式管理所有 provider，统一调度 API 调用 + 订阅查询
- **SubscriptionFetcher** (`providers/subscription.rs`): 独立模块处理 OAuth 订阅用量，调用 `api.anthropic.com/api/oauth/usage` 和 `chatgpt.com/backend-api/wham/usage`
- **IPC 命令** (`commands/`): 通过 `#[tauri::command]` 暴露给前端，所有命令在 `lib.rs` 中注册
- **配置持久化** (`config/`): `AppConfig` 管理 JSON 配置，`KeyStore` 管理 base64 编码的密钥存储
- **状态管理**: `AppConfig`、`KeyStore`、`ProviderManager` 通过 `app.manage()` 注入为 Tauri State

### Vue 前端 (src/)

- **Pinia Store**: `providerStore` (用量数据) + `settingsStore` (应用设置)
- **Composables**: `usePolling` (定时器)、`useProviders` (初始化编排)、`useWindowControls` (窗口控制)
- **视图切换**: `App.vue` 通过 `currentView` 在 widget/settings 之间切换，无路由
- **托盘事件**: 前端监听 `tray-refresh`、`tray-open-settings` 等自定义事件

### 数据流

```
前端轮询 → IPC invoke → ProviderManager.fetch_usage()
  → UsageProvider.fetch_usage() (API Key 按量数据)
  + SubscriptionFetcher.fetch_*() (OAuth 订阅数据)
  → UsageSummary → 前端 Pinia Store → 组件渲染
```

## 关键类型

- `ProviderId`: 枚举 (openai / anthropic / openrouter)
- `UsageData`: API 按量使用数据 (total_used, budget, remaining)
- `SubscriptionUsage`: 订阅用量 (plan_name, windows[])
- `SubscriptionWindow`: 单个用量窗口 (label, utilization%, resets_at)
- `UsageSummary`: 聚合结果 (usage + subscription + rate_limit + status)

Rust 类型定义在 `src-tauri/src/providers/types.rs`，TypeScript 镜像在 `src/types/provider.ts`。
**两边必须保持同步**，字段名 Rust 用 snake_case，TS 用 camelCase，通过 serde `rename_all` 映射。

## 添加新 Provider 的步骤

1. 在 `ProviderId` 枚举添加新变体，实现 `as_str()`、`env_key_name()` 等方法
2. 创建 `src-tauri/src/providers/new_provider.rs`，实现 `UsageProvider` trait
3. 在 `ProviderManager::new()` 中注册新 provider
4. 在 `src/types/provider.ts` 中同步添加对应类型
5. 前端设置面板会自动渲染新 provider 的配置卡片

## OAuth Token 凭据位置

| 来源 | 文件路径 | Token 字段 |
|------|---------|-----------|
| Claude Code | `~/.claude/.credentials.json` | `claudeAiOauth.accessToken` (sk-ant-oat01-...) |
| Codex CLI | `~/.codex/auth.json` | `tokens.access_token` (indexed object → join 为 JWT) |

Codex 的 `access_token` 是索引对象 `{"0":"e","1":"y",...}`，需按数字键排序后拼接成字符串。
实现见 `commands/window_commands.rs` 的 `indexed_object_to_string()`。

## API 端点汇总

### 按量 API
| 服务商 | 端点 | 认证 |
|--------|------|------|
| OpenAI | `/v1/organization/costs`, `/v1/dashboard/billing/subscription` | API Key |
| Anthropic | `/v1/organizations/cost_report` | Admin API Key (sk-ant-admin-...) |
| OpenRouter | `/api/v1/credits`, `/api/v1/key` | API Key |

### 订阅 OAuth
| 服务商 | 端点 | 认证 |
|--------|------|------|
| Anthropic | `api.anthropic.com/api/oauth/usage` | OAuth Token |
| OpenAI | `chatgpt.com/backend-api/wham/usage` | OAuth Token (Bearer) |

## 注意事项

- Tauri v2 的 `WebviewWindow` 没有 `set_opacity()` 方法，透明度通过前端 CSS 控制
- Anthropic 的按量 API 需要 **Admin API Key** (`sk-ant-admin-...`)，普通 API Key 无法获取费用数据
- OpenAI 订阅端点在 `chatgpt.com` 而非 `api.openai.com`
- 关闭窗口行为是隐藏到托盘而非退出应用（`on_window_event` 中拦截 `CloseRequested`）
- 首次 Rust 编译较慢（1-3 分钟），后续增量编译快
- 开发时 Vite 使用端口 1420，如果被占用需先 kill 占用进程

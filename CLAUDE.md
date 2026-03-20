# CLAUDE.md - AI 用量监控桌面浮窗

## 项目概览

这是一个 Tauri v2 桌面应用，用于监控 OpenAI、Anthropic、OpenRouter 的 API 用量与订阅计划消耗。

- Rust 后端负责 provider 请求、配置持久化、密钥存储、托盘和窗口命令
- Vue 3 前端负责主界面、设置页、轮询和交互动画
- 当前 UI 是单窗口浮窗形态，在 `App.vue` 内部切换 `widget / settings`

## 最近已落地的更新

### 1. OpenAI OAuth 自动检测兼容新旧格式

文件：`src-tauri/src/commands/window_commands.rs`

当前 `~/.codex/auth.json` 的 `tokens.access_token` 需要同时兼容：

- 旧格式：`{"0":"e","1":"y",...}`
- 新格式：`"eyJ..."`

现在由 `parse_codex_access_token()` 统一处理，不要再假设它一定是索引对象。

### 2. 设置保存链路已修复

文件：

- `src/components/settings/ProviderConfig.vue`
- `src/components/settings/SettingsPanel.vue`
- `src-tauri/src/commands/provider_commands.rs`

当前行为：

- 设置页禁用供应商后，保存会同步影响主界面卡片
- 清空 API Key / OAuth Token 后保存，会真正清除旧凭据
- 保存按钮有明确的保存状态反馈

### 3. 托盘逻辑已修复

文件：

- `src-tauri/src/tray/mod.rs`
- `src-tauri/tauri.conf.json`

当前行为：

- 托盘只保留一个，由 Rust 手动创建
- 左键只处理一次点击，不再重复触发
- 显示窗口前会先 `unminimize()`
- 不要把自动托盘配置重新加回 `tauri.conf.json`

### 4. 主界面卡片拖拽排序已支持持久化

文件：

- `src/components/widget/WidgetContainer.vue`
- `src-tauri/src/config/app_config.rs`
- `src-tauri/src/commands/provider_commands.rs`
- `src/utils/ipc.ts`

当前行为：

- 主界面卡片支持拖拽换序
- 拖拽中其他卡片会实时碰撞避让
- 松手后会保存排序
- 刷新和重启后继续保持顺序

### 5. 供应商官方图标已接入

文件：

- `src/components/common/ProviderIcon.vue`
- `src/components/widget/ProviderCard.vue`
- `src/components/settings/ProviderConfig.vue`
- `src/assets/provider-icons/`

当前行为：

- 主界面和设置界面的供应商名称前都显示图标
- 图标资源统一由本地静态文件提供
- 命名约定是 `openai.*`、`anthropic.*`、`openrouter.*`
- 后续替换图标时优先只改 `src/assets/provider-icons/`

### 6. 移除供应商已改为应用内确认弹层

文件：

- `src/components/common/ConfirmDialog.vue`
- `src/components/settings/ProviderConfig.vue`

当前行为：

- 不再使用 `window.confirm()`
- 弹层风格与应用主题一致
- 弹层通过 `Teleport` 挂到 `body`
- 小窗口下不会再被设置卡片裁切

### 7. 设置页下拉已改为跨平台自定义组件

文件：

- `src/components/common/AppSelect.vue`
- `src/components/settings/ProviderConfig.vue`
- `src/components/settings/SettingsPanel.vue`

当前行为：

- 设置页不再依赖原生 `<select>` 做核心交互
- 暗黑模式下背景、边框、浮层风格统一走应用主题
- “新增供应商”下拉的选项中显示供应商图标
- 浮层支持 `Teleport`、键盘导航、点击外部关闭
- 这套实现优先面向 Windows、Linux、macOS 的一致性

### 8. 设置页已支持透明度调节条

文件：

- `src/components/settings/SettingsPanel.vue`
- `src/composables/useWindowControls.ts`
- `src/App.vue`

当前行为：

- 设置页可直接调整窗口透明度
- 拖动滑杆时即时预览，松手后保存
- 主界面透明度把手与设置页滑杆共用同一套状态
- 应用启动时会恢复到已保存的透明度
- 当前数值语义是“不透明度”：`100%` 表示完全不透明

### 9. 后续功能开发默认按跨平台一致性设计

当前要求：

- 后续实现默认同时考虑 Windows、Linux、macOS
- 优先采用前端自绘、可控、跨平台稳定的交互方案
- 避免优先依赖单平台系统控件外观或平台特有行为
- 如果必须做平台分支，需要在文档里补充原因和影响范围

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
  - 窗口透明度命令

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

- `src/stores/providerStore.ts` 管理主界面数据
- `src/stores/settingsStore.ts` 管理设置页数据

#### 组合式逻辑

- `src/composables/useProviders.ts`
  - 初始化主数据
  - 手动刷新
  - 与轮询衔接
- `src/composables/usePolling.ts`
  - 周期性拉取用量
- `src/composables/useWindowControls.ts`
  - 窗口显示控制
  - 透明度即时预览
  - 透明度持久化同步

#### 主要组件

- `src/components/common/ProviderIcon.vue`
  - 统一渲染供应商图标
- `src/components/common/AppSelect.vue`
  - 跨平台自定义下拉
- `src/components/common/ConfirmDialog.vue`
  - 应用内确认弹层
- `src/components/widget/WidgetContainer.vue`
  - 渲染主界面卡片列表
  - 拖拽排序
  - 底部状态区
- `src/components/widget/OpacityHandle.vue`
  - 主界面侧边透明度拖拽把手
- `src/components/settings/ProviderConfig.vue`
  - 单个供应商配置卡片
  - 删除确认弹层入口
- `src/components/settings/SettingsPanel.vue`
  - 设置页容器
  - 轮询间隔下拉
  - 透明度调节条

#### 静态资源

- `src/assets/provider-icons/`
  - 供应商官方图标资源

## 当前数据流

### 用量数据流

```text
前端初始化 / 轮询
  -> IPC: fetch_all_usage
  -> AppConfig.get_enabled_providers()
  -> ProviderManager.fetch_usage()
  -> UsageSummary[]
  -> Pinia providerStore
  -> WidgetContainer / ProviderCard 渲染
```

### 排序数据流

```text
WidgetContainer 拖拽结束
  -> ipc.saveProviderOrder(order)
  -> provider_commands.save_provider_order()
  -> AppConfig.save_provider_order()
  -> config.json.provider_order
  -> 下次 fetch_all_usage 按该顺序返回
```

### 透明度数据流

```text
设置页滑杆 / 主界面透明度把手
  -> useWindowControls.updateOpacity()
  -> 更新 #app CSS opacity
  -> IPC: set_window_opacity
  -> settingsStore.saveSettings({ windowOpacity })
  -> App.vue 启动时恢复并监听变化
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

其中 `settings.windowOpacity` 已用于设置页滑杆和主界面透明度同步。

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

## 重要注意事项

- 不要把托盘重新配回 `tauri.conf.json`
- 不要假设 OpenAI OAuth token 一定是对象格式
- 不要忘记设置保存后要刷新前端 provider 数据
- 不要只改前端排序，不改后端 `provider_order`
- 不要在多个组件里各自写图标路径，统一使用 `ProviderIcon.vue`
- 不要为设置页核心交互继续使用原生 `<select>`
- 不要让应用内弹层和浮层被父容器裁切，优先用 `Teleport`
- 透明度现在由前端视觉层控制并通过 IPC 同步，Tauri v2 本身没有直接可用的 `WebviewWindow.set_opacity()`
- 后续交互实现优先保证 Windows、Linux、macOS 的一致性，其次再考虑单平台捷径

## 常用排查入口

### 托盘异常

先看：

- `src-tauri/src/tray/mod.rs`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`

重点查：

- 是否重复创建托盘
- 是否只处理了 `MouseButtonState::Up`
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

### 自定义下拉异常

先看：

- `src/components/common/AppSelect.vue`
- `src/components/settings/ProviderConfig.vue`
- `src/components/settings/SettingsPanel.vue`

重点查：

- 浮层是否通过 `Teleport` 挂到 `body`
- 小窗口下是否仍会被裁切
- 供应商图标是否继续走 `ProviderIcon.vue`
- 暗黑模式是否仍在用应用主题变量

### 透明度异常

先看：

- `src/components/settings/SettingsPanel.vue`
- `src/components/widget/OpacityHandle.vue`
- `src/composables/useWindowControls.ts`
- `src/App.vue`

重点查：

- 滑杆拖动时是否即时预览
- 松手后是否写回 `windowOpacity`
- 启动后是否恢复保存值
- 主界面把手与设置页滑杆是否同步

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
- 自定义下拉在浅色/暗黑模式下的打开、关闭、键盘导航
- 设置页透明度滑杆与主界面透明度把手的同步
## 补充说明

### 主界面主题入口

文件：
- `src/components/widget/WidgetContainer.vue`

当前行为：
- 主界面底部主题按钮固定显示半袖上衣图标，不再根据当前主题切换按钮图标
- 主题菜单改为紧凑列表样式，减少在小浮窗中的遮挡和空间占用
- 菜单仍保留 `light`、`dark`、`system` 三个主题选项

# CLAUDE.md - AI 用量监控桌面浮窗

## 补充更新

- `src/components/settings/SettingsPanel.tsx` 的刷新设置已支持“自动刷新 / 仅手动”切换，自动模式下可自定义数值并选择按秒或按分钟
- 刷新相关持久化字段现在是 `pollingMode`、`pollingInterval`、`pollingUnit`、`providerPollingOverridesEnabled`、`providerPollingOverrides`、`refreshOnSettingsClose`
- 设置页高级区域可开启按供应商独立刷新；开启后会按已配置供应商显示单独策略，且主界面每张供应商卡片右上角都有单独刷新按钮
- 旧配置缺少新字段时继续按“5 分钟自动刷新”兼容
- `src/components/settings/SettingsPanel.tsx` 的设置页返回入口已改为左向箭头图标按钮，不再显示紫色文字按钮
- 返回按钮的 `hover` 和 `focus` 交互态要继续跟随应用主题风格
- 设置页“通用”里新增了“返回时刷新主界面”开关，默认关闭；只有勾选后，从设置返回主界面才会触发一次全部供应商刷新
- 设置页“通用”里已新增语言选择，顺序固定为“简体中文”“繁體中文”“English”，持久化字段是 `language`
- 当前前端文案统一收敛到 `src/i18n/messages.ts`，默认支持 `zh-Hans`、`zh-Hant`、`en`
- GitHub Actions 已接入 Windows + Linux + macOS Release 自动发布，推送 `v*` 标签会构建并发布 Windows NSIS、Linux `x86_64` / `arm64` 的 `deb` / `AppImage`，以及 macOS `x86_64` / `arm64` 的 `app` / `dmg`
- 发版前会校验 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 三处版本号一致

## 项目概览

这是一个 Tauri v2 桌面应用，用于监控 OpenAI、Anthropic、OpenRouter 的 API 用量与订阅计划消耗。

- Rust 后端负责 provider 请求、配置持久化、密钥存储、托盘和窗口命令
- React 前端负责主界面、设置页、轮询和交互动画
- 当前 UI 是单窗口浮窗形态，在 `App.tsx` 内部切换 `widget / settings`

## 最近已落地的更新

### 1. OpenAI OAuth 自动检测兼容新旧格式

文件：`src-tauri/src/commands/window_commands.rs`

当前 `~/.codex/auth.json` 的 `tokens.access_token` 需要同时兼容：

- 旧格式：`{"0":"e","1":"y",...}`
- 新格式：`"eyJ..."`

现在由 `parse_codex_access_token()` 统一处理，不要再假设它一定是索引对象。

### 2. 设置保存链路已修复

文件：

- `src/components/settings/ProviderConfig.tsx`
- `src/components/settings/SettingsPanel.tsx`
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

- `src/components/widget/WidgetContainer.tsx`
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

- `src/components/common/ProviderIcon.tsx`
- `src/components/widget/ProviderCard.tsx`
- `src/components/settings/ProviderConfig.tsx`
- `src/assets/provider-icons/`

当前行为：

- 主界面和设置界面的供应商名称前都显示图标
- 图标资源统一由本地静态文件提供
- 命名约定是 `openai.*`、`anthropic.*`、`openrouter.*`
- 后续替换图标时优先只改 `src/assets/provider-icons/`

### 6. 移除供应商已改为应用内确认弹层

文件：

- `src/components/common/ConfirmDialog.tsx`
- `src/components/settings/ProviderConfig.tsx`

当前行为：

- 不再使用 `window.confirm()`
- 弹层风格与应用主题一致
- 弹层通过 `React portal` 挂到 `body`
- 小窗口下不会再被设置卡片裁切

### 7. 设置页下拉已改为跨平台自定义组件

文件：

- `src/components/common/AppSelect.tsx`
- `src/components/settings/ProviderConfig.tsx`
- `src/components/settings/SettingsPanel.tsx`

当前行为：

- 设置页不再依赖原生 `<select>` 做核心交互
- 暗黑模式下背景、边框、浮层风格统一走应用主题
- “新增供应商”下拉的选项中显示供应商图标
- 浮层支持 `React portal`、键盘导航、点击外部关闭
- 这套实现优先面向 Windows、Linux、macOS 的一致性

### 8. 刷新设置已支持秒 / 分钟 / 仅手动

文件：

- `src/components/settings/SettingsPanel.tsx`
- `src/components/widget/ProviderCard.tsx`
- `src/composables/usePolling.ts`
- `src/composables/useProviders.ts`
- `src/types/settings.ts`
- `src-tauri/src/config/app_config.rs`

当前行为：

- 刷新设置由 `pollingMode`、`pollingInterval`、`pollingUnit` 共同决定
- 自动刷新支持自定义数值，并可选择按秒或按分钟
- 选择“仅手动”后不会继续启动定时轮询
- 设置页里的刷新配置使用紧凑分段按钮和窄输入框，减少小浮窗中的占位
- 设置页“通用”里额外提供“返回时刷新主界面”开关，默认关闭
- 设置页高级区域可开启“按供应商独立刷新”，开启后按已配置供应商展示单独策略
- 分供应商策略支持自动 / 手动、秒 / 分和自定义数值；未单独修改时沿用全局策略
- 主界面每张供应商卡片右上角都有单独刷新按钮，只刷新当前供应商
- 主界面手动刷新按钮和托盘刷新仍然保留
- 旧配置缺少新字段时默认按“5 分钟自动刷新”解释

### 9. 设置页已支持透明度调节条

文件：

- `src/components/settings/SettingsPanel.tsx`
- `src/composables/useWindowControls.ts`
- `src/App.tsx`

当前行为：

- 设置页可直接调整窗口透明度
- 拖动滑杆时即时预览，松手后保存
- 主界面透明度把手与设置页滑杆共用同一套状态
- 应用启动时会恢复到已保存的透明度
- 当前数值语义是“不透明度”：`100%` 表示完全不透明

### 10. 后续功能开发默认按跨平台一致性设计

当前要求：

- 后续实现默认同时考虑 Windows、Linux、macOS
- 优先采用前端自绘、可控、跨平台稳定的交互方案
- 避免优先依赖单平台系统控件外观或平台特有行为
- 如果必须做平台分支，需要在文档里补充原因和影响范围

### 11. Linux Release 已接入 `x86_64` / `arm64`

文件：

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `src-tauri/tauri.linux.conf.json`
- `package.json`

当前行为：

- CI 会在 Windows 和 Linux `x86_64` 上执行 `npm ci`、`tsc --noEmit`、`cargo check`
- 推送 `v*` 标签后会发布 Windows NSIS、Linux `x86_64` / `arm64` 的 `deb` 和 `AppImage`
- Linux 打包目标单独放在 `src-tauri/tauri.linux.conf.json`
- 本地 Linux 打包使用 `npm run tauri:build:linux`
- Linux `arm64` 发布当前依赖 GitHub Actions 的 ARM Linux runner
- Linux CI / Release 的依赖安装要与 Tauri 官方 ARM 打包示例保持一致，至少包含 `build-essential`、`curl`、`file`、`libfuse2`、`libgtk-3-dev`、`libssl-dev`、`libwebkit2gtk-4.1-dev`、`libayatana-appindicator3-dev`、`librsvg2-dev`、`patchelf`

### 12. macOS Release 已接入 `x86_64` / `arm64`

文件：

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `src-tauri/tauri.macos.conf.json`
- `package.json`

当前行为：

- CI 会在 macOS runner 上执行 `npm ci`、`tsc --noEmit`、`cargo check`
- 推送 `v*` 标签后会发布 macOS `x86_64` / `arm64` 的 `app` 和 `dmg`
- macOS 打包目标单独放在 `src-tauri/tauri.macos.conf.json`
- 本地 macOS 打包使用 `npm run tauri:build:macos`
- 当前 macOS 产物未签名、未 notarize
- 如果安装后被提示“文件已损坏，无法打开”，文档里要明确提供 `xattr -dr com.apple.quarantine /Applications/PeekaUsage.app` 作为手动放行方案

### 13. 应用标识已切到 `PeekaUsage`

文件：

- `src-tauri/tauri.conf.json`
- `src-tauri/src/config/migration.rs`
- `src-tauri/src/lib.rs`

当前行为：

- 当前 Tauri `identifier` 是 `com.peekausage.desktop`
- 应用启动时会尝试从旧标识 `com.ai-usage-peek.desktop` 的应用数据目录迁移 `config.json` 和 `keys.dat`
- 只有新目录里对应文件不存在时才会复制，避免覆盖已经迁移或新生成的数据
- 如果后续继续改 `identifier`，必须同步维护迁移逻辑

### 14. 设置页 OAuth Token 区域已新增官方获取入口

文件：

- `src/components/settings/ProviderConfig.tsx`
- `src/i18n/messages.ts`

当前行为：

- `OAuth Token（订阅计划）` 输入框下方保留“自动检测”按钮
- “自动检测”右侧新增“获取方式”按钮
- Anthropic 点击后打开 `Claude Code Authentication` 官方文档
- OpenAI 点击后打开 `Codex Authentication` 官方文档
- 下方提示文案区分“自动检测读取位置”和“官方获取方式”
- OpenAI 文案不再假设 `~/.codex/auth.json` 一定存在，需要兼容系统凭据库存储

### 15. 设置页已支持一键切换 API Key 到系统环境变量

文件：

- `src/components/settings/ProviderConfig.tsx`
- `src/components/settings/SettingsPanel.tsx`
- `src/utils/ipc.ts`
- `src/types/provider.ts`
- `src-tauri/src/commands/provider_commands.rs`
- `src-tauri/src/config/app_config.rs`
- `src-tauri/src/config/system_env.rs`

当前行为：

- 设置页每个 API Key 卡片都可以把当前 Key 切换到对应供应商的系统环境变量
- 只有用户显式点击“切换环境”后，应用才会接管该供应商的环境变量
- 有未保存改动时会先阻止切换，避免把旧值写进环境变量
- 当前激活的 Key 会显示“当前环境”
- Windows 同步用户级环境变量
- Linux / macOS 会同步当前进程，并写入应用托管的 Shell 环境脚本；新开终端会读取新值
- macOS 额外同步 `launchctl` 会话环境；Linux 当前主要保证 Shell 启动的命令链路

### 16. 主界面已支持精简 / 详细显示模式

文件：

- `src/components/widget/WidgetContainer.tsx`
- `src/components/widget/ProviderCard.tsx`
- `src/assets/styles/widget.css`
- `src/i18n/messages.ts`
- `src/types/settings.ts`
- `src-tauri/src/config/app_config.rs`

当前行为：

- 主界面底部新增显示模式切换，使用和其他底部按钮一致的单个图标按钮
- 持久化字段是 `widgetDisplayMode`
- 当前支持 `detailed`、`compact`
- 默认保持 `detailed`
- 详细模式继续显示完整卡片内容
- 精简模式使用“标签 + 进度条 + 百分比”的横向摘要行
- 精简模式下订阅不显示订阅名和重置时间
- 精简模式要保留所有订阅窗口进度条，不能只显示单个汇总窗口
- OpenAI 的 `5小时`、`7天` 等订阅窗口会在精简模式下分别显示
- 多个 API Key 在精简模式下按一行一个显示
- 精简模式不再显示逐 Key 的金额/余额明细块和 rate limit badge
- 切换结果会持久化，重启后继续保持
- 旧配置缺少 `widgetDisplayMode` 时默认按详细模式兼容

## 开发命令

```bash
npm install
npm run dev
npm run tauri dev
npx tsc --noEmit
cargo check
npm run tauri build
npm run tauri:build:linux
npm run tauri:build:macos
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
  - 激活当前系统环境变量使用的 API Key
- `src-tauri/src/commands/window_commands.rs`
  - OAuth 自动检测
  - 窗口透明度命令

#### 配置与密钥

- `src-tauri/src/config/app_config.rs`
  - 管理 `config.json`
  - 持久化应用设置、供应商启用状态、`provider_order`
- `src-tauri/src/config/encryption.rs`
  - 管理 key/token 存取
- `src-tauri/src/config/system_env.rs`
  - 同步当前激活的 API Key 到系统环境变量

#### 托盘

- `src-tauri/src/tray/mod.rs`
  - 创建单一托盘
  - 处理左键显示/隐藏
  - 处理菜单刷新、打开设置、退出

### Vue 前端

#### 状态

- `src/stores/providerStore.ts` 管理主界面数据
- `src/stores/settingsStore.ts` 管理设置页数据
- `src/i18n/index.ts` 和 `src/i18n/messages.ts` 管理语言包与运行时语言切换

#### 组合式逻辑

- `src/composables/useProviders.ts`
  - 初始化主数据
  - 手动刷新
  - 单供应商刷新
  - 与轮询衔接
- `src/composables/usePolling.ts`
  - 按供应商独立调度定时轮询
  - 按秒 / 分钟启动轮询
  - 在“仅手动”模式下停止对应供应商的定时器
- `src/composables/useWindowControls.ts`
  - 窗口显示控制
  - 透明度即时预览
  - 透明度持久化同步

#### 主要组件

- `src/components/common/ProviderIcon.tsx`
  - 统一渲染供应商图标
- `src/components/common/AppSelect.tsx`
  - 跨平台自定义下拉
- `src/components/common/ConfirmDialog.tsx`
  - 应用内确认弹层
- `src/components/widget/WidgetContainer.tsx`
  - 渲染主界面卡片列表
  - 拖拽排序
  - 底部状态区
  - 显示模式切换入口
- `src/components/widget/ProviderCard.tsx`
  - 单个供应商卡片
  - 右上角单卡片刷新按钮
  - 精简 / 详细两套展示
- `src/components/widget/OpacityHandle.tsx`
  - 主界面侧边透明度拖拽把手
- `src/components/settings/ProviderConfig.tsx`
  - 单个供应商配置卡片
  - 删除确认弹层入口
- `src/components/settings/SettingsPanel.tsx`
  - 设置页容器
  - 全局刷新设置
  - 返回时刷新主界面开关
  - 高级分供应商刷新设置
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
  -> Zustand providerStore
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
  -> App.tsx 启动时恢复并监听变化
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

刷新相关设置当前至少包含：

- `pollingMode`
- `pollingInterval`
- `pollingUnit`
- `providerPollingOverridesEnabled`
- `providerPollingOverrides`
- `refreshOnSettingsClose`
- `language`
- `widgetDisplayMode`

### OAuth 凭据位置

| 来源 | 路径 | 字段 |
|------|------|------|
| Claude Code | Windows / Linux 默认在 `~/.claude/.credentials.json`；macOS 默认在 Keychain | `claudeAiOauth.accessToken` |
| Codex CLI | 可能在 `~/.codex/auth.json`，也可能在系统凭据库，取决于 `cli_auth_credentials_store` | `tokens.access_token` |

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
- 不要在多个组件里各自写图标路径，统一使用 `ProviderIcon.tsx`
- 不要为设置页核心交互继续使用原生 `<select>`
- 不要让应用内弹层和浮层被父容器裁切，优先用 `React portal`
- 不要再把 `pollingInterval` 固定理解成“分钟”，现在必须结合 `pollingMode` / `pollingUnit`
- 不要再假设轮询只有一个全局定时器；分供应商策略开启后必须按供应商独立调度
- 不要假设从设置返回一定刷新；是否刷新取决于 `refreshOnSettingsClose`
- 不要把精简 / 详细模式的渲染逻辑散落到多个组件里，优先收敛到 `ProviderCard.tsx`
- 不要让精简模式继续显示逐 Key 的金额/余额明细块或 rate limit badge
- 不要把新文案继续直接写死在组件里，优先统一到 `src/i18n/messages.ts`
- 不要改动设置页语言选项的顺序；当前固定为“简体中文”“繁體中文”“English”
- 透明度现在由前端视觉层控制并通过 IPC 同步，Tauri v2 本身没有直接可用的 `WebviewWindow.set_opacity()`
- 后续交互实现优先保证 Windows、Linux、macOS 的一致性，其次再考虑单平台捷径
- `identifier` 会影响应用数据目录，品牌改名时不能只改显示名，必须处理旧数据迁移
- 不要只改一个版本号文件就直接发版，`package.json`、`tauri.conf.json`、`Cargo.toml` 必须同步
- 不要推送和版本号不一致的标签，Release 流水线会直接失败
- 不要把 Linux 的 `deb` / `appimage` 目标直接塞回主 `tauri.conf.json`，统一放在 `src-tauri/tauri.linux.conf.json`
- 不要把 macOS 的 `app` / `dmg` 目标直接塞回主 `tauri.conf.json`，统一放在 `src-tauri/tauri.macos.conf.json`

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

- `src/components/settings/ProviderConfig.tsx`
- `src/components/settings/SettingsPanel.tsx`
- `src-tauri/src/commands/provider_commands.rs`

重点查：

- 保存后是否刷新 provider store
- 空值是否真的清掉密钥
- disabled provider 是否仍被主界面保留

### 改名后数据丢失

先看：

- `src-tauri/tauri.conf.json`
- `src-tauri/src/config/migration.rs`
- `src-tauri/src/lib.rs`

重点查：

- `identifier` 是否已经改成 `com.peekausage.desktop`
- 迁移逻辑里的旧标识是否仍是 `com.ai-usage-peek.desktop`
- 新目录已存在文件时是否被错误覆盖

### 自定义下拉异常

先看：

- `src/components/common/AppSelect.tsx`
- `src/components/settings/ProviderConfig.tsx`
- `src/components/settings/SettingsPanel.tsx`

重点查：

- 浮层是否通过 `React portal` 挂到 `body`
- 小窗口下是否仍会被裁切
- 供应商图标是否继续走 `ProviderIcon.tsx`
- 暗黑模式是否仍在用应用主题变量

### 刷新异常

先看：

- `src/components/settings/SettingsPanel.tsx`
- `src/components/widget/ProviderCard.tsx`
- `src/composables/usePolling.ts`
- `src/types/settings.ts`
- `src-tauri/src/config/app_config.rs`

重点查：

- 当前是否误处于 `pollingMode = manual`
- `pollingUnit` 是否按 `seconds` / `minutes` 正确换算
- `providerPollingOverridesEnabled` 是否开启且覆盖项是否写到了对应供应商
- `refreshOnSettingsClose` 是否正确保存，且返回设置时是否只在勾选后触发 `refreshAll()`
- 设置切换后 `usePolling.ts` 是否按供应商重建或停止了定时器
- 单卡片刷新按钮是否只调用了当前供应商的 `refreshProvider`
- 旧配置缺少新字段时是否仍按“5 分钟自动刷新”兼容

### 环境变量切换异常

先看：

- `src/components/settings/ProviderConfig.tsx`
- `src-tauri/src/commands/provider_commands.rs`
- `src-tauri/src/config/system_env.rs`

重点查：

- 切换按钮是否在未保存改动时被禁用
- `active_api_key_id` / `manage_api_key_environment` 是否被正确写回配置
- Windows 是否成功写入用户级环境变量
- Linux / macOS 的 `~/.peekausage/env.sh` 和 Shell 启动文件 source 块是否已写入
- macOS 的 `launchctl setenv` / `unsetenv` 是否执行成功

### 透明度异常

先看：

- `src/components/settings/SettingsPanel.tsx`
- `src/components/widget/OpacityHandle.tsx`
- `src/composables/useWindowControls.ts`
- `src/App.tsx`

重点查：

- 滑杆拖动时是否即时预览
- 松手后是否写回 `windowOpacity`
- 启动后是否恢复保存值
- 主界面把手与设置页滑杆是否同步

## 建议验证

涉及逻辑改动时至少执行：

```bash
npx tsc --noEmit
cargo check
```

涉及发版链路改动时，额外确认：

- `.github/workflows/release.yml` 仍然只在 `v*` 标签触发
- Windows runner 能成功构建 `nsis`
- Linux `x86_64` runner 能成功构建 `deb` 和 `AppImage`
- Linux `arm64` runner 能成功构建 `deb` 和 `AppImage`
- macOS runner 能成功构建 `x86_64` / `arm64` 的 `app` 和 `dmg`

涉及交互改动时建议再手动验证：

- 托盘左键、右键菜单、最小化后恢复
- 设置页保存反馈和启停同步
- OAuth 自动检测
- 主界面拖拽推挤、松手保存、重启后顺序保持
- 设置页全局刷新、分供应商刷新、秒/分钟切换和“仅手动”是否按预期生效
- 设置页“返回时刷新主界面”开关在默认关闭和开启后两种情况下是否都符合预期
- 主界面卡片右上角单独刷新按钮是否只刷新当前供应商
- 主界面底部精简 / 详细切换后卡片内容和高度是否符合预期，刷新或重启后是否保持
- 自定义下拉在浅色/暗黑模式下的打开、关闭、键盘导航
- 设置页透明度滑杆与主界面透明度把手的同步
- 设置页切换简体中文、繁體中文、English 后，设置页与主界面文案是否即时同步
- 设置页 API Key “切换环境”后，对应环境变量是否更新，新开终端读取是否符合预期
## 补充说明

### 主界面主题入口

文件：
- `src/components/widget/WidgetContainer.tsx`

当前行为：
- 主界面底部主题按钮固定显示半袖上衣图标，不再根据当前主题切换按钮图标
- 主题菜单仅显示太阳、月亮、系统三个图标，不显示文字
- 三个主题图标横向排列，减少在小浮窗中的遮挡和空间占用
- 主题菜单的水平位置以主题按钮图标为中心，垂直偏移保持不变
- 菜单仍保留 `light`、`dark`、`system` 三个主题选项

### 主界面显示模式入口

文件：
- `src/components/widget/WidgetContainer.tsx`
- `src/components/widget/ProviderCard.tsx`

当前行为：
- 主界面底部显示模式切换使用单个图标按钮，点亮表示精简模式开启
- 详细模式保留完整卡片内容
- 精简模式使用“标签 + 进度条 + 百分比”的横向行布局
- 精简模式下订阅不显示订阅名和重置时间
- 精简模式下要保留所有订阅窗口进度条，OpenAI 的 `5小时` / `7天` 等窗口分别显示
- 精简模式下多个 API Key 按一行一个显示
- 精简模式下 API 行标签优先显示用户自定义的 Key 名称
- 精简模式不显示逐 Key 的金额/余额明细块和 rate limit badge
- 选择结果通过 `widgetDisplayMode` 持久化，重启后恢复



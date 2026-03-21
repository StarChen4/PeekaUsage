# AGENTS.md

## 语言规范

以下内容必须使用中文：

- 所有对话回复
- 代码注释
- 错误提示
- 新增或更新的文档

## 项目定位

这是一个 Tauri v2 桌面浮窗，用来监控 OpenAI、Anthropic、OpenRouter 的 API 用量和订阅计划消耗。

- Rust 后端负责 provider、配置、托盘、窗口命令、密钥存储
- Vue 3 前端负责主界面、设置页、轮询、拖拽排序和交互反馈

## 你接手前先知道的当前状态

最近几次改动已经落地，不要按旧逻辑继续开发。

### 1. OpenAI OAuth 检测已修复

文件：`src-tauri/src/commands/window_commands.rs`

`~/.codex/auth.json` 的 `tokens.access_token` 现在可能是：

- 直接字符串
- 索引对象

必须同时兼容，不能再只按对象格式解析。

### 2. 设置页保存链路已修复

文件：

- `src/components/settings/ProviderConfig.vue`
- `src/components/settings/SettingsPanel.vue`
- `src-tauri/src/commands/provider_commands.rs`

当前要求：

- 禁用供应商并保存后，主界面卡片必须同步消失
- 清空 key/token 保存后，旧凭据必须被真正清除
- 保存必须有明确反馈

### 3. 托盘逻辑已修复

文件：

- `src-tauri/src/tray/mod.rs`
- `src-tauri/tauri.conf.json`

当前要求：

- 只能有一个托盘图标
- 托盘由 Rust 手动创建
- 左键单击只处理一次
- 显示窗口前先 `unminimize()`
- 不要把自动托盘配置重新加回 `tauri.conf.json`

### 4. 主界面支持拖拽排序

文件：

- `src/components/widget/WidgetContainer.vue`
- `src-tauri/src/config/app_config.rs`
- `src-tauri/src/commands/provider_commands.rs`
- `src/utils/ipc.ts`

当前要求：

- 卡片拖动时要有实时碰撞推挤效果
- 松手后保存布局
- 排序写入 `provider_order`
- 刷新和重启后顺序保持一致

### 5. 供应商官方图标已接入

文件：

- `src/components/common/ProviderIcon.vue`
- `src/components/widget/ProviderCard.vue`
- `src/components/settings/ProviderConfig.vue`
- `src/assets/provider-icons/`

当前要求：

- 主界面和设置界面的供应商名字前都显示图标
- 图标路径统一走 `ProviderIcon.vue`
- 图标文件命名统一为 `openai.*`、`anthropic.*`、`openrouter.*`
- 后续替换图标优先只替换 `src/assets/provider-icons/` 中的资源文件

### 6. 设置页移除供应商已改为应用内确认弹层

文件：

- `src/components/common/ConfirmDialog.vue`
- `src/components/settings/ProviderConfig.vue`

当前要求：

- 不再使用 `window.confirm()` 原生确认框
- 弹层必须走应用内样式
- 弹层不显示标题，只显示说明和操作按钮
- 弹层要能在小窗口中自适应，不能被设置卡片裁切
- 弹层通过 `Teleport` 挂到 `body`

### 7. 设置页下拉框已改为跨平台自定义组件

文件：

- `src/components/common/AppSelect.vue`
- `src/components/settings/ProviderConfig.vue`
- `src/components/settings/SettingsPanel.vue`

当前要求：

- 不要继续依赖原生 `<select>` 做核心设置交互
- 暗黑模式下背景、边框、浮层风格必须与应用统一
- “新增供应商”下拉项前必须显示供应商图标
- 图标仍然统一通过 `ProviderIcon.vue` 渲染
- 下拉浮层通过 `Teleport` 挂到 `body`
- 要考虑 Windows、Linux、macOS 的一致性

### 8. 刷新间隔已支持秒 / 分钟 / 仅手动

文件：

- `src/components/settings/SettingsPanel.vue`
- `src/components/widget/ProviderCard.vue`
- `src/composables/usePolling.ts`
- `src/composables/useProviders.ts`
- `src/types/settings.ts`
- `src-tauri/src/config/app_config.rs`

当前要求：

- 刷新设置由 `pollingMode`、`pollingInterval`、`pollingUnit` 共同决定
- 自动刷新时允许自定义数值，并可切换按秒或按分钟
- 选择“仅手动”后不能继续启动定时轮询
- 设置页里的刷新配置要保持紧凑，优先用小尺寸分段按钮和窄输入框，避免在小窗口中过度占位
- 设置页高级区域可开启“按供应商独立刷新”，开启后仅对已配置供应商显示单独策略
- 分供应商策略支持自动 / 手动、秒 / 分、自定义数值，并在未单独修改时沿用全局策略
- 每张供应商卡片右上角都有单独刷新按钮，只刷新当前供应商
- 主界面底部手动刷新按钮和托盘刷新仍然可用
- 旧配置缺少新字段时，要继续按“5 分钟自动刷新”兼容

### 9. 设置页已支持透明度调节条

文件：

- `src/components/settings/SettingsPanel.vue`
- `src/composables/useWindowControls.ts`
- `src/App.vue`

当前要求：

- 设置页提供透明度滑杆
- 拖动时即时预览，松手后持久化到 `windowOpacity`
- 主界面右侧透明度拖拽把手与设置页滑杆共用同一套状态
- 应用启动后要按保存的透明度恢复
- 当前数值语义是“不透明度/可见度”：`100%` 表示完全不透明

### 10. 设置页顶部返回入口已改为图标按钮

文件：

- `src/components/settings/SettingsPanel.vue`
- `src/App.vue`
- `src/types/settings.ts`

当前要求：

- 不再显示紫色“返回”文字按钮
- 返回入口使用左箭头图标按钮
- 按钮尺寸、hover 和 focus 态要与应用整体风格一致
- “从设置返回时刷新主界面” 现在是设置页“通用”里的可勾选项
- 持久化字段是 `refreshOnSettingsClose`
- 默认不勾选；只有勾选后，从设置返回主界面才会触发一次全部供应商刷新

### 11. GitHub 已接入 Windows Release 自动发布

文件：

- `.github/workflows/release.yml`
- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

当前要求：

- 推送 `v*` 标签后自动构建并发布 Windows NSIS 安装包到 GitHub Release
- 发布前必须校验 `package.json`、`tauri.conf.json`、`Cargo.toml` 三处版本号一致
- 标签名必须与应用版本匹配，例如 `v0.1.0`

### 12. Linux 已接入 x86_64 / arm64 构建与发布

文件：

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `src-tauri/tauri.linux.conf.json`
- `package.json`

当前要求：

- Linux 打包目标统一放在 `src-tauri/tauri.linux.conf.json`
- 本地 Linux 打包使用 `npm run tauri:build:linux`
- GitHub Release 会同时上传 Linux `x86_64` / `arm64` 的 `deb` 和 `AppImage`
- Linux `arm64` 发布当前依赖 GitHub Actions ARM Linux runner
- Linux CI / Release 的依赖安装要按 Tauri 官方 ARM 打包要求补齐，至少包含 `build-essential`、`curl`、`file`、`libfuse2`、`libgtk-3-dev`、`libssl-dev`、`libwebkit2gtk-4.1-dev`、`libayatana-appindicator3-dev`、`librsvg2-dev`、`patchelf`
- 不要把 Linux 的 `deb` / `appimage` 目标混回主 `tauri.conf.json`

### 13. macOS 已接入 x86_64 / arm64 构建与发布

文件：

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `src-tauri/tauri.macos.conf.json`
- `package.json`

当前要求：

- macOS 打包目标统一放在 `src-tauri/tauri.macos.conf.json`
- 本地 macOS 打包使用 `npm run tauri:build:macos`
- GitHub Release 会同时上传 macOS `x86_64` / `arm64` 的 `app` 和 `dmg`
- 当前 macOS 产物未签名、未 notarize
- 如果安装后被提示“文件已损坏，无法打开”，文档里要明确提供 `xattr -dr com.apple.quarantine /Applications/PeekaUsage.app` 作为手动放行方案
- 不要把 macOS 的 `app` / `dmg` 目标混回主 `tauri.conf.json`

### 14. 应用标识已改为 PeekaUsage 并保留旧数据迁移

文件：

- `src-tauri/tauri.conf.json`
- `src-tauri/src/config/migration.rs`
- `src-tauri/src/lib.rs`

当前要求：

- 当前 Tauri `identifier` 是 `com.peekausage.desktop`
- 启动时会从旧标识 `com.ai-usage-peek.desktop` 的应用数据目录迁移 `config.json` 和 `keys.dat`
- 迁移只在新目录缺少对应文件时执行，不能覆盖新标识下已经存在的数据
- 如果后续继续改 `identifier`，必须同步更新迁移逻辑，不能只改配置不处理老用户数据

### 15. 多语言支持已接入

文件：

- `src/i18n/index.ts`
- `src/i18n/messages.ts`
- `src/components/settings/SettingsPanel.vue`
- `src-tauri/src/config/app_config.rs`
- `src/types/settings.ts`

当前要求：

- 设置页“通用”里提供语言选择，顺序固定为“简体中文”“繁体中文”“English”
- 当前持久化字段是 `language`
- 当前仅支持 `zh-Hans`、`zh-Hant`、`en`
- 主界面、设置页和通用交互文案切换要即时生效
- 新增文案不要再直接散落在组件里，优先收敛到 `src/i18n/messages.ts`
- 旧配置缺少 `language` 时要继续兼容，默认按简体中文处理

## 先读哪些文件

如果你是新的 coding agent，按这个顺序进入代码：

1. `README.md`
2. `CLAUDE.md`
3. `src-tauri/src/lib.rs`
4. `src-tauri/src/config/app_config.rs`
5. `src-tauri/src/commands/provider_commands.rs`
6. `src-tauri/src/commands/window_commands.rs`
7. `src-tauri/src/tray/mod.rs`
8. `src/App.vue`
9. `src/i18n/index.ts`
10. `src/i18n/messages.ts`
11. `src/composables/useWindowControls.ts`
12. `src/components/common/AppSelect.vue`
13. `src/components/common/ConfirmDialog.vue`
14. `src/components/widget/WidgetContainer.vue`
15. `src/components/settings/ProviderConfig.vue`
16. `src/components/settings/SettingsPanel.vue`
17. `src-tauri/tauri.linux.conf.json`
18. `.github/workflows/ci.yml`
19. `.github/workflows/release.yml`
20. `src-tauri/tauri.macos.conf.json`

## 快速开发命令

```bash
npm install
npm run dev
npm run tauri dev
npx vue-tsc --noEmit
cargo check
npm run tauri:build:linux
npm run tauri:build:macos
```

发 Release 时使用：

```bash
git tag v0.1.0
git push origin v0.1.0
```

如果 `cargo` 不在 PATH 中：

```bash
export PATH="$PATH:$HOME/.cargo/bin"
```

## 架构速记

### Rust

- `providers/traits.rs`：`UsageProvider` trait
- `providers/mod.rs`：`ProviderManager`
- `providers/subscription.rs`：OAuth 订阅查询
- `commands/provider_commands.rs`：配置、用量、顺序保存
- `commands/window_commands.rs`：OAuth 自动检测、窗口透明度命令
- `config/app_config.rs`：设置、供应商启停、`provider_order`
- `tray/mod.rs`：托盘

### Vue

- `App.vue`：widget/settings 视图切换、启动时同步主题与透明度
- `useProviders.ts`：拉取和刷新编排
- `useWindowControls.ts`：窗口隐藏、最小化、透明度同步
- `providerStore`：主数据
- `settingsStore`：设置数据
- `i18n`：语言包和运行时语言切换
- `ProviderIcon.vue`：供应商图标共享组件
- `AppSelect.vue`：跨平台自定义下拉组件
- `ConfirmDialog.vue`：应用内确认弹层
- `WidgetContainer.vue`：主界面卡片和拖拽排序
- `ProviderCard.vue`：供应商卡片和单卡片刷新入口
- `ProviderConfig.vue`：供应商设置卡片
- `SettingsPanel.vue`：设置页容器、语言选择、全局刷新、高级分供应商刷新和透明度控件

## 核心约束

### 类型同步

以下两处必须同步修改：

- `src-tauri/src/providers/types.rs`
- `src/types/provider.ts`

Rust 使用 snake_case，TS 使用 camelCase，通过 serde 做映射。

### 托盘约束

- 不要创建第二个托盘
- 不要依赖 `tauri.conf.json` 自动托盘
- 处理左键点击时要注意 `MouseButtonState::Up`

### 图标约束

- 不要在多个页面分别写图标逻辑
- 统一通过 `ProviderIcon.vue` 渲染
- 图标资源统一放在 `src/assets/provider-icons/`

### 排序约束

- 排序不是纯前端状态
- 必须通过 IPC 存到后端 `provider_order`
- `fetch_all_usage` 的返回顺序必须受 `provider_order` 影响

### 设置保存约束

- 保存后前端状态要同步刷新
- 空字符串保存要真正清掉凭据
- 启用状态变化不能只停留在设置页

### 下拉组件约束

- 涉及核心交互的设置下拉，优先复用 `AppSelect.vue`
- 不要为供应商选择继续写原生 `<select>`
- 供应商选项中的图标必须继续走 `ProviderIcon.vue`
- 小窗口下浮层不能被父容器裁切

### 轮询约束

- 刷新相关持久化字段是 `pollingMode`、`pollingInterval`、`pollingUnit`、`providerPollingOverridesEnabled`、`providerPollingOverrides`、`refreshOnSettingsClose`
- `pollingMode = manual` 时不能继续启动自动轮询
- 秒和分钟都属于自动刷新模式，不要再把 `pollingInterval` 固定解释成“分钟”
- 分供应商定时器要按每个供应商的生效策略独立调度，不能继续假设全局只有一个定时器
- 要兼容旧配置缺少新字段的情况，默认按“5 分钟自动刷新”处理

### 多语言约束

- 语言持久化字段是 `language`
- 允许值当前只有 `zh-Hans`、`zh-Hant`、`en`
- 设置页语言选项顺序固定为“简体中文”“繁体中文”“English”，不要擅自改顺序
- 新增界面文案时，优先写进 `src/i18n/messages.ts`，不要继续把可见文案硬编码在组件里
- 通用组件的默认占位符、按钮文案和 `aria-label` 也要跟随语言切换
- 旧配置缺少 `language` 时要继续兼容，默认简体中文

### 透明度约束

- 透明度值持久化字段是 `windowOpacity`
- 设置页滑杆和主界面拖拽把手必须保持同步
- 拖动预览和最终保存要区分，避免每一帧都写配置
- 文案如果使用“透明度”，要注意当前实际语义更接近“不透明度”

### 跨平台约束

- 这个项目后续不只支持 Windows，还要兼容 Linux 和 macOS
- 新增交互组件时，优先选择前端可控、自绘、跨平台一致的实现
- 不要优先依赖 Windows 特有 API、系统控件外观或只在单平台稳定的行为
- 能复用现有共享组件时，优先复用 `AppSelect.vue`、`ConfirmDialog.vue`、`ProviderIcon.vue`
- 如果必须做平台差异处理，要先确认是否真的不可避免，并在文档中补充说明
- `identifier` 会影响应用数据目录，改名时必须考虑 Windows、Linux、macOS 的旧数据迁移

### 发版约束

- 改版本号时，必须同步修改 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`
- GitHub Release 的标签名必须使用 `v` 前缀并与应用版本完全一致
- Windows 产物是 `nsis`
- Linux 产物是 `x86_64` / `arm64` 的 `deb` 和 `appimage`
- macOS 产物是 `x86_64` / `arm64` 的 `app` 和 `dmg`
- Linux 打包目标统一维护在 `src-tauri/tauri.linux.conf.json`
- macOS 打包目标统一维护在 `src-tauri/tauri.macos.conf.json`
- 当前 macOS 产物未签名、未 notarize
- 如果后续要补自动更新或 Apple Developer 签名，先更新文档再改流水线

## 常见排查点

### 托盘异常

检查：

- 是否重复创建托盘
- 是否漏了 `unminimize()`
- 是否把左键按下和抬起都当成一次切换

### OpenAI 自动检测异常

检查：

- `tokens.access_token` 实际是字符串还是对象
- `parse_codex_access_token()` 是否被走到
- 本地文件路径是否正确

### 拖拽排序异常

检查：

- 拖拽结束后是否调用 `saveProviderOrder`
- `provider_order` 是否成功写入配置
- `get_enabled_providers()` 是否按保存顺序排序

### 设置保存后主界面不同步

检查：

- 保存后是否刷新 provider 列表
- disabled provider 是否还被主界面保留
- 被清空的 token/key 是否仍在 keystore 中残留

### 下拉框表现异常

检查：

- 是否误用了原生 `<select>`
- `AppSelect.vue` 的浮层是否通过 `Teleport` 挂到 `body`
- 暗黑模式样式是否仍在走应用 CSS 变量
- 供应商选项是否通过 `ProviderIcon.vue` 显示图标

### 刷新异常

检查：

- `pollingMode` 当前是不是 `manual`
- `pollingUnit` 是否被正确解释为 `seconds` 或 `minutes`
- `providerPollingOverridesEnabled` 是否已开启且 `providerPollingOverrides` 是否写入了预期供应商
- `refreshOnSettingsClose` 是否按预期保存；未勾选时，从设置返回不应额外触发刷新
- `usePolling.ts` 是否按供应商重建、停止了对应定时器
- 卡片右上角单独刷新按钮是否调用了 `refreshProvider`
- 应用启动时旧配置是否被兼容成“5 分钟自动刷新”

### 透明度异常

检查：

- `windowOpacity` 是否成功保存到设置
- `App.vue` 启动时是否调用了透明度同步
- 设置页滑杆和 `useWindowControls.ts` 是否使用同一套状态
- 主界面透明度把手调整后是否同步写回设置

### Release 发布异常

检查：

- `.github/workflows/release.yml` 是否仍然只在 `v*` 标签下触发
- `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 版本号是否一致
- 推送的标签是否与版本完全匹配，例如 `v0.1.0`
- GitHub Actions 是否具有 `contents: write` 权限
- `src-tauri/tauri.linux.conf.json` 是否仍然只负责 Linux `deb` / `appimage`
- Linux runner 是否安装了 `build-essential`、`curl`、`file`、`libfuse2`、`libgtk-3-dev`、`libssl-dev`、`libwebkit2gtk-4.1-dev`、`libayatana-appindicator3-dev`、`librsvg2-dev`、`patchelf`
- Linux `arm64` job 是否仍然使用 ARM Linux runner
- `src-tauri/tauri.macos.conf.json` 是否仍然只负责 macOS `app` / `dmg`
- macOS job 是否仍然分别产出 `x86_64` / `arm64` 包
- 如果启用了签名或 notarization，相关密钥和证书配置是否完整
- `src-tauri/tauri.conf.json` 的 `identifier` 是否和迁移逻辑中的新旧标识保持一致

## 修改流程

涉及功能改动时，默认按下面流程执行：

1. 先改代码，不要只停留在分析。
2. 如果改动影响已落地行为、交互、约束、组件入口或排查方式，必须同步更新 `AGENTS.md` 和 `CLAUDE.md`。
3. 至少执行：
   - `npx vue-tsc --noEmit`
   - `cargo check`
4. 如果改了交互，再补手动验证关键路径。
5. 确认无误后再提交。

额外要求：

- 不要把“代码改了但文档没更新”的状态提交出去。
- 不要把与本次任务无关的脏改动一并提交。
- 提交信息要能准确描述这次改动是修复、优化还是重构。
- 如果改动会影响 Windows、Linux、macOS 之一的表现，更新文档时要同步写明跨平台约束或取舍。

## 每次提交前至少做的验证

```bash
npx vue-tsc --noEmit
cargo check
```

如果改了交互，再手动验：

- 托盘左键、右键、最小化恢复
- 设置保存反馈
- 自动检测 OAuth
- 主界面拖拽推挤和顺序持久化
- 设置页全局刷新、分供应商刷新、秒/分钟切换和“仅手动”是否按预期生效
- 设置页“返回时刷新主界面”开关在勾选和未勾选两种情况下是否都符合预期
- 主界面卡片右上角单独刷新按钮是否只刷新当前供应商
- 设置页自定义下拉在浅色/暗黑模式下的展开和关闭
- 设置页透明度滑杆和主界面透明度把手是否同步
- 设置页切换简体中文、繁体中文、English 后，设置页和主界面文案是否即时同步

如果改了 Linux 构建或发布链路，再额外确认：

- `.github/workflows/ci.yml` 的 Linux `x86_64` 检查仍然可跑
- `.github/workflows/release.yml` 的 Linux `x86_64` / `arm64` 产物仍然是 `deb` 和 `appimage`

如果改了 macOS 构建或发布链路，再额外确认：

- `.github/workflows/ci.yml` 的 macOS 检查仍然可跑
- `.github/workflows/release.yml` 的 macOS `x86_64` / `arm64` 产物仍然是 `app` 和 `dmg`

## 补充约束

### 主界面主题切换入口

文件：

- `src/components/widget/WidgetContainer.vue`

当前要求：

- 主界面底部的主题切换按钮使用固定的半袖上衣图标，不随当前主题切换图标
- 点击后弹出的主题菜单保持紧凑，优先使用小尺寸列表项，不要再做大卡片式选项
- 主题菜单项只显示太阳、月亮、系统三个图标，不显示文字
- 三个主题选项横向排列，保持小浮窗下的紧凑占用
- 主题菜单的水平位置以主题按钮图标为中心，不再贴右对齐
- 主题菜单仍然只负责切换 `light`、`dark`、`system` 三种模式

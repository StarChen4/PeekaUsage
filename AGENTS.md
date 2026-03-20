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

## 先读哪些文件

如果你是新的 coding agent，按这个顺序进入代码：

1. `README.md`
2. `CLAUDE.md`
3. `src-tauri/src/lib.rs`
4. `src-tauri/src/config/app_config.rs`
5. `src-tauri/src/commands/provider_commands.rs`
6. `src-tauri/src/commands/window_commands.rs`
7. `src-tauri/src/tray/mod.rs`
8. `src/components/widget/WidgetContainer.vue`
9. `src/components/settings/ProviderConfig.vue`
10. `src/components/settings/SettingsPanel.vue`

## 快速开发命令

```bash
npm install
npm run dev
npm run tauri dev
npx vue-tsc --noEmit
cargo check
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
- `commands/window_commands.rs`：OAuth 自动检测
- `config/app_config.rs`：设置、供应商启停、`provider_order`
- `tray/mod.rs`：托盘

### Vue

- `App.vue`：widget/settings 视图切换
- `useProviders.ts`：拉取和刷新编排
- `providerStore`：主数据
- `settingsStore`：设置数据
- `ProviderIcon.vue`：供应商图标共享组件
- `WidgetContainer.vue`：主界面卡片和拖拽排序
- `ProviderConfig.vue`：供应商设置卡片

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

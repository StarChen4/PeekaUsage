# 应用内更新与版本说明方案

状态：待实施

最后更新：2026-03-24

## 1. 目标

为 PeekaUsage 增加一套完整、可维护、跨平台边界清晰的版本说明与应用更新能力，并与现有设置页、主界面提醒、GitHub Release 发布流程打通。

本方案覆盖：

- 设置页新增“更新”子选项
- 当前版本展示与对应版本更新日志入口
- 手动检查更新
- 自动检查更新
- 可配置启动时检查与检查间隔
- 有新版本时的主界面与设置页红点提醒
- 应用内下载安装更新
- Tauri updater 接入
- GitHub Release 自动发布与 updater 产物生成

## 2. 设计结论

### 2.1 设置页结构

设置页固定子导航从当前的：

- 通用
- 供应商
- 高级

扩展为：

- 通用
- 供应商
- 高级
- 更新

说明：

- 子导航标签使用“更新”，保持短文本，避免小窗口内过度拥挤
- 子页标题使用“版本说明与更新”，保留完整语义

### 2.2 更新日志入口

当前版本号后提供“查看更新日志”按钮，默认跳转到 GitHub Release 中该版本的页面：

- 格式：`https://github.com/StarChen4/PeekaUsage/releases/tag/v{version}`
- 例如当前 `0.1.4` 跳转到 `v0.1.4`

原因：

- 现有项目已经使用 GitHub Release 发布
- 不需要额外维护独立 changelog 页面
- 与版本标签一一对应，文档来源稳定

### 2.3 自动更新相关命名

界面文案不直接使用“自动更新”，改为更准确的“自动检查更新”。

原因：

- “自动更新”容易被理解为自动下载并安装
- 实际能力应该拆分为“自动检查”和“用户确认安装”

建议文案：

- 自动检查更新
- 启动时检查
- 检查间隔

### 2.4 红点提示语义

红点语义定义为“有可用更新”，不是“有未读更新”。

原因：

- 如果用户只是进入过更新页，红点就消失，提醒价值会明显下降
- 红点应该持续存在，直到用户升级到最新版本，或再次检测确认当前已是最新版本

## 3. 用户体验方案

## 3.1 设置页“更新”子页

新增“更新”子页，展示以下内容：

### 版本信息区

- 当前版本：`0.1.4`
- 紧跟“查看更新日志”按钮
- 按钮点击后打开对应版本的 GitHub Release 页面

### 更新检查区

- “检查更新”按钮
- 最近一次检查状态摘要
- 最近一次检查时间
- 最近一次检查失败原因

状态文案示例：

- 当前已是最新版本
- 发现新版本 `v0.1.5`
- 检查更新失败：网络异常 / 更新源不可用 / 签名校验失败

### 自动检查区

- 自动检查更新：开关，默认开启
- 启动时检查：开关，默认开启
- 检查间隔：数值输入框，默认 `2`
- 单位固定为 `小时`

交互规则：

- 只有开启“自动检查更新”后，才显示或启用“启动时检查”和“检查间隔”
- 检查间隔限制为正整数，建议范围 `1 - 168`
- 如果距离上次成功检查不足 10 分钟，启动时自动检查跳过，避免高频重启导致重复联网请求

### 安装更新区

主按钮根据状态切换：

- 无可用更新时：禁用，显示“当前已是最新版本”
- 有可用更新时：高亮，显示“更新到 vX.Y.Z”
- 下载中：显示下载进度
- 安装中：显示“安装中...”

如果更新元数据包含说明，在该区域下方展示：

- 版本号
- 发布时间
- 更新说明摘要

## 3.2 主界面提醒

主界面底部设置按钮右上角增加小红点。

触发条件：

- 当前存在可用更新

行为：

- 用户未更新前红点持续存在
- 用户点击设置进入设置页后，红点不自动清除

## 3.3 设置子导航提醒

“更新”子导航项右上角增加小红点。

触发条件：

- 当前存在可用更新

用户进入“更新”子页后：

- 红点仍可保留
- “更新到 vX.Y.Z”主按钮高亮显示
- 页面直接展示可用版本与说明

## 4. 推荐产品边界

## 4.1 第一阶段支持范围

推荐第一阶段承诺：

- Windows：支持应用内检查、下载、安装、重启
- macOS：支持应用内检查、下载、安装、重启
- Linux：优先支持检查更新；应用内安装能力按 Tauri updater 实际产物验证结果决定

### 对 Linux 的保守策略

本项目当前 Linux 发布物同时包含：

- DEB
- AppImage

其中 AppImage 更适合 updater 模式；DEB 则与包管理器安装路径存在天然冲突。

因此第一阶段更稳妥的做法是：

- 若确认 updater 产物与当前 Linux 发布方式完全匹配，则启用应用内安装
- 若无法稳定覆盖 DEB 安装场景，则 Linux 先实现“检查更新 + 打开发布页”或仅对 AppImage 启用内建更新

这部分在正式实施前需要单独验证，不建议在未验证前向用户承诺“Linux 全量应用内自动升级”。

## 4.2 明确不做

第一阶段不建议做：

- 静默自动下载并安装
- 后台无提示自动重启
- 多更新通道切换（stable / beta）
- 回滚到旧版本
- 在设置页外弹出侵入式更新弹窗

原因：

- 这些能力会显著抬高状态管理、平台差异处理和失败恢复复杂度
- 当前项目尚未建立 updater 基础设施，应先把主链路做稳

## 5. 技术方案

## 5.1 总体架构

推荐采用“Rust 负责更新能力，前端负责展示和触发”的分层。

原因：

- 平台差异、安装行为、重启行为更适合放在 Rust 侧
- 未来如果要做私有更新源、请求头、渠道控制，也更容易扩展
- 与现有项目中托盘、环境变量、窗口行为等系统能力的分层方式一致

职责划分：

- Rust：
  - 检查更新
  - 获取可用更新元数据
  - 下载与安装更新
  - 维护最近一次更新状态
- React：
  - 展示更新状态
  - 触发手动检查
  - 触发安装更新
  - 控制红点与按钮高亮

## 5.2 Tauri updater 接入

基于 Tauri v2 官方 updater 方案。

需要新增：

- Rust 依赖：`tauri-plugin-updater`
- 前端依赖：`@tauri-apps/plugin-updater`
- 如需前端重启：`@tauri-apps/plugin-process`

Rust 侧：

- 在 `src-tauri/src/lib.rs` 中注册 updater plugin

Capability：

- 在 `src-tauri/capabilities/default.json` 中增加 updater 相关权限

配置：

- 在 `src-tauri/tauri.conf.json` 中增加 updater 配置
- 配置 `bundle.createUpdaterArtifacts = true`
- 配置 updater 公钥与 endpoint

## 5.3 更新源方案

推荐先使用 GitHub Release 生成的静态 `latest.json`，不额外搭建动态更新服务器。

原因：

- 当前项目已经具备 GitHub Release 自动发布能力
- 静态 JSON 模式足以覆盖现阶段需求
- 维护成本低，发布链路更直接

更新源配置建议：

- endpoint 指向 GitHub Release 附件中的 `latest.json`

说明：

- 更新包必须签名
- updater 会校验签名，签名能力不能关闭

## 5.4 更新状态模型

更新相关数据建议分成两类：

### 用户可配置设置

放入现有 `AppSettings`，持久化到配置文件。

新增字段建议：

- `updateAutoCheckEnabled: boolean`
- `updateCheckOnLaunch: boolean`
- `updateCheckIntervalHours: number`

默认值建议：

- `updateAutoCheckEnabled = true`
- `updateCheckOnLaunch = true`
- `updateCheckIntervalHours = 2`

### 运行时更新状态

不建议全部塞进 `AppSettings`。

原因：

- 这些字段不属于用户偏好，而是运行期状态
- 与设置项混在一起，会让设置模型越来越难维护

建议新增独立的更新状态存储结构，例如：

- `lastUpdateCheckAt: string | null`
- `lastUpdateStatus: "idle" | "checking" | "up-to-date" | "available" | "downloading" | "installing" | "error"`
- `lastAvailableVersion: string | null`
- `lastAvailableReleaseUrl: string | null`
- `lastAvailableNotes: string | null`
- `lastAvailablePubDate: string | null`
- `lastUpdateError: string | null`

持久化建议：

- 可以作为配置文件中的单独块保存
- 也可以单独保存在 store 文件
- 目标是保证应用重启后，红点与最近一次可用更新状态不会丢失

## 5.5 IPC / 命令设计

建议新增 Rust 命令：

- `get_update_status`
- `check_app_update`
- `install_app_update`

建议返回模型：

```ts
type UpdateStatus = {
  currentVersion: string;
  lastCheckAt: string | null;
  state: "idle" | "checking" | "up-to-date" | "available" | "downloading" | "installing" | "error";
  availableVersion: string | null;
  releaseUrl: string | null;
  notes: string | null;
  pubDate: string | null;
  errorMessage: string | null;
  downloadProgress: number | null;
};
```

前端通过独立的 `updateStore` 管理界面展示状态，不与 `settingsStore` 混用。

## 5.6 自动检查触发策略

建议独立于现有 provider 轮询，不要复用 `usePolling.ts`。

原因：

- provider 刷新是业务数据轮询
- 更新检查是应用生命周期级别行为
- 二者触发频率、错误处理、状态展示完全不同

推荐新增专用机制，例如：

- `useAppUpdate.ts`
- 或在 `App.tsx` 中统一接入并由 `updateStore` 托管

触发规则：

- 应用启动后，如果开启“自动检查更新”且开启“启动时检查”，执行一次检查
- 若距离最近一次成功检查不足 10 分钟，则跳过本次启动检查
- 应用运行过程中按“检查间隔”定时触发
- 设置项变更后，重建更新检查定时器

## 5.7 安装与重启策略

### Windows

建议行为：

- 下载并安装更新
- 安装阶段允许应用退出
- 安装完成后自动重启或由安装器接管

说明：

- Windows 下 updater 在安装时退出应用是正常行为
- 不要为了统一体验去强行规避平台默认限制

### macOS / Linux

建议行为：

- 下载并安装更新
- 安装完成后提示“立即重启”或“稍后重启”

原因：

- 让用户明确知道应用将要退出并重启
- 可减少用户对“应用突然关闭”的误解

## 6. 前端改动建议

## 6.1 新增状态仓库

建议新增：

- `src/stores/updateStore.ts`

职责：

- 拉取当前更新状态
- 发起手动检查
- 发起安装更新
- 提供红点布尔值
- 提供下载进度

## 6.2 设置页改动

文件：

- `src/components/settings/SettingsPanel.tsx`
- `src/assets/styles/settings.css`
- `src/i18n/messages.ts`

改动点：

- `SettingsSectionId` 新增 `updates`
- 子导航增加“更新”
- 设置页内容映射增加更新子页
- 子导航项支持红点显示
- “更新”子页右上角可显示提醒态

## 6.3 主界面改动

文件：

- `src/components/widget/WidgetContainer.tsx`
- `src/assets/styles/widget.css`
- `src/i18n/messages.ts`

改动点：

- 设置按钮增加小红点角标
- 红点样式与现有紧凑底部按钮体系一致
- 有可用更新时不改变按钮主结构，只增加提醒信息，避免破坏当前底部按钮密度

## 6.4 文案国际化

文件：

- `src/i18n/messages.ts`

新增文案应覆盖：

- 中文简体
- 中文繁体
- English

建议新增分组：

- `settings.sections.updates`
- `settings.updates.*`
- `widget.actions.settingsUpdateAvailable`

## 7. Rust 改动建议

## 7.1 新增命令模块

建议新增：

- `src-tauri/src/commands/update_commands.rs`

职责：

- 获取当前版本
- 调用 updater 检查更新
- 下载与安装更新
- 返回结构化状态

## 7.2 lib.rs 注册

文件：

- `src-tauri/src/lib.rs`

改动点：

- 注册 `tauri-plugin-updater`
- 注册 `update_commands.rs` 提供的 invoke handler

## 7.3 配置持久化

文件：

- `src-tauri/src/config/app_config.rs`

改动点：

- 在 `AppSettings` 中加入更新检查相关设置字段
- 为旧配置缺失字段提供默认兼容
- 如决定持久化更新运行时状态，可新增独立结构并挂入 `ConfigFile`

## 8. 发布链路方案

## 8.1 为什么必须改 release workflow

当前仓库的发布流程只解决“打包并上传安装包”，还不满足应用内 updater 的要求。

应用内更新额外需要：

- updater 产物
- 产物签名
- `latest.json`
- updater 公钥 / 私钥配置

因此该功能是完整的发布体系改造，不是单纯的前端按钮开发。

## 8.2 需要新增的能力

### 签名密钥

使用 Tauri signer 生成 updater 密钥对。

需要保管：

- 公钥：放入 `tauri.conf.json`
- 私钥：放入 GitHub Secrets

建议新增 Secrets：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

## 8.3 tauri.conf 变更

建议增加：

- `bundle.createUpdaterArtifacts = true`
- `plugins.updater.pubkey`
- `plugins.updater.endpoints`

Windows installMode 建议：

- 先保持默认或使用 `passive`

原因：

- 比 `quiet` 更容易给用户可感知的安装反馈
- 比 `basicUi` 更少交互阻塞

## 8.4 GitHub Actions 变更

文件：

- `.github/workflows/release.yml`

建议改动：

- 在构建环境中注入 updater 私钥环境变量
- 构建时生成 updater 产物与签名
- 上传 `latest.json`
- 确保 GitHub Release 中包含 updater 依赖的静态 JSON 和对应平台产物

如果 `tauri-action` 已支持自动生成对应 updater JSON，则优先使用官方能力；
如果现有 action 配置不足，则增加生成与上传 `latest.json` 的显式步骤。

## 9. 风险与注意事项

## 9.1 Linux 发行物差异

这是整套方案中最大的实际风险点。

原因：

- DEB 安装与 AppImage 更新机制不同
- 并不是所有 Linux 安装方式都适合统一的应用内升级体验

处理建议：

- 把 Linux updater 能力作为单独验证项
- 在验证完成前，不承诺 Linux 上与 Windows / macOS 完全一致的应用内安装体验

## 9.2 红点状态丢失

如果“有可用更新”只存在前端内存中，应用重启后红点会消失。

处理建议：

- 最近一次检测到的更新版本与说明应持久化

## 9.3 检查频率过高

如果同时启用“启动时检查”和“固定间隔检查”，且没有去重，会造成重复请求。

处理建议：

- 启动检查增加最小时间窗口去重，建议 10 分钟

## 9.4 文案歧义

如果使用“自动更新”而不是“自动检查更新”，用户会期待自动下载安装。

处理建议：

- 全部使用“检查更新”语义

## 9.5 发布链路先于界面

如果只先做界面而没有打通 updater 产物与签名，功能会停留在假按钮状态。

处理建议：

- 实施顺序必须从基础设施开始

## 10. 推荐实施顺序

### 阶段 1：基础设施

- 接入 `tauri-plugin-updater`
- 配置 capability
- 配置 `tauri.conf.json`
- 配置签名密钥
- 改造 GitHub Release 流程

### 阶段 2：Rust 能力

- 新增更新命令模块
- 定义更新状态模型
- 实现检查、安装、状态持久化

### 阶段 3：前端接入

- 新增 `updateStore`
- 主界面设置按钮红点
- 设置页“更新”子页
- 状态展示与交互

### 阶段 4：打磨与验证

- 下载进度表现
- 失败提示
- 平台差异提示
- Linux 场景收敛

## 11. 推荐验证项

### 基础验证

- 启动应用后在默认设置下会自动检查更新
- 关闭“自动检查更新”后不再执行启动检查和间隔检查
- 调整检查间隔后定时器按新值重建
- 点击“检查更新”可立即触发手动检查

### UI 验证

- 无更新时，“更新软件”按钮禁用并显示“当前已是最新版本”
- 有更新时，主界面设置按钮右上角显示红点
- 有更新时，设置页“更新”子导航显示红点
- 进入“更新”子页后，“更新到 vX.Y.Z”按钮高亮
- “查看更新日志”能打开当前版本对应 Release 页面

### 安装验证

- Windows 能正常下载安装并完成退出安装流程
- macOS 能正常下载安装并提示重启
- Linux 至少能正确检查更新；若启用安装，则需分别验证 AppImage / DEB 实际行为

### 持久化验证

- 自动检查设置重启后保持
- 最近一次有可用更新的状态重启后保持
- 红点在重启后仍与最近一次检测结果一致

## 12. 涉及文件建议清单

前端：

- `src/components/settings/SettingsPanel.tsx`
- `src/components/widget/WidgetContainer.tsx`
- `src/stores/updateStore.ts`
- `src/utils/ipc.ts`
- `src/i18n/messages.ts`
- `src/assets/styles/settings.css`
- `src/assets/styles/widget.css`
- `src/types/settings.ts`

Rust：

- `src-tauri/src/lib.rs`
- `src-tauri/src/commands/update_commands.rs`
- `src-tauri/src/config/app_config.rs`
- `src-tauri/capabilities/default.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

发布：

- `.github/workflows/release.yml`
- 如有需要，补充 `.github/workflows/ci.yml`

## 13. 方案摘要

这是一个“产品交互 + 客户端状态 + 系统更新能力 + 发布基础设施”四段联动的功能，不适合只做前端页面层的表面改造。

推荐路线是：

- 用“更新”作为设置页第四个子选项
- 用 GitHub Release 作为更新日志来源
- 用 Tauri 官方 updater 作为更新能力底座
- 用 GitHub Release 静态 `latest.json` 作为第一阶段更新源
- 先打通签名与 updater 产物，再接设置页和红点提醒
- 对 Linux 保持保守承诺，先验证再决定是否启用应用内安装

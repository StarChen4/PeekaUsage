# 发版说明约定

每次发布 `v*` 标签前，必须新增对应的发版说明文件：

- 路径：`.github/release-notes/vX.Y.Z.md`
- 例如：`.github/release-notes/v0.1.6.md`

要求：

- 必须写明本次新增功能
- 必须写明本次修复内容
- 如有工程、构建、文档或兼容性变更，也应一并写明

`release.yml` 会在发版时强制检查这个文件是否存在且非空，并将其内容同步写入 GitHub Release。

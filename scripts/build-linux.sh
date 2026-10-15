#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

build_started="$(mktemp -t peekausage-build.XXXXXXXX)"
trap 'rm -f -- "$build_started"' EXIT

npm run tauri -- "$@"

if [[ "${1:-}" == "build" ]]; then
  target_dir="$(cargo metadata --manifest-path src-tauri/Cargo.toml --no-deps --format-version 1 |
    node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).target_directory')"
  # 只检查本次构建产生的安装包；检查失败时不能继续进入 Release 上传阶段。
  mapfile -d '' appimages < <(find "$target_dir" -type f -path '*/bundle/appimage/*.AppImage' -newer "$build_started" -print0)
  bash scripts/check-appimage.sh "${appimages[@]}"
fi

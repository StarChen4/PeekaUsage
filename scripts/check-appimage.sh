#!/usr/bin/env bash
set -euo pipefail

check_appimage() (
  local appimage appdir icon_path temp_dir
  appimage="$(realpath -- "$1")"
  temp_dir="$(mktemp -d -t peekausage-appimage.XXXXXXXX)"
  trap 'rm -rf -- "$temp_dir"' EXIT

  # 解包检查最终产物，避免构建目录里的绝对链接掩盖分发后的图标失效。
  cd "$temp_dir"
  "$appimage" --appimage-extract >/dev/null
  appdir="$temp_dir/squashfs-root"

  if [[ ! -s "$appdir/.DirIcon" ]]; then
    echo "错误：AppImage 的 .DirIcon 缺失、为空或链接已失效：$appimage" >&2
    exit 1
  fi

  if [[ -L "$appdir/.DirIcon" && "$(readlink -- "$appdir/.DirIcon")" == /* ]]; then
    echo "错误：AppImage 的 .DirIcon 使用了绝对链接：$appimage" >&2
    exit 1
  fi

  icon_path="$(realpath -- "$appdir/.DirIcon")"
  case "$icon_path" in
    "$appdir"/*) ;;
    *)
      echo "错误：AppImage 的 .DirIcon 指向包外文件：$appimage" >&2
      exit 1
      ;;
  esac

  if [[ "$(od -An -tx1 -N8 -- "$icon_path" | tr -d ' \n')" != "89504e470d0a1a0a" ]]; then
    echo "错误：AppImage 的 .DirIcon 不是有效的 PNG 图标：$appimage" >&2
    exit 1
  fi

  echo "AppImage 图标检查通过：$appimage"
)

if [[ $# -eq 0 ]]; then
  echo "错误：请指定至少一个待检查的 AppImage 文件。" >&2
  exit 1
fi

for appimage in "$@"; do
  check_appimage "$appimage"
done

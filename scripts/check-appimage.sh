#!/usr/bin/env bash
set -euo pipefail

check_appimage() (
  local appimage appdir icon_path temp_dir invalid_path launcher offset
  appimage="$(realpath -- "$1")"
  temp_dir="$(mktemp -d -t peekausage-appimage.XXXXXXXX)"
  trap 'rm -rf -- "$temp_dir"' EXIT

  # 运行时解包会把目录改为 0700，改用 SquashFS 工具保留实际打包权限。
  offset="$("$appimage" --appimage-offset)"
  if [[ ! "$offset" =~ ^[0-9]+$ ]]; then
    echo "错误：无法读取 AppImage 的 SquashFS 偏移量：$appimage" >&2
    exit 1
  fi
  appdir="$temp_dir/squashfs-root"
  umask 000
  unsquashfs -no-progress -o "$offset" -d "$appdir" "$appimage" >/dev/null

  for launcher in AppRun AppRun.wrapped usr/bin/peeka-usage; do
    if [[ ! -f "$appdir/$launcher" || ! -x "$appdir/$launcher" ]]; then
      echo "错误：AppImage 启动文件缺失或不可执行：$launcher" >&2
      exit 1
    fi
  done

  # 解包后文件归当前用户所有，单纯 test -x 会漏掉挂载后归 root 的 0770 启动器。
  invalid_path="$(find "$appdir" \( \( -type d ! -perm -0555 \) -o \
    \( -type f \( ! -perm -0444 -o \( -perm /0111 ! -perm -0111 \) \) \) \) -print -quit)"
  if [[ -n "$invalid_path" ]]; then
    echo "错误：AppImage 文件或目录未向所有用户开放所需的读取/执行权限：${invalid_path#"$appdir"/}" >&2
    exit 1
  fi

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

  echo "AppImage 图标与权限检查通过：$appimage"
)

if [[ $# -eq 0 ]]; then
  echo "错误：请指定至少一个待检查的 AppImage 文件。" >&2
  exit 1
fi

if ! command -v unsquashfs >/dev/null; then
  echo "错误：缺少 unsquashfs，请先安装 squashfs-tools。" >&2
  exit 1
fi

for appimage in "$@"; do
  check_appimage "$appimage"
done

#!/usr/bin/env bash
set -euo pipefail

# Tauri 2.11.4 首次下载启动器时会设为 0770；预先准备后，打包器会复用此文件。
target_triple="${TAURI_ENV_TARGET_TRIPLE:?错误：缺少 Tauri 目标平台信息}"
arch="${target_triple%%-*}"
case "$arch" in
  x86_64) checksum="f30140a43a0a59e46db21bdefdf749b9e9f2c6946e92afabbacf98b8ae73fb4f" ;;
  aarch64) checksum="072f17c0895a85c490282fe5395c5007e5fc75da727e553b3b8fb680feb11578" ;;
  i686) checksum="a573a682b1a4a3e9b5dddbd1f5785749b7bba6013149b51ae99d0f123fe11691" ;;
  arm | armv7 | armhf)
    arch="armhf"
    checksum="b14d89f0762bcf09fc6af2359d936675928b8833ff52a1aeda68cb28a309f6ba"
    ;;
  *) echo "错误：不支持的 AppImage 启动器架构：$arch" >&2; exit 1 ;;
esac

tools_dir="${XDG_CACHE_HOME:-$HOME/.cache}/tauri"
mkdir -p -- "$tools_dir"
launcher="$tools_dir/AppRun-$arch"
if [[ ! -f "$launcher" || "$(sha256sum -- "$launcher" | cut -d ' ' -f 1)" != "$checksum" ]]; then
  temporary="$(mktemp "$tools_dir/.AppRun-$arch.XXXXXXXX")"
  trap 'rm -f -- "$temporary"' EXIT
  curl --fail --location --retry 3 --connect-timeout 15 --max-time 120 \
    "https://github.com/tauri-apps/binary-releases/releases/download/apprun-old/AppRun-$arch" \
    --output "$temporary"
  if [[ "$(sha256sum -- "$temporary" | cut -d ' ' -f 1)" != "$checksum" ]]; then
    echo "错误：官方 AppImage 启动器校验失败，停止打包。" >&2
    exit 1
  fi
  mv -f -- "$temporary" "$launcher"
fi

chmod 0755 -- "$launcher"
echo "AppImage 启动器已准备：$arch，权限 0755"

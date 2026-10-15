import argparse
import base64
import binascii
import json
from pathlib import Path


def validate_manifest(manifest, tag):
    if not tag.startswith("v") or not isinstance(manifest, dict):
        raise ValueError("标签或更新清单根结构不正确")
    if manifest.get("version") != tag[1:]:
        raise ValueError("更新清单版本与发布标签不一致")
    platforms = manifest.get("platforms")
    if not isinstance(platforms, dict):
        raise ValueError("更新清单缺少平台映射")
    expected = {"windows-x86_64", "linux-x86_64", "darwin-x86_64", "darwin-aarch64"}
    prefix = f"https://github.com/StarChen4/PeekaUsage/releases/download/{tag}/"
    for platform in sorted(expected):
        entry = platforms.get(platform)
        if not isinstance(entry, dict):
            raise ValueError(f"更新清单缺少平台：{platform}")
        url = entry.get("url")
        if not isinstance(url, str) or not url.startswith(prefix) or url == prefix:
            raise ValueError(f"平台下载地址不属于当前版本：{platform}")
        signature = entry.get("signature")
        if not isinstance(signature, str) or not signature.strip():
            raise ValueError(f"平台缺少更新签名：{platform}")
        try:
            decoded = base64.b64decode(signature, validate=True)
        except (ValueError, binascii.Error) as error:
            raise ValueError(f"平台签名不是合法 Base64：{platform}") from error
        if not decoded.startswith(b"untrusted comment:"):
            raise ValueError(f"平台签名格式不正确：{platform}")


def main():
    parser = argparse.ArgumentParser(description="检查 PeekaUsage 更新清单")
    parser.add_argument("manifest", type=Path, help="本地 latest.json 路径")
    parser.add_argument("tag", help="发布标签，例如 v0.1.11")
    args = parser.parse_args()
    try:
        validate_manifest(json.loads(args.manifest.read_text(encoding="utf-8")), args.tag)
    except (OSError, ValueError) as error:
        raise SystemExit(f"更新清单检查失败：{error}") from error
    print(f"更新清单检查通过：{args.tag}，四个平台条目齐全")


if __name__ == "__main__":
    main()

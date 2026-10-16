import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import unittest


PROJECT = Path(__file__).resolve().parents[1]
CHECKER = PROJECT / "scripts/check-appimage.sh"
BUILDER = PROJECT / "scripts/build-linux.sh"
PREPARER = PROJECT / "scripts/prepare-appimage.sh"


def executable(path, content):
    path.write_text("#!/usr/bin/env bash\nset -euo pipefail\n" + content, encoding="utf-8")
    path.chmod(0o755)


@unittest.skipUnless(os.name == "posix", "AppImage 脚本仅在 Linux 检查")
class AppImageScriptsTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="peekausage-appimage-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.prototype = self.root / "原始 AppDir"
        (self.prototype / "usr/bin").mkdir(parents=True)
        for name in (".", "usr", "usr/bin"):
            (self.prototype / name).chmod(0o755)
        shutil.copyfile(PROJECT / "src-tauri/icons/icon.png", self.prototype / "icon.png")
        (self.prototype / "icon.png").chmod(0o644)
        (self.prototype / ".DirIcon").symlink_to("icon.png")
        for name in ("AppRun", "AppRun.wrapped", "usr/bin/peeka-usage"):
            executable(self.prototype / name, "exit 0\n")
        self.index = 0

    def package(self, mutate=lambda appdir: None):
        self.index += 1
        appdir = self.root / f"测试 AppDir {self.index}"
        shutil.copytree(self.prototype, appdir, symlinks=True)
        mutate(appdir)
        package = self.root / f"测试安装包 {self.index}.AppImage"
        filesystem = self.root / f"测试文件系统 {self.index}.squashfs"
        subprocess.run(["mksquashfs", str(appdir), str(filesystem), "-noappend", "-no-progress", "-processors", "1"], stdout=subprocess.DEVNULL, check=True)
        # 使用真实 SquashFS 权限元数据，启动头只模拟 AppImage 的偏移查询。
        header = b"#!/usr/bin/env bash\nprintf '1024\\n'\nexit 0\n"
        package.write_bytes(header + b"\x00" * (1024 - len(header)) + filesystem.read_bytes())
        package.chmod(0o755)
        return package

    def run_script(self, command, expected, env=None):
        result = subprocess.run(command, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
        return result

    def check_package(self, package, expected):
        return self.run_script(["bash", str(CHECKER), str(package)], expected)

    def test_icons_and_missing_input(self):
        self.check_package(self.package(), 0)

        def direct_icon(appdir):
            (appdir / ".DirIcon").unlink()
            shutil.copyfile(appdir / "icon.png", appdir / ".DirIcon")

        self.check_package(self.package(direct_icon), 0)
        for target in (None, "missing.png", str(self.prototype / "icon.png"), "../原始 AppDir/icon.png"):
            with self.subTest(target=target):
                def change_link(appdir):
                    (appdir / ".DirIcon").unlink()
                    if target is not None:
                        (appdir / ".DirIcon").symlink_to(target)
                self.check_package(self.package(change_link), 1)
        for content in (b"", b"invalid PNG"):
            with self.subTest(content=content):
                def change_content(appdir):
                    (appdir / ".DirIcon").unlink()
                    (appdir / ".DirIcon").write_bytes(content)
                self.check_package(self.package(change_content), 1)
        self.run_script(["bash", str(CHECKER)], 1)

    def test_rejects_permissions_hidden_by_extracting_as_owner(self):
        for name, mode in (
            ("AppRun", 0o770),
            ("AppRun.wrapped", 0o770),
            ("usr/bin/peeka-usage", 0o750),
            ("icon.png", 0o640),
            ("usr/bin", 0o750),
        ):
            with self.subTest(name=name, mode=oct(mode)):
                result = self.check_package(self.package(lambda appdir: (appdir / name).chmod(mode)), 1)
                self.assertIn("权限", result.stderr)
        for name in ("AppRun", "AppRun.wrapped", "usr/bin/peeka-usage"):
            with self.subTest(missing=name):
                self.check_package(self.package(lambda appdir: (appdir / name).unlink()), 1)

    def test_builder_checks_only_fresh_successful_outputs(self):
        tools = self.root / "tools"
        tools.mkdir()
        target = self.root / "target"
        output = target / "debug/bundle/appimage/测试.AppImage"
        output.parent.mkdir(parents=True)
        executable(tools / "npm", 'cp "$PEEKA_FIXTURE" "$PEEKA_OUTPUT"\nchmod +x "$PEEKA_OUTPUT"\n')
        executable(tools / "cargo", "printf %s " + shlex.quote(json.dumps({"target_directory": str(target)})) + "\n")
        executable(tools / "node", "python3 -c 'import json, sys; print(json.load(sys.stdin)[\"target_directory\"])'\n")
        env = dict(os.environ, PATH=str(tools) + ":" + os.environ["PATH"], PEEKA_OUTPUT=str(output))
        env["PEEKA_FIXTURE"] = str(self.package())
        self.run_script(["bash", str(BUILDER), "build", "--debug"], 0, env)
        env["PEEKA_FIXTURE"] = str(self.package(lambda appdir: (appdir / "AppRun.wrapped").chmod(0o770)))
        self.run_script(["bash", str(BUILDER), "build", "--debug"], 1, env)
        executable(tools / "npm", "exit 7\n")
        self.run_script(["bash", str(BUILDER), "build"], 7, env)
        executable(tools / "npm", "true\n")
        self.run_script(["bash", str(BUILDER), "build"], 1, env)

    def test_preparer_rejects_unknown_target_and_unverified_download(self):
        tools = self.root / "tools"
        tools.mkdir()
        executable(tools / "curl", 'while [[ "$1" != --output ]]; do shift; done\nprintf invalid > "$2"\n')
        env = dict(os.environ, PATH=str(tools) + ":" + os.environ["PATH"], XDG_CACHE_HOME=str(self.root / "cache"))
        env["TAURI_ENV_TARGET_TRIPLE"] = "unknown-linux-gnu"
        self.run_script(["bash", str(PREPARER)], 1, env)
        env["TAURI_ENV_TARGET_TRIPLE"] = "x86_64-unknown-linux-gnu"
        result = self.run_script(["bash", str(PREPARER)], 1, env)
        self.assertIn("校验失败", result.stderr)
        self.assertFalse((self.root / "cache/tauri/AppRun-x86_64").exists())


if __name__ == "__main__":
    unittest.main()

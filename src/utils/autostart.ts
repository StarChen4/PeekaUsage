import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

/** 同步系统开机自启状态。 */
export async function syncLaunchAtStartup(enabled: boolean): Promise<void> {
  if (enabled) {
    await enable();
  } else {
    await disable();
  }

  const actual = await isEnabled();
  if (actual !== enabled) {
    throw new Error(
      enabled ? "系统未成功启用开机自动启动。" : "系统未成功关闭开机自动启动。",
    );
  }
}

import { defineStore } from "pinia";
import { ref } from "vue";
import type { AppSettings } from "../types/settings";
import {
  DEFAULT_SETTINGS,
  normalizeAppSettings,
} from "../types/settings";
import { getSettings, saveSettings as ipcSaveSettings } from "../utils/ipc";

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS });
  const loaded = ref(false);
  let loadingPromise: Promise<void> | null = null;

  /** 从后端加载设置 */
  async function loadSettings(force = false) {
    if (loaded.value && !force) {
      return;
    }

    if (loadingPromise && !force) {
      return loadingPromise;
    }

    loadingPromise = (async () => {
      try {
        const remoteSettings = await getSettings();
        settings.value = normalizeAppSettings({
          ...DEFAULT_SETTINGS,
          ...remoteSettings,
          providerCardExpanded: {
            ...DEFAULT_SETTINGS.providerCardExpanded,
            ...remoteSettings.providerCardExpanded,
          },
          providerPollingOverrides: {
            ...DEFAULT_SETTINGS.providerPollingOverrides,
            ...remoteSettings.providerPollingOverrides,
          },
        });
      } catch {
        settings.value = { ...DEFAULT_SETTINGS };
      }
      loaded.value = true;
    })();

    try {
      await loadingPromise;
    } finally {
      loadingPromise = null;
    }
  }

  /** 保存设置到后端 */
  async function saveSettings(newSettings: Partial<AppSettings>) {
    settings.value = normalizeAppSettings({
      ...settings.value,
      ...newSettings,
      providerPollingOverrides: {
        ...settings.value.providerPollingOverrides,
        ...newSettings.providerPollingOverrides,
      },
    });
    await ipcSaveSettings(settings.value);
  }

  return {
    settings,
    loaded,
    loadSettings,
    saveSettings,
  };
});

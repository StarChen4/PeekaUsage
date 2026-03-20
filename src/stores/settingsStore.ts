import { defineStore } from "pinia";
import { ref } from "vue";
import type { AppSettings } from "../types/settings";
import { DEFAULT_SETTINGS } from "../types/settings";
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
        settings.value = {
          ...DEFAULT_SETTINGS,
          ...remoteSettings,
          providerCardExpanded: {
            ...DEFAULT_SETTINGS.providerCardExpanded,
            ...remoteSettings.providerCardExpanded,
          },
        };
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
    settings.value = { ...settings.value, ...newSettings };
    await ipcSaveSettings(settings.value);
  }

  return {
    settings,
    loaded,
    loadSettings,
    saveSettings,
  };
});

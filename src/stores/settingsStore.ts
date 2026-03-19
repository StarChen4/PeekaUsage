import { defineStore } from "pinia";
import { ref } from "vue";
import type { AppSettings } from "../types/settings";
import { DEFAULT_SETTINGS } from "../types/settings";
import { getSettings, saveSettings as ipcSaveSettings } from "../utils/ipc";

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS });
  const loaded = ref(false);

  /** 从后端加载设置 */
  async function loadSettings() {
    try {
      settings.value = await getSettings();
    } catch {
      settings.value = { ...DEFAULT_SETTINGS };
    }
    loaded.value = true;
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

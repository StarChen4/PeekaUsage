import { create } from "zustand";
import type { AppSettings } from "../types/settings";
import {
  DEFAULT_SETTINGS,
  normalizeAppSettings,
} from "../types/settings";
import { getSettings, saveSettings as ipcSaveSettings } from "../utils/ipc";

type SettingsStoreState = {
  settings: AppSettings;
  loaded: boolean;
  loadSettings: (force?: boolean) => Promise<void>;
  saveSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
};

let loadingPromise: Promise<void> | null = null;

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  loaded: false,

  async loadSettings(force = false) {
    if (get().loaded && !force) {
      return;
    }

    if (loadingPromise && !force) {
      return loadingPromise;
    }

    loadingPromise = (async () => {
      try {
        const remoteSettings = await getSettings();
        const normalized = normalizeAppSettings({
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

        set({
          settings: normalized,
          loaded: true,
        });
      } catch {
        set({
          settings: { ...DEFAULT_SETTINGS },
          loaded: true,
        });
      }
    })();

    try {
      await loadingPromise;
    } finally {
      loadingPromise = null;
    }
  },

  async saveSettings(newSettings: Partial<AppSettings>) {
    const currentSettings = get().settings;
    const nextSettings = normalizeAppSettings({
      ...currentSettings,
      ...newSettings,
      providerPollingOverrides: {
        ...currentSettings.providerPollingOverrides,
        ...newSettings.providerPollingOverrides,
      },
    });

    set({
      settings: nextSettings,
    });

    await ipcSaveSettings(nextSettings);
  },
}));

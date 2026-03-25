import { create } from "zustand";
import type { UpdateStatus } from "../types/settings";
import { invoke } from "@tauri-apps/api/core";

interface UpdateStore {
  status: UpdateStatus | null;
  isChecking: boolean;
  isInstalling: boolean;
  lastCheckAt: number | null;
  hasUpdate: boolean;
  checkUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  loadCurrentVersion: () => Promise<void>;
}

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  status: null,
  isChecking: false,
  isInstalling: false,
  lastCheckAt: null,
  hasUpdate: false,

  loadCurrentVersion: async () => {
    try {
      const version = await invoke<string>("get_current_version");
      set((state) => ({
        status: state.status
          ? { ...state.status, currentVersion: version }
          : {
              currentVersion: version,
              state: "idle" as const,
              availableVersion: null,
              releaseUrl: null,
              notes: null,
              pubDate: null,
              errorMessage: null,
              downloadProgress: null,
            },
      }));
    } catch (e) {
      console.error("get_current_version failed", e);
    }
  },

  checkUpdate: async () => {
    if (get().isChecking) return;
    set({ isChecking: true });
    try {
      const status = await invoke<UpdateStatus>("check_app_update");
      set({
        status,
        hasUpdate: status.state === "available",
        lastCheckAt: Date.now(),
        isChecking: false,
      });
    } catch (e) {
      set({ isChecking: false });
      console.error("check_app_update failed", e);
    }
  },

  installUpdate: async () => {
    if (get().isInstalling) return;
    set({ isInstalling: true });
    try {
      await invoke("install_app_update");
    } catch (e) {
      set({ isInstalling: false });
      console.error("install_app_update failed", e);
    }
  },
}));

import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import TitleBar from "./components/common/TitleBar";
import WidgetContainer from "./components/widget/WidgetContainer";
import SettingsPanel from "./components/settings/SettingsPanel";
import { useWindowControls } from "./composables/useWindowControls";
import { useProviderStore } from "./stores/providerStore";
import { useSettingsStore } from "./stores/settingsStore";
import { applyTheme, observeSystemTheme } from "./utils/theme";

export default function App() {
  const [currentView, setCurrentView] = useState<"widget" | "settings">("widget");
  const settings = useSettingsStore((state) => state.settings);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const { applyOpacity } = useWindowControls();

  useEffect(() => {
    let active = true;
    let unlistenRefresh: UnlistenFn | null = null;
    let unlistenSettings: UnlistenFn | null = null;
    let stopObservingSystemTheme: (() => void) | null = null;

    async function syncAlwaysOnTop(alwaysOnTop: boolean) {
      try {
        await getCurrentWindow().setAlwaysOnTop(alwaysOnTop);
      } catch {
        // 忽略窗口置顶同步失败，避免影响界面初始化
      }
    }

    void (async () => {
      await loadSettings();
      const currentSettings = useSettingsStore.getState().settings;

      applyTheme(currentSettings.theme);
      await applyOpacity(currentSettings.windowOpacity);
      await syncAlwaysOnTop(currentSettings.alwaysOnTop);

      if (!active) {
        return;
      }

      unlistenRefresh = await listen("tray-refresh", () => {
        void useProviderStore.getState().refreshAll();
      });

      unlistenSettings = await listen("tray-open-settings", () => {
        setCurrentView("settings");
      });

      stopObservingSystemTheme = observeSystemTheme(() => {
        if (useSettingsStore.getState().settings.theme === "system") {
          applyTheme("system");
        }
      });
    })();

    return () => {
      active = false;
      unlistenRefresh?.();
      unlistenSettings?.();
      stopObservingSystemTheme?.();
    };
  }, [applyOpacity, loadSettings]);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    void getCurrentWindow().setAlwaysOnTop(settings.alwaysOnTop).catch(() => {
      // 忽略窗口置顶同步失败，避免影响界面更新
    });
  }, [settings.alwaysOnTop]);

  useEffect(() => {
    void applyOpacity(settings.windowOpacity);
  }, [applyOpacity, settings.windowOpacity]);

  async function handleBackFromSettings() {
    setCurrentView("widget");

    if (useSettingsStore.getState().settings.refreshOnSettingsClose) {
      await useProviderStore.getState().refreshAll();
    }
  }

  return (
    <>
      <TitleBar />
      {currentView === "widget" ? (
        <WidgetContainer onOpenSettings={() => setCurrentView("settings")} />
      ) : (
        <SettingsPanel onBack={() => void handleBackFromSettings()} />
      )}
    </>
  );
}

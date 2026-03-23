import { useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { LogicalPosition, LogicalSize, getCurrentWindow } from "@tauri-apps/api/window";
import TitleBar from "./components/common/TitleBar";
import WidgetContainer from "./components/widget/WidgetContainer";
import SettingsPanel from "./components/settings/SettingsPanel";
import { useWindowControls } from "./composables/useWindowControls";
import { useProviderStore } from "./stores/providerStore";
import { useSettingsStore } from "./stores/settingsStore";
import { applyTheme, observeSystemTheme } from "./utils/theme";
import {
  areWindowPositionsEqual,
  areWindowSizesEqual,
  isProgrammaticWindowResize,
  markProgrammaticWindowResize,
  normalizeWindowPosition,
  normalizeWindowSize,
  suppressAutoFitAfterManualResize,
  toLogicalWindowPosition,
  toLogicalWindowSize,
  type LogicalWindowPosition,
  type LogicalWindowSize,
} from "./utils/windowBounds";

export default function App() {
  const [currentView, setCurrentView] = useState<"widget" | "settings">("widget");
  const settings = useSettingsStore((state) => state.settings);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const { applyOpacity } = useWindowControls();
  const restoringWindowBoundsRef = useRef(false);
  const windowBoundsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWindowSizeRef = useRef<LogicalWindowSize | null>(null);
  const pendingWindowPositionRef = useRef<LogicalWindowPosition | null>(null);

  function clearWindowBoundsSaveTimer() {
    if (windowBoundsSaveTimerRef.current) {
      clearTimeout(windowBoundsSaveTimerRef.current);
      windowBoundsSaveTimerRef.current = null;
    }
  }

  function scheduleWindowBoundsSave(next: {
    windowSize?: LogicalWindowSize | null;
    windowPosition?: LogicalWindowPosition | null;
  }) {
    if (next.windowSize !== undefined) {
      pendingWindowSizeRef.current = next.windowSize;
    }

    if (next.windowPosition !== undefined) {
      pendingWindowPositionRef.current = next.windowPosition;
    }

    clearWindowBoundsSaveTimer();
    windowBoundsSaveTimerRef.current = setTimeout(() => {
      const size = pendingWindowSizeRef.current;
      const position = pendingWindowPositionRef.current;
      pendingWindowSizeRef.current = null;
      pendingWindowPositionRef.current = null;
      windowBoundsSaveTimerRef.current = null;

      const currentSettings = useSettingsStore.getState().settings;
      const patch: Partial<typeof currentSettings> = {};

      if (size && !areWindowSizesEqual(currentSettings.windowSize, size)) {
        patch.windowSize = size;
      }

      if (position && !areWindowPositionsEqual(currentSettings.windowPosition, position)) {
        patch.windowPosition = position;
      }

      if (Object.keys(patch).length > 0) {
        void useSettingsStore.getState().saveSettings(patch);
      }
    }, 180);
  }

  useEffect(() => {
    let active = true;
    let unlistenRefresh: UnlistenFn | null = null;
    let unlistenSettings: UnlistenFn | null = null;
    let unlistenWindowResized: UnlistenFn | null = null;
    let unlistenWindowMoved: UnlistenFn | null = null;
    let stopObservingSystemTheme: (() => void) | null = null;
    const currentWindow = getCurrentWindow();

    async function syncAlwaysOnTop(alwaysOnTop: boolean) {
      try {
        await currentWindow.setAlwaysOnTop(alwaysOnTop);
      } catch {
        // 忽略置顶同步失败，避免影响界面初始化
      }
    }

    async function restoreWindowBounds() {
      const currentSettings = useSettingsStore.getState().settings;
      const windowSize = normalizeWindowSize(currentSettings.windowSize);
      const windowPosition = normalizeWindowPosition(currentSettings.windowPosition);

      if (!windowSize && !windowPosition) {
        return;
      }

      restoringWindowBoundsRef.current = true;

      try {
        if (windowSize) {
          markProgrammaticWindowResize();
          await currentWindow.setSize(new LogicalSize(windowSize.width, windowSize.height));
        }

        if (windowPosition) {
          await currentWindow.setPosition(new LogicalPosition(windowPosition.x, windowPosition.y));
        }
      } catch {
        // 忽略无效的历史窗口边界，避免阻塞启动
      } finally {
        restoringWindowBoundsRef.current = false;
      }
    }

    void (async () => {
      await loadSettings();
      const currentSettings = useSettingsStore.getState().settings;

      applyTheme(currentSettings.theme);
      await applyOpacity(currentSettings.windowOpacity);
      await syncAlwaysOnTop(currentSettings.alwaysOnTop);
      await restoreWindowBounds();

      if (!active) {
        return;
      }

      unlistenRefresh = await listen("tray-refresh", () => {
        void useProviderStore.getState().refreshAll();
      });

      unlistenSettings = await listen("tray-open-settings", () => {
        setCurrentView("settings");
      });

      unlistenWindowResized = await currentWindow.onResized(async ({ payload }) => {
        if (!active || restoringWindowBoundsRef.current) {
          return;
        }

        if (!isProgrammaticWindowResize()) {
          suppressAutoFitAfterManualResize();
        }

        const scaleFactor = await currentWindow.scaleFactor();
        scheduleWindowBoundsSave({
          windowSize: toLogicalWindowSize(payload, scaleFactor),
        });
      });

      unlistenWindowMoved = await currentWindow.onMoved(async ({ payload }) => {
        if (!active || restoringWindowBoundsRef.current) {
          return;
        }

        const scaleFactor = await currentWindow.scaleFactor();
        scheduleWindowBoundsSave({
          windowPosition: toLogicalWindowPosition(payload, scaleFactor),
        });
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
      unlistenWindowResized?.();
      unlistenWindowMoved?.();
      stopObservingSystemTheme?.();
      clearWindowBoundsSaveTimer();
    };
  }, [applyOpacity, loadSettings]);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    void getCurrentWindow().setAlwaysOnTop(settings.alwaysOnTop).catch(() => {
      // 忽略置顶同步失败，避免影响界面更新
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

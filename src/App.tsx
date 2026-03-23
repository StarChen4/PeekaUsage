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
  isProgrammaticWindowMove,
  isProgrammaticWindowResize,
  markProgrammaticWindowMove,
  markProgrammaticWindowResize,
  normalizeWindowPosition,
  normalizeWindowSize,
  resolveWindowDockBounds,
  suppressAutoFitAfterManualResize,
  toLogicalWindowPosition,
  toLogicalWindowSize,
  wasLikelyResizedBySystemSnap,
  type LogicalWindowPosition,
  type LogicalWindowSize,
  type WindowDockBounds,
  type WindowDockEdge,
} from "./utils/windowBounds";

type WindowDockState = {
  edge: WindowDockEdge;
  collapsed: boolean;
  expandedBounds: {
    windowPosition: LogicalWindowPosition;
    windowSize: LogicalWindowSize;
  };
};

export default function App() {
  const [currentView, setCurrentView] = useState<"widget" | "settings">("widget");
  const [dockVisualState, setDockVisualState] = useState<{
    edge: WindowDockEdge;
    collapsed: boolean;
  } | null>(null);
  const settings = useSettingsStore((state) => state.settings);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const { applyOpacity } = useWindowControls();
  const restoringWindowBoundsRef = useRef(false);
  const windowBoundsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWindowSizeRef = useRef<LogicalWindowSize | null>(null);
  const pendingWindowPositionRef = useRef<LogicalWindowPosition | null>(null);
  const edgeDockCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeDockEvaluateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titlebarDragIntentUntilRef = useRef(0);
  const titlebarDraggingRef = useRef(false);
  const dragStartWindowSizeRef = useRef<LogicalWindowSize | null>(null);
  const latestDragBoundsRef = useRef<{
    windowPosition: LogicalWindowPosition;
    windowSize: LogicalWindowSize;
  } | null>(null);
  const dockStateRef = useRef<WindowDockState | null>(null);

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

  function clearEdgeDockCollapseTimer() {
    if (edgeDockCollapseTimerRef.current) {
      clearTimeout(edgeDockCollapseTimerRef.current);
      edgeDockCollapseTimerRef.current = null;
    }
  }

  function clearEdgeDockEvaluateTimer() {
    if (edgeDockEvaluateTimerRef.current) {
      clearTimeout(edgeDockEvaluateTimerRef.current);
      edgeDockEvaluateTimerRef.current = null;
    }
  }

  function updateDockState(nextState: WindowDockState | null) {
    dockStateRef.current = nextState;
    setDockVisualState(nextState
      ? {
        edge: nextState.edge,
        collapsed: nextState.collapsed,
      }
      : null);
  }

  function persistDockExpandedBounds(dockState: WindowDockState) {
    scheduleWindowBoundsSave({
      windowSize: dockState.expandedBounds.windowSize,
      windowPosition: dockState.expandedBounds.windowPosition,
    });
  }

  async function setProgrammaticWindowBounds(
    windowPosition: LogicalWindowPosition,
    windowSize: LogicalWindowSize,
  ) {
    const currentWindow = getCurrentWindow();
    markProgrammaticWindowMove();
    markProgrammaticWindowResize();
    await currentWindow.setSize(new LogicalSize(windowSize.width, windowSize.height));
    await currentWindow.setPosition(new LogicalPosition(windowPosition.x, windowPosition.y));
  }

  async function collapseDockedWindow() {
    if (!useSettingsStore.getState().settings.edgeDockCollapseEnabled) {
      return;
    }

    const dockState = dockStateRef.current;
    if (!dockState || dockState.collapsed) {
      return;
    }

    const dockBounds = await resolveWindowDockBounds(
      dockState.expandedBounds.windowPosition,
      dockState.expandedBounds.windowSize,
    );

    if (!dockBounds || dockBounds.edge !== dockState.edge) {
      updateDockState(null);
      return;
    }

    const nextState: WindowDockState = {
      edge: dockBounds.edge,
      collapsed: true,
      expandedBounds: {
        windowPosition: dockBounds.expandedPosition,
        windowSize: dockBounds.expandedSize,
      },
    };

    await setProgrammaticWindowBounds(dockBounds.collapsedPosition, dockBounds.collapsedSize);
    updateDockState(nextState);
    persistDockExpandedBounds(nextState);
  }

  async function expandDockedWindow() {
    const dockState = dockStateRef.current;
    if (!dockState || !dockState.collapsed) {
      return;
    }

    await setProgrammaticWindowBounds(
      dockState.expandedBounds.windowPosition,
      dockState.expandedBounds.windowSize,
    );

    const nextState: WindowDockState = {
      ...dockState,
      collapsed: false,
    };
    updateDockState(nextState);
    persistDockExpandedBounds(nextState);
  }

  async function activateWindowDock(dockBounds: WindowDockBounds) {
    if (!useSettingsStore.getState().settings.edgeDockCollapseEnabled) {
      return;
    }

    clearEdgeDockCollapseTimer();

    const nextState: WindowDockState = {
      edge: dockBounds.edge,
      collapsed: true,
      expandedBounds: {
        windowPosition: dockBounds.expandedPosition,
        windowSize: dockBounds.expandedSize,
      },
    };

    await setProgrammaticWindowBounds(dockBounds.collapsedPosition, dockBounds.collapsedSize);
    updateDockState(nextState);
    persistDockExpandedBounds(nextState);
  }

  function clearWindowDock(bounds?: {
    windowPosition?: LogicalWindowPosition | null;
    windowSize?: LogicalWindowSize | null;
  }) {
    clearEdgeDockCollapseTimer();
    updateDockState(null);

    if (bounds) {
      scheduleWindowBoundsSave(bounds);
    }
  }

  async function evaluateWindowDock(
    windowPosition: LogicalWindowPosition,
    windowSize: LogicalWindowSize,
  ) {
    if (!useSettingsStore.getState().settings.edgeDockCollapseEnabled) {
      dragStartWindowSizeRef.current = null;
      clearWindowDock({
        windowPosition,
        windowSize,
      });
      return;
    }

    if (wasLikelyResizedBySystemSnap(dragStartWindowSizeRef.current, windowSize)) {
      dragStartWindowSizeRef.current = null;
      clearWindowDock({
        windowPosition,
        windowSize,
      });
      return;
    }

    dragStartWindowSizeRef.current = null;
    const dockBounds = await resolveWindowDockBounds(windowPosition, windowSize, {
      requireExceeded: true,
    });
    if (dockBounds) {
      await activateWindowDock(dockBounds);
    } else {
      clearWindowDock({
        windowPosition,
        windowSize,
      });
    }
  }

  function scheduleWindowDockEvaluation(
    windowPosition: LogicalWindowPosition,
    windowSize: LogicalWindowSize,
  ) {
    if (!titlebarDraggingRef.current || Date.now() >= titlebarDragIntentUntilRef.current) {
      return;
    }

    latestDragBoundsRef.current = {
      windowPosition,
      windowSize,
    };
    clearEdgeDockEvaluateTimer();
    edgeDockEvaluateTimerRef.current = setTimeout(() => {
      edgeDockEvaluateTimerRef.current = null;
      titlebarDraggingRef.current = false;
      titlebarDragIntentUntilRef.current = 0;
      const latestBounds = latestDragBoundsRef.current;
      latestDragBoundsRef.current = null;

      if (!latestBounds) {
        return;
      }

      void (async () => {
        await evaluateWindowDock(latestBounds.windowPosition, latestBounds.windowSize);
      })();
    }, 420);
  }

  function registerTitlebarDragIntent() {
    titlebarDraggingRef.current = true;
    titlebarDragIntentUntilRef.current = Date.now() + 5000;
    latestDragBoundsRef.current = null;
    dragStartWindowSizeRef.current = null;
    clearEdgeDockCollapseTimer();

    void (async () => {
      try {
        const currentWindow = getCurrentWindow();
        const scaleFactor = await currentWindow.scaleFactor();
        const size = await currentWindow.innerSize();
        dragStartWindowSizeRef.current = toLogicalWindowSize(size, scaleFactor);
      } catch {
        dragStartWindowSizeRef.current = null;
      }
    })();
  }

  function finishTitlebarDragIntent() {
    if (!titlebarDraggingRef.current) {
      return;
    }

    titlebarDraggingRef.current = false;
    titlebarDragIntentUntilRef.current = 0;
    clearEdgeDockEvaluateTimer();

    const latestBounds = latestDragBoundsRef.current;
    latestDragBoundsRef.current = null;
    if (!latestBounds) {
      dragStartWindowSizeRef.current = null;
      return;
    }

    void evaluateWindowDock(latestBounds.windowPosition, latestBounds.windowSize);
  }

  function handleAppMouseEnter() {
    if (!settings.edgeDockCollapseEnabled) {
      return;
    }

    clearEdgeDockCollapseTimer();

    if (dockStateRef.current?.collapsed) {
      void expandDockedWindow();
    }
  }

  function handleAppMouseLeave() {
    if (!settings.edgeDockCollapseEnabled) {
      return;
    }

    const dockState = dockStateRef.current;
    if (!dockState || dockState.collapsed || Date.now() < titlebarDragIntentUntilRef.current) {
      return;
    }

    clearEdgeDockCollapseTimer();
    edgeDockCollapseTimerRef.current = setTimeout(() => {
      edgeDockCollapseTimerRef.current = null;
      void collapseDockedWindow();
    }, 180);
  }

  useEffect(() => {
    if (settings.edgeDockCollapseEnabled) {
      return;
    }

    clearEdgeDockCollapseTimer();
    clearEdgeDockEvaluateTimer();
    titlebarDraggingRef.current = false;
    titlebarDragIntentUntilRef.current = 0;
    latestDragBoundsRef.current = null;
    dragStartWindowSizeRef.current = null;

    const dockState = dockStateRef.current;
    if (!dockState) {
      return;
    }

    void (async () => {
      if (dockState.collapsed) {
        await setProgrammaticWindowBounds(
          dockState.expandedBounds.windowPosition,
          dockState.expandedBounds.windowSize,
        );
      }

      updateDockState(null);
      scheduleWindowBoundsSave({
        windowPosition: dockState.expandedBounds.windowPosition,
        windowSize: dockState.expandedBounds.windowSize,
      });
    })();
  }, [settings.edgeDockCollapseEnabled]);

  useEffect(() => {
    let active = true;
    let unlistenRefresh: UnlistenFn | null = null;
    let unlistenSettings: UnlistenFn | null = null;
    let unlistenWindowResized: UnlistenFn | null = null;
    let unlistenWindowMoved: UnlistenFn | null = null;
    let stopObservingSystemTheme: (() => void) | null = null;
    const currentWindow = getCurrentWindow();

    function handleGlobalMouseUp() {
      finishTitlebarDragIntent();
    }

    window.addEventListener("mouseup", handleGlobalMouseUp);

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
        const nextSize = toLogicalWindowSize(payload, scaleFactor);
        const dockState = dockStateRef.current;

        if (dockState) {
          if (!dockState.collapsed) {
            dockStateRef.current = {
              ...dockState,
              expandedBounds: {
                ...dockState.expandedBounds,
                windowSize: nextSize,
              },
            };
          }

          persistDockExpandedBounds(dockStateRef.current ?? dockState);
          return;
        }

        scheduleWindowBoundsSave({
          windowSize: nextSize,
        });
      });

      unlistenWindowMoved = await currentWindow.onMoved(async ({ payload }) => {
        if (!active || restoringWindowBoundsRef.current) {
          return;
        }

        const scaleFactor = await currentWindow.scaleFactor();
        const nextPosition = toLogicalWindowPosition(payload, scaleFactor);
        if (!nextPosition) {
          return;
        }

        const dockState = dockStateRef.current;
        if (dockState) {
          if (isProgrammaticWindowMove()) {
            persistDockExpandedBounds(dockState);
            return;
          }

          dockStateRef.current = dockState.collapsed
            ? dockState
            : {
              ...dockState,
              expandedBounds: {
                ...dockState.expandedBounds,
                windowPosition: nextPosition,
              },
            };
          persistDockExpandedBounds(dockStateRef.current ?? dockState);
        } else {
          scheduleWindowBoundsSave({
            windowPosition: nextPosition,
          });
        }

        if (!isProgrammaticWindowMove()) {
          const innerSize = await currentWindow.innerSize();
          const nextSize = toLogicalWindowSize(innerSize, scaleFactor);
          scheduleWindowDockEvaluation(nextPosition, nextSize);
        }
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
      clearEdgeDockCollapseTimer();
      clearEdgeDockEvaluateTimer();
      window.removeEventListener("mouseup", handleGlobalMouseUp);
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
    <div
      className={`app-shell${dockVisualState ? " is-edge-docked" : ""}${dockVisualState?.collapsed ? " is-edge-docked-collapsed" : ""}${dockVisualState ? ` edge-${dockVisualState.edge}` : ""}`}
      onMouseEnter={handleAppMouseEnter}
      onMouseLeave={handleAppMouseLeave}
    >
      <TitleBar onDragIntentStart={registerTitlebarDragIntent} />
      {currentView === "widget" ? (
        <WidgetContainer
          onOpenSettings={() => setCurrentView("settings")}
          suppressWindowAutoFit={!!dockVisualState?.collapsed}
        />
      ) : (
        <SettingsPanel onBack={() => void handleBackFromSettings()} />
      )}
      {dockVisualState?.collapsed ? <div className="dock-peek-indicator" aria-hidden="true" /> : null}
    </div>
  );
}

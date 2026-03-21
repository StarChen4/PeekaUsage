import { create } from "zustand";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { setWindowOpacity } from "../utils/ipc";
import { useSettingsStore } from "../stores/settingsStore";

type WindowControlsState = {
  opacity: number;
  isDraggingOpacity: boolean;
  setOpacityState: (value: number) => void;
  setDraggingOpacity: (value: boolean) => void;
};

const useWindowControlsStore = create<WindowControlsState>((set) => ({
  opacity: 100,
  isDraggingOpacity: false,
  setOpacityState: (value) => set({ opacity: value }),
  setDraggingOpacity: (value) => set({ isDraggingOpacity: value }),
}));

function clampOpacity(value: number) {
  return Math.max(10, Math.min(100, Math.round(value)));
}

async function applyOpacity(value: number) {
  const clamped = clampOpacity(value);
  useWindowControlsStore.getState().setOpacityState(clamped);

  const appEl = document.getElementById("app");
  if (appEl) {
    appEl.style.opacity = `${clamped / 100}`;
  }

  await setWindowOpacity(clamped / 100);
  return clamped;
}

export function useWindowControls() {
  const opacity = useWindowControlsStore((state) => state.opacity);
  const isDraggingOpacity = useWindowControlsStore((state) => state.isDraggingOpacity);

  async function hideWindow() {
    await getCurrentWindow().hide();
  }

  async function minimizeWindow() {
    await getCurrentWindow().minimize();
  }

  async function closeToTray() {
    await getCurrentWindow().hide();
  }

  async function updateOpacity(value: number, persist = false) {
    const clamped = await applyOpacity(value);

    if (persist && useSettingsStore.getState().settings.windowOpacity !== clamped) {
      await useSettingsStore.getState().saveSettings({ windowOpacity: clamped });
    }

    return clamped;
  }

  function startOpacityDrag(startY: number) {
    useWindowControlsStore.getState().setDraggingOpacity(true);
    const startOpacity = useWindowControlsStore.getState().opacity;
    let lastOpacity = startOpacity;

    function onMouseMove(event: MouseEvent) {
      const deltaY = startY - event.clientY;
      const deltaOpacity = deltaY * 0.5;
      lastOpacity = clampOpacity(startOpacity - deltaOpacity);
      void updateOpacity(lastOpacity, false);
    }

    function onMouseUp() {
      useWindowControlsStore.getState().setDraggingOpacity(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      void updateOpacity(lastOpacity, true);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  return {
    opacity,
    isDraggingOpacity,
    hideWindow,
    minimizeWindow,
    closeToTray,
    updateOpacity,
    startOpacityDrag,
    applyOpacity,
  };
}

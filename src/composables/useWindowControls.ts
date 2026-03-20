import { ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { setWindowOpacity } from "../utils/ipc";
import { useSettingsStore } from "../stores/settingsStore";

const opacity = ref(100);
const isDraggingOpacity = ref(false);

function clampOpacity(value: number) {
  return Math.max(10, Math.min(100, Math.round(value)));
}

async function applyOpacity(value: number) {
  const clamped = clampOpacity(value);
  opacity.value = clamped;

  const appEl = document.getElementById("app");
  if (appEl) {
    appEl.style.opacity = `${clamped / 100}`;
  }

  await setWindowOpacity(clamped / 100);
  return clamped;
}

export function useWindowControls() {
  const settingsStore = useSettingsStore();

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

    if (persist && settingsStore.settings.windowOpacity !== clamped) {
      await settingsStore.saveSettings({ windowOpacity: clamped });
    }

    return clamped;
  }

  function startOpacityDrag(startY: number) {
    isDraggingOpacity.value = true;
    const startOpacity = opacity.value;
    let lastOpacity = startOpacity;

    function onMouseMove(event: MouseEvent) {
      const deltaY = startY - event.clientY;
      const deltaOpacity = deltaY * 0.5;
      lastOpacity = clampOpacity(startOpacity - deltaOpacity);
      void updateOpacity(lastOpacity, false);
    }

    function onMouseUp() {
      isDraggingOpacity.value = false;
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

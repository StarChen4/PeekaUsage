import { ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { setWindowOpacity } from "../utils/ipc";

export function useWindowControls() {
  const opacity = ref(100);
  const isDraggingOpacity = ref(false);

  async function hideWindow() {
    await getCurrentWindow().hide();
  }

  async function minimizeWindow() {
    await getCurrentWindow().minimize();
  }

  async function closeToTray() {
    await getCurrentWindow().hide();
  }

  /** 更新窗口透明度（10-100） */
  async function updateOpacity(value: number) {
    const clamped = Math.max(10, Math.min(100, Math.round(value)));
    opacity.value = clamped;
    // 通过 CSS 控制视觉透明度
    const appEl = document.getElementById("app");
    if (appEl) {
      appEl.style.opacity = `${clamped / 100}`;
    }
    // 同时通知后端（预留给 Win32 API 实现）
    await setWindowOpacity(clamped / 100);
  }

  /** 处理透明度拖拽 */
  function startOpacityDrag(startY: number) {
    isDraggingOpacity.value = true;
    const startOpacity = opacity.value;

    function onMouseMove(e: MouseEvent) {
      // 向上拖 = 更透明，向下拖 = 更不透明
      const deltaY = startY - e.clientY;
      const deltaOpacity = deltaY * 0.5;
      updateOpacity(startOpacity - deltaOpacity);
    }

    function onMouseUp() {
      isDraggingOpacity.value = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
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
  };
}

import { ref, watch, onUnmounted } from "vue";
import { useSettingsStore } from "../stores/settingsStore";
import { useProviderStore } from "../stores/providerStore";

export function usePolling() {
  const settingsStore = useSettingsStore();
  const providerStore = useProviderStore();
  const isActive = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  function start() {
    stop();
    isActive.value = true;
    const intervalMs = settingsStore.settings.pollingInterval * 60 * 1000;
    timer = setInterval(() => {
      providerStore.refreshAll();
    }, intervalMs);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    isActive.value = false;
  }

  // 轮询间隔变化时重启
  watch(
    () => settingsStore.settings.pollingInterval,
    () => {
      if (isActive.value) start();
    }
  );

  onUnmounted(stop);

  return { isActive, start, stop };
}

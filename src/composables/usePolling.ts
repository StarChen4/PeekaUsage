import { ref, watch, onUnmounted } from "vue";
import { useSettingsStore } from "../stores/settingsStore";
import { useProviderStore } from "../stores/providerStore";
import { getPollingIntervalMs } from "../types/settings";

export function usePolling() {
  const settingsStore = useSettingsStore();
  const providerStore = useProviderStore();
  const isActive = ref(false);
  const shouldRun = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  function clearTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function restartTimer() {
    clearTimer();

    const intervalMs = getPollingIntervalMs(settingsStore.settings);
    if (intervalMs === null) {
      isActive.value = false;
      return;
    }

    isActive.value = true;
    timer = setInterval(() => {
      void providerStore.refreshAll();
    }, intervalMs);
  }

  function start() {
    shouldRun.value = true;
    restartTimer();
  }

  function stop() {
    shouldRun.value = false;
    clearTimer();
    isActive.value = false;
  }

  watch(
    () => [
      settingsStore.settings.pollingInterval,
      settingsStore.settings.pollingMode,
      settingsStore.settings.pollingUnit,
    ],
    () => {
      if (shouldRun.value) {
        restartTimer();
      }
    },
  );

  onUnmounted(stop);

  return { isActive, start, stop };
}

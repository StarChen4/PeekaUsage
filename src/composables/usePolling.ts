import { ref, watch, onUnmounted } from "vue";
import { useSettingsStore } from "../stores/settingsStore";
import { useProviderStore } from "../stores/providerStore";
import type { ProviderId } from "../types/provider";
import {
  getEffectivePollingSettings,
  getPollingIntervalMs,
} from "../types/settings";

export function usePolling() {
  const settingsStore = useSettingsStore();
  const providerStore = useProviderStore();
  const isActive = ref(false);
  const shouldRun = ref(false);
  const timers = new Map<ProviderId, ReturnType<typeof setInterval>>();

  function clearTimer(providerId: ProviderId) {
    const timer = timers.get(providerId);
    if (timer) {
      clearInterval(timer);
      timers.delete(providerId);
    }
  }

  function clearAllTimers() {
    for (const providerId of timers.keys()) {
      clearTimer(providerId);
    }
  }

  function syncTimers() {
    clearAllTimers();

    if (!shouldRun.value) {
      isActive.value = false;
      return;
    }

    const enabledProviders = providerStore.enabledProviders();

    for (const provider of enabledProviders) {
      const pollingSettings = getEffectivePollingSettings(
        settingsStore.settings,
        provider.providerId,
      );
      const intervalMs = getPollingIntervalMs(pollingSettings);
      if (intervalMs === null) {
        continue;
      }

      const providerId = provider.providerId;
      timers.set(providerId, setInterval(() => {
        void providerStore.refreshProvider(providerId);
      }, intervalMs));
    }

    isActive.value = timers.size > 0;
  }

  function start() {
    shouldRun.value = true;
    syncTimers();
  }

  function stop() {
    shouldRun.value = false;
    clearAllTimers();
    isActive.value = false;
  }

  watch(
    () => JSON.stringify({
      pollingInterval: settingsStore.settings.pollingInterval,
      pollingMode: settingsStore.settings.pollingMode,
      pollingUnit: settingsStore.settings.pollingUnit,
      providerPollingOverridesEnabled: settingsStore.settings.providerPollingOverridesEnabled,
      providerPollingOverrides: settingsStore.settings.providerPollingOverrides,
    }),
    () => {
      if (shouldRun.value) {
        syncTimers();
      }
    },
  );

  watch(
    () => providerStore.providers
      .map((provider) => `${provider.providerId}:${provider.enabled}`)
      .join("|"),
    () => {
      if (shouldRun.value) {
        syncTimers();
      }
    },
  );

  onUnmounted(stop);

  return { isActive, start, stop };
}

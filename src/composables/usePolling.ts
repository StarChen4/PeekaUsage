import { useEffect, useRef, useState } from "react";
import type { ProviderId } from "../types/provider";
import {
  getEffectivePollingSettings,
  getPollingIntervalMs,
} from "../types/settings";
import { useProviderStore } from "../stores/providerStore";
import { useSettingsStore } from "../stores/settingsStore";

export function usePolling() {
  const [isActive, setIsActive] = useState(false);
  const shouldRunRef = useRef(false);
  const timersRef = useRef(new Map<ProviderId, ReturnType<typeof setInterval>>());
  // 只在启用的供应商集合变化时重建定时器；每次刷新都会替换 providers 数组，
  // 直接依赖它会不断重置计时，间隔长的供应商永远等不到触发。
  const enabledProviderKey = useProviderStore((state) =>
    state.providers
      .filter((provider) => provider.enabled)
      .map((provider) => provider.providerId)
      .join(","),
  );
  const settings = useSettingsStore((state) => state.settings);

  function clearTimer(providerId: ProviderId) {
    const timer = timersRef.current.get(providerId);
    if (timer) {
      clearInterval(timer);
      timersRef.current.delete(providerId);
    }
  }

  function clearAllTimers() {
    for (const providerId of timersRef.current.keys()) {
      clearTimer(providerId);
    }
  }

  function syncTimers() {
    clearAllTimers();

    if (!shouldRunRef.current) {
      setIsActive(false);
      return;
    }

    const enabledProviders = useProviderStore.getState().providers.filter((provider) => provider.enabled);
    const currentSettings = useSettingsStore.getState().settings;

    for (const provider of enabledProviders) {
      const pollingSettings = getEffectivePollingSettings(
        currentSettings,
        provider.providerId,
      );
      const intervalMs = getPollingIntervalMs(pollingSettings);

      if (intervalMs === null) {
        continue;
      }

      const providerId = provider.providerId;
      timersRef.current.set(
        providerId,
        setInterval(() => {
          void useProviderStore.getState().refreshProvider(providerId);
        }, intervalMs),
      );
    }

    setIsActive(timersRef.current.size > 0);
  }

  function start() {
    shouldRunRef.current = true;
    syncTimers();
  }

  function stop() {
    shouldRunRef.current = false;
    clearAllTimers();
    setIsActive(false);
  }

  useEffect(() => {
    if (shouldRunRef.current) {
      syncTimers();
    }
  }, [
    enabledProviderKey,
    settings.pollingInterval,
    settings.pollingMode,
    settings.pollingUnit,
    settings.providerPollingOverridesEnabled,
    settings.providerPollingOverrides,
  ]);

  useEffect(() => stop, []);

  return { isActive, start, stop };
}

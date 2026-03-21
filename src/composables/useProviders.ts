import { useEffect } from "react";
import type { ProviderId } from "../types/provider";
import { usePolling } from "./usePolling";
import { useProviderStore } from "../stores/providerStore";
import { useSettingsStore } from "../stores/settingsStore";

let hasInitializedProviders = false;

export function useProviders() {
  const providers = useProviderStore((state) => state.providers);
  const isRefreshing = useProviderStore((state) => state.isRefreshing);
  const refreshingProviders = useProviderStore((state) => state.refreshingProviders);
  const polling = usePolling();

  useEffect(() => {
    let active = true;

    void (async () => {
      await useSettingsStore.getState().loadSettings();

      if (!hasInitializedProviders) {
        await useProviderStore.getState().refreshAll();
        hasInitializedProviders = true;
      }

      if (active) {
        polling.start();
      }
    })();

    return () => {
      active = false;
      polling.stop();
    };
  }, []);

  async function manualRefresh() {
    await useProviderStore.getState().refreshAll();
  }

  async function manualRefreshProvider(providerId: ProviderId) {
    await useProviderStore.getState().refreshProvider(providerId);
  }

  return {
    providers,
    isRefreshing,
    refreshingProviders,
    polling,
    manualRefresh,
    manualRefreshProvider,
  };
}

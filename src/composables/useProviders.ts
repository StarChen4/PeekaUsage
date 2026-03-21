import { onMounted } from "vue";
import { useProviderStore } from "../stores/providerStore";
import { useSettingsStore } from "../stores/settingsStore";
import { usePolling } from "./usePolling";

let hasInitializedProviders = false;

export function useProviders() {
  const providerStore = useProviderStore();
  const settingsStore = useSettingsStore();
  const polling = usePolling();

  onMounted(async () => {
    await settingsStore.loadSettings();

    if (!hasInitializedProviders) {
      await providerStore.refreshAll();
      hasInitializedProviders = true;
    }

    polling.start();
  });

  async function manualRefresh() {
    await providerStore.refreshAll();
  }

  async function manualRefreshProvider(providerId: Parameters<typeof providerStore.refreshProvider>[0]) {
    await providerStore.refreshProvider(providerId);
  }

  return {
    providerStore,
    settingsStore,
    polling,
    manualRefresh,
    manualRefreshProvider,
  };
}

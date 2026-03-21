import { onMounted } from "vue";
import { useProviderStore } from "../stores/providerStore";
import { useSettingsStore } from "../stores/settingsStore";
import { usePolling } from "./usePolling";

export function useProviders() {
  const providerStore = useProviderStore();
  const settingsStore = useSettingsStore();
  const polling = usePolling();

  onMounted(async () => {
    await settingsStore.loadSettings();
    await providerStore.refreshAll();
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

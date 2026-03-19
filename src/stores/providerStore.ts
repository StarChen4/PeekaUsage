import { defineStore } from "pinia";
import { ref } from "vue";
import type { UsageSummary, ProviderId } from "../types/provider";
import { fetchAllUsage, fetchProviderUsage } from "../utils/ipc";

export const useProviderStore = defineStore("provider", () => {
  const providers = ref<UsageSummary[]>([]);
  const isRefreshing = ref(false);
  const lastError = ref<string | null>(null);

  /** 刷新所有供应商数据 */
  async function refreshAll() {
    if (isRefreshing.value) return;
    isRefreshing.value = true;
    lastError.value = null;
    try {
      providers.value = await fetchAllUsage();
    } catch (e: any) {
      lastError.value = e?.toString() ?? "未知错误";
    } finally {
      isRefreshing.value = false;
    }
  }

  /** 刷新单个供应商 */
  async function refreshProvider(providerId: ProviderId) {
    try {
      const updated = await fetchProviderUsage(providerId);
      const idx = providers.value.findIndex((p) => p.providerId === providerId);
      if (idx >= 0) {
        providers.value[idx] = updated;
      } else {
        providers.value.push(updated);
      }
    } catch (e: any) {
      lastError.value = e?.toString() ?? "未知错误";
    }
  }

  /** 获取已启用的供应商 */
  function enabledProviders() {
    return providers.value.filter((p) => p.enabled);
  }

  return {
    providers,
    isRefreshing,
    lastError,
    refreshAll,
    refreshProvider,
    enabledProviders,
  };
});

import { create } from "zustand";
import type { ProviderId, UsageSummary } from "../types/provider";
import { fetchAllUsage, fetchProviderUsage } from "../utils/ipc";

type ProviderStoreState = {
  providers: UsageSummary[];
  isRefreshing: boolean;
  refreshingProviders: Partial<Record<ProviderId, boolean>>;
  lastError: string | null;
  refreshAll: () => Promise<void>;
  refreshProvider: (providerId: ProviderId) => Promise<void>;
  isProviderRefreshing: (providerId: ProviderId) => boolean;
};

export const useProviderStore = create<ProviderStoreState>((set, get) => ({
  providers: [],
  isRefreshing: false,
  refreshingProviders: {},
  lastError: null,

  async refreshAll() {
    if (get().isRefreshing) {
      return;
    }

    set({
      isRefreshing: true,
      lastError: null,
    });

    try {
      const providers = await fetchAllUsage();
      set({
        providers,
        isRefreshing: false,
      });
    } catch (error: unknown) {
      set({
        isRefreshing: false,
        lastError: error instanceof Error ? error.toString() : "未知错误",
      });
    }
  },

  async refreshProvider(providerId: ProviderId) {
    const state = get();
    if (state.isRefreshing || state.refreshingProviders[providerId]) {
      return;
    }

    set({
      refreshingProviders: {
        ...state.refreshingProviders,
        [providerId]: true,
      },
    });

    try {
      const updated = await fetchProviderUsage(providerId);
      const nextProviders = [...get().providers];
      const index = nextProviders.findIndex((provider) => provider.providerId === providerId);

      if (index >= 0) {
        nextProviders[index] = updated;
      } else {
        nextProviders.push(updated);
      }

      set({
        providers: nextProviders,
      });
    } catch (error: unknown) {
      set({
        lastError: error instanceof Error ? error.toString() : "未知错误",
      });
    } finally {
      set((current) => ({
        refreshingProviders: {
          ...current.refreshingProviders,
          [providerId]: false,
        },
      }));
    }
  },

  isProviderRefreshing(providerId: ProviderId) {
    const state = get();
    return state.isRefreshing || !!state.refreshingProviders[providerId];
  },
}));

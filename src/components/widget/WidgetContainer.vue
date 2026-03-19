<script setup lang="ts">
import { useProviders } from "../../composables/useProviders";
import ProviderCard from "./ProviderCard.vue";
import OpacityHandle from "./OpacityHandle.vue";

defineEmits<{
  openSettings: [];
}>();

const { providerStore, manualRefresh } = useProviders();
</script>

<template>
  <div class="widget-container">
    <div class="card-list">
      <template v-if="providerStore.enabledProviders().length > 0">
        <ProviderCard
          v-for="provider in providerStore.enabledProviders()"
          :key="provider.providerId"
          :provider="provider"
        />
      </template>
      <div v-else class="empty-state">
        <p>暂无已启用的供应商</p>
        <button class="btn-link" @click="$emit('openSettings')">前往设置</button>
      </div>
    </div>

    <div class="widget-footer">
      <button
        class="icon-btn"
        :class="{ spinning: providerStore.isRefreshing }"
        @click="manualRefresh"
        :disabled="providerStore.isRefreshing"
        title="刷新数据"
      >
        🔄
      </button>
      <button class="icon-btn" @click="$emit('openSettings')" title="设置">
        ⚙
      </button>
    </div>

    <OpacityHandle />
  </div>
</template>

<style scoped>
.widget-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.card-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  color: var(--color-text-muted);
  font-size: 12px;
}

.btn-link {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 12px;
  text-decoration: underline;
}

.widget-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.icon-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--color-border);
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.icon-btn.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>

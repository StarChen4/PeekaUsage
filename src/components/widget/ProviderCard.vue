<script setup lang="ts">
import { computed } from "vue";
import type { UsageSummary } from "../../types/provider";
import { formatCurrency, calcUsagePercent } from "../../utils/formatters";
import UsageProgressBar from "./UsageProgressBar.vue";
import RateLimitBadge from "./RateLimitBadge.vue";

const props = defineProps<{
  provider: UsageSummary;
}>();

const usagePercent = computed(() => {
  if (!props.provider.usage) return 0;
  return calcUsagePercent(
    props.provider.usage.totalUsed,
    props.provider.usage.totalBudget
  );
});

</script>

<template>
  <div class="provider-card" :class="{ 'is-error': provider.status === 'error' }">
    <div class="card-header">
      <span class="provider-name">{{ provider.displayName }}</span>
      <span v-if="provider.status === 'loading'" class="status-loading">⟳</span>
      <span v-if="provider.usage" class="usage-amount">
        {{ formatCurrency(provider.usage.totalUsed, provider.usage.currency) }}
      </span>
    </div>

    <div v-if="provider.usage && provider.usage.totalBudget" class="card-body">
      <UsageProgressBar :percent="usagePercent" />
      <div class="balance-row">
        <span class="balance-label">余额:</span>
        <span class="balance-value">
          {{ formatCurrency(provider.usage.remaining ?? 0, provider.usage.currency) }}
        </span>
      </div>
    </div>

    <div v-if="provider.usage && !provider.usage.totalBudget" class="card-body">
      <div class="balance-row">
        <span class="balance-label">已用:</span>
        <span class="balance-value">
          {{ formatCurrency(provider.usage.totalUsed, provider.usage.currency) }}
        </span>
      </div>
    </div>

    <RateLimitBadge
      v-if="provider.rateLimit"
      :rate-limit="provider.rateLimit"
    />

    <div v-if="provider.status === 'error'" class="error-msg">
      {{ provider.errorMessage }}
    </div>
  </div>
</template>

<style scoped>
.provider-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  transition: border-color 0.2s;
}

.provider-card:hover {
  border-color: var(--color-border-hover);
}

.provider-card.is-error {
  border-color: rgba(239, 68, 68, 0.3);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.provider-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.status-loading {
  animation: spin 1s linear infinite;
  font-size: 14px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.usage-amount {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-primary-hover);
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.balance-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
}

.balance-label {
  color: var(--color-text-muted);
}

.balance-value {
  color: var(--color-text-secondary);
}

.error-msg {
  font-size: 10px;
  color: var(--color-danger);
  padding: 2px 0;
}
</style>

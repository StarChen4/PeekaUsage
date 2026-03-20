<script setup lang="ts">
import { computed } from "vue";
import type { UsageSummary } from "../../types/provider";
import { formatCurrency, calcUsagePercent } from "../../utils/formatters";
import UsageProgressBar from "./UsageProgressBar.vue";
import RateLimitBadge from "./RateLimitBadge.vue";
import SubscriptionBadge from "./SubscriptionBadge.vue";
import ProviderIcon from "../common/ProviderIcon.vue";

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

const hasSubscription = computed(() => !!props.provider.subscription);
const hasApiUsage = computed(() => !!props.provider.usage);
</script>

<template>
  <div class="provider-card" :class="{ 'is-error': provider.status === 'error' }">
    <div class="card-header">
      <div class="provider-title">
        <ProviderIcon :provider-id="provider.providerId" :size="20" />
        <span class="provider-name">{{ provider.displayName }}</span>
      </div>
      <span v-if="provider.status === 'loading'" class="status-loading">⟳</span>
    </div>

    <!-- 订阅用量 -->
    <SubscriptionBadge
      v-if="hasSubscription"
      :subscription="provider.subscription!"
    />

    <!-- 按量 API 用量 -->
    <div v-if="hasApiUsage" class="api-section">
      <div v-if="hasSubscription" class="api-label">按量 API</div>

      <div class="api-header">
        <span class="usage-amount">
          {{ formatCurrency(provider.usage!.totalUsed, provider.usage!.currency) }}
        </span>
        <span v-if="provider.usage!.remaining != null" class="balance-info">
          余额: {{ formatCurrency(provider.usage!.remaining!, provider.usage!.currency) }}
        </span>
      </div>

      <UsageProgressBar
        v-if="provider.usage!.totalBudget"
        :percent="usagePercent"
      />
    </div>

    <RateLimitBadge
      v-if="provider.rateLimit"
      :rate-limit="provider.rateLimit"
    />

    <div
      v-if="provider.status === 'error' && !hasSubscription && !hasApiUsage"
      class="error-msg"
    >
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
  gap: var(--spacing-sm);
}

.provider-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.provider-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.1;
}

.status-loading {
  animation: spin 1s linear infinite;
  font-size: 14px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.api-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding-top: var(--spacing-xs);
  border-top: 1px dashed var(--color-border);
}

.api-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.api-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.usage-amount {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-primary-hover);
}

.balance-info {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.error-msg {
  font-size: 10px;
  color: var(--color-danger);
  padding: 2px 0;
}
</style>

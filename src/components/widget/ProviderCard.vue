<script setup lang="ts">
import { computed } from "vue";
import type { ApiKeyUsageSummary, UsageSummary } from "../../types/provider";
import { calcUsagePercent, formatCurrency } from "../../utils/formatters";
import UsageProgressBar from "./UsageProgressBar.vue";
import RateLimitBadge from "./RateLimitBadge.vue";
import SubscriptionBadge from "./SubscriptionBadge.vue";
import ProviderIcon from "../common/ProviderIcon.vue";

const props = defineProps<{
  provider: UsageSummary;
  isRefreshing?: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

const hasSubscription = computed(() => !!props.provider.subscription);
const hasApiUsage = computed(() => props.provider.apiKeyUsages.length > 0);
const hasMultipleApiKeys = computed(() => props.provider.apiKeyUsages.length > 1);

function usagePercent(item: ApiKeyUsageSummary) {
  if (!item.usage) {
    return 0;
  }

  return calcUsagePercent(item.usage.totalUsed, item.usage.totalBudget);
}
</script>

<template>
  <div class="provider-card" :class="{ 'is-error': provider.status === 'error' }">
    <div class="card-header">
      <div class="provider-title">
        <ProviderIcon :provider-id="provider.providerId" :size="20" />
        <span class="provider-name">{{ provider.displayName }}</span>
      </div>
      <button
        class="refresh-btn"
        :class="{ 'is-spinning': isRefreshing }"
        :disabled="isRefreshing"
        type="button"
        title="刷新当前供应商"
        aria-label="刷新当前供应商"
        @pointerdown.stop
        @click.stop="emit('refresh')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M20 12a8 8 0 1 1-2.34-5.66"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-width="1.8"
          />
          <path
            d="M20 5.5v5h-5"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.8"
          />
        </svg>
      </button>
    </div>

    <SubscriptionBadge
      v-if="hasSubscription"
      :subscription="provider.subscription!"
    />

    <div v-if="hasApiUsage" class="api-section">
      <div class="api-header-block">
        <div v-if="hasSubscription" class="api-label">按量 API</div>
        <div v-if="provider.usage" class="api-total">
          <span class="api-total-label">{{ hasMultipleApiKeys ? "合计" : "当前" }}</span>
          <span class="usage-amount">
            {{ formatCurrency(provider.usage.totalUsed, provider.usage.currency) }}
          </span>
          <span v-if="provider.usage.remaining != null" class="balance-info">
            余额: {{ formatCurrency(provider.usage.remaining, provider.usage.currency) }}
          </span>
        </div>
      </div>

      <div
        v-for="item in provider.apiKeyUsages"
        :key="item.keyId"
        class="api-key-usage"
        :class="{ 'is-error': item.status === 'error' }"
      >
        <div class="api-key-header">
          <span class="api-key-name">{{ item.keyName }}</span>
          <span v-if="item.usage" class="api-key-amount">
            {{ formatCurrency(item.usage.totalUsed, item.usage.currency) }}
          </span>
        </div>

        <div v-if="item.usage" class="api-key-meta">
          <span v-if="item.usage.remaining != null" class="balance-info">
            余额: {{ formatCurrency(item.usage.remaining, item.usage.currency) }}
          </span>
        </div>

        <UsageProgressBar
          v-if="item.usage?.totalBudget"
          :percent="usagePercent(item)"
        />

        <div v-if="item.errorMessage" class="api-key-error">
          {{ item.errorMessage }}
        </div>

        <RateLimitBadge
          v-if="item.rateLimit && provider.apiKeyUsages.length === 1"
          :rate-limit="item.rateLimit"
        />
      </div>
    </div>

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

.refresh-btn {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.refresh-btn:hover {
  background: var(--color-ghost-bg-hover);
  border-color: var(--color-border);
  color: var(--color-text);
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.refresh-btn:focus-visible {
  outline: none;
  border-color: var(--color-primary-soft-border);
  box-shadow: 0 0 0 3px var(--color-primary-soft-bg);
}

.refresh-btn svg {
  width: 14px;
  height: 14px;
}

.refresh-btn.is-spinning svg {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.api-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding-top: var(--spacing-xs);
  border-top: 1px dashed var(--color-border);
}

.api-header-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.api-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.api-total {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.api-total-label {
  font-size: 10px;
  color: var(--color-text-muted);
}

.usage-amount,
.api-key-amount {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-primary-hover);
}

.balance-info {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.api-key-usage {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: var(--radius-sm);
  background: var(--color-usage-item-bg);
}

.api-key-usage.is-error {
  background: var(--color-usage-item-error-bg);
}

.api-key-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.api-key-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text);
}

.api-key-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.api-key-error,
.error-msg {
  font-size: 10px;
  color: var(--color-danger);
}
</style>

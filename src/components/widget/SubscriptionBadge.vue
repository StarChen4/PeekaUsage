<script setup lang="ts">
import { computed } from "vue";
import type { SubscriptionUsage } from "../../types/provider";
import UsageProgressBar from "./UsageProgressBar.vue";

const props = defineProps<{
  subscription: SubscriptionUsage;
}>();

const planLabel = computed(() => props.subscription.planName ?? "订阅");
</script>

<template>
  <div class="subscription-section">
    <div class="sub-header">
      <span class="sub-label">{{ planLabel }}</span>
      <span
        v-if="subscription.status === 'error'"
        class="sub-error"
        :title="subscription.errorMessage ?? ''"
      >⚠</span>
    </div>

    <div v-if="subscription.status === 'success' && subscription.windows.length > 0" class="sub-windows">
      <div
        v-for="(win, idx) in subscription.windows"
        :key="idx"
        class="sub-window"
      >
        <div class="window-header">
          <span class="window-label">{{ win.label }}</span>
          <span
            v-if="win.resetsAt"
            class="window-reset"
            :title="win.resetsAt"
          >
            {{ formatResetTime(win.resetsAt) }}
          </span>
        </div>
        <UsageProgressBar :percent="win.utilization" />
      </div>
    </div>

    <div v-if="subscription.status === 'error'" class="sub-error-msg">
      {{ subscription.errorMessage }}
    </div>
  </div>
</template>

<script lang="ts">
function formatResetTime(isoStr: string): string {
  const reset = new Date(isoStr);
  const now = Date.now();
  const diffMs = reset.getTime() - now;
  if (diffMs <= 0) return "即将重置";
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}分钟后重置`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时后重置`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}天后重置`;
}
</script>

<style scoped>
.subscription-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding-top: var(--spacing-xs);
  border-top: 1px dashed var(--color-border);
}

.sub-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sub-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-info);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.sub-error {
  font-size: 12px;
  color: var(--color-warning);
  cursor: help;
}

.sub-windows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sub-window {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.window-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.window-label {
  font-size: 10px;
  color: var(--color-text-secondary);
}

.window-reset {
  font-size: 9px;
  color: var(--color-text-muted);
}

.sub-error-msg {
  font-size: 9px;
  color: var(--color-danger);
}
</style>

<script setup lang="ts">
import type { RateLimitData } from "../../types/provider";
import { formatNumber } from "../../utils/formatters";

defineProps<{
  rateLimit: RateLimitData;
}>();
</script>

<template>
  <div class="rate-limit-badges">
    <span
      v-if="rateLimit.requestsPerMinute != null && rateLimit.requestsPerMinuteLimit != null"
      class="badge"
    >
      RPM: {{ rateLimit.requestsPerMinute }}/{{ rateLimit.requestsPerMinuteLimit }}
    </span>
    <span
      v-if="rateLimit.tokensPerMinute != null && rateLimit.tokensPerMinuteLimit != null"
      class="badge"
    >
      TPM: {{ formatNumber(rateLimit.tokensPerMinute) }}/{{ formatNumber(rateLimit.tokensPerMinuteLimit) }}
    </span>
  </div>
</template>

<style scoped>
.rate-limit-badges {
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

.badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}
</style>

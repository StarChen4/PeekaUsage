<script setup lang="ts">
import { computed } from "vue";
import { getUsageColor } from "../../utils/formatters";

const props = defineProps<{
  percent: number;
}>();

const barColor = computed(() => getUsageColor(props.percent));
const clampedPercent = computed(() => Math.max(0, Math.min(100, props.percent)));
</script>

<template>
  <div class="progress-container">
    <div class="progress-track">
      <div
        class="progress-fill"
        :style="{
          width: `${clampedPercent}%`,
          backgroundColor: barColor,
        }"
      ></div>
    </div>
    <span class="progress-label" :style="{ color: barColor }">
      {{ Math.round(clampedPercent) }}%
    </span>
  </div>
</template>

<style scoped>
.progress-container {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.progress-track {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s ease, background-color 0.3s ease;
}

.progress-label {
  font-size: 11px;
  font-weight: 600;
  min-width: 32px;
  text-align: right;
}
</style>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import type { ProviderConfigItem } from "../../types/provider";
import type { PollingInterval } from "../../types/settings";
import { useSettingsStore } from "../../stores/settingsStore";
import { getProviderConfigs } from "../../utils/ipc";
import ProviderConfig from "./ProviderConfig.vue";

defineEmits<{
  back: [];
}>();

const settingsStore = useSettingsStore();
const providerConfigs = ref<ProviderConfigItem[]>([]);

const pollingOptions: PollingInterval[] = [1, 2, 5, 10, 30];

onMounted(async () => {
  try {
    providerConfigs.value = await getProviderConfigs();
  } catch {
    // 加载失败时使用空列表
  }
});

async function onPollingChange(e: Event) {
  const val = parseInt((e.target as HTMLSelectElement).value) as PollingInterval;
  await settingsStore.saveSettings({ pollingInterval: val });
}

async function onAlwaysOnTopChange(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  await settingsStore.saveSettings({ alwaysOnTop: checked });
}

function onProviderSaved() {
  // 可以在此触发刷新
}
</script>

<template>
  <div class="settings-panel">
    <div class="settings-header">
      <button class="back-btn" @click="$emit('back')">← 返回</button>
      <span class="settings-title">设置</span>
    </div>

    <div class="settings-body">
      <section class="settings-section">
        <h3 class="section-title">通用</h3>
        <div class="setting-row">
          <label>轮询间隔</label>
          <select :value="settingsStore.settings.pollingInterval" @change="onPollingChange">
            <option v-for="opt in pollingOptions" :key="opt" :value="opt">
              {{ opt }} 分钟
            </option>
          </select>
        </div>
        <div class="setting-row">
          <label>始终置顶</label>
          <input
            type="checkbox"
            :checked="settingsStore.settings.alwaysOnTop"
            @change="onAlwaysOnTopChange"
          />
        </div>
      </section>

      <section class="settings-section">
        <h3 class="section-title">供应商</h3>
        <ProviderConfig
          v-for="config in providerConfigs"
          :key="config.providerId"
          :config="config"
          @saved="onProviderSaved"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.back-btn {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
}

.settings-title {
  font-size: 13px;
  font-weight: 600;
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.section-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-muted);
  font-weight: 600;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.setting-row select {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  border-radius: var(--radius-sm);
  padding: 3px 6px;
  font-size: 11px;
}

.setting-row input[type="checkbox"] {
  accent-color: var(--color-primary);
}
</style>

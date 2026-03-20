<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { ProviderConfigItem, ProviderId } from "../../types/provider";
import type { PollingInterval } from "../../types/settings";
import { useProviderStore } from "../../stores/providerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { getProviderConfigs, getSupportedProviders } from "../../utils/ipc";
import ProviderConfig from "./ProviderConfig.vue";

defineEmits<{
  back: [];
}>();

const settingsStore = useSettingsStore();
const providerStore = useProviderStore();
const providerConfigs = ref<ProviderConfigItem[]>([]);
const supportedProviders = ref<ProviderConfigItem[]>([]);
const creatingProviderId = ref<ProviderId | null>(null);

const pollingOptions: PollingInterval[] = [1, 2, 5, 10, 30];

const configuredProviderIds = computed(() => new Set(providerConfigs.value.map((item) => item.providerId)));
const availableProviders = computed(() => {
  return supportedProviders.value.filter((item) => !configuredProviderIds.value.has(item.providerId));
});

const draftProviderConfig = computed<ProviderConfigItem | null>(() => {
  if (!creatingProviderId.value) {
    return null;
  }

  const provider = availableProviders.value.find((item) => item.providerId === creatingProviderId.value);
  if (!provider) {
    return null;
  }

  return {
    ...provider,
    enabled: true,
    apiKeys: [
      {
        id: `${provider.providerId}-draft-key`,
        name: "密钥 1",
        value: "",
      },
    ],
    oauthToken: "",
  };
});

async function loadProviderData() {
  try {
    const [configs, supported] = await Promise.all([
      getProviderConfigs(),
      getSupportedProviders(),
    ]);

    providerConfigs.value = configs;
    supportedProviders.value = supported;

    if (creatingProviderId.value && !availableProviders.value.some((item) => item.providerId === creatingProviderId.value)) {
      creatingProviderId.value = availableProviders.value[0]?.providerId ?? null;
    }
  } catch {
    providerConfigs.value = [];
    supportedProviders.value = [];
  }
}

onMounted(loadProviderData);

async function onPollingChange(event: Event) {
  const value = parseInt((event.target as HTMLSelectElement).value, 10) as PollingInterval;
  await settingsStore.saveSettings({ pollingInterval: value });
}

async function reloadProviders() {
  await loadProviderData();
  await providerStore.refreshAll();
}

function startCreateProvider() {
  creatingProviderId.value = availableProviders.value[0]?.providerId ?? null;
}

function cancelCreateProvider() {
  creatingProviderId.value = null;
}

function isProviderExpanded(providerId: ProviderId) {
  return settingsStore.settings.providerCardExpanded[providerId] ?? true;
}

async function onProviderExpandedChange(providerId: ProviderId, expanded: boolean) {
  await settingsStore.saveSettings({
    providerCardExpanded: {
      ...settingsStore.settings.providerCardExpanded,
      [providerId]: expanded,
    },
  });
}

async function onProviderSaved() {
  creatingProviderId.value = null;
  await reloadProviders();
}

async function onProviderRemoved() {
  await reloadProviders();
}
</script>

<template>
  <div class="settings-panel">
    <div class="settings-header">
      <button class="back-btn" @click="$emit('back')">返回</button>
      <span class="settings-title">设置</span>
    </div>

    <div class="settings-body">
      <section class="settings-section">
        <h3 class="section-title">通用</h3>
        <div class="setting-row">
          <label>轮询间隔</label>
          <select :value="settingsStore.settings.pollingInterval" @change="onPollingChange">
            <option v-for="option in pollingOptions" :key="option" :value="option">
              {{ option }} 分钟
            </option>
          </select>
        </div>
      </section>

      <section class="settings-section">
        <div class="section-header">
          <h3 class="section-title">供应商</h3>
          <button
            v-if="!creatingProviderId && availableProviders.length > 0"
            class="add-provider-btn"
            type="button"
            @click="startCreateProvider"
          >
            +
          </button>
        </div>

        <ProviderConfig
          v-if="draftProviderConfig"
          :config="draftProviderConfig"
          :expanded="true"
          :mode="'create'"
          :selectable-providers="availableProviders"
          @provider-change="creatingProviderId = $event"
          @canceled="cancelCreateProvider"
          @saved="onProviderSaved"
        />

        <div v-if="providerConfigs.length === 0 && !draftProviderConfig" class="provider-empty-state">
          <span>还没有添加供应商，点击右上角的 + 开始配置。</span>
        </div>

        <ProviderConfig
          v-for="config in providerConfigs"
          :key="config.providerId"
          :config="config"
          :expanded="isProviderExpanded(config.providerId)"
          @expanded-change="onProviderExpandedChange(config.providerId, $event)"
          @saved="onProviderSaved"
          @removed="onProviderRemoved"
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

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  gap: var(--spacing-md);
  font-size: 12px;
}

.setting-row select {
  min-width: 108px;
  background: var(--color-input-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  border-radius: var(--radius-sm);
  padding: 3px 6px;
  font-size: 11px;
}

.add-provider-btn {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid var(--color-primary-soft-border);
  background: var(--color-primary-soft-bg);
  color: var(--color-primary-soft-text);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.provider-empty-state {
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: 16px;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-muted-surface);
}
</style>

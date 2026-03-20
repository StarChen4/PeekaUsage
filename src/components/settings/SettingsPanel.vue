<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { ProviderConfigItem, ProviderId } from "../../types/provider";
import type { PollingInterval } from "../../types/settings";
import { useWindowControls } from "../../composables/useWindowControls";
import { useProviderStore } from "../../stores/providerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { getProviderConfigs, getSupportedProviders } from "../../utils/ipc";
import AppSelect from "../common/AppSelect.vue";
import ProviderConfig from "./ProviderConfig.vue";

defineEmits<{
  back: [];
}>();

const settingsStore = useSettingsStore();
const providerStore = useProviderStore();
const { updateOpacity } = useWindowControls();
const providerConfigs = ref<ProviderConfigItem[]>([]);
const supportedProviders = ref<ProviderConfigItem[]>([]);
const creatingProviderId = ref<ProviderId | null>(null);
const opacityDraft = ref(settingsStore.settings.windowOpacity);

const pollingOptions: PollingInterval[] = [1, 2, 5, 10, 30];
const pollingSelectOptions = computed(() => {
  return pollingOptions.map((option) => ({
    value: option,
    label: `${option} 分钟`,
  }));
});

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

watch(() => settingsStore.settings.windowOpacity, (value) => {
  opacityDraft.value = value;
}, { immediate: true });

async function onPollingChange(value: PollingInterval) {
  await settingsStore.saveSettings({ pollingInterval: value });
}

function onOpacityInput(event: Event) {
  const value = parseInt((event.target as HTMLInputElement).value, 10);
  opacityDraft.value = value;
  void updateOpacity(value, false);
}

async function onOpacityChange(event: Event) {
  const value = parseInt((event.target as HTMLInputElement).value, 10);
  opacityDraft.value = value;
  await updateOpacity(value, true);
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
      <button
        class="back-btn"
        type="button"
        aria-label="返回"
        @click="$emit('back')"
      >
        <svg
          class="back-icon"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M9.5 3.5L5 8l4.5 4.5"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <span class="settings-title">设置</span>
    </div>

    <div class="settings-body">
      <section class="settings-section">
        <h3 class="section-title">通用</h3>
        <div class="setting-row">
          <label>轮询间隔</label>
          <AppSelect
            class="polling-select"
            :model-value="settingsStore.settings.pollingInterval"
            :options="pollingSelectOptions"
            aria-label="轮询间隔"
            @update:model-value="onPollingChange($event as PollingInterval)"
          />
        </div>
        <div class="setting-row setting-row-slider">
          <label for="window-opacity-range">透明度</label>
          <div class="opacity-control">
            <input
              id="window-opacity-range"
              class="opacity-range"
              type="range"
              min="10"
              max="100"
              step="1"
              :value="opacityDraft"
              @input="onOpacityInput"
              @change="onOpacityChange"
            />
            <span class="opacity-value">{{ opacityDraft }}%</span>
          </div>
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
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}

.back-btn:hover {
  background: var(--color-muted-surface);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

.back-btn:active {
  transform: translateX(-1px);
}

.back-btn:focus-visible {
  outline: none;
  border-color: var(--color-primary-soft-border);
  box-shadow: 0 0 0 3px var(--color-primary-soft-bg);
}

.back-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
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

.setting-row-slider {
  align-items: flex-start;
}

.polling-select {
  width: 112px;
  flex-shrink: 0;
}

.opacity-control {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.opacity-range {
  flex: 1;
  min-width: 0;
  height: 6px;
  appearance: none;
  border-radius: 999px;
  background: var(--color-progress-track);
  outline: none;
}

.opacity-range::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--color-primary-soft-bg), var(--color-primary));
}

.opacity-range::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -4px;
  border-radius: 999px;
  border: 1px solid var(--color-primary-soft-border);
  background: var(--color-surface-hover);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
  cursor: pointer;
}

.opacity-range::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  border: 0;
  background: linear-gradient(90deg, var(--color-primary-soft-bg), var(--color-primary));
}

.opacity-range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 1px solid var(--color-primary-soft-border);
  background: var(--color-surface-hover);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
  cursor: pointer;
}

.opacity-value {
  width: 42px;
  flex-shrink: 0;
  text-align: right;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
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

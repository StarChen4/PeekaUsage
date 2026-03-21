<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { ProviderConfigItem, ProviderId } from "../../types/provider";
import {
  MAX_POLLING_INTERVAL,
  MIN_POLLING_INTERVAL,
  getEffectivePollingSettings,
  normalizePollingInterval,
  type AppLanguage,
  type PollingSettings,
  type PollingMode,
  type PollingUnit,
} from "../../types/settings";
import { useWindowControls } from "../../composables/useWindowControls";
import { LANGUAGE_OPTIONS } from "../../i18n/messages";
import { useProviderStore } from "../../stores/providerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { getProviderConfigs, getSupportedProviders } from "../../utils/ipc";
import AppSelect from "../common/AppSelect.vue";
import ProviderIcon from "../common/ProviderIcon.vue";
import ProviderConfig from "./ProviderConfig.vue";

defineEmits<{
  back: [];
}>();

const settingsStore = useSettingsStore();
const providerStore = useProviderStore();
const { updateOpacity } = useWindowControls();
const { t } = useI18n();
const providerConfigs = ref<ProviderConfigItem[]>([]);
const supportedProviders = ref<ProviderConfigItem[]>([]);
const creatingProviderId = ref<ProviderId | null>(null);
const opacityDraft = ref(settingsStore.settings.windowOpacity);
const pollingIntervalDraft = ref(String(settingsStore.settings.pollingInterval));
const providerPollingIntervalDrafts = ref<Partial<Record<ProviderId, string>>>({});
const languageOptions = LANGUAGE_OPTIONS;
const pollingModeOptions = computed<Array<{ value: PollingMode; label: string }>>(() => [
  { value: "auto", label: t("settings.polling.auto") },
  { value: "manual", label: t("settings.polling.manual") },
]);
const pollingUnitOptions = computed<Array<{ value: PollingUnit; label: string }>>(() => [
  { value: "seconds", label: t("common.secondsShort") },
  { value: "minutes", label: t("common.minutesShort") },
]);

const configuredProviderIds = computed(() => new Set(providerConfigs.value.map((item) => item.providerId)));
const availableProviders = computed(() => {
  return supportedProviders.value.filter((item) => !configuredProviderIds.value.has(item.providerId));
});
const isManualPolling = computed(() => settingsStore.settings.pollingMode === "manual");
const configuredPollingProviders = computed(() => providerConfigs.value.filter((item) => item.enabled));

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
        name: t("settings.providerConfig.keyName", { index: 1 }),
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

    syncProviderPollingDrafts();
  } catch {
    providerConfigs.value = [];
    supportedProviders.value = [];
  }
}

onMounted(loadProviderData);

watch(() => settingsStore.settings.windowOpacity, (value) => {
  opacityDraft.value = value;
}, { immediate: true });

watch(() => settingsStore.settings.pollingInterval, (value) => {
  pollingIntervalDraft.value = String(value);
}, { immediate: true });

watch(
  () => JSON.stringify({
    providerConfigs: configuredPollingProviders.value.map((item) => item.providerId),
    providerPollingOverrides: settingsStore.settings.providerPollingOverrides,
    providerPollingOverridesEnabled: settingsStore.settings.providerPollingOverridesEnabled,
    pollingInterval: settingsStore.settings.pollingInterval,
    pollingMode: settingsStore.settings.pollingMode,
    pollingUnit: settingsStore.settings.pollingUnit,
  }),
  () => {
    syncProviderPollingDrafts();
  },
  { immediate: true },
);

async function onPollingModeChange(value: PollingMode) {
  await settingsStore.saveSettings({ pollingMode: value });
}

async function onLanguageChange(value: AppLanguage) {
  await settingsStore.saveSettings({ language: value });
}

async function onPollingUnitChange(value: PollingUnit) {
  await settingsStore.saveSettings({ pollingUnit: value });
}

async function onProviderPollingOverridesEnabledChange(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  await settingsStore.saveSettings({ providerPollingOverridesEnabled: checked });
}

async function onRefreshOnSettingsCloseChange(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  await settingsStore.saveSettings({ refreshOnSettingsClose: checked });
}

function onPollingIntervalInput(event: Event) {
  pollingIntervalDraft.value = (event.target as HTMLInputElement).value;
}

async function commitPollingInterval() {
  const parsed = Number.parseInt(pollingIntervalDraft.value, 10);
  const nextValue = normalizePollingInterval(
    Number.isNaN(parsed) ? settingsStore.settings.pollingInterval : parsed,
  );

  pollingIntervalDraft.value = String(nextValue);

  if (nextValue === settingsStore.settings.pollingInterval) {
    return;
  }

  await settingsStore.saveSettings({ pollingInterval: nextValue });
}

function onPollingIntervalKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    (event.target as HTMLInputElement).blur();
  }
}

function getProviderPollingSettings(providerId: ProviderId): PollingSettings {
  return getEffectivePollingSettings(settingsStore.settings, providerId);
}

function syncProviderPollingDrafts() {
  const nextDrafts: Partial<Record<ProviderId, string>> = {};

  for (const item of configuredPollingProviders.value) {
    nextDrafts[item.providerId] = String(getProviderPollingSettings(item.providerId).pollingInterval);
  }

  providerPollingIntervalDrafts.value = nextDrafts;
}

async function saveProviderPollingSettings(
  providerId: ProviderId,
  nextSettings: Partial<PollingSettings>,
) {
  const current = getProviderPollingSettings(providerId);
  await settingsStore.saveSettings({
    providerPollingOverrides: {
      ...settingsStore.settings.providerPollingOverrides,
      [providerId]: {
        ...current,
        ...nextSettings,
      },
    },
  });
}

async function onProviderPollingModeChange(providerId: ProviderId, value: PollingMode) {
  await saveProviderPollingSettings(providerId, { pollingMode: value });
}

async function onProviderPollingUnitChange(providerId: ProviderId, value: PollingUnit) {
  await saveProviderPollingSettings(providerId, { pollingUnit: value });
}

function onProviderPollingIntervalInput(providerId: ProviderId, event: Event) {
  providerPollingIntervalDrafts.value = {
    ...providerPollingIntervalDrafts.value,
    [providerId]: (event.target as HTMLInputElement).value,
  };
}

async function commitProviderPollingInterval(providerId: ProviderId) {
  const rawValue = providerPollingIntervalDrafts.value[providerId] ?? "";
  const current = getProviderPollingSettings(providerId);
  const parsed = Number.parseInt(rawValue, 10);
  const nextValue = normalizePollingInterval(
    Number.isNaN(parsed) ? current.pollingInterval : parsed,
  );

  providerPollingIntervalDrafts.value = {
    ...providerPollingIntervalDrafts.value,
    [providerId]: String(nextValue),
  };

  if (nextValue === current.pollingInterval) {
    return;
  }

  await saveProviderPollingSettings(providerId, { pollingInterval: nextValue });
}

function onProviderPollingIntervalKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    (event.target as HTMLInputElement).blur();
  }
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
        :aria-label="t('common.back')"
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
      <span class="settings-title">{{ t("settings.title") }}</span>
    </div>

    <div class="settings-body">
      <section class="settings-section">
        <h3 class="section-title">{{ t("settings.sections.general") }}</h3>
        <div class="setting-row">
          <label>{{ t("settings.language.label") }}</label>
          <div class="setting-select-wrap">
            <AppSelect
              :model-value="settingsStore.settings.language"
              :options="languageOptions"
              :aria-label="t('settings.language.ariaLabel')"
              @update:model-value="onLanguageChange($event as AppLanguage)"
            />
          </div>
        </div>
        <div class="setting-row setting-row-polling">
          <label>{{ t("settings.polling.label") }}</label>
          <div class="polling-control">
            <div class="polling-segment" role="group" :aria-label="t('settings.polling.modeAriaLabel')">
              <button
                v-for="option in pollingModeOptions"
                :key="option.value"
                class="polling-segment-button"
                :class="{ 'is-active': settingsStore.settings.pollingMode === option.value }"
                type="button"
                :aria-pressed="settingsStore.settings.pollingMode === option.value"
                @click="onPollingModeChange(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
            <div v-if="!isManualPolling" class="polling-auto-inline">
              <input
                class="polling-interval-input"
                type="number"
                inputmode="numeric"
                :min="MIN_POLLING_INTERVAL"
                :max="MAX_POLLING_INTERVAL"
                :value="pollingIntervalDraft"
                :aria-label="t('settings.polling.intervalAriaLabel')"
                @input="onPollingIntervalInput"
                @blur="commitPollingInterval"
                @keydown="onPollingIntervalKeydown"
              />
              <div class="polling-segment polling-unit-segment" role="group" :aria-label="t('settings.polling.unitAriaLabel')">
                <button
                  v-for="option in pollingUnitOptions"
                  :key="option.value"
                  class="polling-segment-button"
                  :class="{ 'is-active': settingsStore.settings.pollingUnit === option.value }"
                  type="button"
                  :aria-pressed="settingsStore.settings.pollingUnit === option.value"
                  @click="onPollingUnitChange(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="setting-row setting-row-slider">
          <label for="window-opacity-range">{{ t("settings.opacity.label") }}</label>
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
        <label class="setting-row setting-row-toggle">
          <span class="setting-copy">
            <span class="setting-label">{{ t("settings.refreshOnBack.label") }}</span>
            <span class="setting-hint">{{ t("settings.refreshOnBack.hint") }}</span>
          </span>
          <span class="switch">
            <input
              class="switch-input"
              type="checkbox"
              :checked="settingsStore.settings.refreshOnSettingsClose"
              @change="onRefreshOnSettingsCloseChange"
            >
            <span class="switch-track" />
          </span>
        </label>
      </section>

      <section class="settings-section">
        <div class="section-header">
          <h3 class="section-title">{{ t("settings.sections.providers") }}</h3>
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
          <span>{{ t("settings.providersSection.empty") }}</span>
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

      <section class="settings-section">
        <div class="section-header">
          <h3 class="section-title">{{ t("settings.sections.advanced") }}</h3>
        </div>

        <label class="advanced-toggle">
          <span class="advanced-toggle-copy">
            <span class="advanced-toggle-title">{{ t("settings.advancedSection.title") }}</span>
            <span class="advanced-toggle-hint">{{ t("settings.advancedSection.hint") }}</span>
          </span>
          <span class="switch">
            <input
              class="switch-input"
              type="checkbox"
              :checked="settingsStore.settings.providerPollingOverridesEnabled"
              @change="onProviderPollingOverridesEnabledChange"
            >
            <span class="switch-track" />
          </span>
        </label>

        <div
          v-if="settingsStore.settings.providerPollingOverridesEnabled && configuredPollingProviders.length === 0"
          class="provider-empty-state"
        >
          <span>{{ t("settings.advancedSection.empty") }}</span>
        </div>

        <div
          v-if="settingsStore.settings.providerPollingOverridesEnabled && configuredPollingProviders.length > 0"
          class="provider-polling-list"
        >
          <div
            v-for="config in configuredPollingProviders"
            :key="config.providerId"
            class="provider-polling-item"
          >
            <div class="provider-polling-meta">
              <ProviderIcon :provider-id="config.providerId" :size="16" />
              <span class="provider-polling-name">{{ config.displayName }}</span>
            </div>
            <div class="polling-control polling-control-compact">
              <div class="polling-segment polling-segment-compact" role="group" :aria-label="`${config.displayName} ${t('settings.polling.modeAriaLabel')}`">
                <button
                  v-for="option in pollingModeOptions"
                  :key="option.value"
                  class="polling-segment-button polling-segment-button-compact"
                  :class="{ 'is-active': getProviderPollingSettings(config.providerId).pollingMode === option.value }"
                  type="button"
                  :aria-pressed="getProviderPollingSettings(config.providerId).pollingMode === option.value"
                  @click="onProviderPollingModeChange(config.providerId, option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
              <div
                v-if="getProviderPollingSettings(config.providerId).pollingMode !== 'manual'"
                class="polling-auto-inline polling-auto-inline-compact"
              >
                <input
                  class="polling-interval-input polling-interval-input-compact"
                  type="number"
                  inputmode="numeric"
                  :min="MIN_POLLING_INTERVAL"
                  :max="MAX_POLLING_INTERVAL"
                  :value="providerPollingIntervalDrafts[config.providerId] ?? String(getProviderPollingSettings(config.providerId).pollingInterval)"
                  :aria-label="`${config.displayName} ${t('settings.polling.intervalAriaLabel')}`"
                  @input="onProviderPollingIntervalInput(config.providerId, $event)"
                  @blur="commitProviderPollingInterval(config.providerId)"
                  @keydown="onProviderPollingIntervalKeydown($event)"
                />
                <div class="polling-segment polling-unit-segment polling-segment-compact" role="group" :aria-label="`${config.displayName} ${t('settings.polling.unitAriaLabel')}`">
                  <button
                    v-for="option in pollingUnitOptions"
                    :key="option.value"
                    class="polling-segment-button polling-segment-button-compact"
                    :class="{ 'is-active': getProviderPollingSettings(config.providerId).pollingUnit === option.value }"
                    type="button"
                    :aria-pressed="getProviderPollingSettings(config.providerId).pollingUnit === option.value"
                    @click="onProviderPollingUnitChange(config.providerId, option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
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

.setting-select-wrap {
  width: min(168px, 100%);
  flex-shrink: 0;
}

.setting-row-polling {
  align-items: flex-start;
}

.setting-row-slider {
  align-items: flex-start;
}

.setting-row-toggle {
  align-items: flex-start;
}

.setting-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.setting-label {
  color: var(--color-text);
}

.setting-hint {
  font-size: 10px;
  line-height: 1.3;
  color: var(--color-text-secondary);
}

.advanced-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.advanced-toggle-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.advanced-toggle-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
}

.advanced-toggle-hint {
  font-size: 10px;
  line-height: 1.3;
  color: var(--color-text-secondary);
}

.switch {
  position: relative;
  flex-shrink: 0;
  width: 34px;
  height: 20px;
}

.switch-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  margin: 0;
  cursor: pointer;
}

.switch-track {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--color-progress-track);
  border: 1px solid var(--color-border);
  transition: background 0.18s ease, border-color 0.18s ease;
}

.switch-track::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: var(--color-surface);
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.18);
  transition: transform 0.18s ease;
}

.switch-input:checked + .switch-track {
  background: var(--color-primary-soft-bg);
  border-color: var(--color-primary-soft-border);
}

.switch-input:checked + .switch-track::after {
  transform: translateX(14px);
}

.switch-input:focus-visible + .switch-track {
  box-shadow: 0 0 0 3px var(--color-primary-soft-bg);
}

.polling-control {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.polling-auto-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  min-width: 0;
}

.provider-polling-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.provider-polling-item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.provider-polling-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.provider-polling-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
}

.provider-polling-item .polling-control {
  justify-content: flex-start;
}

.polling-control-compact {
  gap: 4px;
}

.polling-segment {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border: 1px solid var(--color-border);
  border-radius: calc(var(--radius-sm) + 2px);
  background: linear-gradient(180deg, var(--color-surface-hover), var(--color-surface));
  flex-shrink: 0;
}

.polling-unit-segment {
  min-width: 0;
}

.polling-segment-compact {
  padding: 1px;
  border-radius: var(--radius-sm);
  background: var(--color-ghost-bg);
}

.polling-segment-button {
  min-width: 38px;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.polling-segment-button-compact {
  min-width: 34px;
  height: 24px;
  padding: 0 8px;
  font-size: 10px;
}

.polling-segment-button:hover {
  color: var(--color-text);
}

.polling-segment-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--color-primary-soft-bg);
}

.polling-segment-button.is-active {
  background: var(--color-primary-soft-bg);
  color: var(--color-primary-soft-text);
}

.polling-interval-input {
  appearance: textfield;
  width: 56px;
  min-height: 28px;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: linear-gradient(180deg, var(--color-surface-hover), var(--color-surface));
  color: var(--color-text);
  font-size: 11px;
  line-height: 1.4;
  text-align: center;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.polling-auto-inline-compact {
  gap: 4px;
}

.polling-interval-input-compact {
  width: 44px;
  min-height: 24px;
  padding: 2px 6px;
  font-size: 10px;
}

.polling-interval-input:hover {
  border-color: var(--color-border-hover);
}

.polling-interval-input:focus-visible {
  outline: none;
  border-color: var(--color-primary-soft-border);
  box-shadow: 0 0 0 3px var(--color-primary-soft-bg);
}

.polling-interval-input::-webkit-outer-spin-button,
.polling-interval-input::-webkit-inner-spin-button {
  margin: 0;
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

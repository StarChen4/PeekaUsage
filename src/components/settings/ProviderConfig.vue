<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { ProviderApiKeyItem, ProviderConfigItem, ProviderId } from "../../types/provider";
import ApiKeyInput from "./ApiKeyInput.vue";
import {
  detectOAuthTokens,
  removeProviderConfig,
  saveProviderConfig,
  validateApiKey,
} from "../../utils/ipc";
import AppSelect from "../common/AppSelect.vue";
import ConfirmDialog from "../common/ConfirmDialog.vue";
import ProviderIcon from "../common/ProviderIcon.vue";

const props = withDefaults(defineProps<{
  config: ProviderConfigItem;
  expanded: boolean;
  mode?: "edit" | "create";
  selectableProviders?: ProviderConfigItem[];
}>(), {
  mode: "edit",
  selectableProviders: () => [],
});

const emit = defineEmits<{
  saved: [];
  canceled: [];
  removed: [];
  "expanded-change": [expanded: boolean];
  "provider-change": [providerId: ProviderId];
}>();

const apiKeys = ref<ProviderApiKeyItem[]>([]);
const oauthToken = ref("");
const validatingKeyId = ref<string | null>(null);
const validationResults = ref<Record<string, boolean | null>>({});
const detecting = ref(false);
const detectResult = ref<string | null>(null);
const saving = ref(false);
const removing = ref(false);
const showRemoveDialog = ref(false);
const saveResult = ref<{ type: "success" | "error"; message: string } | null>(null);
const { t } = useI18n();

let syncingFromProps = false;
let keepSaveResultOnNextSync = false;

const isCreateMode = computed(() => props.mode === "create");
const selectedProvider = computed(() => {
  if (isCreateMode.value) {
    return props.selectableProviders.find((item) => item.providerId === props.config.providerId) ?? props.config;
  }
  return props.config;
});
const selectableProviderOptions = computed(() => {
  return props.selectableProviders.map((item) => ({
    value: item.providerId,
    label: item.displayName,
    providerId: item.providerId,
  }));
});

const canDetectOAuth = computed(() => selectedProvider.value.capabilities.hasSubscription);
const hasAnyCredential = computed(() => {
  return sanitizedApiKeys(apiKeys.value).length > 0 || oauthToken.value.trim().length > 0;
});

const hasChanges = computed(() => {
  const current = JSON.stringify({
    apiKeys: sanitizedApiKeys(apiKeys.value),
    oauthToken: oauthToken.value.trim(),
  });
  const original = JSON.stringify({
    apiKeys: sanitizedApiKeys(props.config.apiKeys),
    oauthToken: props.config.oauthToken.trim(),
  });

  return current !== original;
});

const saveButtonLabel = computed(() => {
  if (saving.value) {
    return isCreateMode.value ? t("settings.providerConfig.adding") : t("common.saving");
  }

  if (!isCreateMode.value && saveResult.value?.type === "success" && !hasChanges.value) {
    return t("common.saved");
  }

  return isCreateMode.value ? t("settings.providerConfig.addConfirm") : t("common.save");
});

function defaultKeyName(index: number) {
  return t("settings.providerConfig.keyName", { index: index + 1 });
}

function createKeyId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function createEmptyApiKey(index: number): ProviderApiKeyItem {
  return {
    id: createKeyId(),
    name: defaultKeyName(index),
    value: "",
  };
}

function cloneApiKeys(source: ProviderApiKeyItem[]) {
  if (source.length === 0) {
    return [createEmptyApiKey(0)];
  }

  return source.map((item, index) => ({
    id: item.id || createKeyId(),
    name: item.name || defaultKeyName(index),
    value: item.value,
  }));
}

function sanitizedApiKeys(items: ProviderApiKeyItem[]) {
  return items
    .map((item, index) => ({
      id: item.id,
      name: item.name.trim() || defaultKeyName(index),
      value: item.value.trim(),
    }))
    .filter((item) => item.value.length > 0);
}

function clearTransientState() {
  validatingKeyId.value = null;
  validationResults.value = {};
  detecting.value = false;
  detectResult.value = null;
  showRemoveDialog.value = false;
}

function clearSaveResult() {
  saveResult.value = null;
}

function setSaveResult(type: "success" | "error", message: string) {
  saveResult.value = { type, message };
}

function toggleExpanded() {
  emit("expanded-change", !props.expanded);
}

function addApiKey() {
  apiKeys.value = [...apiKeys.value, createEmptyApiKey(apiKeys.value.length)];
  clearSaveResult();
}

function removeApiKey(index: number) {
  if (apiKeys.value.length === 1) {
    apiKeys.value = [createEmptyApiKey(0)];
  } else {
    apiKeys.value = apiKeys.value.filter((_, currentIndex) => currentIndex !== index);
  }
  clearSaveResult();
}

function updateProvider(providerId: ProviderId) {
  emit("provider-change", providerId);
}

function getOptionProviderId(option: { value: string | number }) {
  return option.value as ProviderId;
}

watch(
  () => props.config,
  (config) => {
    syncingFromProps = true;
    apiKeys.value = cloneApiKeys(config.apiKeys);
    oauthToken.value = config.oauthToken;
    syncingFromProps = false;

    clearTransientState();

    if (keepSaveResultOnNextSync) {
      keepSaveResultOnNextSync = false;
      return;
    }

    clearSaveResult();
  },
  { deep: true, immediate: true }
);

watch([apiKeys, oauthToken], () => {
  if (syncingFromProps) {
    return;
  }

  clearTransientState();
  clearSaveResult();
}, { deep: true });

async function onValidate(index: number) {
  const target = apiKeys.value[index];
  const value = target?.value.trim();
  if (!target || !value || value.includes("...")) {
    return;
  }

  validatingKeyId.value = target.id;
  validationResults.value[target.id] = null;

  try {
    validationResults.value[target.id] = await validateApiKey(props.config.providerId, value);
  } catch {
    validationResults.value[target.id] = false;
  } finally {
    validatingKeyId.value = null;
  }
}

async function onDetectToken() {
  if (!canDetectOAuth.value) {
    return;
  }

  detecting.value = true;
  detectResult.value = null;

  try {
    const tokens = await detectOAuthTokens();
    const found = props.config.providerId === "anthropic" ? tokens.anthropic : tokens.openai;

    if (found) {
      oauthToken.value = found.token;
      const subscriptionType = found.subscriptionType
        ? t("settings.providerConfig.detectedTokenType", { subscriptionType: found.subscriptionType })
        : "";
      detectResult.value = t("settings.providerConfig.detectedToken", {
        source: found.source,
        subscriptionType,
      });
    } else {
      detectResult.value = t("settings.providerConfig.tokenNotFound");
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    detectResult.value = t("settings.providerConfig.detectFailed", { message });
  } finally {
    detecting.value = false;
  }
}

async function onSave() {
  if (saving.value || !hasAnyCredential.value) {
    return;
  }

  if (!isCreateMode.value && !hasChanges.value) {
    return;
  }

  saving.value = true;
  clearSaveResult();

  try {
    await saveProviderConfig({
      providerId: props.config.providerId,
      apiKeys: sanitizedApiKeys(apiKeys.value),
      oauthToken: oauthToken.value.trim(),
      enabled: true,
    });

    if (isCreateMode.value) {
      emit("saved");
      return;
    }

    keepSaveResultOnNextSync = true;
    setSaveResult("success", t("settings.providerConfig.saveSuccess"));
    emit("saved");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    setSaveResult("error", t("settings.providerConfig.saveFailed", { message }));
  } finally {
    saving.value = false;
  }
}

function openRemoveDialog() {
  if (removing.value) {
    return;
  }

  showRemoveDialog.value = true;
}

function cancelRemove() {
  if (removing.value) {
    return;
  }

  showRemoveDialog.value = false;
}

async function confirmRemove() {
  if (removing.value) {
    return;
  }

  removing.value = true;
  showRemoveDialog.value = false;
  clearSaveResult();

  try {
    await removeProviderConfig(props.config.providerId);
    emit("removed");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    setSaveResult("error", t("settings.providerConfig.removeFailed", { message }));
  } finally {
    removing.value = false;
  }
}
</script>

<template>
  <div class="provider-config" :class="{ 'is-create': isCreateMode }">
    <div class="config-header">
      <template v-if="isCreateMode">
        <div class="provider-select-wrap">
          <label class="field-label">{{ t("settings.providerConfig.selectProvider") }}</label>
          <AppSelect
            class="provider-select"
            :model-value="config.providerId"
            :options="selectableProviderOptions"
            :aria-label="t('settings.providerConfig.selectProvider')"
            :placeholder="t('settings.providerConfig.selectProvider')"
            @update:model-value="updateProvider($event as ProviderId)"
          >
            <template #selected="{ option }">
              <span class="provider-select-value" :class="{ 'is-placeholder': !option }">
                <template v-if="option">
                  <ProviderIcon :provider-id="getOptionProviderId(option)" :size="18" />
                  <span class="provider-select-text">{{ option.label }}</span>
                </template>
                <template v-else>
                  <span class="provider-select-text">{{ t("settings.providerConfig.selectProvider") }}</span>
                </template>
              </span>
            </template>

            <template #option="{ option }">
              <span class="provider-select-value">
                <ProviderIcon :provider-id="getOptionProviderId(option)" :size="18" />
                <span class="provider-select-text">{{ option.label }}</span>
              </span>
            </template>
          </AppSelect>
        </div>
      </template>

      <template v-else>
        <div class="provider-title">
          <ProviderIcon :provider-id="config.providerId" :size="20" />
          <span class="provider-name">{{ config.displayName }}</span>
        </div>

        <button
          class="collapse-toggle"
          type="button"
          :aria-expanded="expanded"
          :aria-label="expanded ? t('settings.providerConfig.collapse') : t('settings.providerConfig.expand')"
          @click="toggleExpanded"
        >
          <svg
            class="collapse-icon"
            :class="{ 'is-expanded': expanded }"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path d="M2.5 4.5L6 8L9.5 4.5" />
          </svg>
        </button>
      </template>
    </div>

    <div v-show="isCreateMode || expanded" class="config-body">
      <div class="field-group">
        <div class="field-row">
          <label class="field-label">{{ t("settings.providerConfig.apiKeyLabel") }}</label>
          <button class="btn btn-sm btn-secondary" type="button" @click="addApiKey">
            {{ t("settings.providerConfig.addKey") }}
          </button>
        </div>

        <div v-for="(item, index) in apiKeys" :key="item.id" class="api-key-card">
          <div class="api-key-header">
            <input
              v-model="item.name"
              class="key-name-input"
              type="text"
              :placeholder="t('settings.providerConfig.keyName', { index: index + 1 })"
            />
            <button class="btn btn-sm btn-ghost" type="button" @click="removeApiKey(index)">
              {{ t("settings.providerConfig.deleteKey") }}
            </button>
          </div>

          <ApiKeyInput v-model="item.value" placeholder="sk-..." />

          <div class="config-actions">
            <button
              class="btn btn-sm"
              :disabled="validatingKeyId === item.id || !item.value.trim() || item.value.includes('...')"
              type="button"
              @click="onValidate(index)"
            >
              {{ validatingKeyId === item.id ? t("settings.providerConfig.validating") : t("settings.providerConfig.validate") }}
            </button>
            <span v-if="validationResults[item.id] === true" class="valid-mark">{{ t("settings.providerConfig.valid") }}</span>
            <span v-else-if="validationResults[item.id] === false" class="invalid-mark">{{ t("settings.providerConfig.invalid") }}</span>
          </div>
        </div>
      </div>

      <div v-if="canDetectOAuth" class="field-group">
        <label class="field-label">{{ t("settings.providerConfig.oauthTokenLabel") }}</label>
        <ApiKeyInput
          v-model="oauthToken"
          :placeholder="config.providerId === 'anthropic' ? 'sk-ant-oat01-...' : 'eyJ...'"
        />
        <div class="config-actions">
          <button class="btn btn-sm btn-detect" :disabled="detecting" type="button" @click="onDetectToken">
            {{ detecting ? t("settings.providerConfig.detecting") : t("settings.providerConfig.detect") }}
          </button>
        </div>
        <div v-if="detectResult" class="detect-result">{{ detectResult }}</div>
        <div class="field-hint">
          <template v-if="config.providerId === 'anthropic'">
            {{ t("settings.providerConfig.detectAnthropicHintAuto") }} <code>~/.claude/.credentials.json</code><br />
            {{ t("settings.providerConfig.detectAnthropicHintManual") }} <code>accessToken</code>
          </template>
          <template v-else>
            {{ t("settings.providerConfig.detectOpenAIHintAuto") }} <code>~/.codex/auth.json</code><br />
            {{ t("settings.providerConfig.detectOpenAIHintManual", { command: "codex --login" }) }} <code>access_token</code>
          </template>
        </div>
      </div>

      <div v-if="!hasAnyCredential" class="field-hint">
        {{ t("settings.providerConfig.credentialHint") }}
      </div>

      <div
        v-if="saveResult"
        class="save-result"
        :class="saveResult.type === 'success' ? 'is-success' : 'is-error'"
      >
        {{ saveResult.message }}
      </div>

      <div class="footer-actions">
        <template v-if="isCreateMode">
          <button class="btn btn-sm btn-secondary" type="button" @click="$emit('canceled')">
            {{ t("common.cancel") }}
          </button>
          <button
            class="btn btn-sm btn-primary"
            :disabled="saving || !hasAnyCredential"
            type="button"
            @click="onSave"
          >
            {{ saveButtonLabel }}
          </button>
        </template>

        <template v-else>
          <button
            class="btn btn-sm btn-danger"
            :disabled="saving || removing"
            type="button"
            @click="openRemoveDialog"
          >
            {{ removing ? t("common.removing") : t("common.remove") }}
          </button>
          <button
            class="btn btn-sm btn-primary"
            :class="{ 'is-saved': saveResult?.type === 'success' && !hasChanges }"
            :disabled="saving || !hasChanges || !hasAnyCredential"
            type="button"
            @click="onSave"
          >
            {{ saveButtonLabel }}
          </button>
        </template>
      </div>
    </div>
    <ConfirmDialog
      :open="showRemoveDialog"
      :busy="removing"
      :message="t('settings.providerConfig.removeConfirmMessage', { providerName: props.config.displayName })"
      :aria-label="t('settings.providerConfig.removeConfirmAria')"
      :confirm-label="t('common.remove')"
      :cancel-label="t('common.cancel')"
      variant="danger"
      @cancel="cancelRemove"
      @confirm="confirmRemove"
    />
  </div>
</template>

<style scoped>
.provider-config {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.provider-config.is-create {
  border-style: dashed;
}

.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.provider-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.provider-name {
  font-weight: 600;
  line-height: 1.1;
}

.provider-select-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  width: 100%;
}

.provider-select {
  width: 100%;
}

.provider-select-value {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.provider-select-value.is-placeholder {
  color: var(--color-text-muted);
}

.provider-select-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.config-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.api-key-card {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm);
  border: 1px solid var(--color-muted-surface-border);
  border-radius: var(--radius-sm);
  background: var(--color-muted-surface);
}

.api-key-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.key-name-input {
  flex: 1;
  min-width: 0;
  background: var(--color-input-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  font-size: 12px;
}

.config-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.field-hint {
  font-size: 10px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.field-hint code {
  background: var(--color-ghost-bg);
  padding: 0 3px;
  border-radius: 2px;
  font-size: 10px;
}

.detect-result {
  font-size: 10px;
  color: var(--color-text-secondary);
}

.save-result {
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-size: 11px;
}

.save-result.is-success {
  background: var(--color-success-soft-bg);
  color: var(--color-success-soft-text);
  border: 1px solid var(--color-success-soft-border);
}

.save-result.is-error {
  background: var(--color-danger-soft-bg);
  color: var(--color-danger-soft-text);
  border: 1px solid var(--color-danger-soft-border);
}

.valid-mark {
  font-size: 11px;
  color: var(--color-success);
}

.invalid-mark {
  font-size: 11px;
  color: var(--color-danger);
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
}

.collapse-toggle {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-ghost-bg);
  color: var(--color-text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.collapse-toggle:hover {
  background: var(--color-ghost-bg-hover);
  color: var(--color-text);
}

.collapse-icon {
  width: 12px;
  height: 12px;
}

.collapse-icon path {
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.collapse-icon.is-expanded {
  transform: rotate(180deg);
  transform-origin: center;
}

.btn {
  border: 1px solid var(--color-border);
  background: var(--color-ghost-bg);
  color: var(--color-text);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-sm {
  padding: 6px 10px;
  font-size: 11px;
}

.btn-primary {
  background: var(--color-primary-soft-bg);
  border-color: var(--color-primary-soft-border);
  color: var(--color-primary-soft-text);
}

.btn-secondary {
  background: var(--color-ghost-bg);
}

.btn-danger {
  background: var(--color-danger-soft-bg);
  border-color: var(--color-danger-soft-border);
  color: var(--color-danger-soft-text);
}

.btn-ghost {
  background: transparent;
}
</style>

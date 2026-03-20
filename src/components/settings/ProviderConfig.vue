<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ProviderConfigItem } from "../../types/provider";
import ApiKeyInput from "./ApiKeyInput.vue";
import { detectOAuthTokens, saveProviderConfig, validateApiKey } from "../../utils/ipc";
import ProviderIcon from "../common/ProviderIcon.vue";

const props = defineProps<{
  config: ProviderConfigItem;
}>();

const emit = defineEmits<{
  saved: [];
}>();

const apiKey = ref(props.config.apiKey);
const oauthToken = ref(props.config.oauthToken);
const enabled = ref(props.config.enabled);
const validating = ref(false);
const validationResult = ref<boolean | null>(null);
const detecting = ref(false);
const detectResult = ref<string | null>(null);
const saving = ref(false);
const saveResult = ref<{ type: "success" | "error"; message: string } | null>(null);
const pendingSavedConfig = ref<{
  apiKey: string;
  oauthToken: string;
  enabled: boolean;
} | null>(null);

const apiKeyLabel = "API Key\uff08\u6309\u91cf\u8ba1\u8d39\uff09";
const oauthTokenLabel = "OAuth Token\uff08\u8ba2\u9605\u8ba1\u5212\uff09";
const validatingLabel = "\u9a8c\u8bc1\u4e2d...";
const validateLabel = "\u9a8c\u8bc1";
const validLabel = "\u6709\u6548";
const invalidLabel = "\u65e0\u6548";
const detectingLabel = "\u68c0\u6d4b\u4e2d...";
const detectLabel = "\u81ea\u52a8\u68c0\u6d4b";
const noChangesHint = "\u5f53\u524d\u4f9b\u5e94\u5546\u5df2\u53d6\u6d88\u52fe\u9009\u3002\u70b9\u51fb\u4fdd\u5b58\u540e\uff0c\u4e3b\u754c\u9762\u4f1a\u9690\u85cf\u8be5\u4f9b\u5e94\u5546\u5361\u7247\u3002";
const anthropicHintPrefix = "\u81ea\u52a8\u68c0\u6d4b\u8bfb\u53d6 ";
const anthropicHintSuffix = "\u6216\u624b\u52a8\uff1a\u8fd0\u884c Claude Code \u767b\u5f55\u540e\u4ece\u8be5\u6587\u4ef6\u63d0\u53d6 ";
const openaiHintPrefix = "\u81ea\u52a8\u68c0\u6d4b\u8bfb\u53d6 ";
const openaiHintSuffix = "\u6216\u624b\u52a8\uff1a\u8fd0\u884c ";
const openaiHintSuffixTail = " \u767b\u5f55\u540e\u4ece\u8be5\u6587\u4ef6\u63d0\u53d6 ";

let syncingFromProps = false;

const hasChanges = computed(() => {
  return (
    apiKey.value !== props.config.apiKey ||
    oauthToken.value !== props.config.oauthToken ||
    enabled.value !== props.config.enabled
  );
});

const saveButtonLabel = computed(() => {
  if (saving.value) {
    return "\u4fdd\u5b58\u4e2d...";
  }

  if (saveResult.value?.type === "success" && !hasChanges.value) {
    return "\u5df2\u4fdd\u5b58";
  }

  return "\u4fdd\u5b58";
});

function maskCredential(value: string) {
  if (!value) {
    return "";
  }

  if (value.includes("...")) {
    return value;
  }

  if (value.length > 8) {
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }

  return "****";
}

function clearSaveResult() {
  saveResult.value = null;
}

function setSaveResult(type: "success" | "error", message: string) {
  saveResult.value = { type, message };
}

watch(
  () => props.config,
  (config) => {
    const matchesPendingSavedConfig =
      pendingSavedConfig.value?.apiKey === config.apiKey &&
      pendingSavedConfig.value?.oauthToken === config.oauthToken &&
      pendingSavedConfig.value?.enabled === config.enabled;

    syncingFromProps = true;
    apiKey.value = config.apiKey;
    oauthToken.value = config.oauthToken;
    enabled.value = config.enabled;
    syncingFromProps = false;

    validationResult.value = null;
    detectResult.value = null;

    if (matchesPendingSavedConfig) {
      pendingSavedConfig.value = null;
      return;
    }

    pendingSavedConfig.value = null;
    clearSaveResult();
  },
  { deep: true }
);

watch([apiKey, oauthToken, enabled], () => {
  if (syncingFromProps) {
    return;
  }

  pendingSavedConfig.value = null;
  clearSaveResult();
});

async function onValidate() {
  if (!apiKey.value) {
    return;
  }

  validating.value = true;
  validationResult.value = null;

  try {
    validationResult.value = await validateApiKey(props.config.providerId, apiKey.value);
  } catch {
    validationResult.value = false;
  } finally {
    validating.value = false;
  }
}

async function onDetectToken() {
  detecting.value = true;
  detectResult.value = null;

  try {
    const tokens = await detectOAuthTokens();
    const found = props.config.providerId === "anthropic" ? tokens.anthropic : tokens.openai;

    if (found) {
      oauthToken.value = found.token;
      const subscriptionType = found.subscriptionType ? ` (${found.subscriptionType})` : "";
      detectResult.value = `\u5df2\u4ece ${found.source} \u68c0\u6d4b\u5230 Token${subscriptionType}`;
    } else {
      detectResult.value = "\u672a\u627e\u5230\u672c\u5730 OAuth Token\u3002";
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    detectResult.value = `\u68c0\u6d4b\u5931\u8d25\uff1a${message}`;
  } finally {
    detecting.value = false;
  }
}

async function onSave() {
  if (saving.value || !hasChanges.value) {
    return;
  }

  saving.value = true;
  clearSaveResult();

  try {
    await saveProviderConfig({
      providerId: props.config.providerId,
      apiKey: apiKey.value,
      oauthToken: oauthToken.value,
      enabled: enabled.value,
    });

    pendingSavedConfig.value = {
      apiKey: maskCredential(apiKey.value),
      oauthToken: maskCredential(oauthToken.value),
      enabled: enabled.value,
    };

    setSaveResult(
      "success",
      enabled.value
        ? "\u4fdd\u5b58\u6210\u529f\uff0c\u4e3b\u754c\u9762\u5df2\u540c\u6b65\u5237\u65b0\u3002"
        : "\u5df2\u7981\u7528\u5e76\u4fdd\u5b58\uff0c\u4e3b\u754c\u9762\u5c06\u79fb\u9664\u8be5\u4f9b\u5e94\u5546\u3002"
    );

    emit("saved");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    setSaveResult("error", `\u4fdd\u5b58\u5931\u8d25\uff1a${message}`);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="provider-config">
    <div class="config-header">
      <label class="switch-label">
        <input v-model="enabled" type="checkbox" />
        <span class="provider-title">
          <ProviderIcon :provider-id="config.providerId" :size="20" />
          <span class="provider-name">{{ config.displayName }}</span>
        </span>
      </label>
    </div>

    <div class="config-body">
      <template v-if="enabled">
        <div class="field-group">
          <label class="field-label">{{ apiKeyLabel }}</label>
          <ApiKeyInput v-model="apiKey" placeholder="sk-..." />
          <div class="config-actions">
            <button class="btn btn-sm" :disabled="validating || !apiKey" type="button" @click="onValidate">
              {{ validating ? validatingLabel : validateLabel }}
            </button>
            <span v-if="validationResult === true" class="valid-mark">{{ validLabel }}</span>
            <span v-if="validationResult === false" class="invalid-mark">{{ invalidLabel }}</span>
          </div>
        </div>

        <div v-if="config.capabilities.hasSubscription" class="field-group">
          <label class="field-label">{{ oauthTokenLabel }}</label>
          <ApiKeyInput
            v-model="oauthToken"
            :placeholder="config.providerId === 'anthropic' ? 'sk-ant-oat01-...' : 'eyJ...'"
          />
          <div class="config-actions">
            <button class="btn btn-sm btn-detect" :disabled="detecting" type="button" @click="onDetectToken">
              {{ detecting ? detectingLabel : detectLabel }}
            </button>
          </div>
          <div v-if="detectResult" class="detect-result">{{ detectResult }}</div>
          <div class="field-hint">
            <template v-if="config.providerId === 'anthropic'">
              {{ anthropicHintPrefix }}<code>~/.claude/.credentials.json</code><br />
              {{ anthropicHintSuffix }}<code>accessToken</code>
            </template>
            <template v-else>
              {{ openaiHintPrefix }}<code>~/.codex/auth.json</code><br />
              {{ openaiHintSuffix }}<code>codex --login</code>{{ openaiHintSuffixTail }}<code>access_token</code>
            </template>
          </div>
        </div>
      </template>

      <div v-else class="disabled-hint">
        {{ noChangesHint }}
      </div>

      <div
        v-if="saveResult"
        class="save-result"
        :class="saveResult.type === 'success' ? 'is-success' : 'is-error'"
      >
        {{ saveResult.message }}
      </div>

      <button
        class="btn btn-sm btn-primary save-btn"
        :class="{ 'is-saved': saveResult?.type === 'success' && !hasChanges }"
        :disabled="saving || !hasChanges"
        type="button"
        @click="onSave"
      >
        {{ saveButtonLabel }}
      </button>
    </div>
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
  gap: var(--spacing-sm);
}

.config-header {
  display: flex;
  align-items: center;
}

.switch-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  cursor: pointer;
  font-size: 13px;
}

.switch-label input[type="checkbox"] {
  accent-color: var(--color-primary);
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

.config-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.field-hint,
.disabled-hint {
  font-size: 9px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.field-hint code {
  background: rgba(255, 255, 255, 0.06);
  padding: 0 3px;
  border-radius: 2px;
  font-size: 9px;
}

.config-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.detect-result,
.save-result {
  font-size: 10px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

.detect-result {
  color: var(--color-success);
  background: rgba(34, 197, 94, 0.08);
}

.save-result.is-success {
  color: var(--color-success);
  background: rgba(34, 197, 94, 0.08);
}

.save-result.is-error {
  color: var(--color-danger);
  background: rgba(239, 68, 68, 0.08);
}

.save-btn {
  align-self: flex-end;
  min-width: 72px;
}

.btn {
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-text);
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
}

.btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}

.save-btn.is-saved,
.save-btn.is-saved:hover {
  background: rgba(34, 197, 94, 0.18);
  border-color: rgba(34, 197, 94, 0.35);
  color: var(--color-success);
}

.btn-detect {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.3);
  color: var(--color-info);
}

.btn-detect:hover {
  background: rgba(59, 130, 246, 0.25);
}

.valid-mark {
  color: var(--color-success);
  font-size: 11px;
}

.invalid-mark {
  color: var(--color-danger);
  font-size: 11px;
}
</style>

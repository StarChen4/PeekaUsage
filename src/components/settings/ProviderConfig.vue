<script setup lang="ts">
import { ref, watch } from "vue";
import type { ProviderConfigItem } from "../../types/provider";
import ApiKeyInput from "./ApiKeyInput.vue";
import { saveProviderConfig, validateApiKey } from "../../utils/ipc";

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

watch(() => props.config, (c) => {
  apiKey.value = c.apiKey;
  oauthToken.value = c.oauthToken;
  enabled.value = c.enabled;
}, { deep: true });

async function onValidate() {
  if (!apiKey.value) return;
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

async function onSave() {
  await saveProviderConfig({
    providerId: props.config.providerId,
    apiKey: apiKey.value,
    oauthToken: oauthToken.value,
    enabled: enabled.value,
  });
  emit("saved");
}
</script>

<template>
  <div class="provider-config">
    <div class="config-header">
      <label class="switch-label">
        <input type="checkbox" v-model="enabled" />
        <span class="provider-name">{{ config.displayName }}</span>
      </label>
    </div>

    <div v-if="enabled" class="config-body">
      <!-- 按量 API Key -->
      <div class="field-group">
        <label class="field-label">API Key（按量计费）</label>
        <ApiKeyInput v-model="apiKey" placeholder="sk-..." />
        <div class="config-actions">
          <button class="btn btn-sm" @click="onValidate" :disabled="validating || !apiKey">
            {{ validating ? "验证中..." : "验证" }}
          </button>
          <span v-if="validationResult === true" class="valid-mark">✓ 有效</span>
          <span v-if="validationResult === false" class="invalid-mark">✗ 无效</span>
        </div>
      </div>

      <!-- 订阅 OAuth Token（仅 OpenAI / Anthropic） -->
      <div v-if="config.capabilities.hasSubscription" class="field-group">
        <label class="field-label">OAuth Token（订阅计划）</label>
        <ApiKeyInput
          v-model="oauthToken"
          :placeholder="config.providerId === 'anthropic' ? 'sk-ant-oat01-...' : 'Bearer token...'"
        />
        <div class="field-hint">
          {{ config.providerId === 'anthropic'
            ? '从 Claude Code 凭据中获取，用于查询 Pro/Max 订阅用量'
            : '从 Codex CLI 凭据中获取，用于查询 ChatGPT Plus/Pro 订阅用量'
          }}
        </div>
      </div>

      <button class="btn btn-sm btn-primary save-btn" @click="onSave">
        保存
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

.provider-name {
  font-weight: 600;
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

.field-hint {
  font-size: 9px;
  color: var(--color-text-muted);
  line-height: 1.3;
}

.config-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.save-btn {
  align-self: flex-end;
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

.valid-mark {
  color: var(--color-success);
  font-size: 11px;
}

.invalid-mark {
  color: var(--color-danger);
  font-size: 11px;
}
</style>

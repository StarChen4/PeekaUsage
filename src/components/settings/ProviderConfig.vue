<script setup lang="ts">
import { ref, watch } from "vue";
import type { ProviderConfigItem } from "../../types/provider";
import ApiKeyInput from "./ApiKeyInput.vue";
import { saveProviderConfig, validateApiKey, detectOAuthTokens } from "../../utils/ipc";

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

async function onDetectToken() {
  detecting.value = true;
  detectResult.value = null;
  try {
    const tokens = await detectOAuthTokens();
    const found = props.config.providerId === "anthropic"
      ? tokens.anthropic
      : tokens.openai;
    if (found) {
      oauthToken.value = found.token;
      const sub = found.subscriptionType ? ` (${found.subscriptionType})` : "";
      detectResult.value = `已从 ${found.source} 检测到${sub}`;
    } else {
      detectResult.value = "未找到本地凭据";
    }
  } catch (e: any) {
    detectResult.value = `检测失败: ${e}`;
  } finally {
    detecting.value = false;
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

      <!-- 订阅 OAuth Token -->
      <div v-if="config.capabilities.hasSubscription" class="field-group">
        <label class="field-label">OAuth Token（订阅计划）</label>
        <ApiKeyInput
          v-model="oauthToken"
          :placeholder="config.providerId === 'anthropic' ? 'sk-ant-oat01-...' : 'eyJ...'"
        />
        <div class="config-actions">
          <button class="btn btn-sm btn-detect" @click="onDetectToken" :disabled="detecting">
            {{ detecting ? "检测中..." : "自动检测" }}
          </button>
        </div>
        <div v-if="detectResult" class="detect-result">{{ detectResult }}</div>
        <div class="field-hint">
          <template v-if="config.providerId === 'anthropic'">
            自动检测读取 <code>~/.claude/.credentials.json</code><br>
            或手动：运行 Claude Code 登录后从该文件提取 accessToken
          </template>
          <template v-else>
            自动检测读取 <code>~/.codex/auth.json</code><br>
            或手动：运行 <code>codex --login</code> 登录后从该文件提取 access_token
          </template>
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
  line-height: 1.4;
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

.detect-result {
  font-size: 10px;
  color: var(--color-success);
  padding: 2px 0;
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

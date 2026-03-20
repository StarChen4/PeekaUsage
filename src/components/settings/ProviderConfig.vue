<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
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

let saveResultTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.config,
  (config) => {
    apiKey.value = config.apiKey;
    oauthToken.value = config.oauthToken;
    enabled.value = config.enabled;
    validationResult.value = null;
    detectResult.value = null;
    saveResult.value = null;
  },
  { deep: true }
);

onBeforeUnmount(() => {
  if (saveResultTimer) {
    clearTimeout(saveResultTimer);
  }
});

function setSaveResult(type: "success" | "error", message: string) {
  saveResult.value = { type, message };
  if (saveResultTimer) {
    clearTimeout(saveResultTimer);
  }
  if (type === "success") {
    saveResultTimer = setTimeout(() => {
      saveResult.value = null;
      saveResultTimer = null;
    }, 2500);
  }
}

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

/* async function onDetectTokenLegacy() {
  detecting.value = true;
  detectResult.value = null;
  try {
    const tokens = await detectOAuthTokens();
    const found = props.config.providerId === "anthropic" ? tokens.anthropic : tokens.openai;
    if (found) {
      oauthToken.value = found.token;
      const subscriptionType = found.subscriptionType ? `（${found.subscriptionType}）` : "";
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

async function onSaveLegacy() {
  await saveProviderConfig({
    providerId: props.config.providerId,
    apiKey: apiKey.value,
    oauthToken: oauthToken.value,
    enabled: enabled.value,
  });
  emit("saved");
} */

/* async function onDetectTokenBroken() {
  detecting.value = true;
  detectResult.value = null;
  try {
    const tokens = await detectOAuthTokens();
    const found = props.config.providerId === "anthropic" ? tokens.anthropic : tokens.openai;
    if (found) {
      oauthToken.value = found.token;
      const subscriptionType = found.subscriptionType ? `（${found.subscriptionType}）` : "";
      detectResult.value = `已从 ${found.source} 检测到 Token${subscriptionType}`;
    } else {
      detectResult.value = "未找到本地 OAuth Token。";
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    detectResult.value = `检测失败：${message}`;
  } finally {
    detecting.value = false;
  }
} */

/* async function onSaveBroken() {
  saving.value = true;
  saveResult.value = null;
  try {
    await saveProviderConfig({
      providerId: props.config.providerId,
      apiKey: apiKey.value,
      oauthToken: oauthToken.value,
      enabled: enabled.value,
    });
    setSaveResult(
      "success",
      enabled.value ? "保存成功，主界面已同步刷新。" : "已禁用并保存，主界面将移除该供应商。"
    );
    emit("saved");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    setSaveResult("error", `保存失败：${message}`);
  } finally {
    saving.value = false;
  }
} */

/* async function onDetectToken() {
  detecting.value = true;
  detectResult.value = null;
  try {
    const tokens = await detectOAuthTokens();
    const found = props.config.providerId === "anthropic" ? tokens.anthropic : tokens.openai;
    if (found) {
      oauthToken.value = found.token;
      const subscriptionType = found.subscriptionType ? " (" + found.subscriptionType + ")" : "";
      detectResult.value = "已从 " + found.source + " 检测到 Token" + subscriptionType;
    } else {
      detectResult.value = "未找到本地 OAuth Token。";
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    detectResult.value = "检测失败：" + message;
  } finally {
    detecting.value = false;
  }
} */

/* async function onSave() {
  saving.value = true;
  saveResult.value = null;
  try {
    await saveProviderConfig({
      providerId: props.config.providerId,
      apiKey: apiKey.value,
      oauthToken: oauthToken.value,
      enabled: enabled.value,
    });
    const successMessage = enabled.value
      ? "保存成功，主界面已同步刷新。"
      : "已禁用并保存，主界面将移除该供应商。";
    setSaveResult("success", successMessage);
    emit("saved");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    setSaveResult("error", "保存失败：" + message);
  } finally {
    saving.value = false;
  }
} */

async function onDetectToken() {
  detecting.value = true;
  detectResult.value = null;
  try {
    const tokens = await detectOAuthTokens();
    const found = props.config.providerId === "anthropic" ? tokens.anthropic : tokens.openai;
    if (found) {
      oauthToken.value = found.token;
      const subscriptionType = found.subscriptionType ? " (" + found.subscriptionType + ")" : "";
      detectResult.value =
        "\u5df2\u4ece " + found.source + " \u68c0\u6d4b\u5230 Token" + subscriptionType;
    } else {
      detectResult.value = "\u672a\u627e\u5230\u672c\u5730 OAuth Token\u3002";
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    detectResult.value = "\u68c0\u6d4b\u5931\u8d25\uff1a" + message;
  } finally {
    detecting.value = false;
  }
}

async function onSave() {
  saving.value = true;
  saveResult.value = null;
  try {
    await saveProviderConfig({
      providerId: props.config.providerId,
      apiKey: apiKey.value,
      oauthToken: oauthToken.value,
      enabled: enabled.value,
    });
    const successMessage = enabled.value
      ? "\u4fdd\u5b58\u6210\u529f\uff0c\u4e3b\u754c\u9762\u5df2\u540c\u6b65\u5237\u65b0\u3002"
      : "\u5df2\u7981\u7528\u5e76\u4fdd\u5b58\uff0c\u4e3b\u754c\u9762\u5c06\u79fb\u9664\u8be5\u4f9b\u5e94\u5546\u3002";
    setSaveResult("success", successMessage);
    emit("saved");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    setSaveResult("error", "\u4fdd\u5b58\u5931\u8d25\uff1a" + message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="provider-config">
    <div class="config-header">
      <label class="switch-label">
        <input type="checkbox" v-model="enabled" />
        <span class="provider-title">
          <ProviderIcon :provider-id="config.providerId" :size="20" />
          <span class="provider-name">{{ config.displayName }}</span>
        </span>
      </label>
    </div>

    <div v-if="false" class="config-body legacy-config-body">
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

    <div class="config-body">
      <template v-if="enabled">
        <div class="field-group">
          <label class="field-label">API Key（按量计费）</label>
          <ApiKeyInput v-model="apiKey" placeholder="sk-..." />
          <div class="config-actions">
            <button class="btn btn-sm" :disabled="validating || !apiKey" type="button" @click="onValidate">
              {{ validating ? "验证中..." : "验证" }}
            </button>
            <span v-if="validationResult === true" class="valid-mark">有效</span>
            <span v-if="validationResult === false" class="invalid-mark">无效</span>
          </div>
        </div>

        <div v-if="config.capabilities.hasSubscription" class="field-group">
          <label class="field-label">OAuth Token（订阅计划）</label>
          <ApiKeyInput
            v-model="oauthToken"
            :placeholder="config.providerId === 'anthropic' ? 'sk-ant-oat01-...' : 'eyJ...'"
          />
          <div class="config-actions">
            <button class="btn btn-sm btn-detect" :disabled="detecting" type="button" @click="onDetectToken">
              {{ detecting ? "检测中..." : "自动检测" }}
            </button>
          </div>
          <div v-if="detectResult" class="detect-result">{{ detectResult }}</div>
          <div class="field-hint">
            <template v-if="config.providerId === 'anthropic'">
              自动检测读取 <code>~/.claude/.credentials.json</code><br>
              或手动：运行 Claude Code 登录后从该文件提取 <code>accessToken</code>
            </template>
            <template v-else>
              自动检测读取 <code>~/.codex/auth.json</code><br>
              或手动：运行 <code>codex --login</code> 登录后从该文件提取 <code>access_token</code>
            </template>
          </div>
        </div>
      </template>

      <div v-else class="disabled-hint">
        当前供应商已取消勾选。点击保存后，主界面会隐藏该供应商卡片。
      </div>

      <div
        v-if="saveResult"
        class="save-result"
        :class="saveResult.type === 'success' ? 'is-success' : 'is-error'"
      >
        {{ saveResult.message }}
      </div>

      <button class="btn btn-sm btn-primary save-btn" :disabled="saving" type="button" @click="onSave">
        {{ saving ? "保存中..." : "保存" }}
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

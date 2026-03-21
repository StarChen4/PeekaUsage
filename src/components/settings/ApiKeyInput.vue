<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";

defineProps<{
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const { t } = useI18n();
const showKey = ref(false);

function onInput(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="key-input-wrapper">
    <input
      :type="showKey ? 'text' : 'password'"
      :value="modelValue"
      :placeholder="placeholder ?? t('settings.providerConfig.apiKeyInputPlaceholder')"
      @input="onInput"
      class="key-input"
      spellcheck="false"
      autocomplete="off"
    />
    <button
      class="toggle-btn"
      @click="showKey = !showKey"
      :title="showKey ? t('common.hide') : t('common.show')"
      type="button"
    >
      {{ showKey ? t("common.hide") : t("common.show") }}
    </button>
  </div>
</template>

<style scoped>
.key-input-wrapper {
  display: flex;
  align-items: center;
  background: var(--color-input-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.key-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-text);
  font-size: 12px;
  padding: 6px 8px;
  font-family: monospace;
}

.key-input::placeholder {
  color: var(--color-text-muted);
}

.toggle-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  font-size: 12px;
}
</style>

<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";

const props = withDefaults(defineProps<{
  open: boolean;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  busy?: boolean;
  ariaLabel?: string;
}>(), {
  confirmLabel: "确认",
  cancelLabel: "取消",
  variant: "default",
  busy: false,
  ariaLabel: "确认操作",
});

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

function handleKeydown(event: KeyboardEvent) {
  if (!props.open || props.busy) {
    return;
  }

  if (event.key === "Escape") {
    emit("cancel");
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener("keydown", handleKeydown);
      return;
    }

    window.removeEventListener("keydown", handleKeydown);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="dialog-overlay"
      @click.self="!busy && $emit('cancel')"
    >
      <div
        class="dialog-card"
        :aria-label="ariaLabel"
        aria-modal="true"
        role="dialog"
      >
        <p class="dialog-message">{{ message }}</p>
        <div class="dialog-actions">
          <button
            class="dialog-btn dialog-btn-secondary"
            :disabled="busy"
            type="button"
            @click="$emit('cancel')"
          >
            {{ cancelLabel }}
          </button>
          <button
            class="dialog-btn"
            :class="variant === 'danger' ? 'dialog-btn-danger' : 'dialog-btn-primary'"
            :disabled="busy"
            type="button"
            @click="$emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgba(15, 23, 42, 0.24);
  backdrop-filter: blur(8px);
}

.dialog-card {
  width: min(100%, 360px);
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-drag);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dialog-message {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.dialog-btn {
  min-width: 76px;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-ghost-bg);
  color: var(--color-text);
  font-size: 11px;
  cursor: pointer;
}

.dialog-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.dialog-btn-secondary {
  background: var(--color-ghost-bg);
}

.dialog-btn-primary {
  background: var(--color-primary-soft-bg);
  border-color: var(--color-primary-soft-border);
  color: var(--color-primary-soft-text);
}

.dialog-btn-danger {
  background: var(--color-danger-soft-bg);
  border-color: var(--color-danger-soft-border);
  color: var(--color-danger-soft-text);
}
</style>

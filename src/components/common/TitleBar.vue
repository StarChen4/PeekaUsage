<script setup lang="ts">
import { useWindowControls } from "../../composables/useWindowControls";

const { minimizeWindow, closeToTray } = useWindowControls();
</script>

<template>
  <div class="titlebar" data-tauri-drag-region>
    <div class="titlebar-left" data-tauri-drag-region>
      <span class="titlebar-dot"></span>
      <span class="titlebar-title" data-tauri-drag-region>AI Usage Monitor</span>
    </div>
    <div class="titlebar-actions">
      <button class="titlebar-btn" @click="minimizeWindow" title="最小化">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="0" y="4" width="10" height="1.5" fill="currentColor" rx="0.5" />
        </svg>
      </button>
      <button class="titlebar-btn titlebar-btn-close" @click="closeToTray" title="隐藏到托盘">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.titlebar {
  height: var(--titlebar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--spacing-sm);
  background: var(--color-titlebar-bg);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.titlebar-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.titlebar-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary);
}

.titlebar-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  letter-spacing: 0.3px;
}

.titlebar-actions {
  display: flex;
  gap: 2px;
}

.titlebar-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s;
}

.titlebar-btn:hover {
  background: var(--color-ghost-bg-hover);
  color: var(--color-text);
}

.titlebar-btn-close:hover {
  background: var(--color-danger);
  color: white;
}
</style>

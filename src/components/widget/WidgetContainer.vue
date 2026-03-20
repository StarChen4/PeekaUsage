<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { ComponentPublicInstance } from "vue";
import { useProviders } from "../../composables/useProviders";
import { useSettingsStore } from "../../stores/settingsStore";
import type { ProviderId, UsageSummary } from "../../types/provider";
import type { ThemeMode } from "../../types/settings";
import { saveProviderOrder } from "../../utils/ipc";
import ProviderCard from "./ProviderCard.vue";
import OpacityHandle from "./OpacityHandle.vue";

defineEmits<{
  openSettings: [];
}>();

interface DragSlot {
  id: ProviderId;
  top: number;
  height: number;
}

interface DragState {
  providerId: ProviderId;
  pointerId: number;
  startClientY: number;
  startScrollTop: number;
  deltaY: number;
  originIndex: number;
  targetIndex: number;
  slots: DragSlot[];
  releasing: boolean;
}

const { providerStore, manualRefresh } = useProviders();
const settingsStore = useSettingsStore();

const themeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: "light", label: "明亮" },
  { value: "dark", label: "暗黑" },
  { value: "system", label: "跟随系统" },
];

const cardListRef = ref<HTMLElement | null>(null);
const themeMenuRef = ref<HTMLElement | null>(null);
const themeTriggerRef = ref<HTMLElement | null>(null);
const orderedProviders = ref<UsageSummary[]>([]);
const dragState = ref<DragState | null>(null);
const layoutSaveState = ref<"idle" | "saving" | "saved" | "error">("idle");
const isThemeMenuOpen = ref(false);
const cardRefs = new Map<ProviderId, HTMLElement>();

let saveFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

const enabledProviders = computed(() => providerStore.enabledProviders());
const isDragging = computed(() => !!dragState.value && !dragState.value.releasing);
const currentTheme = computed(() => {
  return themeOptions.find((option) => option.value === settingsStore.settings.theme) ?? themeOptions[2];
});
const layoutStatusText = computed(() => {
  switch (layoutSaveState.value) {
    case "saving":
      return "正在保存布局...";
    case "saved":
      return "布局已保存";
    case "error":
      return "布局保存失败";
    default:
      return orderedProviders.value.length > 1 ? "拖动卡片可调整顺序" : "";
  }
});

watch(
  enabledProviders,
  (providers) => {
    if (dragState.value) return;
    syncOrderedProviders(providers);
  },
  { immediate: true }
);

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerCancel);
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeyDown);
  clearSaveFeedbackTimer();
});

function clearSaveFeedbackTimer() {
  if (saveFeedbackTimer) {
    clearTimeout(saveFeedbackTimer);
    saveFeedbackTimer = null;
  }
}

function closeThemeMenu() {
  isThemeMenuOpen.value = false;
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!isThemeMenuOpen.value) {
    return;
  }

  const target = event.target as Node | null;
  if (!target) {
    closeThemeMenu();
    return;
  }

  const clickedMenu = themeMenuRef.value?.contains(target) ?? false;
  const clickedTrigger = themeTriggerRef.value?.contains(target) ?? false;

  if (!clickedMenu && !clickedTrigger) {
    closeThemeMenu();
  }
}

function onDocumentKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    closeThemeMenu();
  }
}

function toggleThemeMenu() {
  isThemeMenuOpen.value = !isThemeMenuOpen.value;
}

async function selectTheme(theme: ThemeMode) {
  closeThemeMenu();
  if (settingsStore.settings.theme === theme) {
    return;
  }
  await settingsStore.saveSettings({ theme });
}

async function toggleAlwaysOnTop() {
  await settingsStore.saveSettings({
    alwaysOnTop: !settingsStore.settings.alwaysOnTop,
  });
}

function syncOrderedProviders(providers: UsageSummary[]) {
  const providerMap = new Map(providers.map((provider) => [provider.providerId, provider]));
  const merged: UsageSummary[] = [];

  for (const provider of orderedProviders.value) {
    const next = providerMap.get(provider.providerId);
    if (next) {
      merged.push(next);
      providerMap.delete(provider.providerId);
    }
  }

  for (const provider of providers) {
    if (providerMap.has(provider.providerId)) {
      merged.push(provider);
      providerMap.delete(provider.providerId);
    }
  }

  orderedProviders.value = merged;
}

function setCardRef(providerId: ProviderId, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) {
    cardRefs.set(providerId, el);
  } else {
    cardRefs.delete(providerId);
  }
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return [...items];
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function getDragSlots(): DragSlot[] {
  const listEl = cardListRef.value;
  if (!listEl) return [];

  const listRect = listEl.getBoundingClientRect();
  const scrollTop = listEl.scrollTop;

  return orderedProviders.value
    .map((provider) => {
      const el = cardRefs.get(provider.providerId);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        id: provider.providerId,
        top: rect.top - listRect.top + scrollTop,
        height: rect.height,
      };
    })
    .filter((slot): slot is DragSlot => slot !== null);
}

function getTargetIndex(slots: DragSlot[], draggedId: ProviderId, draggedCenter: number) {
  let index = 0;
  for (const slot of slots) {
    if (slot.id === draggedId) continue;
    if (draggedCenter > slot.top + slot.height / 2) {
      index += 1;
    }
  }
  return index;
}

function autoScrollList(clientY: number) {
  const listEl = cardListRef.value;
  if (!listEl) return;

  const rect = listEl.getBoundingClientRect();
  const threshold = 56;
  const maxStep = 18;

  if (clientY < rect.top + threshold) {
    const distance = rect.top + threshold - clientY;
    listEl.scrollTop -= Math.min(maxStep, distance * 0.45);
  } else if (clientY > rect.bottom - threshold) {
    const distance = clientY - (rect.bottom - threshold);
    listEl.scrollTop += Math.min(maxStep, distance * 0.45);
  }
}

function startDrag(providerId: ProviderId, event: PointerEvent) {
  if (event.button !== 0) return;
  if (orderedProviders.value.length < 2) return;

  closeThemeMenu();

  const slots = getDragSlots();
  const originIndex = orderedProviders.value.findIndex((provider) => provider.providerId === providerId);
  const listEl = cardListRef.value;

  if (!listEl || slots.length !== orderedProviders.value.length || originIndex < 0) {
    return;
  }

  clearSaveFeedbackTimer();
  layoutSaveState.value = "idle";
  dragState.value = {
    providerId,
    pointerId: event.pointerId,
    startClientY: event.clientY,
    startScrollTop: listEl.scrollTop,
    deltaY: 0,
    originIndex,
    targetIndex: originIndex,
    slots,
    releasing: false,
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);
  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function onPointerMove(event: PointerEvent) {
  const drag = dragState.value;
  const listEl = cardListRef.value;
  if (!drag || drag.releasing || !listEl || event.pointerId !== drag.pointerId) return;

  autoScrollList(event.clientY);

  const scrollOffset = listEl.scrollTop - drag.startScrollTop;
  const deltaY = event.clientY - drag.startClientY + scrollOffset;
  const draggedSlot = drag.slots[drag.originIndex];
  const draggedCenter = draggedSlot.top + deltaY + draggedSlot.height / 2;
  const targetIndex = getTargetIndex(drag.slots, drag.providerId, draggedCenter);

  dragState.value = {
    ...drag,
    deltaY,
    targetIndex,
  };
}

function onPointerUp(event: PointerEvent) {
  const drag = dragState.value;
  if (!drag || event.pointerId !== drag.pointerId) return;
  void releaseDrag(true);
}

function onPointerCancel(event: PointerEvent) {
  const drag = dragState.value;
  if (!drag || event.pointerId !== drag.pointerId) return;
  void releaseDrag(false);
}

async function releaseDrag(commit: boolean) {
  const drag = dragState.value;
  if (!drag) return;

  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerCancel);

  if (!commit) {
    dragState.value = null;
    return;
  }

  const movedProviders = moveItem(orderedProviders.value, drag.originIndex, drag.targetIndex);
  const finalOffset = drag.slots[drag.targetIndex].top - drag.slots[drag.originIndex].top;

  dragState.value = {
    ...drag,
    deltaY: finalOffset,
    releasing: true,
  };

  window.setTimeout(async () => {
    orderedProviders.value = movedProviders;
    dragState.value = null;

    if (drag.originIndex !== drag.targetIndex) {
      await persistProviderOrder(movedProviders.map((provider) => provider.providerId));
    }
  }, 180);
}

async function persistProviderOrder(order: ProviderId[]) {
  clearSaveFeedbackTimer();
  layoutSaveState.value = "saving";

  try {
    await saveProviderOrder(order);
    layoutSaveState.value = "saved";
  } catch {
    layoutSaveState.value = "error";
  }

  saveFeedbackTimer = setTimeout(() => {
    layoutSaveState.value = "idle";
    saveFeedbackTimer = null;
  }, 2200);
}

function getCardTransform(providerId: ProviderId) {
  const drag = dragState.value;
  if (!drag) return undefined;

  const currentOrder = orderedProviders.value.map((provider) => provider.providerId);
  const originalIndex = currentOrder.indexOf(providerId);
  if (originalIndex < 0) return undefined;

  if (providerId === drag.providerId) {
    return `translate3d(0, ${drag.deltaY}px, 0) scale(1.02)`;
  }

  const nextOrder = moveItem(currentOrder, drag.originIndex, drag.targetIndex);
  const nextIndex = nextOrder.indexOf(providerId);

  if (nextIndex === originalIndex) {
    return undefined;
  }

  return `translate3d(0, ${drag.slots[nextIndex].top - drag.slots[originalIndex].top}px, 0)`;
}

function getCardStyle(providerId: ProviderId) {
  const drag = dragState.value;
  const transform = getCardTransform(providerId);

  if (!drag) {
    return undefined;
  }

  return {
    transform,
    zIndex: providerId === drag.providerId ? "3" : "1",
    transition: providerId === drag.providerId && !drag.releasing
      ? "none"
      : "transform 180ms cubic-bezier(0.2, 0.85, 0.25, 1)",
  };
}

function getCardClass(providerId: ProviderId) {
  const drag = dragState.value;
  return {
    "is-dragging": drag?.providerId === providerId,
    "is-shifting": !!drag && drag.providerId !== providerId && !!getCardTransform(providerId),
  };
}
</script>

<template>
  <div class="widget-container">
    <div ref="cardListRef" class="card-list" :class="{ 'is-dragging': isDragging }">
      <template v-if="orderedProviders.length > 0">
        <div
          v-for="provider in orderedProviders"
          :key="provider.providerId"
          :ref="(el) => setCardRef(provider.providerId, el)"
          class="card-shell"
          :class="getCardClass(provider.providerId)"
          :style="getCardStyle(provider.providerId)"
          @pointerdown="startDrag(provider.providerId, $event)"
        >
          <ProviderCard :provider="provider" />
        </div>
      </template>
      <div v-else class="empty-state">
        <p>暂无已启用的供应商</p>
        <button class="btn-link" @click="$emit('openSettings')">前往设置</button>
      </div>
    </div>

    <div class="widget-footer">
      <span v-if="layoutStatusText" class="layout-status" :class="`is-${layoutSaveState}`">
        {{ layoutStatusText }}
      </span>

      <div class="footer-actions">
        <div class="theme-picker">
          <button
            ref="themeTriggerRef"
            class="icon-btn"
            :class="{ 'is-active': isThemeMenuOpen }"
            title="主题切换"
            @click="toggleThemeMenu"
          >
            <svg v-if="currentTheme.value === 'light'" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="4.25" fill="none" stroke="currentColor" stroke-width="1.8" />
              <path
                d="M12 2.5V5.1M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.72 5.28l-1.84 1.84M7.12 16.88l-1.84 1.84M18.72 18.72l-1.84-1.84M7.12 7.12L5.28 5.28"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-width="1.8"
              />
            </svg>
            <svg v-else-if="currentTheme.value === 'dark'" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M19 14.5A7.5 7.5 0 0 1 9.5 5a8.5 8.5 0 1 0 9.5 9.5Z"
                fill="none"
                stroke="currentColor"
                stroke-linejoin="round"
                stroke-width="1.8"
              />
            </svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <rect
                x="4"
                y="5"
                width="16"
                height="11"
                rx="2"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
              />
              <path
                d="M9 19h6M12 16v3"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-width="1.8"
              />
            </svg>
          </button>

          <div v-if="isThemeMenuOpen" ref="themeMenuRef" class="theme-menu">
            <button
              v-for="option in themeOptions"
              :key="option.value"
              class="theme-option"
              :class="{ 'is-selected': settingsStore.settings.theme === option.value }"
              @click="selectTheme(option.value)"
            >
              <span class="theme-option-icon">
                <svg v-if="option.value === 'light'" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="4.25" fill="none" stroke="currentColor" stroke-width="1.8" />
                  <path
                    d="M12 2.5V5.1M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.72 5.28l-1.84 1.84M7.12 16.88l-1.84 1.84M18.72 18.72l-1.84-1.84M7.12 7.12L5.28 5.28"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="1.8"
                  />
                </svg>
                <svg v-else-if="option.value === 'dark'" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M19 14.5A7.5 7.5 0 0 1 9.5 5a8.5 8.5 0 1 0 9.5 9.5Z"
                    fill="none"
                    stroke="currentColor"
                    stroke-linejoin="round"
                    stroke-width="1.8"
                  />
                </svg>
                <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                  <rect
                    x="4"
                    y="5"
                    width="16"
                    height="11"
                    rx="2"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                  />
                  <path
                    d="M9 19h6M12 16v3"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="1.8"
                  />
                </svg>
              </span>
              <span class="theme-option-label">{{ option.label }}</span>
            </button>
          </div>
        </div>

        <button
          class="icon-btn pin-icon-btn"
          :class="{ 'is-active': settingsStore.settings.alwaysOnTop }"
          :title="settingsStore.settings.alwaysOnTop ? '取消始终置顶' : '始终置顶'"
          @click="toggleAlwaysOnTop"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 6.25h12"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="1.8"
            />
            <path
              d="M12 18V8.75M8.75 12l3.25-3.25L15.25 12"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.8"
            />
          </svg>
        </button>

        <button
          class="icon-btn"
          :class="{ spinning: providerStore.isRefreshing }"
          :disabled="providerStore.isRefreshing || isDragging"
          title="手动刷新"
          @click="manualRefresh"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M20 12a8 8 0 1 1-2.34-5.66"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="1.8"
            />
            <path
              d="M20 5.5v5h-5"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.8"
            />
          </svg>
        </button>

        <button class="icon-btn" title="设置" @click="$emit('openSettings')">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 8.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            />
            <path
              d="M19.4 15a1 1 0 0 0 .2 1.1l.05.06a2 2 0 1 1-2.83 2.83l-.06-.05a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.92V20a2 2 0 1 1-4 0v-.08a1 1 0 0 0-.66-.94 1 1 0 0 0-1.1.2l-.06.05a2 2 0 1 1-2.83-2.83l.05-.06a1 1 0 0 0 .2-1.1 1 1 0 0 0-.92-.6H4a2 2 0 1 1 0-4h.08a1 1 0 0 0 .94-.66 1 1 0 0 0-.2-1.1l-.05-.06a2 2 0 1 1 2.83-2.83l.06.05a1 1 0 0 0 1.1.2h.02A1 1 0 0 0 9.7 4.1V4a2 2 0 1 1 4 0v.08a1 1 0 0 0 .66.94h.02a1 1 0 0 0 1.1-.2l.06-.05a2 2 0 1 1 2.83 2.83l-.05.06a1 1 0 0 0-.2 1.1v.02a1 1 0 0 0 .92.6H20a2 2 0 1 1 0 4h-.08a1 1 0 0 0-.94.66V15Z"
              fill="none"
              stroke="currentColor"
              stroke-linejoin="round"
              stroke-width="1.6"
            />
          </svg>
        </button>
      </div>
    </div>

    <OpacityHandle />
  </div>
</template>

<style scoped>
.widget-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.card-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.card-list.is-dragging {
  user-select: none;
}

.card-shell {
  position: relative;
  cursor: grab;
  touch-action: none;
  transition: transform 180ms cubic-bezier(0.2, 0.85, 0.25, 1);
  will-change: transform;
}

.card-shell:active {
  cursor: grabbing;
}

.card-shell.is-dragging {
  cursor: grabbing;
}

.card-shell.is-dragging :deep(.provider-card) {
  box-shadow: var(--shadow-drag);
  border-color: var(--color-border-hover);
}

.card-shell.is-shifting :deep(.provider-card) {
  border-color: var(--color-border-hover);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  color: var(--color-text-muted);
  font-size: 12px;
}

.btn-link {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 12px;
  text-decoration: underline;
}

.widget-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.layout-status {
  margin-right: auto;
  font-size: 10px;
  color: var(--color-text-muted);
  transition: color 0.2s ease;
}

.layout-status.is-saving {
  color: var(--color-info);
}

.layout-status.is-saved {
  color: var(--color-success);
}

.layout-status.is-error {
  color: var(--color-danger);
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.theme-picker {
  position: relative;
}

.theme-menu {
  position: absolute;
  right: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(50%);
  display: flex;
  gap: 6px;
  padding: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(18px);
  z-index: 8;
}

.theme-option {
  width: 68px;
  min-height: 74px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 6px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.theme-option:hover {
  background: var(--color-ghost-bg-hover);
  border-color: var(--color-border);
  color: var(--color-text);
}

.theme-option.is-selected {
  background: var(--color-primary-soft-bg);
  border-color: var(--color-primary-soft-border);
  color: var(--color-primary-soft-text);
}

.theme-option-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.theme-option-icon svg {
  width: 20px;
  height: 20px;
}

.theme-option-label {
  font-size: 10px;
  line-height: 1.2;
  text-align: center;
}

.icon-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-btn svg {
  width: 16px;
  height: 16px;
}

.pin-icon-btn svg {
  width: 18px;
  height: 18px;
}

.icon-btn:hover {
  background: var(--color-ghost-bg-hover);
  border-color: var(--color-border);
  color: var(--color-text);
}

.icon-btn.is-active {
  background: var(--color-primary-soft-bg);
  border-color: var(--color-primary-soft-border);
  color: var(--color-primary-soft-text);
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.icon-btn.spinning svg {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>

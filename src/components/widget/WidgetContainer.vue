<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { ComponentPublicInstance } from "vue";
import { useProviders } from "../../composables/useProviders";
import type { ProviderId, UsageSummary } from "../../types/provider";
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

const cardListRef = ref<HTMLElement | null>(null);
const orderedProviders = ref<UsageSummary[]>([]);
const dragState = ref<DragState | null>(null);
const layoutSaveState = ref<"idle" | "saving" | "saved" | "error">("idle");
const cardRefs = new Map<ProviderId, HTMLElement>();

let saveFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

const enabledProviders = computed(() => providerStore.enabledProviders());
const isDragging = computed(() => !!dragState.value && !dragState.value.releasing);
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

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerCancel);
  clearSaveFeedbackTimer();
});

function clearSaveFeedbackTimer() {
  if (saveFeedbackTimer) {
    clearTimeout(saveFeedbackTimer);
    saveFeedbackTimer = null;
  }
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
      <button
        class="icon-btn"
        :class="{ spinning: providerStore.isRefreshing }"
        @click="manualRefresh"
        :disabled="providerStore.isRefreshing || isDragging"
        title="刷新数据"
      >
        🔄
      </button>
      <button class="icon-btn" @click="$emit('openSettings')" title="设置">
        ⚙
      </button>
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

.icon-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
}

.icon-btn:hover {
  background: var(--color-ghost-bg-hover);
  border-color: var(--color-border);
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.icon-btn.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>

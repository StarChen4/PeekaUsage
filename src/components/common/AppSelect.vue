<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

type SelectValue = string | number;

type SelectOption = {
  value: SelectValue;
  label: string;
  disabled?: boolean;
  providerId?: string;
};

const props = withDefaults(defineProps<{
  modelValue: SelectValue | null;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  listMaxHeight?: number;
}>(), {
  placeholder: "请选择",
  disabled: false,
  ariaLabel: "选择选项",
  listMaxHeight: 240,
});

const emit = defineEmits<{
  "update:modelValue": [value: SelectValue];
  change: [value: SelectValue];
  open: [];
  close: [];
}>();

const isOpen = ref(false);
const activeIndex = ref(-1);
const triggerRef = ref<HTMLButtonElement | null>(null);
const panelRef = ref<HTMLDivElement | null>(null);
const panelStyle = ref<Record<string, string>>({});

const selectedOption = computed(() => {
  return props.options.find((option) => option.value === props.modelValue) ?? null;
});

function closeMenu() {
  if (!isOpen.value) {
    return;
  }

  isOpen.value = false;
  emit("close");
}

function getFirstEnabledIndex() {
  return props.options.findIndex((option) => !option.disabled);
}

function setActiveToSelected() {
  const selectedIndex = props.options.findIndex((option) => option.value === props.modelValue && !option.disabled);
  activeIndex.value = selectedIndex >= 0 ? selectedIndex : getFirstEnabledIndex();
}

function syncPanelPosition() {
  const trigger = triggerRef.value;
  const panel = panelRef.value;
  if (!trigger || !panel) {
    return;
  }

  const rect = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const panelHeight = Math.min(panel.scrollHeight, props.listMaxHeight);
  const gap = 6;
  const edgePadding = 12;
  const spaceBelow = viewportHeight - rect.bottom - edgePadding;
  const placeAbove = spaceBelow < Math.min(panelHeight, 180) && rect.top > spaceBelow;
  const top = placeAbove
    ? Math.max(edgePadding, rect.top - panelHeight - gap)
    : Math.max(edgePadding, Math.min(viewportHeight - edgePadding - panelHeight, rect.bottom + gap));
  const maxLeft = Math.max(edgePadding, viewportWidth - rect.width - edgePadding);
  const left = Math.min(Math.max(edgePadding, rect.left), maxLeft);

  panelStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    width: `${rect.width}px`,
    maxHeight: `${props.listMaxHeight}px`,
  };
}

function scrollActiveOptionIntoView() {
  const panel = panelRef.value;
  if (!panel || activeIndex.value < 0) {
    return;
  }

  const activeOption = panel.querySelector<HTMLElement>(`[data-index="${activeIndex.value}"]`);
  activeOption?.scrollIntoView({ block: "nearest" });
}

function openMenu() {
  if (props.disabled || props.options.length === 0 || isOpen.value) {
    return;
  }

  setActiveToSelected();
  isOpen.value = true;
  emit("open");
}

function toggleMenu() {
  if (isOpen.value) {
    closeMenu();
    return;
  }

  openMenu();
}

function focusTrigger() {
  nextTick(() => {
    triggerRef.value?.focus();
  });
}

function selectOption(option: SelectOption) {
  if (option.disabled) {
    return;
  }

  emit("update:modelValue", option.value);
  emit("change", option.value);
  closeMenu();
  focusTrigger();
}

function moveActive(step: 1 | -1) {
  if (props.options.length === 0) {
    return;
  }

  let nextIndex = activeIndex.value;

  for (let i = 0; i < props.options.length; i += 1) {
    nextIndex = (nextIndex + step + props.options.length) % props.options.length;
    if (!props.options[nextIndex]?.disabled) {
      activeIndex.value = nextIndex;
      scrollActiveOptionIntoView();
      return;
    }
  }
}

function onKeydown(event: KeyboardEvent) {
  if (props.disabled) {
    return;
  }

  if (!isOpen.value) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu();
    }
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveActive(1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveActive(-1);
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    activeIndex.value = getFirstEnabledIndex();
    scrollActiveOptionIntoView();
    return;
  }

  if (event.key === "End") {
    event.preventDefault();
    const reversedIndex = [...props.options].reverse().findIndex((option) => !option.disabled);
    if (reversedIndex >= 0) {
      activeIndex.value = props.options.length - reversedIndex - 1;
      scrollActiveOptionIntoView();
    }
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    const option = props.options[activeIndex.value];
    if (option) {
      selectOption(option);
    }
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeMenu();
    focusTrigger();
    return;
  }

  if (event.key === "Tab") {
    closeMenu();
  }
}

function handlePointerDown(event: PointerEvent) {
  const target = event.target as Node | null;
  if (!target) {
    return;
  }

  if (triggerRef.value?.contains(target) || panelRef.value?.contains(target)) {
    return;
  }

  closeMenu();
}

function addWindowListeners() {
  document.addEventListener("pointerdown", handlePointerDown, true);
  window.addEventListener("resize", syncPanelPosition);
  window.addEventListener("scroll", syncPanelPosition, true);
}

function removeWindowListeners() {
  document.removeEventListener("pointerdown", handlePointerDown, true);
  window.removeEventListener("resize", syncPanelPosition);
  window.removeEventListener("scroll", syncPanelPosition, true);
}

watch(isOpen, async (open) => {
  if (open) {
    addWindowListeners();
    await nextTick();
    syncPanelPosition();
    scrollActiveOptionIntoView();
    return;
  }

  removeWindowListeners();
});

watch(() => props.options, () => {
  if (!isOpen.value) {
    return;
  }

  nextTick(() => {
    syncPanelPosition();
    scrollActiveOptionIntoView();
  });
}, { deep: true });

watch(() => props.modelValue, () => {
  if (!isOpen.value) {
    return;
  }

  setActiveToSelected();
  nextTick(scrollActiveOptionIntoView);
});

onBeforeUnmount(() => {
  removeWindowListeners();
});
</script>

<template>
  <div class="app-select">
    <button
      ref="triggerRef"
      class="select-trigger"
      :class="{ 'is-open': isOpen, 'is-disabled': disabled }"
      :aria-expanded="isOpen"
      :aria-haspopup="'listbox'"
      :aria-label="ariaLabel"
      type="button"
      @click="toggleMenu"
      @keydown="onKeydown"
    >
      <span class="select-trigger-content">
        <slot name="selected" :option="selectedOption">
          <span class="select-trigger-label" :class="{ 'is-placeholder': !selectedOption }">
            {{ selectedOption?.label ?? placeholder }}
          </span>
        </slot>
      </span>
      <svg
        class="select-caret"
        :class="{ 'is-open': isOpen }"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
      >
        <path d="M2.5 4.5L6 8L9.5 4.5" />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="panelRef"
        class="select-panel"
        :style="panelStyle"
        role="listbox"
        :aria-label="ariaLabel"
      >
        <button
          v-for="(option, index) in options"
          :key="String(option.value)"
          class="select-option"
          :class="{
            'is-selected': option.value === modelValue,
            'is-active': index === activeIndex,
            'is-disabled': option.disabled,
          }"
          :aria-selected="option.value === modelValue"
          :data-index="index"
          :disabled="option.disabled"
          role="option"
          tabindex="-1"
          type="button"
          @click="selectOption(option)"
          @mouseenter="activeIndex = index"
        >
          <slot
            name="option"
            :option="option"
            :selected="option.value === modelValue"
            :active="index === activeIndex"
          >
            <span class="select-option-label">{{ option.label }}</span>
          </slot>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.app-select {
  width: 100%;
}

.select-trigger {
  width: 100%;
  min-height: 32px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: linear-gradient(180deg, var(--color-surface-hover), var(--color-surface));
  color: var(--color-text);
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.select-trigger:hover {
  border-color: var(--color-border-hover);
}

.select-trigger:focus-visible {
  outline: none;
  border-color: var(--color-primary-soft-border);
  box-shadow: 0 0 0 3px var(--color-primary-soft-bg);
}

.select-trigger.is-open {
  border-color: var(--color-primary-soft-border);
  box-shadow: 0 0 0 3px var(--color-primary-soft-bg);
}

.select-trigger.is-disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.select-trigger-content {
  flex: 1;
  min-width: 0;
  text-align: left;
}

.select-trigger-label {
  display: block;
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-text);
}

.select-trigger-label.is-placeholder {
  color: var(--color-text-muted);
}

.select-caret {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--color-text-muted);
  transition: transform 0.15s ease, color 0.15s ease;
}

.select-caret.is-open {
  transform: rotate(180deg);
  color: var(--color-text);
}

.select-caret path {
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.select-panel {
  position: fixed;
  z-index: 1100;
  overflow-y: auto;
  padding: 6px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: linear-gradient(180deg, var(--color-surface-hover), var(--color-surface));
  box-shadow: var(--shadow-drag);
  backdrop-filter: blur(12px);
}

.select-option {
  width: 100%;
  min-height: 34px;
  padding: 7px 9px;
  border: 0;
  border-radius: calc(var(--radius-sm) + 1px);
  background: transparent;
  color: var(--color-text);
  display: flex;
  align-items: center;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.select-option:hover,
.select-option.is-active {
  background: var(--color-ghost-bg-hover);
}

.select-option.is-selected {
  background: var(--color-primary-soft-bg);
  color: var(--color-primary-soft-text);
}

.select-option.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.select-option-label {
  display: block;
  font-size: 12px;
  line-height: 1.4;
}
</style>

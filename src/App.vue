<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import TitleBar from "./components/common/TitleBar.vue";
import WidgetContainer from "./components/widget/WidgetContainer.vue";
import SettingsPanel from "./components/settings/SettingsPanel.vue";
import { useWindowControls } from "./composables/useWindowControls";
import { useProviderStore } from "./stores/providerStore";
import { useSettingsStore } from "./stores/settingsStore";
import { applyTheme, observeSystemTheme } from "./utils/theme";

const currentView = ref<"widget" | "settings">("widget");
const providerStore = useProviderStore();
const settingsStore = useSettingsStore();
const { applyOpacity } = useWindowControls();

let unlistenRefresh: UnlistenFn | null = null;
let unlistenSettings: UnlistenFn | null = null;
let stopObservingSystemTheme: (() => void) | null = null;

function handleBackFromSettings() {
  currentView.value = "widget";

  if (settingsStore.settings.refreshOnSettingsClose) {
    void providerStore.refreshAll();
  }
}

function syncTheme() {
  applyTheme(settingsStore.settings.theme);
}

async function syncAlwaysOnTop() {
  try {
    await getCurrentWindow().setAlwaysOnTop(settingsStore.settings.alwaysOnTop);
  } catch {
    // 忽略窗口置顶同步失败，避免影响界面初始化
  }
}

watch(() => settingsStore.settings.theme, syncTheme, { immediate: true });
watch(() => settingsStore.settings.alwaysOnTop, () => {
  void syncAlwaysOnTop();
});
watch(() => settingsStore.settings.windowOpacity, (value) => {
  void applyOpacity(value);
});

onMounted(async () => {
  await settingsStore.loadSettings();
  syncTheme();
  await applyOpacity(settingsStore.settings.windowOpacity);
  await syncAlwaysOnTop();

  unlistenRefresh = await listen("tray-refresh", () => {
    providerStore.refreshAll();
  });
  unlistenSettings = await listen("tray-open-settings", () => {
    currentView.value = "settings";
  });

  stopObservingSystemTheme = observeSystemTheme(() => {
    if (settingsStore.settings.theme === "system") {
      syncTheme();
    }
  });
});

onUnmounted(() => {
  unlistenRefresh?.();
  unlistenSettings?.();
  stopObservingSystemTheme?.();
});
</script>

<template>
  <TitleBar />
  <WidgetContainer
    v-if="currentView === 'widget'"
    @open-settings="currentView = 'settings'"
  />
  <SettingsPanel
    v-else
    @back="handleBackFromSettings"
  />
</template>

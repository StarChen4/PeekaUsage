<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import TitleBar from "./components/common/TitleBar.vue";
import WidgetContainer from "./components/widget/WidgetContainer.vue";
import SettingsPanel from "./components/settings/SettingsPanel.vue";
import { useProviderStore } from "./stores/providerStore";
import { useSettingsStore } from "./stores/settingsStore";
import { applyTheme, observeSystemTheme } from "./utils/theme";

const currentView = ref<"widget" | "settings">("widget");
const providerStore = useProviderStore();
const settingsStore = useSettingsStore();

let unlistenRefresh: UnlistenFn | null = null;
let unlistenSettings: UnlistenFn | null = null;
let stopObservingSystemTheme: (() => void) | null = null;

function syncTheme() {
  applyTheme(settingsStore.settings.theme);
}

watch(() => settingsStore.settings.theme, syncTheme, { immediate: true });

onMounted(async () => {
  await settingsStore.loadSettings();
  syncTheme();

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
    @back="currentView = 'widget'"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import TitleBar from "./components/common/TitleBar.vue";
import WidgetContainer from "./components/widget/WidgetContainer.vue";
import SettingsPanel from "./components/settings/SettingsPanel.vue";
import { useProviderStore } from "./stores/providerStore";

const currentView = ref<"widget" | "settings">("widget");
const providerStore = useProviderStore();

let unlistenRefresh: UnlistenFn | null = null;
let unlistenSettings: UnlistenFn | null = null;

onMounted(async () => {
  // 监听来自托盘的事件
  unlistenRefresh = await listen("tray-refresh", () => {
    providerStore.refreshAll();
  });
  unlistenSettings = await listen("tray-open-settings", () => {
    currentView.value = "settings";
  });
});

onUnmounted(() => {
  unlistenRefresh?.();
  unlistenSettings?.();
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

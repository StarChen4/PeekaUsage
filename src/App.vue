<script setup lang="ts">
import { ref } from "vue";
import TitleBar from "./components/common/TitleBar.vue";
import WidgetContainer from "./components/widget/WidgetContainer.vue";
import SettingsPanel from "./components/settings/SettingsPanel.vue";

const currentView = ref<"widget" | "settings">("widget");
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

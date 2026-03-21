<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { ProviderId } from "../../types/provider";
import openaiIcon from "../../assets/provider-icons/openai.svg";
import anthropicIcon from "../../assets/provider-icons/anthropic.png";
import openrouterIcon from "../../assets/provider-icons/openrouter.jpeg";

const props = withDefaults(
  defineProps<{
    providerId: ProviderId;
    size?: number;
  }>(),
  {
    size: 18,
  }
);

const iconStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
}));
const { t } = useI18n();

const iconSrcMap: Record<ProviderId, string> = {
  openai: openaiIcon,
  anthropic: anthropicIcon,
  openrouter: openrouterIcon,
};

const iconAltMap: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
};

const iconSrc = computed(() => iconSrcMap[props.providerId]);
const iconAlt = computed(() => t("providerIcon.alt", { providerName: iconAltMap[props.providerId] }));
</script>

<template>
  <span class="provider-icon" :class="`is-${providerId}`" :style="iconStyle" aria-hidden="true">
    <img :src="iconSrc" :alt="iconAlt" />
  </span>
</template>

<style scoped>
.provider-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.provider-icon img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.provider-icon.is-openai {
  background: rgba(255, 255, 255, 0.92);
}

.provider-icon.is-anthropic {
  background: rgba(237, 228, 210, 0.95);
}

.provider-icon.is-openrouter {
  background: rgba(255, 255, 255, 0.92);
}
</style>

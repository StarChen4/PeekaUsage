import { createI18n } from "vue-i18n";
import type { AppLanguage } from "../types/settings";
import { DEFAULT_SETTINGS } from "../types/settings";
import { messages } from "./messages";

export const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_SETTINGS.language,
  fallbackLocale: "en",
  globalInjection: false,
  messages,
});

export function setI18nLanguage(language: AppLanguage) {
  i18n.global.locale.value = language;
  document.documentElement.lang = language;
}

setI18nLanguage(DEFAULT_SETTINGS.language);

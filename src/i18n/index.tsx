import {
  createContext,
  useContext,
  useEffect,
  type PropsWithChildren,
} from "react";
import { DEFAULT_SETTINGS, type AppLanguage } from "../types/settings";
import { useSettingsStore } from "../stores/settingsStore";
import { messages } from "./messages";

type TranslationParams = Record<string, string | number | null | undefined>;

type I18nContextValue = {
  language: AppLanguage;
  t: (key: string, params?: TranslationParams) => string;
};

const I18nContext = createContext<I18nContextValue>({
  language: DEFAULT_SETTINGS.language,
  t: (key) => key,
});

function getMessage(language: AppLanguage, key: string): string | null {
  const parts = key.split(".");
  let current: unknown = messages[language];

  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      current = null;
      break;
    }

    current = (current as Record<string, unknown>)[part];
  }

  if (typeof current === "string") {
    return current;
  }

  if (language !== "en") {
    return getMessage("en", key);
  }

  return null;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = params[token];
    return value == null ? `{${token}}` : String(value);
  });
}

export function setI18nLanguage(language: AppLanguage) {
  document.documentElement.lang = language;
}

export function I18nProvider({ children }: PropsWithChildren) {
  const language = useSettingsStore((state) => state.settings.language);

  useEffect(() => {
    setI18nLanguage(language);
  }, [language]);

  const value: I18nContextValue = {
    language,
    t: (key, params) => {
      const message = getMessage(language, key);
      return message ? interpolate(message, params) : key;
    },
  };

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

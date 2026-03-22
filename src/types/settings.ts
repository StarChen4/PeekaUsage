import type { ProviderId } from "./provider";

export type PollingMode = "auto" | "manual";
export type PollingUnit = "seconds" | "minutes";
export type ThemeMode = "system" | "light" | "dark";
export type AppLanguage = "zh-Hans" | "zh-Hant" | "en";
export type WidgetDisplayMode = "detailed" | "compact";

export const DEFAULT_POLLING_INTERVAL = 5;
export const MIN_POLLING_INTERVAL = 1;
export const MAX_POLLING_INTERVAL = 999;
export const SUPPORTED_LANGUAGES: AppLanguage[] = ["zh-Hans", "zh-Hant", "en"];

export interface PollingSettings {
  pollingInterval: number;
  pollingMode: PollingMode;
  pollingUnit: PollingUnit;
}

/** 应用设置 */
export interface AppSettings extends PollingSettings {
  providerPollingOverridesEnabled: boolean;
  providerPollingOverrides: Partial<Record<ProviderId, PollingSettings>>;
  refreshOnSettingsClose: boolean;
  language: AppLanguage;
  widgetDisplayMode: WidgetDisplayMode;
  alwaysOnTop: boolean;
  launchAtStartup: boolean;
  windowOpacity: number;
  theme: ThemeMode;
  windowPosition: { x: number; y: number } | null;
  windowSize: { width: number; height: number } | null;
  providerCardExpanded: Partial<Record<ProviderId, boolean>>;
}

/** 默认设置 */
export const DEFAULT_SETTINGS: AppSettings = {
  pollingInterval: DEFAULT_POLLING_INTERVAL,
  pollingMode: "auto",
  pollingUnit: "minutes",
  providerPollingOverridesEnabled: false,
  providerPollingOverrides: {},
  refreshOnSettingsClose: false,
  language: "zh-Hans",
  widgetDisplayMode: "detailed",
  alwaysOnTop: true,
  launchAtStartup: false,
  windowOpacity: 100,
  theme: "system",
  windowPosition: null,
  windowSize: null,
  providerCardExpanded: createDefaultProviderCardExpanded(),
};

function createDefaultProviderCardExpanded(): Record<ProviderId, boolean> {
  return {
    openai: true,
    anthropic: true,
    openrouter: true,
  };
}

export function normalizePollingInterval(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_POLLING_INTERVAL;
  }

  return Math.min(
    MAX_POLLING_INTERVAL,
    Math.max(MIN_POLLING_INTERVAL, Math.round(value)),
  );
}

export function normalizePollingSettings(settings: PollingSettings): PollingSettings {
  return {
    pollingInterval: normalizePollingInterval(settings.pollingInterval),
    pollingMode: settings.pollingMode,
    pollingUnit: settings.pollingUnit,
  };
}

export function normalizeProviderPollingOverrides(
  overrides: Partial<Record<ProviderId, PollingSettings>> | undefined,
): Partial<Record<ProviderId, PollingSettings>> {
  const next: Partial<Record<ProviderId, PollingSettings>> = {};

  for (const providerId of ["openai", "anthropic", "openrouter"] as const) {
    const item = overrides?.[providerId];
    if (!item) {
      continue;
    }
    next[providerId] = normalizePollingSettings(item);
  }

  return next;
}

export function normalizeAppSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    ...normalizePollingSettings(settings),
    providerPollingOverridesEnabled: !!settings.providerPollingOverridesEnabled,
    providerPollingOverrides: normalizeProviderPollingOverrides(settings.providerPollingOverrides),
    refreshOnSettingsClose: !!settings.refreshOnSettingsClose,
    language: normalizeAppLanguage(settings.language),
    widgetDisplayMode: normalizeWidgetDisplayMode(settings.widgetDisplayMode),
  };
}

export function getPollingIntervalMs(settings: PollingSettings): number | null {
  if (settings.pollingMode === "manual") {
    return null;
  }

  const interval = normalizePollingInterval(settings.pollingInterval);
  return settings.pollingUnit === "seconds"
    ? interval * 1000
    : interval * 60 * 1000;
}

export function getEffectivePollingSettings(
  settings: AppSettings,
  providerId: ProviderId,
): PollingSettings {
  if (settings.providerPollingOverridesEnabled) {
    const override = settings.providerPollingOverrides[providerId];
    if (override) {
      return normalizePollingSettings(override);
    }
  }

  return normalizePollingSettings(settings);
}

export function normalizeAppLanguage(language: AppLanguage | string | undefined): AppLanguage {
  if (language && SUPPORTED_LANGUAGES.includes(language as AppLanguage)) {
    return language as AppLanguage;
  }

  return DEFAULT_SETTINGS.language;
}

export function normalizeWidgetDisplayMode(
  mode: WidgetDisplayMode | string | undefined,
): WidgetDisplayMode {
  return mode === "compact" ? "compact" : DEFAULT_SETTINGS.widgetDisplayMode;
}

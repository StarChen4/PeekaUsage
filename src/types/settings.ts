import type { ProviderId } from "./provider";

export type PollingMode = "auto" | "manual";
export type PollingUnit = "seconds" | "minutes";
export type ThemeMode = "system" | "light" | "dark";

export const DEFAULT_POLLING_INTERVAL = 5;
export const MIN_POLLING_INTERVAL = 1;
export const MAX_POLLING_INTERVAL = 999;

/** 应用设置 */
export interface AppSettings {
  pollingInterval: number;
  pollingMode: PollingMode;
  pollingUnit: PollingUnit;
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

export function getPollingIntervalMs(settings: Pick<AppSettings, "pollingInterval" | "pollingMode" | "pollingUnit">): number | null {
  if (settings.pollingMode === "manual") {
    return null;
  }

  const interval = normalizePollingInterval(settings.pollingInterval);
  return settings.pollingUnit === "seconds"
    ? interval * 1000
    : interval * 60 * 1000;
}

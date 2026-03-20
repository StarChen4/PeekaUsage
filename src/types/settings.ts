import type { ProviderId } from "./provider";

/** 轮询间隔选项（分钟） */
export type PollingInterval = 1 | 2 | 5 | 10 | 30;

/** 应用设置 */
export interface AppSettings {
  pollingInterval: PollingInterval;
  alwaysOnTop: boolean;
  launchAtStartup: boolean;
  windowOpacity: number;
  windowPosition: { x: number; y: number } | null;
  windowSize: { width: number; height: number } | null;
  providerCardExpanded: Partial<Record<ProviderId, boolean>>;
}

/** 默认设置 */
export const DEFAULT_SETTINGS: AppSettings = {
  pollingInterval: 5,
  alwaysOnTop: true,
  launchAtStartup: false,
  windowOpacity: 100,
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

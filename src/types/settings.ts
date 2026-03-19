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
}

/** 默认设置 */
export const DEFAULT_SETTINGS: AppSettings = {
  pollingInterval: 5,
  alwaysOnTop: true,
  launchAtStartup: false,
  windowOpacity: 100,
  windowPosition: null,
  windowSize: null,
};

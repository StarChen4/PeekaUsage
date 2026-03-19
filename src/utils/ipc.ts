import { invoke } from "@tauri-apps/api/core";
import type { UsageSummary, ProviderConfigItem, ProviderId } from "../types/provider";
import type { AppSettings } from "../types/settings";

/** 获取所有供应商用量摘要 */
export async function fetchAllUsage(): Promise<UsageSummary[]> {
  return invoke<UsageSummary[]>("fetch_all_usage");
}

/** 获取单个供应商用量摘要 */
export async function fetchProviderUsage(providerId: ProviderId): Promise<UsageSummary> {
  return invoke<UsageSummary>("fetch_provider_usage", { providerId });
}

/** 获取供应商配置列表 */
export async function getProviderConfigs(): Promise<ProviderConfigItem[]> {
  return invoke<ProviderConfigItem[]>("get_provider_configs");
}

/** 保存供应商配置 */
export async function saveProviderConfig(config: {
  providerId: ProviderId;
  apiKey: string;
  enabled: boolean;
}): Promise<void> {
  return invoke("save_provider_config", { config });
}

/** 验证 API Key */
export async function validateApiKey(providerId: ProviderId, apiKey: string): Promise<boolean> {
  return invoke<boolean>("validate_api_key", { providerId, apiKey });
}

/** 获取应用设置 */
export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_settings");
}

/** 保存应用设置 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

/** 设置窗口透明度 */
export async function setWindowOpacity(opacity: number): Promise<void> {
  return invoke("set_window_opacity", { opacity });
}

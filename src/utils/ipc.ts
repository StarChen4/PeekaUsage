import { invoke } from "@tauri-apps/api/core";
import type {
  UsageSummary,
  ProviderConfigItem,
  ProviderId,
  ProviderApiKeyItem,
  ProviderSubscriptionItem,
} from "../types/provider";
import type { AppSettings } from "../types/settings";
import type { StatsRange, UsageStatsSnapshot } from "../types/stats";

/** 获取所有供应商用量摘要 */
export async function fetchAllUsage(): Promise<UsageSummary[]> {
  return invoke<UsageSummary[]>("fetch_all_usage");
}

/** 获取单个供应商用量摘要 */
export async function fetchProviderUsage(providerId: ProviderId): Promise<UsageSummary> {
  return invoke<UsageSummary>("fetch_provider_usage", { providerId });
}

/** 获取已添加的供应商配置列表 */
export async function getProviderConfigs(): Promise<ProviderConfigItem[]> {
  return invoke<ProviderConfigItem[]>("get_provider_configs");
}

/** 获取支持的供应商列表 */
export async function getSupportedProviders(): Promise<ProviderConfigItem[]> {
  return invoke<ProviderConfigItem[]>("get_supported_providers");
}

/** 保存供应商配置 */
export async function saveProviderConfig(config: {
  providerId: ProviderId;
  apiKeys: Array<Pick<ProviderApiKeyItem, "id" | "name" | "color" | "value">>;
  subscriptions: Array<Pick<ProviderSubscriptionItem, "id" | "name" | "color" | "oauthToken" | "source">>;
  enabled: boolean;
}): Promise<void> {
  return invoke("save_provider_config", { config });
}

/** 移除供应商配置 */
export async function removeProviderConfig(providerId: ProviderId): Promise<void> {
  return invoke("remove_provider_config", { providerId });
}

export async function saveProviderOrder(order: ProviderId[]): Promise<void> {
  return invoke("save_provider_order", { order });
}

export async function getUsageStatsSnapshot(range: StatsRange): Promise<UsageStatsSnapshot> {
  return invoke<UsageStatsSnapshot>("get_usage_stats_snapshot", { range });
}

/** 激活某个 API Key 并同步到系统环境变量 */
export async function activateProviderApiKey(providerId: ProviderId, apiKeyId: string): Promise<void> {
  return invoke("activate_provider_api_key", { providerId, apiKeyId });
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

/** 璁剧疆鏄惁闅愯棌 Windows 浠诲姟鏍忓浘鏍? */
export async function setWindowSkipTaskbar(skip: boolean): Promise<void> {
  return invoke("set_window_skip_taskbar", { skip });
}

/** 检测到的 OAuth Token */
export interface DetectedToken {
  token: string;
  source: string;
  subscriptionType: string | null;
  environment: "windows" | "wsl" | "native";
  displaySource: string;
}

/** 检测到的 Token 集合 */
export interface DetectedTokens {
  anthropic: DetectedToken[];
  openai: DetectedToken[];
}

/** 自动检测本地 OAuth Token */
export async function detectOAuthTokens(): Promise<DetectedTokens> {
  return invoke<DetectedTokens>("detect_oauth_tokens");
}

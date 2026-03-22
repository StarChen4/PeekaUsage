/** 供应商 ID */
export type ProviderId = "openai" | "anthropic" | "openrouter";

/** 供应商能力 */
export interface ProviderCapabilities {
  hasBalance: boolean;
  hasUsage: boolean;
  hasRateLimit: boolean;
  hasSubscription: boolean;
}

/** 用量数据（按量 API） */
export interface UsageData {
  totalUsed: number;
  totalBudget: number | null;
  remaining: number | null;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
}

/** 订阅用量窗口 */
export interface SubscriptionWindow {
  label: string;
  utilization: number;
  resetsAt: string | null;
}

/** 订阅用量数据 */
export interface SubscriptionUsage {
  planName: string | null;
  windows: SubscriptionWindow[];
  status: ProviderStatus;
  errorMessage: string | null;
}

/** 速率限制数据 */
export interface RateLimitData {
  requestsPerMinute: number | null;
  requestsPerMinuteLimit: number | null;
  tokensPerMinute: number | null;
  tokensPerMinuteLimit: number | null;
}

/** 供应商状态 */
export type ProviderStatus = "idle" | "loading" | "success" | "error";

/** 单个 API Key 的用量摘要 */
export interface ApiKeyUsageSummary {
  keyId: string;
  keyName: string;
  status: ProviderStatus;
  usage: UsageData | null;
  rateLimit: RateLimitData | null;
  errorMessage: string | null;
}

/** 供应商用量摘要（从后端返回） */
export interface UsageSummary {
  providerId: ProviderId;
  displayName: string;
  enabled: boolean;
  status: ProviderStatus;
  apiKeyUsages: ApiKeyUsageSummary[];
  usage: UsageData | null;
  subscription: SubscriptionUsage | null;
  rateLimit: RateLimitData | null;
  lastUpdated: string | null;
  errorMessage: string | null;
}

/** 命名 API Key 配置 */
export interface ProviderApiKeyItem {
  id: string;
  name: string;
  value: string;
  isActiveInEnvironment: boolean;
}

/** 供应商配置（前端用） */
export interface ProviderConfigItem {
  providerId: ProviderId;
  displayName: string;
  enabled: boolean;
  apiKeys: ProviderApiKeyItem[];
  oauthToken: string;
  capabilities: ProviderCapabilities;
  environmentVariableName: string;
  activeApiKeyId: string | null;
}

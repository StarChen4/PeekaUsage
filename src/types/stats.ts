import type { ProviderId } from "./provider";

export type StatsRange = "day" | "month";
export type StatsHealthNoticeLevel = "info" | "warning";
export type StatsHealthNoticeCode =
  | "enableAutoRefresh"
  | "insufficientSamples"
  | "staleData"
  | "startingToCollect";

export type UsageForecastStatus =
  | "available"
  | "insufficientData"
  | "notApplicable"
  | "unlikelyBeforeReset";

export type SubscriptionTrendKind = "window" | "extraUsage";

export interface StatsHealthNotice {
  code: StatsHealthNoticeCode;
  level: StatsHealthNoticeLevel;
}

export interface UsageForecast {
  status: UsageForecastStatus;
  estimatedAt: string | null;
  hoursRemaining: number | null;
}

export interface ApiStatsSummary {
  currentTotalUsed: number;
  rangeUsed: number;
  currentRemaining: number | null;
  currency: string;
  recentVelocity: number | null;
  forecast: UsageForecast;
}

export interface SubscriptionTrendSummary {
  subscriptionId: string;
  subscriptionName: string;
  kind: SubscriptionTrendKind;
  label: string;
  currentUtilization: number;
  rangeDelta: number;
  recentVelocity: number | null;
  forecast: UsageForecast;
  resetsAt: string | null;
  currentUsed: number | null;
  currentLimit: number | null;
  currency: string | null;
}

export interface ProviderStatsSnapshot {
  providerId: ProviderId;
  displayName: string;
  apiSummary: ApiStatsSummary | null;
  subscriptionTrends: SubscriptionTrendSummary[];
  lastSampleAt: string | null;
}

export interface UsageStatsSnapshot {
  range: StatsRange;
  generatedAt: string;
  healthNotices: StatsHealthNotice[];
  providers: ProviderStatsSnapshot[];
}

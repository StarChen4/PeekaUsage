use serde::{Deserialize, Serialize};

/// 供应商 ID
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum ProviderId {
    #[serde(rename = "openai")]
    OpenAI,
    #[serde(rename = "anthropic")]
    Anthropic,
    #[serde(rename = "openrouter")]
    OpenRouter,
}

impl ProviderId {
    pub fn as_str(&self) -> &str {
        match self {
            ProviderId::OpenAI => "openai",
            ProviderId::Anthropic => "anthropic",
            ProviderId::OpenRouter => "openrouter",
        }
    }

    /// 按量 API Key 对应的环境变量名
    pub fn env_key_name(&self) -> &str {
        match self {
            ProviderId::OpenAI => "OPENAI_API_KEY",
            ProviderId::Anthropic => "ANTHROPIC_API_KEY",
            ProviderId::OpenRouter => "OPENROUTER_API_KEY",
        }
    }

    /// 订阅 OAuth Token 对应的环境变量名
    pub fn env_oauth_token_name(&self) -> Option<&str> {
        match self {
            ProviderId::OpenAI => Some("OPENAI_OAUTH_TOKEN"),
            ProviderId::Anthropic => Some("ANTHROPIC_OAUTH_TOKEN"),
            ProviderId::OpenRouter => None,
        }
    }

    /// 是否支持订阅用量查询
    pub fn supports_subscription(&self) -> bool {
        matches!(self, ProviderId::OpenAI | ProviderId::Anthropic)
    }
}

/// 供应商能力
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCapabilities {
    pub has_balance: bool,
    pub has_usage: bool,
    pub has_rate_limit: bool,
    pub has_subscription: bool,
}

/// 用量数据（按量 API）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageData {
    pub total_used: f64,
    pub total_budget: Option<f64>,
    pub remaining: Option<f64>,
    pub currency: String,
    pub period_start: Option<String>,
    pub period_end: Option<String>,
}

/// 订阅用量窗口
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionWindow {
    /// 窗口名称（如 "5小时"、"7天"、"主窗口"、"次窗口"）
    pub label: String,
    /// 利用率百分比 (0-100)
    pub utilization: f64,
    /// 重置时间 (ISO 8601)
    pub resets_at: Option<String>,
}

/// 订阅用量数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionUsage {
    /// 订阅计划名称（如 "Pro", "Max", "Plus"）
    pub plan_name: Option<String>,
    /// 各个限制窗口
    pub windows: Vec<SubscriptionWindow>,
    /// 状态
    pub status: ProviderStatus,
    /// 错误信息
    pub error_message: Option<String>,
}

/// 速率限制数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimitData {
    pub requests_per_minute: Option<u64>,
    pub requests_per_minute_limit: Option<u64>,
    pub tokens_per_minute: Option<u64>,
    pub tokens_per_minute_limit: Option<u64>,
}

/// 供应商状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderStatus {
    #[serde(rename = "idle")]
    Idle,
    #[serde(rename = "loading")]
    Loading,
    #[serde(rename = "success")]
    Success,
    #[serde(rename = "error")]
    Error,
}

/// 供应商用量摘要（返回给前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub provider_id: ProviderId,
    pub display_name: String,
    pub enabled: bool,
    pub status: ProviderStatus,
    pub usage: Option<UsageData>,
    pub subscription: Option<SubscriptionUsage>,
    pub rate_limit: Option<RateLimitData>,
    pub last_updated: Option<String>,
    pub error_message: Option<String>,
}

/// 供应商配置（从前端传入）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub provider_id: ProviderId,
    pub api_key: String,
    pub enabled: bool,
    #[serde(default)]
    pub oauth_token: String,
}

/// 供应商配置项（返回给前端，不含完整 Key）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfigItem {
    pub provider_id: ProviderId,
    pub display_name: String,
    pub enabled: bool,
    pub api_key: String,
    pub oauth_token: String,
    pub capabilities: ProviderCapabilities,
}

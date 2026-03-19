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

    /// 对应的环境变量名
    pub fn env_key_name(&self) -> &str {
        match self {
            ProviderId::OpenAI => "OPENAI_API_KEY",
            ProviderId::Anthropic => "ANTHROPIC_API_KEY",
            ProviderId::OpenRouter => "OPENROUTER_API_KEY",
        }
    }
}

/// 供应商能力
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCapabilities {
    pub has_balance: bool,
    pub has_usage: bool,
    pub has_rate_limit: bool,
}

/// 用量数据
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
    pub rate_limit: Option<RateLimitData>,
    pub last_updated: Option<String>,
    pub error_message: Option<String>,
}

/// 供应商配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub provider_id: ProviderId,
    pub api_key: String,
    pub enabled: bool,
}

/// 供应商配置项（返回给前端，不含完整 Key）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfigItem {
    pub provider_id: ProviderId,
    pub display_name: String,
    pub enabled: bool,
    pub api_key: String,
    pub capabilities: ProviderCapabilities,
}

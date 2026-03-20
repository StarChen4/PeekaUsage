use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;

use super::traits::{ProviderError, UsageProvider};
use super::types::*;

pub struct OpenRouterProvider {
    client: Client,
}

impl OpenRouterProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }
}

/// /api/v1/credits 响应
#[derive(Debug, Deserialize)]
struct CreditsResponse {
    data: CreditsData,
}

#[derive(Debug, Deserialize)]
struct CreditsData {
    total_credits: f64,
    total_usage: f64,
}

/// /api/v1/key 响应
#[derive(Debug, Deserialize)]
struct KeyInfoResponse {
    data: KeyInfoData,
}

#[derive(Debug, Deserialize)]
struct KeyInfoData {
    usage: f64,
    limit: Option<f64>,
    rate_limit: Option<KeyRateLimit>,
}

#[derive(Debug, Deserialize)]
struct KeyRateLimit {
    requests: Option<u64>,
}

#[async_trait]
impl UsageProvider for OpenRouterProvider {
    fn id(&self) -> ProviderId {
        ProviderId::OpenRouter
    }

    fn display_name(&self) -> &str {
        "OpenRouter"
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            has_balance: true,
            has_usage: true,
            has_rate_limit: true,
            has_subscription: false,
        }
    }

    async fn fetch_usage(&self, api_key: &str) -> Result<UsageData, ProviderError> {
        // 获取 credits 信息
        let credits_resp = self
            .client
            .get("https://openrouter.ai/api/v1/credits")
            .bearer_auth(api_key)
            .send()
            .await?;

        if credits_resp.status().as_u16() == 401 {
            return Err(ProviderError::AuthError("API Key 无效".into()));
        }

        if credits_resp.status().is_success() {
            let credits: CreditsResponse = credits_resp
                .json()
                .await
                .map_err(|e| ProviderError::ParseError(e.to_string()))?;

            return Ok(UsageData {
                total_used: credits.data.total_usage,
                total_budget: Some(credits.data.total_credits),
                remaining: Some((credits.data.total_credits - credits.data.total_usage).max(0.0)),
                currency: "USD".to_string(),
                period_start: None,
                period_end: None,
            });
        }

        // 回退到 /api/v1/key
        let key_resp = self
            .client
            .get("https://openrouter.ai/api/v1/key")
            .bearer_auth(api_key)
            .send()
            .await?;

        if !key_resp.status().is_success() {
            return Err(ProviderError::RequestError(format!(
                "HTTP {}",
                key_resp.status()
            )));
        }

        let key_info: KeyInfoResponse = key_resp
            .json()
            .await
            .map_err(|e| ProviderError::ParseError(e.to_string()))?;

        Ok(UsageData {
            total_used: key_info.data.usage,
            total_budget: key_info.data.limit,
            remaining: key_info.data.limit.map(|l| (l - key_info.data.usage).max(0.0)),
            currency: "USD".to_string(),
            period_start: None,
            period_end: None,
        })
    }

    async fn fetch_rate_limits(&self, api_key: &str) -> Result<Option<RateLimitData>, ProviderError> {
        let resp = self
            .client
            .get("https://openrouter.ai/api/v1/key")
            .bearer_auth(api_key)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Ok(None);
        }

        let key_info: KeyInfoResponse = resp
            .json()
            .await
            .map_err(|e| ProviderError::ParseError(e.to_string()))?;

        if let Some(rl) = key_info.data.rate_limit {
            Ok(Some(RateLimitData {
                requests_per_minute: rl.requests,
                requests_per_minute_limit: rl.requests,
                tokens_per_minute: None,
                tokens_per_minute_limit: None,
            }))
        } else {
            Ok(None)
        }
    }

    async fn validate_key(&self, api_key: &str) -> Result<bool, ProviderError> {
        let resp = self
            .client
            .get("https://openrouter.ai/api/v1/key")
            .bearer_auth(api_key)
            .send()
            .await?;

        Ok(resp.status().is_success())
    }
}

use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;

use super::traits::{ProviderError, UsageProvider};
use super::types::*;

pub struct AnthropicProvider {
    client: Client,
}

impl AnthropicProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }
}

/// 花费报告响应
#[derive(Debug, Deserialize)]
struct CostReportResponse {
    data: Vec<CostEntry>,
}

#[derive(Debug, Deserialize)]
struct CostEntry {
    #[serde(default)]
    cost_cents: f64,
}

#[async_trait]
impl UsageProvider for AnthropicProvider {
    fn id(&self) -> ProviderId {
        ProviderId::Anthropic
    }

    fn display_name(&self) -> &str {
        "Anthropic"
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            has_balance: false,
            has_usage: true,
            has_rate_limit: true,
            has_subscription: true,
        }
    }

    async fn fetch_usage(&self, api_key: &str) -> Result<UsageData, ProviderError> {
        let now = chrono::Utc::now();
        let start_date = now.format("%Y-%m-01").to_string();
        let end_date = now.format("%Y-%m-%d").to_string();

        let url = format!(
            "https://api.anthropic.com/v1/organizations/cost_report?start_date={}&end_date={}",
            start_date, end_date
        );

        let resp = self
            .client
            .get(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .send()
            .await?;

        if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 {
            return Err(ProviderError::AuthError(
                "Admin API Key 无效或权限不足（需要 sk-ant-admin... 格式）".into(),
            ));
        }

        if !resp.status().is_success() {
            return Err(ProviderError::RequestError(format!(
                "HTTP {}",
                resp.status()
            )));
        }

        let report: CostReportResponse = resp
            .json()
            .await
            .map_err(|e| ProviderError::ParseError(e.to_string()))?;

        let total_used: f64 = report.data.iter().map(|e| e.cost_cents).sum::<f64>() / 100.0;

        Ok(UsageData {
            total_used,
            total_budget: None,
            remaining: None,
            currency: "USD".to_string(),
            period_start: Some(start_date),
            period_end: Some(end_date),
        })
    }

    async fn fetch_rate_limits(
        &self,
        api_key: &str,
    ) -> Result<Option<RateLimitData>, ProviderError> {
        // 发一个轻量请求以获取响应头中的速率限制
        let resp = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .body(r#"{"model":"claude-sonnet-4-20250514","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}"#)
            .send()
            .await?;

        let headers = resp.headers();

        let rpm = headers
            .get("anthropic-ratelimit-requests-remaining")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok());

        let rpm_limit = headers
            .get("anthropic-ratelimit-requests-limit")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok());

        let tpm = headers
            .get("anthropic-ratelimit-tokens-remaining")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok());

        let tpm_limit = headers
            .get("anthropic-ratelimit-tokens-limit")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok());

        if rpm.is_some() || tpm.is_some() {
            Ok(Some(RateLimitData {
                requests_per_minute: rpm,
                requests_per_minute_limit: rpm_limit,
                tokens_per_minute: tpm,
                tokens_per_minute_limit: tpm_limit,
            }))
        } else {
            Ok(None)
        }
    }

    async fn validate_key(&self, api_key: &str) -> Result<bool, ProviderError> {
        // 使用 cost_report 端点验证 admin key
        let resp = self
            .client
            .get("https://api.anthropic.com/v1/organizations/cost_report?start_date=2024-01-01&end_date=2024-01-02")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .send()
            .await?;

        Ok(resp.status().is_success())
    }
}

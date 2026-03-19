use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;

use super::traits::{ProviderError, UsageProvider};
use super::types::*;

pub struct OpenAIProvider {
    client: Client,
}

impl OpenAIProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }
}

/// /v1/organization/costs 响应
#[derive(Debug, Deserialize)]
struct CostsResponse {
    #[serde(default)]
    data: Vec<CostBucket>,
}

#[derive(Debug, Deserialize)]
struct CostBucket {
    results: Vec<CostResult>,
}

#[derive(Debug, Deserialize)]
struct CostResult {
    amount: CostAmount,
}

#[derive(Debug, Deserialize)]
struct CostAmount {
    value: f64,
}

/// /v1/dashboard/billing/subscription 响应
#[derive(Debug, Deserialize)]
struct SubscriptionResponse {
    hard_limit_usd: Option<f64>,
}

/// /v1/dashboard/billing/credit_grants 响应
#[derive(Debug, Deserialize)]
struct CreditGrantsResponse {
    total_granted: Option<f64>,
    total_used: Option<f64>,
    total_available: Option<f64>,
}

#[async_trait]
impl UsageProvider for OpenAIProvider {
    fn id(&self) -> ProviderId {
        ProviderId::OpenAI
    }

    fn display_name(&self) -> &str {
        "OpenAI"
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            has_balance: true,
            has_usage: true,
            has_rate_limit: false,
        }
    }

    async fn fetch_usage(&self, api_key: &str) -> Result<UsageData, ProviderError> {
        // 先尝试获取 credit grants（预付费账户）
        let credits_result = self
            .client
            .get("https://api.openai.com/v1/dashboard/billing/credit_grants")
            .bearer_auth(api_key)
            .send()
            .await;

        if let Ok(resp) = credits_result {
            if resp.status().is_success() {
                if let Ok(credits) = resp.json::<CreditGrantsResponse>().await {
                    if let (Some(granted), Some(used), Some(available)) =
                        (credits.total_granted, credits.total_used, credits.total_available)
                    {
                        if granted > 0.0 {
                            return Ok(UsageData {
                                total_used: used,
                                total_budget: Some(granted),
                                remaining: Some(available),
                                currency: "USD".to_string(),
                                period_start: None,
                                period_end: None,
                            });
                        }
                    }
                }
            }
        }

        // 后付费账户：获取本月用量
        let now = chrono::Utc::now();
        let start_of_month = now.format("%Y-%m-01").to_string();
        let end_date = now.format("%Y-%m-%d").to_string();

        // 获取用量（costs API）
        let start_timestamp = chrono::NaiveDate::parse_from_str(&start_of_month, "%Y-%m-%d")
            .map(|d| d.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp())
            .unwrap_or(0);
        let end_timestamp = now.timestamp();

        let costs_url = format!(
            "https://api.openai.com/v1/organization/costs?start_time={}&end_time={}&group_by=line_item",
            start_timestamp, end_timestamp
        );

        let costs_resp = self
            .client
            .get(&costs_url)
            .bearer_auth(api_key)
            .send()
            .await?;

        if costs_resp.status().as_u16() == 401 || costs_resp.status().as_u16() == 403 {
            return Err(ProviderError::AuthError("API Key 无效或权限不足".into()));
        }

        let total_used = if costs_resp.status().is_success() {
            let costs: CostsResponse = costs_resp
                .json()
                .await
                .map_err(|e| ProviderError::ParseError(e.to_string()))?;
            costs
                .data
                .iter()
                .flat_map(|b| b.results.iter())
                .map(|r| r.amount.value)
                .sum::<f64>()
                / 100.0 // API 返回的是美分
        } else {
            0.0
        };

        // 尝试获取 subscription 限额
        let budget = match self
            .client
            .get("https://api.openai.com/v1/dashboard/billing/subscription")
            .bearer_auth(api_key)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => resp
                .json::<SubscriptionResponse>()
                .await
                .ok()
                .and_then(|s| s.hard_limit_usd),
            _ => None,
        };

        Ok(UsageData {
            total_used,
            total_budget: budget,
            remaining: budget.map(|b| (b - total_used).max(0.0)),
            currency: "USD".to_string(),
            period_start: Some(start_of_month),
            period_end: Some(end_date),
        })
    }

    async fn fetch_rate_limits(&self, _api_key: &str) -> Result<Option<RateLimitData>, ProviderError> {
        // OpenAI 速率限制在响应 header 中返回，需要实际请求才能获取
        Ok(None)
    }

    async fn validate_key(&self, api_key: &str) -> Result<bool, ProviderError> {
        let resp = self
            .client
            .get("https://api.openai.com/v1/models")
            .bearer_auth(api_key)
            .send()
            .await?;

        Ok(resp.status().is_success())
    }
}

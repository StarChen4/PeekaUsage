use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;

use super::http::{check_response, new_client, ApiNumber};
use super::traits::{ProviderError, UsageProvider};
use super::types::*;

pub struct OpenRouterProvider {
    client: Client,
    base_url: String,
}

impl OpenRouterProvider {
    pub fn new() -> Self {
        Self {
            client: new_client(),
            base_url: "https://openrouter.ai".into(),
        }
    }
}

#[derive(Debug, Deserialize)]
struct CreditsResponse {
    data: CreditsData,
}

#[derive(Debug, Deserialize)]
struct CreditsData {
    total_credits: ApiNumber,
    total_usage: ApiNumber,
}

#[derive(Debug, Deserialize)]
struct KeyInfoResponse {
    data: KeyInfoData,
}

#[derive(Debug, Deserialize)]
struct KeyInfoData {
    usage: ApiNumber,
    limit: Option<ApiNumber>,
    limit_remaining: Option<ApiNumber>,
    limit_reset: Option<String>,
    usage_daily: Option<ApiNumber>,
    usage_weekly: Option<ApiNumber>,
    usage_monthly: Option<ApiNumber>,
    byok_usage: Option<ApiNumber>,
    byok_usage_daily: Option<ApiNumber>,
    byok_usage_weekly: Option<ApiNumber>,
    byok_usage_monthly: Option<ApiNumber>,
    #[serde(default)]
    include_byok_in_limit: bool,
    is_management_key: Option<bool>,
    is_provisioning_key: Option<bool>,
    effective_budget: Option<EffectiveBudget>,
}

#[derive(Debug, Deserialize)]
struct EffectiveBudget {
    scope: Option<String>,
    limit_usd: ApiNumber,
    remaining_usd: ApiNumber,
    spend_usd: ApiNumber,
    resets_at: Option<String>,
}

impl KeyInfoData {
    fn to_usage(&self) -> Result<UsageData, ProviderError> {
        if let Some(budget) = &self.effective_budget {
            // 当前账户可能同时受成员、工作区等预算约束，优先生效预算。
            return Ok(UsageData {
                scope: if budget.scope.as_deref() == Some("key") {
                    UsageScope::Key
                } else {
                    UsageScope::SharedBudget
                },
                source: None,
                is_unlimited: false,
                total_used: budget.spend_usd.value()?,
                total_budget: Some(budget.limit_usd.value()?),
                remaining: Some(budget.remaining_usd.value()?),
                currency: "USD".into(),
                period_start: None,
                period_end: budget.resets_at.clone(),
            });
        }
        let limit = self.limit.as_ref().map(ApiNumber::value).transpose()?;
        let remaining = self
            .limit_remaining
            .as_ref()
            .map(ApiNumber::value)
            .transpose()?;
        let total_used = if let (Some(limit), Some(remaining)) = (limit, remaining) {
            // 剩余额度已经考虑重置周期与 BYOK，不能用历史累计金额反推。
            (limit - remaining).max(0.0)
        } else if limit.is_some() {
            let (usage, byok) = match self.limit_reset.as_deref() {
                Some("daily") => (self.usage_daily.as_ref(), self.byok_usage_daily.as_ref()),
                Some("weekly") => (self.usage_weekly.as_ref(), self.byok_usage_weekly.as_ref()),
                Some("monthly") => (
                    self.usage_monthly.as_ref(),
                    self.byok_usage_monthly.as_ref(),
                ),
                None => (Some(&self.usage), self.byok_usage.as_ref()),
                Some(_) => {
                    return Err(ProviderError::ParseError(
                        "无法识别 OpenRouter 额度重置周期".into(),
                    ))
                }
            };
            let mut used = usage
                .ok_or_else(|| ProviderError::ParseError("响应缺少当前额度周期的用量".into()))?
                .value()?;
            if self.include_byok_in_limit {
                used += byok
                    .ok_or_else(|| {
                        ProviderError::ParseError("响应缺少计入额度的 BYOK 用量".into())
                    })?
                    .value()?;
            }
            used
        } else {
            self.usage.value()?
        };
        Ok(UsageData {
            scope: UsageScope::Key,
            source: None,
            is_unlimited: false,
            total_used,
            total_budget: limit,
            remaining: remaining.or_else(|| limit.map(|limit| (limit - total_used).max(0.0))),
            currency: "USD".into(),
            period_start: None,
            period_end: None,
        })
    }
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
            has_rate_limit: false,
            has_subscription: false,
        }
    }

    async fn fetch_usage(&self, api_key: &str) -> Result<UsageData, ProviderError> {
        let response = check_response(
            self.client
                .get(format!("{}/api/v1/key", self.base_url))
                .bearer_auth(api_key)
                .send()
                .await?,
            "OpenRouter API Key 无效或权限不足",
        )?;
        let key: KeyInfoResponse = response
            .json()
            .await
            .map_err(|error| ProviderError::ParseError(error.to_string()))?;
        if !key
            .data
            .is_management_key
            .or(key.data.is_provisioning_key)
            .unwrap_or(false)
        {
            return key.data.to_usage();
        }
        // 账户总余额接口现在要求 Management Key；普通 Key 只查询自身额度。
        let response = check_response(
            self.client
                .get(format!("{}/api/v1/credits", self.base_url))
                .bearer_auth(api_key)
                .send()
                .await?,
            "查询 OpenRouter 账户余额需要具备相应权限的 Management Key",
        )?;
        let credits: CreditsResponse = response
            .json()
            .await
            .map_err(|error| ProviderError::ParseError(error.to_string()))?;
        let total_budget = credits.data.total_credits.value()?;
        let total_used = credits.data.total_usage.value()?;
        Ok(UsageData {
            scope: UsageScope::Account,
            source: None,
            is_unlimited: false,
            total_used,
            total_budget: Some(total_budget),
            remaining: Some(total_budget - total_used),
            currency: "USD".into(),
            period_start: None,
            period_end: None,
        })
    }

    async fn fetch_rate_limits(
        &self,
        _api_key: &str,
    ) -> Result<Option<RateLimitData>, ProviderError> {
        // rate_limit 是已废弃的兼容字段，不代表实时剩余请求数。
        Ok(None)
    }

    async fn validate_key(&self, api_key: &str) -> Result<bool, ProviderError> {
        match self.fetch_usage(api_key).await {
            Ok(_) => Ok(true),
            Err(ProviderError::AuthError(_)) => Ok(false),
            Err(error) => Err(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::http::tests::MockServer;
    use super::*;

    fn parse_usage(body: &str) -> UsageData {
        serde_json::from_str::<KeyInfoResponse>(body)
            .unwrap()
            .data
            .to_usage()
            .unwrap()
    }

    #[tokio::test]
    async fn regular_keys_use_remaining_limit_without_account_credit_requests() {
        let server = MockServer::start(vec![(200, r#"{"data":{"usage":9999,"limit":100,"limit_remaining":74.5,"limit_reset":"monthly","usage_monthly":25.5,"is_management_key":false,"rate_limit":{"requests":1000,"interval":"1h"}}}"#)]).await;
        let provider = OpenRouterProvider {
            client: new_client(),
            base_url: server.url.clone(),
        };
        let usage = provider.fetch_usage("test-key").await.unwrap();
        assert_eq!(usage.total_used, 25.5);
        assert_eq!(usage.remaining, Some(74.5));
        assert!(provider
            .fetch_rate_limits("test-key")
            .await
            .unwrap()
            .is_none());
        let requests = server.finish().await;
        assert_eq!(requests.len(), 1);
        assert!(requests[0].starts_with("GET /api/v1/key "));
    }

    #[tokio::test]
    async fn management_keys_can_read_account_credit_totals() {
        let server = MockServer::start(vec![
            (200, r#"{"data":{"usage":0,"is_management_key":true}}"#),
            (
                200,
                r#"{"data":{"total_credits":100.5,"total_usage":25.75}}"#,
            ),
        ])
        .await;
        let provider = OpenRouterProvider {
            client: new_client(),
            base_url: server.url.clone(),
        };
        let usage = provider.fetch_usage("test-management-key").await.unwrap();
        assert_eq!(usage.remaining, Some(74.75));
        assert!(server.finish().await[1].starts_with("GET /api/v1/credits "));
    }

    #[test]
    fn effective_budgets_override_key_caps_and_period_fallback_includes_byok() {
        let usage = parse_usage(
            r#"{"data":{"usage":500,"limit":100,"limit_remaining":74.5,"effective_budget":{"limit_usd":50,"remaining_usd":17.5,"spend_usd":32.5,"resets_at":"2026-11-01T00:00:00Z"}}}"#,
        );
        assert_eq!(usage.total_used, 32.5);
        assert_eq!(usage.total_budget, Some(50.0));
        assert_eq!(usage.remaining, Some(17.5));
        let usage = parse_usage(
            r#"{"data":{"usage":500,"limit":100,"limit_reset":"daily","usage_daily":10,"include_byok_in_limit":true,"byok_usage_daily":2}}"#,
        );
        assert_eq!(usage.total_used, 12.0);
        assert_eq!(usage.remaining, Some(88.0));
        let usage = parse_usage(r#"{"data":{"usage":12.3,"limit":null,"limit_remaining":null}}"#);
        assert_eq!(usage.total_used, 12.3);
        assert_eq!(usage.total_budget, None);
    }
}

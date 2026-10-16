use async_trait::async_trait;
use chrono::Utc;
use reqwest::Client;
use serde::Deserialize;
use std::collections::HashSet;

use super::http::{check_response, month_bounds, new_client, ApiNumber, Pagination};
use super::traits::{ProviderError, UsageProvider};
use super::types::*;

const AUTH_MESSAGE: &str =
    "查询组织成本需要具备读取用量权限的 OpenAI Admin API Key，普通项目 Key 不适用";

pub struct OpenAIProvider {
    client: Client,
    base_url: String,
}

impl OpenAIProvider {
    pub fn new() -> Self {
        Self {
            client: new_client(),
            base_url: "https://api.openai.com".into(),
        }
    }
}

#[derive(Debug, Deserialize)]
struct CostsResponse {
    data: Vec<CostBucket>,
    #[serde(flatten)]
    pagination: Pagination,
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
    value: ApiNumber,
    currency: String,
}

impl CostsResponse {
    fn total_usd(&self) -> Result<f64, ProviderError> {
        self.data
            .iter()
            .flat_map(|bucket| &bucket.results)
            .try_fold(0.0, |sum, item| {
                if !item.amount.currency.eq_ignore_ascii_case("usd") {
                    return Err(ProviderError::ParseError(
                        "成本报告包含非美元金额，不能直接合计".into(),
                    ));
                }
                // OpenAI 的 amount.value 已经以美元表示，不能再除以 100。
                Ok(sum + item.amount.value.value()?)
            })
    }
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
            has_balance: false,
            has_usage: true,
            has_rate_limit: false,
            has_subscription: true,
        }
    }

    async fn fetch_usage(&self, api_key: &str) -> Result<UsageData, ProviderError> {
        let now = Utc::now();
        let (start, end) = month_bounds(now);
        let mut page = None;
        let mut seen = HashSet::new();
        let mut total_used = 0.0;
        loop {
            let mut request = self
                .client
                .get(format!("{}/v1/organization/costs", self.base_url))
                .bearer_auth(api_key)
                .query(&[
                    ("start_time", start.timestamp().to_string()),
                    (
                        "end_time",
                        now.timestamp().max(start.timestamp() + 1).to_string(),
                    ),
                    ("limit", "31".into()),
                ]);
            if let Some(ref cursor) = page {
                request = request.query(&[("page", cursor)]);
            }
            let response = check_response(request.send().await?, AUTH_MESSAGE)?;
            let costs: CostsResponse = response
                .json()
                .await
                .map_err(|error| ProviderError::ParseError(error.to_string()))?;
            total_used += costs.total_usd()?;
            page = costs.pagination.next(&mut seen)?;
            if page.is_none() {
                break;
            }
        }
        // 公开成本接口不提供预付余额或预算，避免调用旧 Dashboard 私有接口猜测。
        Ok(UsageData {
            scope: UsageScope::Organization,
            source: None,
            total_used,
            total_budget: None,
            remaining: None,
            currency: "USD".into(),
            period_start: Some(start.to_rfc3339()),
            period_end: Some(end.to_rfc3339()),
        })
    }

    async fn fetch_rate_limits(
        &self,
        _api_key: &str,
    ) -> Result<Option<RateLimitData>, ProviderError> {
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

    #[tokio::test]
    async fn costs_keep_dollars_and_follow_pagination() {
        let server = MockServer::start(vec![
            (200, r#"{"data":[{"results":[{"amount":{"value":1.25,"currency":"usd"}}]}],"has_more":true,"next_page":"page/2"}"#),
            (200, r#"{"data":[{"results":[{"amount":{"value":0.06,"currency":"usd"}}]}],"has_more":false,"next_page":null}"#),
        ]).await;
        let provider = OpenAIProvider {
            client: new_client(),
            base_url: server.url.clone(),
        };
        let usage = provider.fetch_usage("test-key").await.unwrap();
        assert!((usage.total_used - 1.31).abs() < 1e-9);
        assert_eq!(usage.remaining, None);
        let requests = server.finish().await;
        assert!(requests[0].starts_with("GET /v1/organization/costs?"));
        assert!(requests[0].contains("limit=31"));
        assert!(requests[1].contains("page=page%2F2"));
        assert!(!requests.iter().any(|request| request.contains("dashboard")));
    }

    #[tokio::test]
    async fn failed_requests_and_unknown_shapes_never_become_zero_usage() {
        for (status, body) in [
            (500, "{}"),
            (429, "{}"),
            (200, "{}"),
            (200, r#"{"data":[],"has_more":true}"#),
        ] {
            let server = MockServer::start(vec![(status, body)]).await;
            let provider = OpenAIProvider {
                client: new_client(),
                base_url: server.url.clone(),
            };
            assert!(provider.fetch_usage("test-key").await.is_err());
            server.finish().await;
        }
    }
}

use async_trait::async_trait;
use chrono::{SecondsFormat, Utc};
use reqwest::Client;
use serde::Deserialize;
use std::collections::HashSet;

use super::http::{check_response, month_bounds, new_client, ApiNumber, Pagination};
use super::traits::{ProviderError, UsageProvider};
use super::types::*;

pub struct AnthropicProvider {
    client: Client,
    base_url: String,
}

impl AnthropicProvider {
    pub fn new() -> Self {
        Self {
            client: new_client(),
            base_url: "https://api.anthropic.com".into(),
        }
    }
}

#[derive(Debug, Deserialize)]
struct CostReportResponse {
    data: Vec<CostBucket>,
    #[serde(flatten)]
    pagination: Pagination,
}

#[derive(Debug, Deserialize)]
struct CostBucket {
    results: Vec<CostEntry>,
}

#[derive(Debug, Deserialize)]
struct CostEntry {
    amount: ApiNumber,
    currency: String,
}

impl CostReportResponse {
    fn total_usd(&self) -> Result<f64, ProviderError> {
        self.data
            .iter()
            .flat_map(|bucket| &bucket.results)
            .try_fold(0.0, |sum, entry| {
                if !entry.currency.eq_ignore_ascii_case("usd") {
                    return Err(ProviderError::ParseError(
                        "成本报告包含非美元金额，不能直接合计".into(),
                    ));
                }
                // Anthropic 的 amount 是以美分表示的十进制字符串，与 OpenAI 的单位不同。
                Ok(sum + entry.amount.value()? / 100.0)
            })
    }
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
            has_rate_limit: false,
            has_subscription: true,
        }
    }

    async fn fetch_usage(&self, api_key: &str) -> Result<UsageData, ProviderError> {
        let now = Utc::now();
        let (start, end) = month_bounds(now);
        let starting_at = start.to_rfc3339_opts(SecondsFormat::Secs, true);
        let ending_at = now.to_rfc3339_opts(SecondsFormat::Secs, true);
        let mut page = None;
        let mut seen = HashSet::new();
        let mut total_used = 0.0;
        loop {
            let mut request = self
                .client
                .get(format!("{}/v1/organizations/cost_report", self.base_url))
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .query(&[
                    ("starting_at", starting_at.as_str()),
                    ("ending_at", ending_at.as_str()),
                    ("limit", "31"),
                ]);
            if let Some(ref cursor) = page {
                request = request.query(&[("page", cursor)]);
            }
            let response = check_response(request.send().await?, "查询组织成本需要 Anthropic Admin API 凭据（如 sk-ant-admin...），普通工作区 Key 不适用")?;
            let report: CostReportResponse = response
                .json()
                .await
                .map_err(|error| ProviderError::ParseError(error.to_string()))?;
            total_used += report.total_usd()?;
            page = report.pagination.next(&mut seen)?;
            if page.is_none() {
                break;
            }
        }
        Ok(UsageData {
            scope: UsageScope::Organization,
            source: None,
            is_unlimited: false,
            total_used,
            total_budget: None,
            remaining: None,
            currency: "USD".into(),
            period_start: Some(starting_at),
            period_end: Some(end.to_rfc3339_opts(SecondsFormat::Secs, true)),
        })
    }

    async fn fetch_rate_limits(
        &self,
        _api_key: &str,
    ) -> Result<Option<RateLimitData>, ProviderError> {
        // Admin 成本接口不提供推理限额；监控用量不能额外发送付费生成请求。
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
    async fn cost_report_uses_current_parameters_buckets_and_cents() {
        let server = MockServer::start(vec![
            (200, r#"{"data":[{"results":[{"amount":"123.78912","currency":"USD"}]}],"has_more":true,"next_page":"second"}"#),
            (200, r#"{"data":[{"results":[{"amount":"76.21088","currency":"USD"}]}],"has_more":false,"next_page":null}"#),
        ]).await;
        let provider = AnthropicProvider {
            client: new_client(),
            base_url: server.url.clone(),
        };
        let usage = provider.fetch_usage("test-admin-key").await.unwrap();
        assert!((usage.total_used - 2.0).abs() < 1e-9);
        assert!(provider
            .fetch_rate_limits("test-admin-key")
            .await
            .unwrap()
            .is_none());
        let requests = server.finish().await;
        assert!(requests[0].contains("starting_at="));
        assert!(requests[0].contains("ending_at="));
        assert!(!requests[0].contains("start_date="));
        assert!(requests[0]
            .to_ascii_lowercase()
            .contains("anthropic-version: 2023-06-01"));
        assert!(requests[1].contains("page=second"));
        assert!(requests.iter().all(|request| request.starts_with("GET ")));
    }

    #[test]
    fn obsolete_or_invalid_report_does_not_silently_return_zero() {
        assert!(serde_json::from_str::<CostReportResponse>(
            r#"{"data":[{"cost_cents":100}],"has_more":false}"#
        )
        .is_err());
        let report: CostReportResponse = serde_json::from_str(
            r#"{"data":[{"results":[{"amount":"未知","currency":"USD"}]}],"has_more":false}"#,
        )
        .unwrap();
        assert!(report.total_usd().is_err());
    }
}

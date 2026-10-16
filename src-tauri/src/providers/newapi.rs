use async_trait::async_trait;
use reqwest::{Client, Url};
use serde::Deserialize;

use super::http::{check_response, new_client, ApiNumber};
use super::traits::{ProviderError, UsageProvider};
use super::types::*;

/// New API 的额度属于当前令牌，站点地址随每个命名 Key 独立保存。
pub struct NewApiProvider {
    client: Client,
    base_url: String,
}

impl NewApiProvider {
    pub fn new(base_url: &str) -> Self {
        Self {
            client: new_client(),
            base_url: base_url.to_string(),
        }
    }
}

/// 接受站点根地址、反向代理子路径或客户端常用的 /v1 地址。
pub fn normalize_base_url(value: &str) -> Result<String, ProviderError> {
    let mut url = Url::parse(value.trim())
        .map_err(|_| ProviderError::RequestError("请填写有效的 New API 站点地址".into()))?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err(ProviderError::RequestError(
            "New API 站点地址必须使用 HTTP 或 HTTPS".into(),
        ));
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(ProviderError::RequestError(
            "New API 站点地址不能包含账号、密码、查询参数或片段".into(),
        ));
    }
    let path = url.path().trim_end_matches('/');
    let path = path.strip_suffix("/v1").unwrap_or(path).to_string();
    url.set_path(&path);
    Ok(url.as_str().trim_end_matches('/').to_string())
}

#[derive(Deserialize)]
struct ApiResponse<T> {
    code: Option<bool>,
    success: Option<bool>,
    message: Option<String>,
    data: Option<T>,
}

impl<T> ApiResponse<T> {
    fn into_data(self, api_key: &str) -> Result<T, ProviderError> {
        if self.code == Some(false) || self.success == Some(false) {
            let message = self.message.unwrap_or_else(|| "站点拒绝了查询请求".into());
            return Err(ProviderError::RequestError(format!(
                "New API 查询失败：{}",
                message
                    .replace(api_key, "[已隐藏]")
                    .chars()
                    .take(300)
                    .collect::<String>()
            )));
        }
        if self.code != Some(true) && self.success != Some(true) {
            return Err(ProviderError::ParseError("New API 响应缺少成功标记".into()));
        }
        self.data
            .ok_or_else(|| ProviderError::ParseError("New API 响应缺少数据".into()))
    }
}

#[derive(Deserialize)]
struct TokenUsage {
    total_used: ApiNumber,
    total_granted: Option<ApiNumber>,
    total_available: Option<ApiNumber>,
    unlimited_quota: bool,
}

#[derive(Deserialize)]
struct SiteStatus {
    quota_per_unit: ApiNumber,
}

fn convert_quota(value: &ApiNumber, quota_per_unit: f64) -> Result<f64, ProviderError> {
    let amount = value.value()? / quota_per_unit;
    if !amount.is_finite() {
        return Err(ProviderError::ParseError("New API 额度换算结果无效".into()));
    }
    Ok(amount)
}

#[async_trait]
impl UsageProvider for NewApiProvider {
    fn id(&self) -> ProviderId {
        ProviderId::NewApi
    }

    fn display_name(&self) -> &str {
        "New API"
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
        let base_url = normalize_base_url(&self.base_url)?;
        let api_key = api_key.trim();
        if api_key.is_empty() {
            return Err(ProviderError::AuthError("请填写 New API 令牌".into()));
        }
        let response = self
            .client
            .get(format!("{base_url}/api/usage/token"))
            .bearer_auth(api_key)
            .send()
            .await?;
        let token = check_response(response, "New API 令牌无效或无用量查询权限")?
            .json::<ApiResponse<TokenUsage>>()
            .await
            .map_err(|_| ProviderError::ParseError("New API 令牌用量结构无效".into()))?
            .into_data(api_key)?;

        // 原始额度不是模型 Token 数；读取站点的美元换算比例，不能硬编码默认值。
        let response = self
            .client
            .get(format!("{base_url}/api/status"))
            .send()
            .await?;
        let status = check_response(response, "无法读取 New API 站点额度换算配置")?
            .json::<ApiResponse<SiteStatus>>()
            .await
            .map_err(|_| ProviderError::ParseError("New API 站点缺少有效的 quota_per_unit".into()))?
            .into_data(api_key)?;
        let quota_per_unit = status.quota_per_unit.value()?;
        if quota_per_unit <= 0.0 {
            return Err(ProviderError::ParseError(
                "New API 额度换算比例必须大于零".into(),
            ));
        }
        let total_used = convert_quota(&token.total_used, quota_per_unit)?;
        if total_used < 0.0 {
            return Err(ProviderError::ParseError(
                "New API 已用额度不能为负数".into(),
            ));
        }
        let (total_budget, remaining) = if token.unlimited_quota {
            (None, None)
        } else {
            let granted = token
                .total_granted
                .ok_or_else(|| ProviderError::ParseError("New API 响应缺少令牌总额度".into()))?;
            let available = token
                .total_available
                .ok_or_else(|| ProviderError::ParseError("New API 响应缺少令牌剩余额度".into()))?;
            let budget = convert_quota(&granted, quota_per_unit)?;
            if budget < 0.0 {
                return Err(ProviderError::ParseError(
                    "New API 令牌总额度不能为负数".into(),
                ));
            }
            (
                Some(budget),
                Some(convert_quota(&available, quota_per_unit)?),
            )
        };
        Ok(UsageData {
            scope: UsageScope::Key,
            source: Some(format!("{base_url}|{quota_per_unit}")),
            total_used,
            total_budget,
            remaining,
            currency: "USD".into(),
            // 接口返回累计额度；到期时间不等于用量重置时间。
            period_start: None,
            period_end: None,
        })
    }

    async fn fetch_rate_limits(
        &self,
        _api_key: &str,
    ) -> Result<Option<RateLimitData>, ProviderError> {
        Ok(None)
    }

    async fn validate_key(&self, api_key: &str) -> Result<bool, ProviderError> {
        self.fetch_usage(api_key).await.map(|_| true)
    }
}

#[cfg(test)]
mod tests {
    use super::super::http::tests::MockServer;
    use super::*;

    const TOKEN: &str = r#"{"code":true,"message":"ok","data":{"object":"token_usage","total_used":125000,"total_granted":1000000,"total_available":875000,"unlimited_quota":false,"expires_at":1800000000}}"#;
    const STATUS: &str = r#"{"success":true,"data":{"quota_per_unit":500000}}"#;

    #[tokio::test]
    async fn token_quota_uses_site_ratio_and_only_read_only_endpoints() {
        let server = MockServer::start(vec![(200, TOKEN), (200, STATUS)]).await;
        let manager = crate::providers::ProviderManager::new();
        let (usage, rate_limit) = manager
            .fetch_api_usage(
                "newapi",
                "sk-test-key",
                Some(&format!("{}/gateway/v1/", server.url)),
            )
            .await
            .unwrap();
        assert_eq!(usage.scope, UsageScope::Key);
        assert_eq!(usage.total_used, 0.25);
        assert_eq!(usage.total_budget, Some(2.0));
        assert_eq!(usage.remaining, Some(1.75));
        assert_eq!(usage.currency, "USD");
        assert_eq!(usage.period_start, None);
        assert_eq!(usage.period_end, None);
        assert!(rate_limit.is_none());
        let requests = server.finish().await;
        assert_eq!(requests.len(), 2);
        assert!(requests[0].starts_with("GET /gateway/api/usage/token "));
        assert!(requests[0]
            .to_lowercase()
            .contains("authorization: bearer sk-test-key\r\n"));
        assert!(requests[1].starts_with("GET /gateway/api/status "));
        assert!(!requests[1].to_lowercase().contains("authorization:"));
        let metadata = manager.get_provider_config_item("newapi").unwrap();
        assert!(!metadata.capabilities.has_subscription);
        assert!(!metadata.capabilities.has_rate_limit);
    }

    #[tokio::test]
    async fn unlimited_keys_keep_usage_without_a_fake_balance_or_budget() {
        let server = MockServer::start(vec![
            (200, r#"{"success":true,"data":{"total_used":"250000","total_granted":0,"total_available":0,"unlimited_quota":true,"user_quota":{"total_used":9999999,"total_available":123}}}"#),
            (200, r#"{"success":true,"data":{"quota_per_unit":"100000"}}"#),
        ]).await;
        let usage = NewApiProvider::new(&server.url)
            .fetch_usage("test-key")
            .await
            .unwrap();
        assert_eq!(usage.total_used, 2.5);
        assert!(usage.total_budget.is_none());
        assert!(usage.remaining.is_none());
        server.finish().await;
    }

    #[tokio::test]
    async fn validation_uses_the_selected_site_and_checks_actual_usage_permission() {
        let first = MockServer::start(vec![(200, TOKEN), (200, STATUS)]).await;
        let second = MockServer::start(vec![(403, r#"{"message":"禁止访问"}"#)]).await;
        let manager = crate::providers::ProviderManager::new();
        assert!(manager
            .validate_key("newapi", "key-a", Some(&first.url))
            .await
            .unwrap());
        assert!(manager
            .validate_key("newapi", "key-b", Some(&second.url))
            .await
            .is_err());
        assert_eq!(first.finish().await.len(), 2);
        assert_eq!(second.finish().await.len(), 1);
    }

    #[tokio::test]
    async fn http_and_business_errors_are_not_reported_as_zero_usage() {
        for status in [401, 403, 429, 404, 500] {
            let server = MockServer::start(vec![(status, "{}")]).await;
            let error = NewApiProvider::new(&server.url)
                .fetch_usage("test-key")
                .await
                .unwrap_err();
            match status {
                401 | 403 => assert!(matches!(error, ProviderError::AuthError(_))),
                429 => assert!(matches!(error, ProviderError::RateLimited(_))),
                _ => assert!(matches!(error, ProviderError::RequestError(_))),
            }
            assert_eq!(server.finish().await.len(), 1);
        }
        let server = MockServer::start(vec![(
            200,
            r#"{"success":false,"message":"令牌 test-key 已被删除"}"#,
        )])
        .await;
        let error = NewApiProvider::new(&server.url)
            .fetch_usage("test-key")
            .await
            .unwrap_err()
            .to_string();
        assert!(error.contains("已被删除"));
        assert!(!error.contains("test-key"));
        server.finish().await;
    }

    #[tokio::test]
    async fn missing_or_unknown_token_structures_are_rejected() {
        for body in [
            "<html>站点登录页</html>",
            r#"{"code":true}"#,
            r#"{"data":{"total_used":0,"unlimited_quota":true}}"#,
            r#"{"code":true,"data":{"unlimited_quota":false}}"#,
            r#"{"code":true,"data":{"total_used":0}}"#,
        ] {
            let server = MockServer::start(vec![(200, body)]).await;
            assert!(matches!(
                NewApiProvider::new(&server.url)
                    .fetch_usage("test-key")
                    .await,
                Err(ProviderError::ParseError(_))
            ));
            assert_eq!(server.finish().await.len(), 1);
        }
    }

    #[tokio::test]
    async fn invalid_or_missing_quota_values_are_rejected() {
        for (token, status) in [
            (TOKEN, r#"{"success":true,"data":{}}"#),
            (TOKEN, r#"{"success":true,"data":{"quota_per_unit":0}}"#),
            (TOKEN, r#"{"success":true,"data":{"quota_per_unit":-1}}"#),
            (TOKEN, r#"{"success":true,"data":{"quota_per_unit":"NaN"}}"#),
            (
                r#"{"code":true,"data":{"total_used":"NaN","total_granted":100,"total_available":100,"unlimited_quota":false}}"#,
                STATUS,
            ),
            (
                r#"{"code":true,"data":{"total_used":-1,"total_granted":100,"total_available":101,"unlimited_quota":false}}"#,
                STATUS,
            ),
            (
                r#"{"code":true,"data":{"total_used":10,"unlimited_quota":false}}"#,
                STATUS,
            ),
        ] {
            let server = MockServer::start(vec![(200, token), (200, status)]).await;
            assert!(matches!(
                NewApiProvider::new(&server.url)
                    .fetch_usage("test-key")
                    .await,
                Err(ProviderError::ParseError(_))
            ));
            server.finish().await;
        }
    }

    #[test]
    fn site_urls_are_normalized_and_invalid_addresses_rejected() {
        for (input, expected) in [
            (" https://example.com/ ", "https://example.com"),
            ("https://example.com/v1/", "https://example.com"),
            (
                "http://localhost:3000/newapi/v1",
                "http://localhost:3000/newapi",
            ),
            ("http://[::1]:3000/", "http://[::1]:3000"),
        ] {
            assert_eq!(normalize_base_url(input).unwrap(), expected);
        }
        for input in [
            "",
            "example.com",
            "file:///tmp/key",
            "https://user:pass@example.com",
            "https://example.com?key=secret",
            "https://example.com/#console",
        ] {
            assert!(normalize_base_url(input).is_err(), "应拒绝的地址：{input}");
        }
    }
}

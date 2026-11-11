use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use reqwest::{Client, Url};
use serde::Deserialize;
use serde_json::Value;

use super::http::{check_response, new_client, ApiNumber};
use super::traits::{ProviderError, UsageProvider};
use super::types::*;

/// 站点换算配置很少变化，缓存一段时间，减少每次刷新的请求数。
const SITE_STATUS_TTL: Duration = Duration::from_secs(60 * 60);

/// New API 的额度属于当前令牌，站点地址随每个命名 Key 独立保存。
pub struct NewApiProvider {
    client: Client,
    base_url: String,
    status_cache: Arc<SiteStatusCache>,
}

impl NewApiProvider {
    pub fn new(base_url: &str) -> Self {
        Self::with_shared(base_url, new_client(), Arc::new(SiteStatusCache::default()))
    }

    /// 复用 HTTP 客户端和站点配置缓存，由 ProviderManager 按 Key 创建。
    pub fn with_shared(base_url: &str, client: Client, status_cache: Arc<SiteStatusCache>) -> Self {
        Self {
            client,
            base_url: base_url.to_string(),
            status_cache,
        }
    }
}

/// 站点的额度换算与展示货币。
#[derive(Clone, Debug, PartialEq)]
struct SiteCurrency {
    quota_per_unit: f64,
    /// 1 USD 等于多少展示货币。
    rate: f64,
    currency: String,
}

#[derive(Default)]
pub struct SiteStatusCache {
    entries: Mutex<HashMap<String, (Instant, SiteCurrency)>>,
}

impl SiteStatusCache {
    fn get(&self, base_url: &str) -> Option<SiteCurrency> {
        let entries = self.entries.lock().unwrap();
        entries
            .get(base_url)
            .filter(|(at, _)| at.elapsed() < SITE_STATUS_TTL)
            .map(|(_, value)| value.clone())
    }

    fn put(&self, base_url: &str, value: SiteCurrency) {
        self.entries
            .lock()
            .unwrap()
            .insert(base_url.to_string(), (Instant::now(), value));
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
    /// 秒级时间戳，0 表示永不过期。
    #[serde(default)]
    expires_at: Option<ApiNumber>,
    #[serde(default)]
    model_limits: Option<Value>,
    #[serde(default)]
    model_limits_enabled: Option<bool>,
    /// 令牌开启“允许查询用户额度”时才返回（New API v1.0.0-rc.45 起）。
    #[serde(default)]
    user_quota: Option<UserQuota>,
}

#[derive(Deserialize)]
struct UserQuota {
    total_available: ApiNumber,
    total_used: ApiNumber,
}

#[derive(Deserialize)]
struct SiteStatus {
    quota_per_unit: ApiNumber,
    #[serde(default)]
    quota_display_type: Option<String>,
    #[serde(default)]
    usd_exchange_rate: Option<ApiNumber>,
    #[serde(default)]
    custom_currency_symbol: Option<String>,
    #[serde(default)]
    custom_currency_exchange_rate: Option<ApiNumber>,
}

impl SiteStatus {
    /// 与站点控制台一致：CNY 用站点汇率，自定义货币用自定义汇率，其余按美元。
    fn currency(&self) -> Result<SiteCurrency, ProviderError> {
        let quota_per_unit = self.quota_per_unit.value()?;
        if quota_per_unit <= 0.0 {
            return Err(ProviderError::ParseError(
                "New API 额度换算比例必须大于零".into(),
            ));
        }
        let positive = |value: &Option<ApiNumber>| {
            value
                .as_ref()
                .and_then(|value| value.value().ok())
                .filter(|value| *value > 0.0)
        };
        let (rate, currency) = match self.quota_display_type.as_deref() {
            Some("CNY") => match positive(&self.usd_exchange_rate) {
                Some(rate) => (rate, "CNY".to_string()),
                None => (1.0, "USD".to_string()),
            },
            Some("CUSTOM") => {
                let symbol: String = self
                    .custom_currency_symbol
                    .as_deref()
                    .map(str::trim)
                    .filter(|symbol| !symbol.is_empty())
                    .unwrap_or("¤")
                    .chars()
                    .take(8)
                    .collect();
                (
                    positive(&self.custom_currency_exchange_rate).unwrap_or(1.0),
                    symbol,
                )
            }
            _ => (1.0, "USD".to_string()),
        };
        Ok(SiteCurrency {
            quota_per_unit,
            rate,
            currency,
        })
    }
}

fn convert_quota(value: &ApiNumber, site: &SiteCurrency) -> Result<f64, ProviderError> {
    let amount = value.value()? / site.quota_per_unit * site.rate;
    if !amount.is_finite() {
        return Err(ProviderError::ParseError("New API 额度换算结果无效".into()));
    }
    Ok(amount)
}

fn parse_expires_at(value: Option<&ApiNumber>) -> Option<String> {
    let seconds = value?.value().ok()?;
    if seconds <= 0.0 {
        return None;
    }
    chrono::DateTime::from_timestamp(seconds as i64, 0).map(|time| time.to_rfc3339())
}

/// 站点返回 {"模型": true} 映射；也兼容数组。
fn parse_model_limits(enabled: Option<bool>, value: Option<&Value>) -> Option<Vec<String>> {
    if enabled != Some(true) {
        return None;
    }
    let mut models: Vec<String> = match value? {
        Value::Object(map) => map
            .iter()
            .filter(|(_, allowed)| allowed.as_bool() != Some(false))
            .map(|(name, _)| name.clone())
            .collect(),
        Value::Array(items) => items
            .iter()
            .filter_map(|item| item.as_str().map(str::to_string))
            .collect(),
        _ => return None,
    };
    models.sort();
    Some(models)
}

impl NewApiProvider {
    async fn site_currency(
        &self,
        base_url: &str,
        api_key: &str,
    ) -> Result<SiteCurrency, ProviderError> {
        if let Some(cached) = self.status_cache.get(base_url) {
            return Ok(cached);
        }
        // 原始额度不是模型 Token 数；读取站点的换算比例，不能硬编码默认值。
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
        let currency = status.currency()?;
        self.status_cache.put(base_url, currency.clone());
        Ok(currency)
    }
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

        let site = self.site_currency(&base_url, api_key).await?;
        let total_used = convert_quota(&token.total_used, &site)?;
        if total_used < 0.0 {
            return Err(ProviderError::ParseError(
                "New API 已用额度不能为负数".into(),
            ));
        }
        let (total_budget, remaining) =
            if token.unlimited_quota {
                (None, None)
            } else {
                let granted = token.total_granted.as_ref().ok_or_else(|| {
                    ProviderError::ParseError("New API 响应缺少令牌总额度".into())
                })?;
                let available = token.total_available.as_ref().ok_or_else(|| {
                    ProviderError::ParseError("New API 响应缺少令牌剩余额度".into())
                })?;
                let budget = convert_quota(granted, &site)?;
                if budget < 0.0 {
                    return Err(ProviderError::ParseError(
                        "New API 令牌总额度不能为负数".into(),
                    ));
                }
                (Some(budget), Some(convert_quota(available, &site)?))
            };
        let (account_remaining, account_used) = match token.user_quota.as_ref() {
            Some(user) => (
                Some(convert_quota(&user.total_available, &site)?),
                Some(convert_quota(&user.total_used, &site)?),
            ),
            None => (None, None),
        };
        // 有限额令牌受令牌额度和钱包余额共同约束，无限额令牌只受钱包约束。
        let effective_remaining = match (remaining, account_remaining) {
            (Some(token), Some(account)) => Some(token.min(account)),
            (None, Some(account)) => Some(account),
            (token, None) => token,
        };
        // 美元站点保持旧格式，统计历史不会因升级而断开。
        let source = if site.currency == "USD" && site.rate == 1.0 {
            format!("{base_url}|{}", site.quota_per_unit)
        } else {
            format!(
                "{base_url}|{}|{}|{}",
                site.quota_per_unit, site.currency, site.rate
            )
        };
        Ok(UsageData {
            scope: UsageScope::Key,
            source: Some(source),
            is_unlimited: token.unlimited_quota,
            total_used,
            total_budget,
            remaining,
            currency: site.currency.clone(),
            // 接口返回累计额度；到期时间不等于用量重置时间。
            period_start: None,
            period_end: None,
            account_remaining,
            account_used,
            effective_remaining,
            expires_at: parse_expires_at(token.expires_at.as_ref()),
            model_limits: parse_model_limits(
                token.model_limits_enabled,
                token.model_limits.as_ref(),
            ),
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
        let result = manager
            .fetch_api_usage(
                "newapi",
                "sk-test-key",
                Some(&format!("{}/gateway/v1/", server.url)),
            )
            .await
            .unwrap();
        let (usage, rate_limit) = (result.usage, result.rate_limit);
        assert!(result.limited_until.is_none());
        // 令牌没有开启用户额度查询时，实际可用额度就是令牌剩余额度。
        assert_eq!(usage.effective_remaining, Some(1.75));
        assert!(usage.account_remaining.is_none());
        assert_eq!(
            usage.expires_at.as_deref(),
            Some("2027-01-15T08:00:00+00:00")
        );
        assert_eq!(usage.scope, UsageScope::Key);
        assert_eq!(usage.total_used, 0.25);
        assert_eq!(usage.total_budget, Some(2.0));
        assert!(!usage.is_unlimited);
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
        assert!(usage.is_unlimited);
        assert!(usage.total_budget.is_none());
        assert!(usage.remaining.is_none());
        // 无限额令牌的真实上限是钱包余额。
        assert_eq!(usage.account_remaining, Some(0.00123));
        assert_eq!(usage.account_used, Some(99.99999));
        assert_eq!(usage.effective_remaining, Some(0.00123));
        assert!(usage.expires_at.is_none());
        server.finish().await;
    }

    #[tokio::test]
    async fn limited_keys_are_capped_by_the_wallet_and_report_models_and_currency() {
        let server = MockServer::start(vec![
            (200, r#"{"code":true,"data":{"name":"work","total_used":100,"total_granted":1100,"total_available":1000,"unlimited_quota":false,"expires_at":0,"model_limits_enabled":true,"model_limits":{"gpt-5":true,"claude-opus":true},"user_quota":{"total_available":300,"total_used":5000}}}"#),
            (200, r#"{"success":true,"data":{"quota_per_unit":100,"quota_display_type":"CNY","usd_exchange_rate":7.2}}"#),
        ])
        .await;
        let usage = NewApiProvider::new(&server.url)
            .fetch_usage("test-key")
            .await
            .unwrap();
        assert_eq!(usage.currency, "CNY");
        assert!((usage.total_used - 7.2).abs() < 1e-9);
        assert!((usage.remaining.unwrap() - 72.0).abs() < 1e-9);
        assert!((usage.account_remaining.unwrap() - 21.6).abs() < 1e-9);
        assert!((usage.effective_remaining.unwrap() - 21.6).abs() < 1e-9);
        assert_eq!(
            usage.model_limits,
            Some(vec!["claude-opus".to_string(), "gpt-5".to_string()])
        );
        assert!(usage.source.unwrap().contains("|CNY|7.2"));
        server.finish().await;
    }

    #[tokio::test]
    async fn site_status_is_cached_across_keys_and_refreshes() {
        let token_b = r#"{"code":true,"data":{"total_used":0,"unlimited_quota":true}}"#;
        let server = MockServer::start(vec![(200, TOKEN), (200, STATUS), (200, token_b)]).await;
        let manager = crate::providers::ProviderManager::new();
        manager
            .fetch_api_usage("newapi", "key-a", Some(&server.url))
            .await
            .unwrap();
        manager
            .fetch_api_usage("newapi", "key-b", Some(&server.url))
            .await
            .unwrap();
        let requests = server.finish().await;
        assert_eq!(requests.len(), 3);
        assert!(requests[2].starts_with("GET /api/usage/token "));
    }

    #[tokio::test]
    async fn rapid_refreshes_reuse_the_last_result_instead_of_hitting_the_site() {
        let server = MockServer::start(vec![(200, TOKEN), (200, STATUS)]).await;
        let manager = crate::providers::ProviderManager::new();
        for _ in 0..3 {
            let result = manager
                .fetch_api_usage("newapi", "key-a", Some(&server.url))
                .await
                .unwrap();
            assert_eq!(result.usage.total_used, 0.25);
        }
        assert!(manager
            .validate_key("newapi", "key-a", Some(&server.url))
            .await
            .unwrap());
        assert_eq!(server.finish().await.len(), 2);
    }

    #[tokio::test]
    async fn site_rate_limit_reports_the_wait_time() {
        let server = MockServer::start(vec![(429, "{}")]).await;
        let manager = crate::providers::ProviderManager::new();
        let error = manager
            .fetch_api_usage("newapi", "key-a", Some(&server.url))
            .await
            .err()
            .unwrap();
        assert!(error.contains("请求过于频繁"));
        // 冷却期内不会再请求站点。
        let error = manager
            .fetch_api_usage("newapi", "key-a", Some(&server.url))
            .await
            .err()
            .unwrap();
        assert!(error.contains("秒后恢复"));
        assert_eq!(server.finish().await.len(), 1);
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
                429 => assert!(matches!(error, ProviderError::RateLimited(..))),
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

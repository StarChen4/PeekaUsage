pub mod anthropic;
mod http;
pub mod newapi;
pub mod openai;
pub mod openrouter;
pub mod subscription;
pub mod throttle;
pub mod traits;
pub mod types;

#[cfg(test)]
pub(crate) use http::tests::MockServer;

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

use subscription::{subscription_error, SubscriptionFetcher};
use throttle::{RequestThrottle, ThrottleOutcome, ThrottlePolicy};
use traits::{ProviderError, UsageProvider};
use types::*;

/// 同一凭据两次真实请求的最短间隔：设置页验证、轮询和手动刷新共用。
const MIN_FETCH_INTERVAL: Duration = Duration::from_secs(15);

/// New API 默认对 /api/usage 按 IP 限制 20 次 / 20 分钟（CRITICAL_RATE_LIMIT）。
/// 同一站点的所有令牌共享这个预算，留出余量给用户在其他客户端的查询。
const NEWAPI_SITE_BUDGET: (usize, Duration) = (15, Duration::from_secs(20 * 60));

fn policy_for(provider_id: &str) -> ThrottlePolicy {
    ThrottlePolicy {
        min_interval: MIN_FETCH_INTERVAL,
        site_budget: (provider_id == "newapi").then_some(NEWAPI_SITE_BUDGET),
    }
}

/// 订阅接口没有站点预算的说法，只按凭据节流。
const SUBSCRIPTION_POLICY: ThrottlePolicy = ThrottlePolicy {
    min_interval: MIN_FETCH_INTERVAL,
    site_budget: None,
};

pub struct ApiUsageResult {
    pub usage: UsageData,
    pub rate_limit: Option<RateLimitData>,
    pub fetched_at: String,
    pub limited_until: Option<String>,
}

pub struct SubscriptionUsageResult {
    pub usage: SubscriptionUsage,
    pub fetched_at: Option<String>,
    pub limited_until: Option<String>,
}

/// 供应商管理器：注册并管理所有供应商实现
pub struct ProviderManager {
    providers: HashMap<String, Arc<dyn UsageProvider>>,
    subscription_fetcher: SubscriptionFetcher,
    cache: RwLock<HashMap<String, UsageSummary>>,
    api_throttle: RequestThrottle<(UsageData, Option<RateLimitData>)>,
    subscription_throttle: RequestThrottle<SubscriptionUsage>,
    newapi_client: reqwest::Client,
    newapi_status_cache: Arc<newapi::SiteStatusCache>,
}

impl ProviderManager {
    pub fn new() -> Self {
        let mut providers: HashMap<String, Arc<dyn UsageProvider>> = HashMap::new();

        let openai = Arc::new(openai::OpenAIProvider::new());
        let anthropic = Arc::new(anthropic::AnthropicProvider::new());
        let openrouter = Arc::new(openrouter::OpenRouterProvider::new());
        let newapi = Arc::new(newapi::NewApiProvider::new(""));

        providers.insert(openai.id().as_str().to_string(), openai);
        providers.insert(anthropic.id().as_str().to_string(), anthropic);
        providers.insert(openrouter.id().as_str().to_string(), openrouter);
        providers.insert(newapi.id().as_str().to_string(), newapi);

        Self {
            providers,
            subscription_fetcher: SubscriptionFetcher::new(),
            cache: RwLock::new(HashMap::new()),
            api_throttle: RequestThrottle::new(),
            subscription_throttle: RequestThrottle::new(),
            newapi_client: http::new_client(),
            newapi_status_cache: Arc::new(newapi::SiteStatusCache::default()),
        }
    }

    /// 获取所有已注册供应商的信息
    pub fn get_provider_config_items(&self) -> Vec<ProviderConfigItem> {
        let mut items: Vec<ProviderConfigItem> = self
            .providers
            .values()
            .map(|provider| ProviderConfigItem {
                provider_id: provider.id(),
                display_name: provider.display_name().to_string(),
                enabled: false,
                api_keys: Vec::new(),
                subscriptions: Vec::new(),
                capabilities: provider.capabilities(),
                environment_variable_name: provider.id().env_key_name().to_string(),
                active_api_key_id: None,
            })
            .collect();

        items.sort_by(|left, right| left.provider_id.as_str().cmp(right.provider_id.as_str()));
        items
    }

    pub fn get_provider_config_item(&self, provider_id: &str) -> Option<ProviderConfigItem> {
        self.providers
            .get(provider_id)
            .map(|provider| ProviderConfigItem {
                provider_id: provider.id(),
                display_name: provider.display_name().to_string(),
                enabled: false,
                api_keys: Vec::new(),
                subscriptions: Vec::new(),
                capabilities: provider.capabilities(),
                environment_variable_name: provider.id().env_key_name().to_string(),
                active_api_key_id: None,
            })
    }

    /// 获取单个供应商的按量 API 数据；限流期间返回缓存并带上恢复时间。
    pub async fn fetch_api_usage(
        &self,
        provider_id: &str,
        api_key: &str,
        base_url: Option<&str>,
    ) -> Result<ApiUsageResult, String> {
        let provider = self.request_provider(provider_id, base_url)?;
        let site = site_key(provider_id, base_url);
        let key =
            RequestThrottle::<()>::key(&[provider_id, site.as_deref().unwrap_or("")], api_key);
        let outcome = self
            .api_throttle
            .run(&key, site.as_deref(), policy_for(provider_id), || async {
                let usage = provider.fetch_usage(api_key).await?;
                let rate_limit = provider.fetch_rate_limits(api_key).await.ok().flatten();
                Ok((usage, rate_limit))
            })
            .await
            .map_err(|e| e.to_string())?;
        let ThrottleOutcome {
            value: (usage, rate_limit),
            fetched_at,
            limited_until,
        } = outcome;
        Ok(ApiUsageResult {
            usage,
            rate_limit,
            fetched_at: fetched_at.to_rfc3339(),
            limited_until: limited_until.map(|time| time.to_rfc3339()),
        })
    }

    /// 获取单个供应商的订阅数据
    pub async fn fetch_subscription_usage(
        &self,
        provider_id: &str,
        oauth_token: &str,
    ) -> SubscriptionUsageResult {
        let key = RequestThrottle::<()>::key(&[provider_id, "subscription"], oauth_token);
        let result = self
            .subscription_throttle
            .run(&key, None, SUBSCRIPTION_POLICY, || async {
                match provider_id {
                    "anthropic" => self.subscription_fetcher.fetch_anthropic(oauth_token).await,
                    "openai" => self.subscription_fetcher.fetch_openai(oauth_token).await,
                    _ => Err(ProviderError::RequestError(
                        "当前供应商不支持订阅查询".into(),
                    )),
                }
            })
            .await;
        match result {
            Ok(outcome) => SubscriptionUsageResult {
                usage: outcome.value,
                fetched_at: Some(outcome.fetched_at.to_rfc3339()),
                limited_until: outcome.limited_until.map(|time| time.to_rfc3339()),
            },
            Err(error) => SubscriptionUsageResult {
                usage: subscription_error(&error),
                fetched_at: None,
                limited_until: None,
            },
        }
    }

    /// 缓存汇总结果
    pub async fn cache_summary(&self, provider_id: &str, summary: UsageSummary) {
        let mut cache = self.cache.write().await;
        cache.insert(provider_id.to_string(), summary);
    }

    /// 固定供应商复用实例，New API 按当前 Key 的站点地址创建查询实例。
    fn request_provider(
        &self,
        provider_id: &str,
        base_url: Option<&str>,
    ) -> Result<Arc<dyn UsageProvider>, String> {
        if provider_id == "newapi" {
            return Ok(Arc::new(newapi::NewApiProvider::with_shared(
                base_url.unwrap_or_default(),
                self.newapi_client.clone(),
                self.newapi_status_cache.clone(),
            )));
        }
        self.providers
            .get(provider_id)
            .cloned()
            .ok_or_else(|| format!("未知供应商: {}", provider_id))
    }

    /// 验证 Key 的实际用量查询权限。
    ///
    /// 验证同样走节流：用户在设置页反复点“验证”不会额外消耗站点限流预算。
    pub async fn validate_key(
        &self,
        provider_id: &str,
        api_key: &str,
        base_url: Option<&str>,
    ) -> Result<bool, String> {
        if provider_id == "newapi" {
            // New API 的验证就是一次用量查询，直接复用节流和缓存。
            return self
                .fetch_api_usage(provider_id, api_key, base_url)
                .await
                .map(|_| true);
        }
        let provider = self.request_provider(provider_id, base_url)?;

        provider
            .validate_key(api_key)
            .await
            .map_err(|e| e.to_string())
    }
}

/// New API 的站点预算按规范化后的站点地址区分。
fn site_key(provider_id: &str, base_url: Option<&str>) -> Option<String> {
    if provider_id != "newapi" {
        return None;
    }
    base_url.and_then(|url| newapi::normalize_base_url(url).ok())
}

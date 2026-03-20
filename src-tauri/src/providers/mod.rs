pub mod traits;
pub mod types;
pub mod openai;
pub mod anthropic;
pub mod openrouter;
pub mod subscription;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use subscription::SubscriptionFetcher;
use traits::UsageProvider;
use types::*;

/// 供应商管理器：注册并管理所有供应商实现
pub struct ProviderManager {
    providers: HashMap<String, Arc<dyn UsageProvider>>,
    subscription_fetcher: SubscriptionFetcher,
    cache: RwLock<HashMap<String, UsageSummary>>,
}

impl ProviderManager {
    pub fn new() -> Self {
        let mut providers: HashMap<String, Arc<dyn UsageProvider>> = HashMap::new();

        let openai = Arc::new(openai::OpenAIProvider::new());
        let anthropic = Arc::new(anthropic::AnthropicProvider::new());
        let openrouter = Arc::new(openrouter::OpenRouterProvider::new());

        providers.insert(openai.id().as_str().to_string(), openai);
        providers.insert(anthropic.id().as_str().to_string(), anthropic);
        providers.insert(openrouter.id().as_str().to_string(), openrouter);

        Self {
            providers,
            subscription_fetcher: SubscriptionFetcher::new(),
            cache: RwLock::new(HashMap::new()),
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
                oauth_token: String::new(),
                capabilities: provider.capabilities(),
            })
            .collect();

        items.sort_by(|left, right| left.provider_id.as_str().cmp(right.provider_id.as_str()));
        items
    }

    pub fn get_provider_config_item(&self, provider_id: &str) -> Option<ProviderConfigItem> {
        self.providers.get(provider_id).map(|provider| ProviderConfigItem {
            provider_id: provider.id(),
            display_name: provider.display_name().to_string(),
            enabled: false,
            api_keys: Vec::new(),
            oauth_token: String::new(),
            capabilities: provider.capabilities(),
        })
    }

    /// 获取单个供应商的按量 API 数据
    pub async fn fetch_api_usage(
        &self,
        provider_id: &str,
        api_key: &str,
    ) -> Result<(UsageData, Option<RateLimitData>), String> {
        let provider = self
            .providers
            .get(provider_id)
            .ok_or_else(|| format!("未知供应商: {}", provider_id))?;

        let usage = provider
            .fetch_usage(api_key)
            .await
            .map_err(|e| e.to_string())?;

        let rate_limit = provider.fetch_rate_limits(api_key).await.ok().flatten();
        Ok((usage, rate_limit))
    }

    /// 获取单个供应商的订阅数据
    pub async fn fetch_subscription_usage(
        &self,
        provider_id: &str,
        oauth_token: &str,
    ) -> SubscriptionUsage {
        match provider_id {
            "anthropic" => self.subscription_fetcher.fetch_anthropic(oauth_token).await,
            "openai" => self.subscription_fetcher.fetch_openai(oauth_token).await,
            _ => SubscriptionUsage {
                plan_name: None,
                windows: vec![],
                status: ProviderStatus::Error,
                error_message: Some("当前供应商不支持订阅查询".into()),
            },
        }
    }

    /// 缓存汇总结果
    pub async fn cache_summary(&self, provider_id: &str, summary: UsageSummary) {
        let mut cache = self.cache.write().await;
        cache.insert(provider_id.to_string(), summary);
    }

    /// 验证 Key
    pub async fn validate_key(&self, provider_id: &str, api_key: &str) -> Result<bool, String> {
        let provider = self
            .providers
            .get(provider_id)
            .ok_or_else(|| format!("未知供应商: {}", provider_id))?;

        provider
            .validate_key(api_key)
            .await
            .map_err(|e| e.to_string())
    }
}

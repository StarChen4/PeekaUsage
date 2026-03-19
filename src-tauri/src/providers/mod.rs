pub mod traits;
pub mod types;
pub mod openai;
pub mod anthropic;
pub mod openrouter;
pub mod subscription;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use traits::{ProviderError, UsageProvider};
use types::*;
use subscription::SubscriptionFetcher;

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

    /// 获取所有已注册的供应商信息
    pub fn get_provider_config_items(&self) -> Vec<ProviderConfigItem> {
        self.providers
            .values()
            .map(|p| ProviderConfigItem {
                provider_id: p.id(),
                display_name: p.display_name().to_string(),
                enabled: false,
                api_key: String::new(),
                oauth_token: String::new(),
                capabilities: p.capabilities(),
            })
            .collect()
    }

    /// 获取单个供应商的用量数据（按量 + 订阅）
    pub async fn fetch_usage(
        &self,
        provider_id: &str,
        api_key: Option<&str>,
        oauth_token: Option<&str>,
    ) -> UsageSummary {
        let provider = match self.providers.get(provider_id) {
            Some(p) => p.clone(),
            None => {
                return UsageSummary {
                    provider_id: ProviderId::OpenAI,
                    display_name: provider_id.to_string(),
                    enabled: true,
                    status: ProviderStatus::Error,
                    usage: None,
                    subscription: None,
                    rate_limit: None,
                    last_updated: None,
                    error_message: Some(format!("未知供应商: {}", provider_id)),
                };
            }
        };

        let mut summary = UsageSummary {
            provider_id: provider.id(),
            display_name: provider.display_name().to_string(),
            enabled: true,
            status: ProviderStatus::Success,
            usage: None,
            subscription: None,
            rate_limit: None,
            last_updated: None,
            error_message: None,
        };

        let mut has_any_data = false;

        // 获取按量 API 用量
        if let Some(key) = api_key {
            if !key.is_empty() {
                match provider.fetch_usage(key).await {
                    Ok(usage) => {
                        summary.usage = Some(usage);
                        has_any_data = true;
                    }
                    Err(e) => {
                        if !has_any_data {
                            summary.error_message = Some(format!("API 用量: {}", e));
                        }
                    }
                }

                // 获取速率限制
                match provider.fetch_rate_limits(key).await {
                    Ok(rl) => summary.rate_limit = rl,
                    Err(_) => {}
                }
            }
        }

        // 获取订阅用量
        if let Some(token) = oauth_token {
            if !token.is_empty() {
                let sub = match provider_id {
                    "anthropic" => self.subscription_fetcher.fetch_anthropic(token).await,
                    "openai" => self.subscription_fetcher.fetch_openai(token).await,
                    _ => SubscriptionUsage {
                        plan_name: None,
                        windows: vec![],
                        status: ProviderStatus::Error,
                        error_message: Some("不支持订阅查询".into()),
                    },
                };

                if matches!(sub.status, ProviderStatus::Success) {
                    has_any_data = true;
                }
                summary.subscription = Some(sub);
            }
        }

        if has_any_data {
            summary.status = ProviderStatus::Success;
            summary.error_message = None;
        } else if summary.error_message.is_none() {
            summary.status = ProviderStatus::Error;
            summary.error_message = Some("未配置 API Key 或 OAuth Token".into());
        } else {
            summary.status = ProviderStatus::Error;
        }

        let now = chrono::Utc::now().to_rfc3339();
        summary.last_updated = Some(now);

        let mut cache = self.cache.write().await;
        cache.insert(provider_id.to_string(), summary.clone());

        summary
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

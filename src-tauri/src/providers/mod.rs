pub mod traits;
pub mod types;
pub mod openai;
pub mod anthropic;
pub mod openrouter;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use traits::{ProviderError, UsageProvider};
use types::*;

/// 供应商管理器：注册并管理所有供应商实现
pub struct ProviderManager {
    providers: HashMap<String, Arc<dyn UsageProvider>>,
    /// 每个供应商的最新状态缓存
    cache: RwLock<HashMap<String, UsageSummary>>,
}

impl ProviderManager {
    pub fn new() -> Self {
        let mut providers: HashMap<String, Arc<dyn UsageProvider>> = HashMap::new();

        // 注册内置供应商
        let openai = Arc::new(openai::OpenAIProvider::new());
        let anthropic = Arc::new(anthropic::AnthropicProvider::new());
        let openrouter = Arc::new(openrouter::OpenRouterProvider::new());

        providers.insert(openai.id().as_str().to_string(), openai);
        providers.insert(anthropic.id().as_str().to_string(), anthropic);
        providers.insert(openrouter.id().as_str().to_string(), openrouter);

        Self {
            providers,
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
                capabilities: p.capabilities(),
            })
            .collect()
    }

    /// 获取单个供应商的用量数据
    pub async fn fetch_usage(
        &self,
        provider_id: &str,
        api_key: &str,
    ) -> UsageSummary {
        let provider = match self.providers.get(provider_id) {
            Some(p) => p.clone(),
            None => {
                return UsageSummary {
                    provider_id: ProviderId::OpenAI, // fallback
                    display_name: provider_id.to_string(),
                    enabled: true,
                    status: ProviderStatus::Error,
                    usage: None,
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
            status: ProviderStatus::Loading,
            usage: None,
            rate_limit: None,
            last_updated: None,
            error_message: None,
        };

        // 获取用量
        match provider.fetch_usage(api_key).await {
            Ok(usage) => {
                summary.usage = Some(usage);
                summary.status = ProviderStatus::Success;
            }
            Err(e) => {
                summary.status = ProviderStatus::Error;
                summary.error_message = Some(e.to_string());
                // 认证错误不继续获取速率限制
                if matches!(e, ProviderError::AuthError(_)) {
                    let now = chrono::Utc::now().to_rfc3339();
                    summary.last_updated = Some(now.clone());
                    let mut cache = self.cache.write().await;
                    cache.insert(provider_id.to_string(), summary.clone());
                    return summary;
                }
            }
        }

        // 获取速率限制
        match provider.fetch_rate_limits(api_key).await {
            Ok(rl) => summary.rate_limit = rl,
            Err(_) => {} // 速率限制获取失败不影响主状态
        }

        let now = chrono::Utc::now().to_rfc3339();
        summary.last_updated = Some(now);

        // 更新缓存
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

    /// 获取缓存的摘要
    pub async fn get_cached(&self, provider_id: &str) -> Option<UsageSummary> {
        let cache = self.cache.read().await;
        cache.get(provider_id).cloned()
    }
}

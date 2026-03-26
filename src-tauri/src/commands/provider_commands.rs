use tauri::State;

use crate::config::app_config::{
    AppConfig, ProviderApiKeyEntry, ProviderEntry, ProviderSubscriptionEntry,
};
use crate::config::encryption::KeyStore;
use crate::config::system_env::sync_active_api_key_envs;
use crate::providers::types::*;
use crate::providers::ProviderManager;

const LEGACY_API_KEY_ID: &str = "legacy-default";
const LEGACY_SUBSCRIPTION_ID: &str = "legacy-subscription";

struct ResolvedApiKey {
    id: String,
    name: String,
    value: String,
}

struct ResolvedSubscription {
    id: String,
    name: String,
    value: String,
    source: Option<String>,
}

/// 获取所有已启用供应商的用量
#[tauri::command]
pub async fn fetch_all_usage(
    provider_manager: State<'_, ProviderManager>,
    app_config: State<'_, AppConfig>,
    key_store: State<'_, KeyStore>,
) -> Result<Vec<UsageSummary>, String> {
    let enabled = app_config.get_enabled_providers().await;
    let mut results = Vec::new();

    for provider_id in enabled {
        let entry = app_config.get_provider_entry(&provider_id).await;
        let summary = build_usage_summary(
            &provider_id,
            entry,
            provider_manager.inner(),
            key_store.inner(),
        )
        .await?;
        results.push(summary);
    }

    Ok(results)
}

/// 获取单个供应商用量
#[tauri::command]
pub async fn fetch_provider_usage(
    provider_id: String,
    provider_manager: State<'_, ProviderManager>,
    app_config: State<'_, AppConfig>,
    key_store: State<'_, KeyStore>,
) -> Result<UsageSummary, String> {
    let entry = app_config.get_provider_entry(&provider_id).await;
    build_usage_summary(
        &provider_id,
        entry,
        provider_manager.inner(),
        key_store.inner(),
    )
    .await
}

/// 获取已添加的供应商配置
#[tauri::command]
pub async fn get_provider_configs(
    provider_manager: State<'_, ProviderManager>,
    app_config: State<'_, AppConfig>,
    key_store: State<'_, KeyStore>,
) -> Result<Vec<ProviderConfigItem>, String> {
    let configured_providers = app_config.get_configured_providers().await;
    let mut items = Vec::new();

    for provider_id in configured_providers {
        let Some(mut item) = provider_manager.get_provider_config_item(&provider_id) else {
            continue;
        };

        let entry = app_config.get_provider_entry(&provider_id).await;
        let api_keys = load_provider_api_keys(
            &provider_id,
            &item.provider_id,
            entry.as_ref(),
            key_store.inner(),
        )
        .await;

        let active_api_key_id = entry
            .as_ref()
            .and_then(|provider_entry| provider_entry.active_api_key_id.clone());

        item.enabled = true;
        item.api_keys = api_keys
            .into_iter()
            .map(|key| ProviderApiKeyItem {
                is_active_in_environment: active_api_key_id.as_deref() == Some(key.id.as_str()),
                id: key.id,
                name: key.name,
                value: mask_value(&key.value),
            })
            .collect();
        item.environment_variable_name = item.provider_id.env_key_name().to_string();
        item.active_api_key_id = active_api_key_id;

        if let Some(env_name) = item.provider_id.env_oauth_token_name() {
            item.subscriptions = load_provider_subscriptions(
                &provider_id,
                &item.provider_id,
                entry.as_ref(),
                key_store.inner(),
                Some(env_name),
            )
            .await
            .into_iter()
            .map(|subscription| ProviderSubscriptionItem {
                id: subscription.id,
                name: subscription.name,
                oauth_token: mask_value(&subscription.value),
                source: subscription.source,
            })
            .collect();
        }

        items.push(item);
    }

    Ok(items)
}

/// 获取支持的供应商列表
#[tauri::command]
pub async fn get_supported_providers(
    provider_manager: State<'_, ProviderManager>,
) -> Result<Vec<ProviderConfigItem>, String> {
    Ok(provider_manager.get_provider_config_items())
}

/// 保存供应商配置
#[tauri::command]
pub async fn save_provider_config(
    config: ProviderConfig,
    app_config: State<'_, AppConfig>,
    key_store: State<'_, KeyStore>,
) -> Result<(), String> {
    let ProviderConfig {
        provider_id: provider_enum,
        enabled,
        api_keys,
        subscriptions,
    } = config;

    let provider_id = provider_enum.as_str().to_string();
    let existing_entry = app_config.get_provider_entry(&provider_id).await;

    let sanitized_api_keys: Vec<ProviderApiKeyInput> = api_keys
        .into_iter()
        .enumerate()
        .filter_map(|(index, key)| {
            let value = key.value.trim().to_string();
            if value.is_empty() {
                return None;
            }

            let id = if key.id.trim().is_empty() {
                format!("key-{}", index + 1)
            } else {
                key.id.trim().to_string()
            };

            Some(ProviderApiKeyInput {
                id,
                name: normalize_key_name(&key.name, index),
                value,
            })
        })
        .collect();

    let sanitized_subscriptions: Vec<ProviderSubscriptionInput> = subscriptions
        .into_iter()
        .enumerate()
        .filter_map(|(index, subscription)| {
            let oauth_token = subscription.oauth_token.trim().to_string();
            if oauth_token.is_empty() {
                return None;
            }

            let id = if subscription.id.trim().is_empty() {
                format!("subscription-{}", index + 1)
            } else {
                subscription.id.trim().to_string()
            };

            Some(ProviderSubscriptionInput {
                id,
                name: normalize_subscription_name(&subscription.name, index),
                oauth_token,
                source: subscription.source.and_then(normalize_optional_string),
            })
        })
        .collect();

    let provider_entry = ProviderEntry {
        provider_id: provider_id.clone(),
        enabled,
        api_keys: sanitized_api_keys
            .iter()
            .map(|key| ProviderApiKeyEntry {
                id: key.id.clone(),
                name: key.name.clone(),
            })
            .collect(),
        subscriptions: sanitized_subscriptions
            .iter()
            .map(|subscription| ProviderSubscriptionEntry {
                id: subscription.id.clone(),
                name: subscription.name.clone(),
                source: subscription.source.clone(),
            })
            .collect(),
        active_api_key_id: existing_entry
            .as_ref()
            .and_then(|entry| entry.active_api_key_id.clone())
            .filter(|active_key_id| {
                sanitized_api_keys
                    .iter()
                    .any(|key| key.id == *active_key_id)
            }),
        manage_api_key_environment: existing_entry
            .as_ref()
            .map(|entry| entry.manage_api_key_environment)
            .unwrap_or(false),
    };

    app_config
        .save_provider_entry(&provider_id, provider_entry)
        .await?;

    for key in &sanitized_api_keys {
        let storage_key = api_key_storage_key(&provider_id, &key.id);

        if key.value.contains("...") {
            if key_store.get_stored_key(&storage_key).await.is_none() {
                if let Some(legacy_value) = key_store
                    .get_key(&provider_id, provider_enum.env_key_name())
                    .await
                {
                    key_store.set_key(&storage_key, &legacy_value).await?;
                }
            }
            continue;
        }

        key_store.set_key(&storage_key, &key.value).await?;
    }

    if let Some(entry) = existing_entry.as_ref() {
        for old_key in &entry.api_keys {
            if sanitized_api_keys.iter().any(|key| key.id == old_key.id) {
                continue;
            }

            key_store
                .set_key(&api_key_storage_key(&provider_id, &old_key.id), "")
                .await?;
        }
    }

    key_store.set_key(&provider_id, "").await?;

    if let Some(entry) = existing_entry.as_ref() {
        for old_subscription in &entry.subscriptions {
            if sanitized_subscriptions
                .iter()
                .any(|subscription| subscription.id == old_subscription.id)
            {
                continue;
            }

            key_store
                .set_key(
                    &subscription_storage_key(&provider_id, &old_subscription.id),
                    "",
                )
                .await?;
        }
    }

    for subscription in &sanitized_subscriptions {
        let storage_key = subscription_storage_key(&provider_id, &subscription.id);

        if subscription.oauth_token.contains("...") {
            continue;
        }

        key_store
            .set_key(&storage_key, &subscription.oauth_token)
            .await?;
    }

    key_store
        .set_key(&oauth_storage_key(&provider_id), "")
        .await?;

    sync_active_api_key_envs(app_config.inner(), key_store.inner()).await?;

    Ok(())
}

/// 移除供应商配置
#[tauri::command]
pub async fn remove_provider_config(
    provider_id: String,
    app_config: State<'_, AppConfig>,
    key_store: State<'_, KeyStore>,
) -> Result<(), String> {
    let existing_entry = app_config.get_provider_entry(&provider_id).await;

    if let Some(entry) = existing_entry.as_ref() {
        for key in &entry.api_keys {
            key_store
                .set_key(&api_key_storage_key(&provider_id, &key.id), "")
                .await?;
        }

        for subscription in &entry.subscriptions {
            key_store
                .set_key(
                    &subscription_storage_key(&provider_id, &subscription.id),
                    "",
                )
                .await?;
        }
    }

    key_store.set_key(&provider_id, "").await?;
    key_store
        .set_key(&oauth_storage_key(&provider_id), "")
        .await?;

    app_config
        .save_provider_entry(
            &provider_id,
            ProviderEntry {
                provider_id: provider_id.clone(),
                enabled: false,
                api_keys: Vec::new(),
                subscriptions: Vec::new(),
                active_api_key_id: None,
                manage_api_key_environment: existing_entry
                    .as_ref()
                    .map(|entry| entry.manage_api_key_environment)
                    .unwrap_or(false),
            },
        )
        .await?;

    sync_active_api_key_envs(app_config.inner(), key_store.inner()).await
}

/// 验证 API Key
#[tauri::command]
pub async fn validate_api_key(
    provider_id: String,
    api_key: String,
    provider_manager: State<'_, ProviderManager>,
) -> Result<bool, String> {
    provider_manager.validate_key(&provider_id, &api_key).await
}

#[tauri::command]
pub async fn save_provider_order(
    order: Vec<String>,
    app_config: State<'_, AppConfig>,
) -> Result<(), String> {
    let mut deduped = Vec::new();

    for provider_id in order {
        if !matches!(provider_id.as_str(), "openai" | "anthropic" | "openrouter") {
            continue;
        }

        if !deduped.contains(&provider_id) {
            deduped.push(provider_id);
        }
    }

    app_config.save_provider_order(deduped).await
}

#[tauri::command]
pub async fn activate_provider_api_key(
    provider_id: String,
    api_key_id: String,
    app_config: State<'_, AppConfig>,
    key_store: State<'_, KeyStore>,
) -> Result<(), String> {
    let Some(mut entry) = app_config.get_provider_entry(&provider_id).await else {
        return Err("未找到供应商配置".to_string());
    };

    if !entry.api_keys.iter().any(|key| key.id == api_key_id) {
        return Err("未找到要激活的 API Key".to_string());
    }

    let storage_key = api_key_storage_key(&provider_id, &api_key_id);
    let has_stored_value = key_store
        .get_stored_key(&storage_key)
        .await
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);

    if !has_stored_value {
        return Err("当前 API Key 尚未保存，请先保存配置".to_string());
    }

    entry.active_api_key_id = Some(api_key_id);
    entry.manage_api_key_environment = true;
    app_config.save_provider_entry(&provider_id, entry).await?;
    sync_active_api_key_envs(app_config.inner(), key_store.inner()).await
}

async fn build_usage_summary(
    provider_id: &str,
    entry: Option<ProviderEntry>,
    provider_manager: &ProviderManager,
    key_store: &KeyStore,
) -> Result<UsageSummary, String> {
    let pid = parse_provider_id(provider_id)?;
    let base_item = provider_manager
        .get_provider_config_item(provider_id)
        .ok_or_else(|| format!("未知供应商: {}", provider_id))?;

    let api_keys = load_provider_api_keys(provider_id, &pid, entry.as_ref(), key_store).await;
    let subscriptions = if let Some(env_name) = pid.env_oauth_token_name() {
        load_provider_subscriptions(provider_id, &pid, entry.as_ref(), key_store, Some(env_name))
            .await
    } else {
        Vec::new()
    };

    let mut api_key_usages = Vec::new();
    let mut successful_usages = Vec::new();
    let mut api_errors = Vec::new();
    let mut subscription_errors = Vec::new();
    let mut rate_limit = None;

    for api_key in &api_keys {
        match provider_manager
            .fetch_api_usage(provider_id, &api_key.value)
            .await
        {
            Ok((usage, item_rate_limit)) => {
                if api_keys.len() == 1 {
                    rate_limit = item_rate_limit.clone();
                }

                successful_usages.push(usage.clone());
                api_key_usages.push(ApiKeyUsageSummary {
                    key_id: api_key.id.clone(),
                    key_name: api_key.name.clone(),
                    status: ProviderStatus::Success,
                    usage: Some(usage),
                    rate_limit: item_rate_limit,
                    error_message: None,
                });
            }
            Err(error) => {
                api_errors.push(format!("{}: {}", api_key.name, error));
                api_key_usages.push(ApiKeyUsageSummary {
                    key_id: api_key.id.clone(),
                    key_name: api_key.name.clone(),
                    status: ProviderStatus::Error,
                    usage: None,
                    rate_limit: None,
                    error_message: Some(error),
                });
            }
        }
    }

    let usage = aggregate_usage_data(&successful_usages);
    let mut subscription_summaries = Vec::new();

    for subscription in subscriptions {
        let usage = provider_manager
            .fetch_subscription_usage(provider_id, &subscription.value)
            .await;
        if matches!(usage.status, ProviderStatus::Error) {
            if let Some(error_message) = usage.error_message.clone() {
                subscription_errors.push(format!("{}: {}", subscription.name, error_message));
            }
        }
        subscription_summaries.push(SubscriptionUsageSummary {
            subscription_id: subscription.id,
            subscription_name: subscription.name,
            source: subscription.source,
            usage,
        });
    }

    let has_subscription_data = subscription_summaries
        .iter()
        .any(|item| matches!(item.usage.status, ProviderStatus::Success));

    let has_usage_data = usage.is_some();
    let status = if has_usage_data || has_subscription_data {
        ProviderStatus::Success
    } else {
        ProviderStatus::Error
    };

    let error_message = if has_usage_data || has_subscription_data {
        None
    } else if !api_errors.is_empty() {
        Some(api_errors.join("；"))
    } else {
        Some("未配置 API Key 或 OAuth Token".into())
    };

    let summary = UsageSummary {
        provider_id: pid,
        display_name: base_item.display_name,
        enabled: entry.as_ref().map(|item| item.enabled).unwrap_or(true),
        status,
        api_key_usages,
        usage,
        subscriptions: subscription_summaries,
        rate_limit,
        last_updated: Some(chrono::Utc::now().to_rfc3339()),
        error_message,
    };

    provider_manager
        .cache_summary(provider_id, summary.clone())
        .await;

    Ok(summary)
}

async fn load_provider_api_keys(
    provider_id: &str,
    provider: &ProviderId,
    entry: Option<&ProviderEntry>,
    key_store: &KeyStore,
) -> Vec<ResolvedApiKey> {
    let mut api_keys = Vec::new();

    if let Some(entry) = entry {
        for (index, key) in entry.api_keys.iter().enumerate() {
            if let Some(value) = key_store
                .get_stored_key(&api_key_storage_key(provider_id, &key.id))
                .await
                .filter(|value| !value.is_empty())
            {
                api_keys.push(ResolvedApiKey {
                    id: key.id.clone(),
                    name: normalize_key_name(&key.name, index),
                    value,
                });
            }
        }
    }

    if !api_keys.is_empty() {
        return api_keys;
    }

    if let Some(legacy_value) = key_store
        .get_key(provider_id, provider.env_key_name())
        .await
    {
        if !legacy_value.is_empty() {
            api_keys.push(ResolvedApiKey {
                id: LEGACY_API_KEY_ID.to_string(),
                name: "默认 Key".to_string(),
                value: legacy_value,
            });
        }
    }

    api_keys
}

async fn load_provider_subscriptions(
    provider_id: &str,
    provider: &ProviderId,
    entry: Option<&ProviderEntry>,
    key_store: &KeyStore,
    env_var_name: Option<&str>,
) -> Vec<ResolvedSubscription> {
    let mut subscriptions = Vec::new();

    if let Some(entry) = entry {
        for (index, subscription) in entry.subscriptions.iter().enumerate() {
            if let Some(value) = key_store
                .get_stored_key(&subscription_storage_key(provider_id, &subscription.id))
                .await
                .filter(|value| !value.is_empty())
            {
                subscriptions.push(ResolvedSubscription {
                    id: subscription.id.clone(),
                    name: normalize_subscription_name(&subscription.name, index),
                    value,
                    source: subscription.source.clone(),
                });
            }
        }
    }

    if !subscriptions.is_empty() {
        return subscriptions;
    }

    if let Some(env_var_name) = env_var_name {
        if let Some(legacy_value) = key_store
            .get_key(&oauth_storage_key(provider_id), env_var_name)
            .await
            .filter(|value| !value.is_empty())
        {
            subscriptions.push(ResolvedSubscription {
                id: LEGACY_SUBSCRIPTION_ID.to_string(),
                name: default_subscription_name(provider),
                value: legacy_value,
                source: None,
            });
        }
    }

    subscriptions
}

fn aggregate_usage_data(items: &[UsageData]) -> Option<UsageData> {
    let first = items.first()?;
    let currency = first.currency.clone();
    let mut total_used = 0.0;
    let mut total_budget = Some(0.0);
    let mut remaining = Some(0.0);
    let mut period_start = first.period_start.clone();
    let mut period_end = first.period_end.clone();

    for item in items {
        total_used += item.total_used;

        total_budget = match (total_budget, item.total_budget) {
            (Some(acc), Some(value)) => Some(acc + value),
            _ => None,
        };

        remaining = match (remaining, item.remaining) {
            (Some(acc), Some(value)) => Some(acc + value),
            _ => None,
        };

        period_start = min_optional_iso(period_start, item.period_start.clone());
        period_end = max_optional_iso(period_end, item.period_end.clone());
    }

    Some(UsageData {
        total_used,
        total_budget,
        remaining,
        currency,
        period_start,
        period_end,
    })
}

fn min_optional_iso(current: Option<String>, next: Option<String>) -> Option<String> {
    match (current, next) {
        (Some(left), Some(right)) => Some(if left <= right { left } else { right }),
        (Some(left), None) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    }
}

fn max_optional_iso(current: Option<String>, next: Option<String>) -> Option<String> {
    match (current, next) {
        (Some(left), Some(right)) => Some(if left >= right { left } else { right }),
        (Some(left), None) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    }
}

fn parse_provider_id(provider_id: &str) -> Result<ProviderId, String> {
    match provider_id {
        "openai" => Ok(ProviderId::OpenAI),
        "anthropic" => Ok(ProviderId::Anthropic),
        "openrouter" => Ok(ProviderId::OpenRouter),
        _ => Err(format!("未知供应商: {}", provider_id)),
    }
}

fn api_key_storage_key(provider_id: &str, key_id: &str) -> String {
    format!("{}::api_key::{}", provider_id, key_id)
}

fn oauth_storage_key(provider_id: &str) -> String {
    format!("{}_oauth", provider_id)
}

fn subscription_storage_key(provider_id: &str, subscription_id: &str) -> String {
    format!("{}::subscription::{}", provider_id, subscription_id)
}

fn normalize_key_name(name: &str, index: usize) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        format!("密钥 {}", index + 1)
    } else {
        trimmed.to_string()
    }
}

fn normalize_subscription_name(name: &str, index: usize) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        format!("订阅 {}", index + 1)
    } else {
        trimmed.to_string()
    }
}

fn normalize_optional_string(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn default_subscription_name(provider: &ProviderId) -> String {
    match provider {
        ProviderId::OpenAI => "OpenAI 订阅".to_string(),
        ProviderId::Anthropic => "Anthropic 订阅".to_string(),
        ProviderId::OpenRouter => "OpenRouter 订阅".to_string(),
    }
}

fn mask_value(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }

    if value.len() <= 8 {
        return "****".to_string();
    }

    format!("{}...{}", &value[..4], &value[value.len() - 4..])
}

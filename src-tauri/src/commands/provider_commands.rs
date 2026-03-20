use tauri::State;

use crate::config::app_config::AppConfig;
use crate::config::encryption::KeyStore;
use crate::providers::types::*;
use crate::providers::ProviderManager;

/// 获取所有已启用供应商的用量
#[tauri::command]
pub async fn fetch_all_usage(
    provider_manager: State<'_, ProviderManager>,
    app_config: State<'_, AppConfig>,
    key_store: State<'_, KeyStore>,
) -> Result<Vec<UsageSummary>, String> {
    let enabled = app_config.get_enabled_providers().await;
    let mut results = Vec::new();

    for provider_id in &enabled {
        let pid = match provider_id.as_str() {
            "openai" => ProviderId::OpenAI,
            "anthropic" => ProviderId::Anthropic,
            "openrouter" => ProviderId::OpenRouter,
            _ => continue,
        };

        let api_key = key_store
            .get_key(provider_id, pid.env_key_name())
            .await;

        let oauth_token = if let Some(env_name) = pid.env_oauth_token_name() {
            key_store
                .get_key(&format!("{}_oauth", provider_id), env_name)
                .await
        } else {
            None
        };

        let has_any_credential = api_key.as_ref().map_or(false, |k| !k.is_empty())
            || oauth_token.as_ref().map_or(false, |t| !t.is_empty());

        if has_any_credential {
            let summary = provider_manager
                .fetch_usage(
                    provider_id,
                    api_key.as_deref(),
                    oauth_token.as_deref(),
                )
                .await;
            results.push(summary);
        } else {
            results.push(UsageSummary {
                provider_id: pid,
                display_name: provider_id.clone(),
                enabled: true,
                status: ProviderStatus::Error,
                usage: None,
                subscription: None,
                rate_limit: None,
                last_updated: None,
                error_message: Some("未配置 API Key 或 OAuth Token".into()),
            });
        }
    }

    Ok(results)
}

/// 获取单个供应商用量
#[tauri::command]
pub async fn fetch_provider_usage(
    provider_id: String,
    provider_manager: State<'_, ProviderManager>,
    key_store: State<'_, KeyStore>,
) -> Result<UsageSummary, String> {
    let pid = match provider_id.as_str() {
        "openai" => ProviderId::OpenAI,
        "anthropic" => ProviderId::Anthropic,
        "openrouter" => ProviderId::OpenRouter,
        _ => return Err(format!("未知供应商: {}", provider_id)),
    };

    let api_key = key_store
        .get_key(&provider_id, pid.env_key_name())
        .await;

    let oauth_token = if let Some(env_name) = pid.env_oauth_token_name() {
        key_store
            .get_key(&format!("{}_oauth", provider_id), env_name)
            .await
    } else {
        None
    };

    Ok(provider_manager
        .fetch_usage(&provider_id, api_key.as_deref(), oauth_token.as_deref())
        .await)
}

/// 获取所有供应商配置
#[tauri::command]
pub async fn get_provider_configs(
    provider_manager: State<'_, ProviderManager>,
    app_config: State<'_, AppConfig>,
    key_store: State<'_, KeyStore>,
) -> Result<Vec<ProviderConfigItem>, String> {
    let mut items = provider_manager.get_provider_config_items();

    for item in &mut items {
        let pid_str = item.provider_id.as_str();
        if let Some(entry) = app_config.get_provider_entry(pid_str).await {
            item.enabled = entry.enabled;
        }
        item.api_key = key_store
            .get_masked_key(pid_str, item.provider_id.env_key_name())
            .await;

        if let Some(env_name) = item.provider_id.env_oauth_token_name() {
            item.oauth_token = key_store
                .get_masked_key(&format!("{}_oauth", pid_str), env_name)
                .await;
        }
    }

    Ok(items)
}

/// 保存供应商配置
#[tauri::command]
pub async fn save_provider_config(
    config: ProviderConfig,
    app_config: State<'_, AppConfig>,
    key_store: State<'_, KeyStore>,
) -> Result<(), String> {
    let pid_str = config.provider_id.as_str().to_string();

    // 保存启用状态
    app_config
        .save_provider_entry(
            &pid_str,
            crate::config::app_config::ProviderEntry {
                provider_id: pid_str.clone(),
                enabled: config.enabled,
            },
        )
        .await?;

    // 保存 API Key
    if !config.api_key.contains("...") {
        key_store.set_key(&pid_str, &config.api_key).await?;
    }

    // 保存 OAuth Token
    if !config.oauth_token.contains("...") {
        key_store
            .set_key(&format!("{}_oauth", pid_str), &config.oauth_token)
            .await?;
    }

    Ok(())
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

use std::collections::BTreeMap;

use reqwest::{Client, RequestBuilder};
use serde::Deserialize;
use serde_json::Value;

use super::http::{check_response, new_client, ApiNumber};
use super::traits::ProviderError;
use super::types::*;

/// 订阅端点属于客户端内部接口；保留已知结构，同时拒绝把未知格式显示为零用量。
pub struct SubscriptionFetcher {
    client: Client,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsageWindow {
    utilization: ApiNumber,
    resets_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicExtraUsage {
    is_enabled: bool,
    monthly_limit: Option<ApiNumber>,
    used_credits: Option<ApiNumber>,
    utilization: Option<ApiNumber>,
    resets_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAIWhamUsageResponse {
    plan_type: Option<String>,
    rate_limit: Option<OpenAIRateLimitInfo>,
    #[serde(flatten)]
    additional: BTreeMap<String, Value>,
}

#[derive(Debug, Deserialize)]
struct OpenAIRateLimitInfo {
    primary_window: Option<OpenAIUsageWindow>,
    secondary_window: Option<OpenAIUsageWindow>,
}

#[derive(Debug, Deserialize)]
struct OpenAIUsageWindow {
    used_percent: ApiNumber,
    limit_window_seconds: Option<u64>,
    reset_at: Option<i64>,
    reset_after_seconds: Option<i64>,
}

impl SubscriptionFetcher {
    pub fn new() -> Self {
        Self {
            client: new_client(),
        }
    }

    pub async fn fetch_anthropic(&self, oauth_token: &str) -> SubscriptionUsage {
        fetch_subscription(
            self.client
                .get("https://api.anthropic.com/api/oauth/usage")
                .bearer_auth(oauth_token)
                .header("Accept", "application/json")
                .header("anthropic-beta", "oauth-2025-04-20"),
            parse_anthropic,
        )
        .await
    }

    pub async fn fetch_openai(&self, oauth_token: &str) -> SubscriptionUsage {
        fetch_subscription(
            self.client
                .get("https://chatgpt.com/backend-api/wham/usage")
                .bearer_auth(oauth_token)
                .header("Accept", "application/json"),
            parse_openai,
        )
        .await
    }
}

async fn fetch_subscription(
    request: RequestBuilder,
    parse: fn(Value) -> Result<SubscriptionUsage, ProviderError>,
) -> SubscriptionUsage {
    let result = async {
        let response = check_response(
            request.send().await?,
            "OAuth Token 无效、已过期或缺少订阅查询权限",
        )?;
        let value = response
            .json::<Value>()
            .await
            .map_err(|error| ProviderError::ParseError(error.to_string()))?;
        parse(value)
    }
    .await;
    result.unwrap_or_else(|error| SubscriptionUsage {
        plan_name: None,
        windows: vec![],
        extra_usage: None,
        status: ProviderStatus::Error,
        error_message: Some(error.to_string()),
    })
}

fn parse_anthropic(value: Value) -> Result<SubscriptionUsage, ProviderError> {
    let object = value
        .as_object()
        .ok_or_else(|| ProviderError::ParseError("订阅响应不是 JSON 对象".into()))?;
    let mut entries: Vec<_> = object
        .iter()
        .filter(|(name, value)| {
            name.as_str() != "extra_usage" && value.get("utilization").is_some()
        })
        .collect();
    entries.sort_by(|(left, _), (right, _)| {
        anthropic_window_rank(left)
            .cmp(&anthropic_window_rank(right))
            .then_with(|| left.cmp(right))
    });
    let mut windows = Vec::new();
    for (name, value) in entries {
        let window: AnthropicUsageWindow = serde_json::from_value(value.clone())
            .map_err(|error| ProviderError::ParseError(error.to_string()))?;
        let label = match name.as_str() {
            "five_hour" => "5小时",
            "seven_day" => "7天",
            "seven_day_sonnet" => "7天(Sonnet)",
            "seven_day_opus" => "7天(Opus)",
            "seven_day_oauth_apps" => "7天(OAuth Apps)",
            other => other,
        };
        windows.push(SubscriptionWindow {
            label: label.into(),
            utilization: window.utilization.value()?,
            resets_at: window.resets_at,
        });
    }
    let extra_usage = object
        .get("extra_usage")
        .filter(|value| !value.is_null())
        .map(|value| {
            let extra: AnthropicExtraUsage = serde_json::from_value(value.clone())
                .map_err(|error| ProviderError::ParseError(error.to_string()))?;
            if extra.is_enabled
                && (value.get("monthly_limit").is_none() || value.get("used_credits").is_none())
            {
                return Err(ProviderError::ParseError(
                    "Extra Usage 响应缺少额度或已用金额字段".into(),
                ));
            }
            let monthly_limit_usd = extra
                .monthly_limit
                .as_ref()
                .map(ApiNumber::value)
                .transpose()?
                .map(|value| value / 100.0);
            let used_usd = extra
                .used_credits
                .as_ref()
                .map(ApiNumber::value)
                .transpose()?
                .map(|value| value / 100.0);
            let utilization = match (monthly_limit_usd, used_usd) {
                (Some(limit), Some(used)) if limit > 0.0 => Some(used / limit * 100.0),
                _ => extra
                    .utilization
                    .as_ref()
                    .map(ApiNumber::value)
                    .transpose()?,
            };
            Ok(ExtraUsage {
                is_enabled: extra.is_enabled,
                monthly_limit_usd,
                used_usd,
                utilization,
                resets_at: extra.resets_at,
            })
        })
        .transpose()?;
    if windows.is_empty() && extra_usage.is_none() {
        return Err(ProviderError::ParseError(
            "未识别到 Anthropic 订阅窗口，响应格式可能已变化".into(),
        ));
    }
    Ok(SubscriptionUsage {
        plan_name: None,
        windows,
        extra_usage,
        status: ProviderStatus::Success,
        error_message: None,
    })
}

fn anthropic_window_rank(name: &str) -> u8 {
    match name {
        "five_hour" => 0,
        "seven_day" => 1,
        "seven_day_sonnet" => 2,
        "seven_day_opus" => 3,
        _ => 4,
    }
}

fn parse_openai(value: Value) -> Result<SubscriptionUsage, ProviderError> {
    let data: OpenAIWhamUsageResponse = serde_json::from_value(value)
        .map_err(|error| ProviderError::ParseError(error.to_string()))?;
    let plan_name = data.plan_type.map(|plan| match plan.as_str() {
        "free" => "ChatGPT Free".into(),
        "plus" => "ChatGPT Plus".into(),
        "pro" => "ChatGPT Pro".into(),
        "team" => "ChatGPT Team".into(),
        "business" => "ChatGPT Business".into(),
        "enterprise" => "ChatGPT Enterprise".into(),
        other => other.to_string(),
    });
    let mut windows = Vec::new();
    if let Some(limit) = data.rate_limit {
        append_openai_windows(&mut windows, limit, "")?;
    }
    // 仅在附加对象仍使用已知窗口结构时解析，不凭空推测新字段的单位。
    for (name, value) in &data.additional {
        if name.ends_with("_rate_limit") && value.is_object() {
            let limit: OpenAIRateLimitInfo = serde_json::from_value(value.clone())
                .map_err(|error| ProviderError::ParseError(error.to_string()))?;
            append_openai_windows(&mut windows, limit, name.trim_end_matches("_rate_limit"))?;
        }
    }
    if let Some(limits) = data
        .additional
        .get("additional_rate_limits")
        .and_then(Value::as_array)
    {
        for (index, value) in limits.iter().enumerate() {
            if let Some(limit) = value.get("rate_limit") {
                let label = value
                    .get("limit_name")
                    .or_else(|| value.get("limit_id"))
                    .and_then(Value::as_str)
                    .map(str::to_owned)
                    .unwrap_or_else(|| format!("附加额度{}", index + 1));
                let limit: OpenAIRateLimitInfo = serde_json::from_value(limit.clone())
                    .map_err(|error| ProviderError::ParseError(error.to_string()))?;
                append_openai_windows(&mut windows, limit, &label)?;
            }
        }
    }
    if windows.is_empty() {
        return Err(ProviderError::ParseError(
            "未识别到 OpenAI 订阅窗口，响应格式可能已变化".into(),
        ));
    }
    Ok(SubscriptionUsage {
        plan_name,
        windows,
        extra_usage: None,
        status: ProviderStatus::Success,
        error_message: None,
    })
}

fn append_openai_windows(
    windows: &mut Vec<SubscriptionWindow>,
    limit: OpenAIRateLimitInfo,
    prefix: &str,
) -> Result<(), ProviderError> {
    for (window, fallback) in [
        (limit.primary_window, "主窗口"),
        (limit.secondary_window, "次窗口"),
    ] {
        if let Some(window) = window {
            let duration = window
                .limit_window_seconds
                .map(format_window_duration)
                .unwrap_or_else(|| fallback.into());
            let label = if prefix.is_empty() {
                duration
            } else {
                format!("{prefix} · {duration}")
            };
            let resets_at = window
                .reset_at
                .and_then(|timestamp| chrono::DateTime::from_timestamp(timestamp, 0))
                .or_else(|| {
                    window
                        .reset_after_seconds
                        .and_then(chrono::Duration::try_seconds)
                        .and_then(|duration| chrono::Utc::now().checked_add_signed(duration))
                })
                .map(|time| time.to_rfc3339());
            windows.push(SubscriptionWindow {
                label,
                utilization: window.used_percent.value()?,
                resets_at,
            });
        }
    }
    Ok(())
}

fn format_window_duration(seconds: u64) -> String {
    if seconds >= 86400 {
        format!("{}天", seconds / 86400)
    } else if seconds >= 3600 {
        format!("{}小时", seconds / 3600)
    } else if seconds >= 60 {
        format!("{}分钟", seconds / 60)
    } else {
        format!("{seconds}秒")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn anthropic_preserves_all_windows_and_extra_usage_units() {
        let usage = parse_anthropic(json!({
            "five_hour": {"utilization": 12.5, "resets_at": null},
            "seven_day": {"utilization": 25, "resets_at": null},
            "seven_day_sonnet": null,
            "seven_day_opus": {"utilization": 30, "resets_at": null},
            "future_model_window": {"utilization": "40", "resets_at": null},
            "extra_usage": {"is_enabled": true, "monthly_limit": 5000, "used_credits": 500.5, "utilization": 10.01}
        })).unwrap();
        assert_eq!(usage.windows.len(), 4);
        assert_eq!(usage.windows[0].label, "5小时");
        assert_eq!(usage.windows[2].label, "7天(Opus)");
        let extra = usage.extra_usage.unwrap();
        assert_eq!(extra.monthly_limit_usd, Some(50.0));
        assert_eq!(extra.used_usd, Some(5.005));
        assert!((extra.utilization.unwrap() - 10.01).abs() < 1e-9);
        assert_eq!(extra.resets_at, None);
    }

    #[test]
    fn extra_usage_can_exist_without_subscription_windows() {
        let usage = parse_anthropic(json!({"extra_usage": {"is_enabled": true, "monthly_limit": 1000, "used_credits": 200}})).unwrap();
        assert!(usage.windows.is_empty());
        assert_eq!(usage.extra_usage.unwrap().utilization, Some(20.0));
    }

    #[test]
    fn openai_preserves_standard_and_additional_windows() {
        let usage = parse_openai(json!({
            "plan_type": "business",
            "rate_limit": {
                "primary_window": {"used_percent": 15, "limit_window_seconds": 18000, "reset_at": 1800000000},
                "secondary_window": {"used_percent": 35, "limit_window_seconds": 604800, "reset_at": null, "reset_after_seconds": 120}
            },
            "code_review_rate_limit": {"primary_window": {"used_percent": 50, "limit_window_seconds": 604800}},
            "additional_rate_limits": [{"limit_name": "模型额度", "rate_limit": {"primary_window": {"used_percent": "60", "limit_window_seconds": 18000}}}]
        })).unwrap();
        assert_eq!(usage.plan_name.as_deref(), Some("ChatGPT Business"));
        assert_eq!(usage.windows.len(), 4);
        assert_eq!(usage.windows[0].label, "5小时");
        assert_eq!(usage.windows[1].label, "7天");
        assert!(usage.windows[1].resets_at.is_some());
        assert_eq!(usage.windows[3].utilization, 60.0);
    }

    #[test]
    fn unknown_or_incomplete_subscriptions_are_errors_instead_of_zero_usage() {
        assert!(parse_anthropic(json!({})).is_err());
        assert!(parse_anthropic(json!({"extra_usage": {"is_enabled": true}})).is_err());
        assert!(parse_openai(json!({})).is_err());
        assert!(parse_openai(
            json!({"rate_limit": {"primary_window": {"limit_window_seconds": 18000}}})
        )
        .is_err());
    }
}

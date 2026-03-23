use reqwest::Client;
use serde::Deserialize;

use super::types::*;

/// 订阅用量查询器
pub struct SubscriptionFetcher {
    client: Client,
}

// ===== Anthropic 订阅 =====

#[derive(Debug, Deserialize)]
struct AnthropicOAuthUsageResponse {
    five_hour: Option<AnthropicUsageWindow>,
    seven_day: Option<AnthropicUsageWindow>,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsageWindow {
    utilization: f64,
    resets_at: Option<String>,
}

// ===== OpenAI 订阅 =====

#[derive(Debug, Deserialize)]
struct OpenAIWhamUsageResponse {
    plan_type: Option<String>,
    rate_limit: Option<OpenAIRateLimitInfo>,
}

#[derive(Debug, Deserialize)]
struct OpenAIRateLimitInfo {
    primary_window: Option<OpenAIUsageWindow>,
    secondary_window: Option<OpenAIUsageWindow>,
}

#[derive(Debug, Deserialize)]
struct OpenAIUsageWindow {
    used_percent: Option<f64>,
    limit_window_seconds: Option<u64>,
    reset_at: Option<u64>,
}

impl SubscriptionFetcher {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    /// 获取 Anthropic 订阅用量（Claude Pro/Max/Team）
    pub async fn fetch_anthropic(&self, oauth_token: &str) -> SubscriptionUsage {
        let resp = self
            .client
            .get("https://api.anthropic.com/api/oauth/usage")
            .header("Authorization", format!("Bearer {}", oauth_token))
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .header("anthropic-beta", "oauth-2025-04-20")
            .send()
            .await;

        let resp = match resp {
            Ok(r) => r,
            Err(e) => {
                return SubscriptionUsage {
                    plan_name: None,
                    windows: vec![],
                    status: ProviderStatus::Error,
                    error_message: Some(format!("请求失败: {}", e)),
                };
            }
        };

        if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 {
            return SubscriptionUsage {
                plan_name: None,
                windows: vec![],
                status: ProviderStatus::Error,
                error_message: Some("OAuth Token 无效或已过期".into()),
            };
        }

        if resp.status().as_u16() == 429 {
            return SubscriptionUsage {
                plan_name: None,
                windows: vec![],
                status: ProviderStatus::Error,
                error_message: Some("请求过于频繁，请稍后再试".into()),
            };
        }

        if !resp.status().is_success() {
            return SubscriptionUsage {
                plan_name: None,
                windows: vec![],
                status: ProviderStatus::Error,
                error_message: Some(format!("HTTP {}", resp.status())),
            };
        }

        let data: AnthropicOAuthUsageResponse = match resp.json().await {
            Ok(d) => d,
            Err(e) => {
                return SubscriptionUsage {
                    plan_name: None,
                    windows: vec![],
                    status: ProviderStatus::Error,
                    error_message: Some(format!("解析失败: {}", e)),
                };
            }
        };

        let mut windows = Vec::new();

        if let Some(w) = data.five_hour {
            windows.push(SubscriptionWindow {
                label: "5小时".into(),
                utilization: w.utilization,
                resets_at: w.resets_at,
            });
        }

        if let Some(w) = data.seven_day {
            windows.push(SubscriptionWindow {
                label: "7天".into(),
                utilization: w.utilization,
                resets_at: w.resets_at,
            });
        }

        SubscriptionUsage {
            plan_name: Some("Claude Pro/Max".into()),
            windows,
            status: ProviderStatus::Success,
            error_message: None,
        }
    }

    /// 获取 OpenAI 订阅用量（ChatGPT Plus/Pro/Team）
    pub async fn fetch_openai(&self, oauth_token: &str) -> SubscriptionUsage {
        let resp = self
            .client
            .get("https://chatgpt.com/backend-api/wham/usage")
            .header("Authorization", format!("Bearer {}", oauth_token))
            .header("User-Agent", "ai-usage-monitor")
            .send()
            .await;

        let resp = match resp {
            Ok(r) => r,
            Err(e) => {
                return SubscriptionUsage {
                    plan_name: None,
                    windows: vec![],
                    status: ProviderStatus::Error,
                    error_message: Some(format!("请求失败: {}", e)),
                };
            }
        };

        if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 {
            return SubscriptionUsage {
                plan_name: None,
                windows: vec![],
                status: ProviderStatus::Error,
                error_message: Some("OAuth Token 无效或已过期".into()),
            };
        }

        if !resp.status().is_success() {
            return SubscriptionUsage {
                plan_name: None,
                windows: vec![],
                status: ProviderStatus::Error,
                error_message: Some(format!("HTTP {}", resp.status())),
            };
        }

        let data: OpenAIWhamUsageResponse = match resp.json().await {
            Ok(d) => d,
            Err(e) => {
                return SubscriptionUsage {
                    plan_name: None,
                    windows: vec![],
                    status: ProviderStatus::Error,
                    error_message: Some(format!("解析失败: {}", e)),
                };
            }
        };

        let plan_name = data.plan_type.map(|p| match p.as_str() {
            "plus" => "ChatGPT Plus".into(),
            "pro" => "ChatGPT Pro".into(),
            "team" => "ChatGPT Team".into(),
            "enterprise" => "ChatGPT Enterprise".into(),
            other => other.to_string(),
        });

        let mut windows = Vec::new();

        if let Some(ref rl) = data.rate_limit {
            if let Some(ref w) = rl.primary_window {
                let label = w
                    .limit_window_seconds
                    .map(|s| format_window_duration(s))
                    .unwrap_or_else(|| "主窗口".into());
                windows.push(SubscriptionWindow {
                    label,
                    utilization: w.used_percent.unwrap_or(0.0),
                    resets_at: w.reset_at.map(|ts| {
                        chrono::DateTime::from_timestamp(ts as i64, 0)
                            .map(|dt| dt.to_rfc3339())
                            .unwrap_or_default()
                    }),
                });
            }
            if let Some(ref w) = rl.secondary_window {
                let label = w
                    .limit_window_seconds
                    .map(|s| format_window_duration(s))
                    .unwrap_or_else(|| "次窗口".into());
                windows.push(SubscriptionWindow {
                    label,
                    utilization: w.used_percent.unwrap_or(0.0),
                    resets_at: w.reset_at.map(|ts| {
                        chrono::DateTime::from_timestamp(ts as i64, 0)
                            .map(|dt| dt.to_rfc3339())
                            .unwrap_or_default()
                    }),
                });
            }
        }

        SubscriptionUsage {
            plan_name,
            windows,
            status: ProviderStatus::Success,
            error_message: None,
        }
    }
}

/// 把秒数格式化为可读的窗口时长
fn format_window_duration(seconds: u64) -> String {
    if seconds >= 86400 {
        let days = seconds / 86400;
        format!("{}天", days)
    } else if seconds >= 3600 {
        let hours = seconds / 3600;
        format!("{}小时", hours)
    } else {
        let mins = seconds / 60;
        format!("{}分钟", mins)
    }
}

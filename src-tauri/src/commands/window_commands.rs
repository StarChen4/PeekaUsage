use serde_json::Value;
use std::collections::BTreeMap;
use tauri::{AppHandle, Manager};

/// 设置窗口透明度
#[tauri::command]
pub async fn set_window_opacity(opacity: f64, app: AppHandle) -> Result<(), String> {
    let _clamped = opacity.max(0.1).min(1.0);
    let _window = app.get_webview_window("main").ok_or("找不到主窗口")?;
    Ok(())
}

/// 自动检测本地 OAuth Token
///
/// 搜索 Claude Code 和 Codex CLI 的凭据文件，返回找到的 token。
#[tauri::command]
pub async fn detect_oauth_tokens() -> Result<DetectedTokens, String> {
    let home = dirs_next().ok_or_else(|| "无法获取用户目录".to_string())?;

    let mut result = DetectedTokens {
        anthropic: None,
        openai: None,
    };

    // 检测 Claude Code: ~/.claude/.credentials.json
    let claude_creds = home.join(".claude").join(".credentials.json");
    if claude_creds.exists() {
        if let Ok(content) = std::fs::read_to_string(&claude_creds) {
            if let Ok(creds) = serde_json::from_str::<ClaudeCredentials>(&content) {
                if let Some(oauth) = creds.claude_ai_oauth {
                    if !oauth.access_token.is_empty() {
                        result.anthropic = Some(DetectedToken {
                            token: oauth.access_token,
                            source: "Claude Code (~/.claude/.credentials.json)".into(),
                            subscription_type: oauth.subscription_type,
                        });
                    }
                }
            }
        }
    }

    // 检测 Codex CLI: ~/.codex/auth.json
    let codex_auth = home.join(".codex").join("auth.json");
    if codex_auth.exists() {
        if let Ok(content) = std::fs::read_to_string(&codex_auth) {
            if let Ok(auth) = serde_json::from_str::<CodexAuth>(&content) {
                if let Some(tokens) = auth.tokens {
                    // access_token 是 { "0": "e", "1": "y", ... } 格式
                    if let Some(token) = tokens
                        .access_token
                        .as_ref()
                        .and_then(parse_codex_access_token)
                    {
                        result.openai = Some(DetectedToken {
                            token,
                            source: "Codex CLI (~/.codex/auth.json)".into(),
                            subscription_type: None,
                        });
                    }
                }
            }
        }
    }

    Ok(result)
}

/// 把 { "0": "a", "1": "b", ... } 格式的对象转为字符串
fn indexed_object_to_string(map: &BTreeMap<String, serde_json::Value>) -> String {
    let mut entries: Vec<(usize, &str)> = map
        .iter()
        .filter_map(|(k, v)| {
            let idx = k.parse::<usize>().ok()?;
            let ch = v.as_str()?;
            Some((idx, ch))
        })
        .collect();
    entries.sort_by_key(|(idx, _)| *idx);
    entries.iter().map(|(_, ch)| *ch).collect()
}

fn parse_codex_access_token(value: &Value) -> Option<String> {
    match value {
        Value::String(token) if !token.is_empty() => Some(token.clone()),
        Value::Object(map) => {
            let ordered: BTreeMap<String, Value> = map
                .iter()
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect();
            let token = indexed_object_to_string(&ordered);
            if token.is_empty() {
                None
            } else {
                Some(token)
            }
        }
        _ => None,
    }
}

fn dirs_next() -> Option<std::path::PathBuf> {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()
        .map(std::path::PathBuf::from)
}

// ===== 数据结构 =====

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedTokens {
    pub anthropic: Option<DetectedToken>,
    pub openai: Option<DetectedToken>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedToken {
    pub token: String,
    pub source: String,
    pub subscription_type: Option<String>,
}

// ===== Claude Code 凭据结构 =====

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeCredentials {
    claude_ai_oauth: Option<ClaudeOAuth>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeOAuth {
    access_token: String,
    subscription_type: Option<String>,
}

// ===== Codex CLI 凭据结构 =====

#[derive(Debug, serde::Deserialize)]
struct CodexAuth {
    tokens: Option<CodexTokens>,
}

#[derive(Debug, serde::Deserialize)]
struct CodexTokens {
    access_token: Option<Value>,
}

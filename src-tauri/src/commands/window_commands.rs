use serde_json::Value;
use std::collections::BTreeMap;
#[cfg(windows)]
use std::process::Command;
use tauri::{AppHandle, Manager};

/// 设置窗口透明度
#[tauri::command]
pub async fn set_window_opacity(opacity: f64, app: AppHandle) -> Result<(), String> {
    let _clamped = opacity.max(0.1).min(1.0);
    let _window = app.get_webview_window("main").ok_or("找不到主窗口")?;
    Ok(())
}

/// 自动检测本地 OAuth Token
#[tauri::command]
pub async fn detect_oauth_tokens() -> Result<DetectedTokens, String> {
    let home = dirs_next().ok_or_else(|| "无法获取用户目录".to_string())?;

    let mut result = DetectedTokens {
        anthropic: Vec::new(),
        openai: Vec::new(),
    };

    if let Some(token) = read_claude_token_from_home(&home, "native") {
        result.anthropic.push(token);
    }

    if let Some(token) = read_codex_token_from_home(&home, "native") {
        result.openai.push(token);
    }

    #[cfg(windows)]
    {
        if let Some(token) = read_wsl_claude_token() {
            result.anthropic.push(token);
        }

        if let Some(token) = read_wsl_codex_token() {
            result.openai.push(token);
        }

        for token in &mut result.anthropic {
            if token.environment == "native" {
                token.environment = "windows".to_string();
                token.display_source = format!("Windows {}", token.source);
            }
        }

        for token in &mut result.openai {
            if token.environment == "native" {
                token.environment = "windows".to_string();
                token.display_source = format!("Windows {}", token.source);
            }
        }
    }

    Ok(result)
}

fn read_claude_token_from_home(home: &std::path::Path, environment: &str) -> Option<DetectedToken> {
    let credentials_path = home.join(".claude").join(".credentials.json");
    let content = std::fs::read_to_string(&credentials_path).ok()?;
    let creds = serde_json::from_str::<ClaudeCredentials>(&content).ok()?;
    let oauth = creds.claude_ai_oauth?;
    if oauth.access_token.is_empty() {
        return None;
    }

    let source = "Claude Code (~/.claude/.credentials.json)".to_string();
    Some(DetectedToken {
        token: oauth.access_token,
        source: source.clone(),
        subscription_type: oauth.subscription_type,
        environment: environment.to_string(),
        display_source: source,
    })
}

fn read_codex_token_from_home(home: &std::path::Path, environment: &str) -> Option<DetectedToken> {
    let auth_path = home.join(".codex").join("auth.json");
    let content = std::fs::read_to_string(&auth_path).ok()?;
    let auth = serde_json::from_str::<CodexAuth>(&content).ok()?;
    let tokens = auth.tokens?;
    let token = tokens
        .access_token
        .as_ref()
        .and_then(parse_codex_access_token)?;
    let source = "Codex CLI (~/.codex/auth.json)".to_string();

    Some(DetectedToken {
        token,
        source: source.clone(),
        subscription_type: None,
        environment: environment.to_string(),
        display_source: source,
    })
}

#[cfg(windows)]
fn read_wsl_claude_token() -> Option<DetectedToken> {
    let content = run_wsl_file_read("~/.claude/.credentials.json")?;
    let creds = serde_json::from_str::<ClaudeCredentials>(&content).ok()?;
    let oauth = creds.claude_ai_oauth?;
    if oauth.access_token.is_empty() {
        return None;
    }

    let source = "Claude Code (~/.claude/.credentials.json)".to_string();
    Some(DetectedToken {
        token: oauth.access_token,
        source: source.clone(),
        subscription_type: oauth.subscription_type,
        environment: "wsl".to_string(),
        display_source: format!("WSL {}", source),
    })
}

#[cfg(windows)]
fn read_wsl_codex_token() -> Option<DetectedToken> {
    let content = run_wsl_file_read("~/.codex/auth.json")?;
    let auth = serde_json::from_str::<CodexAuth>(&content).ok()?;
    let tokens = auth.tokens?;
    let token = tokens
        .access_token
        .as_ref()
        .and_then(parse_codex_access_token)?;
    let source = "Codex CLI (~/.codex/auth.json)".to_string();

    Some(DetectedToken {
        token,
        source: source.clone(),
        subscription_type: None,
        environment: "wsl".to_string(),
        display_source: format!("WSL {}", source),
    })
}

#[cfg(windows)]
fn run_wsl_file_read(path: &str) -> Option<String> {
    let script = format!("test -f {path} && cat {path}");
    let output = Command::new("wsl.exe")
        .args(["-e", "sh", "-lc", &script])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let content = String::from_utf8(output.stdout).ok()?;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
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

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedTokens {
    pub anthropic: Vec<DetectedToken>,
    pub openai: Vec<DetectedToken>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedToken {
    pub token: String,
    pub source: String,
    pub subscription_type: Option<String>,
    pub environment: String,
    pub display_source: String,
}

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

#[derive(Debug, serde::Deserialize)]
struct CodexAuth {
    tokens: Option<CodexTokens>,
}

#[derive(Debug, serde::Deserialize)]
struct CodexTokens {
    access_token: Option<Value>,
}

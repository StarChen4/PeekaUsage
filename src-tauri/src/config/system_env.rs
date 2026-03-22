use std::collections::HashMap;
#[cfg(not(target_os = "windows"))]
use std::fs;
#[cfg(not(target_os = "windows"))]
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::config::app_config::{AppConfig, ProviderEntry};
use crate::config::encryption::KeyStore;
use crate::providers::types::ProviderId;

#[cfg(not(target_os = "windows"))]
const MANAGED_ENV_DIR: &str = ".peekausage";
#[cfg(not(target_os = "windows"))]
const MANAGED_ENV_FILE: &str = "env.sh";
#[cfg(not(target_os = "windows"))]
const SOURCE_BLOCK_START: &str = "# >>> PeekaUsage env >>>";
#[cfg(not(target_os = "windows"))]
const SOURCE_BLOCK_END: &str = "# <<< PeekaUsage env <<<";

pub async fn sync_active_api_key_envs(
    app_config: &AppConfig,
    key_store: &KeyStore,
) -> Result<(), String> {
    let provider_entries = app_config.get_provider_entries().await;
    let managed_env_names = collect_managed_env_names(&provider_entries);
    let assignments = collect_active_assignments(&provider_entries, key_store).await;

    if managed_env_names.is_empty() {
        return Ok(());
    }

    sync_process_environment(&managed_env_names, &assignments);

    #[cfg(target_os = "windows")]
    {
        sync_windows_user_environment(&managed_env_names, &assignments)?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        sync_unix_shell_environment(&managed_env_names, &assignments)?;
    }

    Ok(())
}

fn collect_managed_env_names(provider_entries: &HashMap<String, ProviderEntry>) -> Vec<String> {
    supported_provider_ids()
        .into_iter()
        .filter_map(|provider_id| {
            let provider = parse_provider_id(provider_id)?;
            let entry = provider_entries.get(provider_id)?;
            if entry.manage_api_key_environment {
                Some(provider.env_key_name().to_string())
            } else {
                None
            }
        })
        .collect()
}

async fn collect_active_assignments(
    provider_entries: &HashMap<String, ProviderEntry>,
    key_store: &KeyStore,
) -> HashMap<String, String> {
    let mut assignments = HashMap::new();

    for provider_id in supported_provider_ids() {
        let Some(provider) = parse_provider_id(provider_id) else {
            continue;
        };

        let Some(entry) = provider_entries.get(provider_id) else {
            continue;
        };

        let Some(active_api_key_id) = entry.active_api_key_id.as_ref() else {
            continue;
        };

        let storage_key = api_key_storage_key(provider_id, active_api_key_id);
        let Some(value) = key_store.get_stored_key(&storage_key).await else {
            continue;
        };

        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }

        assignments.insert(provider.env_key_name().to_string(), trimmed.to_string());
    }

    assignments
}

fn sync_process_environment(managed_env_names: &[String], assignments: &HashMap<String, String>) {
    for env_var_name in managed_env_names {
        if let Some(value) = assignments.get(env_var_name) {
            std::env::set_var(env_var_name, value);
        } else {
            std::env::remove_var(env_var_name);
        }
    }
}

#[cfg(target_os = "windows")]
fn sync_windows_user_environment(
    managed_env_names: &[String],
    assignments: &HashMap<String, String>,
) -> Result<(), String> {
    for env_var_name in managed_env_names {
        let script = if assignments.contains_key(env_var_name) {
            r#"$name = $env:PEEKA_ENV_NAME
$value = $env:PEEKA_ENV_VALUE
[Environment]::SetEnvironmentVariable($name, $value, "User")"#
        } else {
            r#"$name = $env:PEEKA_ENV_NAME
[Environment]::SetEnvironmentVariable($name, $null, "User")"#
        };

        let mut command = Command::new("powershell");
        command
            .arg("-NoProfile")
            .arg("-Command")
            .arg(script)
            .env("PEEKA_ENV_NAME", env_var_name);

        if let Some(value) = assignments.get(env_var_name) {
            command.env("PEEKA_ENV_VALUE", value);
        }

        let output = command
            .output()
            .map_err(|error| format!("写入用户环境变量失败: {}", error))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                "写入用户环境变量失败".to_string()
            } else {
                format!("写入用户环境变量失败: {}", stderr)
            });
        }
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn sync_unix_shell_environment(
    managed_env_names: &[String],
    assignments: &HashMap<String, String>,
) -> Result<(), String> {
    let home_dir = home_dir().ok_or_else(|| "无法确定用户主目录".to_string())?;
    let managed_dir = home_dir.join(MANAGED_ENV_DIR);
    fs::create_dir_all(&managed_dir).map_err(|error| format!("创建环境变量目录失败: {}", error))?;

    let managed_env_path = managed_dir.join(MANAGED_ENV_FILE);
    let env_file_content = build_managed_env_content(managed_env_names, assignments);
    fs::write(&managed_env_path, env_file_content)
        .map_err(|error| format!("写入环境变量脚本失败: {}", error))?;

    for rc_path in shell_rc_paths(&home_dir) {
        ensure_source_block(&rc_path, &managed_env_path)?;
    }

    #[cfg(target_os = "macos")]
    sync_launchctl_environment(managed_env_names, assignments)?;

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn build_managed_env_content(
    managed_env_names: &[String],
    assignments: &HashMap<String, String>,
) -> String {
    let mut env_names = managed_env_names.to_vec();
    env_names.sort_unstable();

    let mut lines = vec![
        "#!/bin/sh".to_string(),
        "# 由 PeekaUsage 自动生成，用于同步当前激活的 API Key。".to_string(),
    ];

    for env_var_name in env_names {
        if let Some(value) = assignments.get(&env_var_name) {
            lines.push(format!(
                "export {}='{}'",
                env_var_name,
                escape_shell_value(value)
            ));
        } else {
            lines.push(format!("unset {}", env_var_name));
        }
    }

    lines.push(String::new());
    lines.join("\n")
}

#[cfg(not(target_os = "windows"))]
fn escape_shell_value(value: &str) -> String {
    value.replace('\'', "'\"'\"'")
}

#[cfg(not(target_os = "windows"))]
fn shell_rc_paths(home_dir: &Path) -> Vec<PathBuf> {
    [
        ".profile",
        ".bashrc",
        ".bash_profile",
        ".zshrc",
        ".zprofile",
    ]
    .into_iter()
    .map(|file_name| home_dir.join(file_name))
    .collect()
}

#[cfg(not(target_os = "windows"))]
fn ensure_source_block(rc_path: &Path, managed_env_path: &Path) -> Result<(), String> {
    let source_block = format!(
        "{}\n[ -f '{}' ] && . '{}'\n{}",
        SOURCE_BLOCK_START,
        managed_env_path.display(),
        managed_env_path.display(),
        SOURCE_BLOCK_END
    );

    let existing = match fs::read_to_string(rc_path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => {
            return Err(format!(
                "更新 Shell 启动文件失败 ({}): {}",
                rc_path.display(),
                error
            ))
        }
    };

    let next = if let Some(start) = existing.find(SOURCE_BLOCK_START) {
        if let Some(end_relative) = existing[start..].find(SOURCE_BLOCK_END) {
            let end = start + end_relative + SOURCE_BLOCK_END.len();
            format!("{}{}{}", &existing[..start], source_block, &existing[end..])
        } else {
            format!("{}\n{}", existing.trim_end(), source_block)
        }
    } else if existing.trim().is_empty() {
        format!("{}\n", source_block)
    } else {
        format!("{}\n\n{}\n", existing.trim_end(), source_block)
    };

    fs::write(rc_path, next)
        .map_err(|error| format!("写入 Shell 启动文件失败 ({}): {}", rc_path.display(), error))
}

#[cfg(target_os = "macos")]
fn sync_launchctl_environment(
    managed_env_names: &[String],
    assignments: &HashMap<String, String>,
) -> Result<(), String> {
    for env_var_name in managed_env_names {
        let mut command = Command::new("launchctl");

        if let Some(value) = assignments.get(env_var_name) {
            command.arg("setenv").arg(env_var_name).arg(value);
        } else {
            command.arg("unsetenv").arg(env_var_name);
        }

        let output = command
            .output()
            .map_err(|error| format!("更新 launchctl 环境变量失败: {}", error))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                "更新 launchctl 环境变量失败".to_string()
            } else {
                format!("更新 launchctl 环境变量失败: {}", stderr)
            });
        }
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
}

fn supported_provider_ids() -> [&'static str; 3] {
    ["openai", "anthropic", "openrouter"]
}

fn parse_provider_id(provider_id: &str) -> Option<ProviderId> {
    match provider_id {
        "openai" => Some(ProviderId::OpenAI),
        "anthropic" => Some(ProviderId::Anthropic),
        "openrouter" => Some(ProviderId::OpenRouter),
        _ => None,
    }
}

fn api_key_storage_key(provider_id: &str, key_id: &str) -> String {
    format!("{}::api_key::{}", provider_id, key_id)
}

use tauri::State;

use crate::config::app_config::{AppConfig, AppSettings};

/// 获取应用设置
#[tauri::command]
pub async fn get_settings(app_config: State<'_, AppConfig>) -> Result<AppSettings, String> {
    Ok(app_config.get_settings().await)
}

/// 保存应用设置
#[tauri::command]
pub async fn save_settings(
    settings: AppSettings,
    app_config: State<'_, AppConfig>,
) -> Result<(), String> {
    app_config.save_settings(settings).await
}

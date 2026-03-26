use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UpdateState {
    Idle,
    Checking,
    UpToDate,
    Available,
    Downloading,
    Installing,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub current_version: String,
    pub state: UpdateState,
    pub available_version: Option<String>,
    pub release_url: Option<String>,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
    pub error_message: Option<String>,
    pub download_progress: Option<f64>,
}

fn normalize_updater_error(message: &str) -> String {
    if message.contains("valid release JSON") || message.contains("latest.json") {
        return "远端未提供有效的更新元数据（latest.json）。当前 GitHub Release 可能缺少 Tauri updater 产物，请先检查 release 流程是否已上传 latest.json 和签名文件。".to_string();
    }

    message.to_string()
}

#[tauri::command]
pub async fn check_app_update(app: AppHandle) -> Result<UpdateStatus, String> {
    let current_version = app.package_info().version.to_string();

    let updater = app.updater().map_err(|e| e.to_string())?;

    match updater.check().await {
        Ok(Some(update)) => {
            let available_version = update.version.clone();
            let notes = update.body.clone();
            let pub_date = update.date.map(|d| d.to_string());
            Ok(UpdateStatus {
                current_version,
                state: UpdateState::Available,
                available_version: Some(available_version.clone()),
                release_url: Some(format!(
                    "https://github.com/StarChen4/PeekaUsage/releases/tag/v{}",
                    available_version
                )),
                notes,
                pub_date,
                error_message: None,
                download_progress: None,
            })
        }
        Ok(None) => Ok(UpdateStatus {
            current_version,
            state: UpdateState::UpToDate,
            available_version: None,
            release_url: None,
            notes: None,
            pub_date: None,
            error_message: None,
            download_progress: None,
        }),
        Err(e) => Ok(UpdateStatus {
            current_version,
            state: UpdateState::Error,
            available_version: None,
            release_url: None,
            notes: None,
            pub_date: None,
            error_message: Some(normalize_updater_error(&e.to_string())),
            download_progress: None,
        }),
    }
}

#[tauri::command]
pub async fn install_app_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;

    if let Some(update) = updater
        .check()
        .await
        .map_err(|e| normalize_updater_error(&e.to_string()))?
    {
        update
            .download_and_install(|_chunk, _total| {}, || {})
            .await
            .map_err(|e| normalize_updater_error(&e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_current_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

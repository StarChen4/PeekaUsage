use tauri::State;

use crate::config::app_config::AppConfig;
use crate::stats::{StatsRange, UsageStatsSnapshot, UsageStatsStore};

#[tauri::command]
pub async fn get_usage_stats_snapshot(
    range: StatsRange,
    app_config: State<'_, AppConfig>,
    usage_stats_store: State<'_, UsageStatsStore>,
) -> Result<UsageStatsSnapshot, String> {
    let settings = app_config.get_settings().await;
    let enabled_provider_ids = app_config.get_enabled_providers().await;
    Ok(usage_stats_store
        .get_snapshot(range, &settings, &enabled_provider_ids)
        .await)
}

mod commands;
mod config;
mod polling;
mod providers;
mod stats;
mod tray;

use config::app_config::AppConfig;
use config::encryption::KeyStore;
use config::migration::migrate_legacy_app_data;
use providers::ProviderManager;
use stats::UsageStatsStore;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // 获取应用数据目录
            let app_data_dir = app.path().app_data_dir().expect("无法获取应用数据目录");

            // 品牌改名后保留旧数据，避免 identifier 变化导致用户配置和凭据丢失。
            migrate_legacy_app_data(&app_data_dir).map_err(std::io::Error::other)?;

            // 初始化状态
            let app_config = AppConfig::new(app_data_dir.clone());
            let key_store = KeyStore::new(app_data_dir.clone());
            let provider_manager = ProviderManager::new();
            let usage_stats_store = UsageStatsStore::new(app_data_dir);
            let initial_settings = tauri::async_runtime::block_on(app_config.get_settings());

            app.manage(app_config);
            app.manage(key_store);
            app.manage(provider_manager);
            app.manage(usage_stats_store);

            // 初始化系统托盘
            let handle = app.handle().clone();
            tray::setup_tray(&handle)?;

            // 窗口关闭事件：隐藏到托盘而非退出
            let window = app.get_webview_window("main").unwrap();
            #[cfg(windows)]
            if initial_settings.hide_taskbar_icon {
                let _ = window.set_skip_taskbar(true);
            }
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Some(w) = handle.get_webview_window("main") {
                        let _ = w.hide();
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::provider_commands::fetch_all_usage,
            commands::provider_commands::fetch_provider_usage,
            commands::provider_commands::get_provider_configs,
            commands::provider_commands::get_supported_providers,
            commands::provider_commands::save_provider_config,
            commands::provider_commands::remove_provider_config,
            commands::provider_commands::save_provider_order,
            commands::provider_commands::validate_api_key,
            commands::provider_commands::activate_provider_api_key,
            commands::settings_commands::get_settings,
            commands::settings_commands::save_settings,
            commands::stats_commands::get_usage_stats_snapshot,
            commands::taskbar_commands::set_window_skip_taskbar,
            commands::window_commands::set_window_opacity,
            commands::window_commands::detect_oauth_tokens,
            commands::update_commands::check_app_update,
            commands::update_commands::install_app_update,
            commands::update_commands::get_current_version,
        ])
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}

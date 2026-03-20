mod commands;
mod config;
mod providers;
mod tray;
mod polling;

use config::app_config::AppConfig;
use config::encryption::KeyStore;
use providers::ProviderManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // 获取应用数据目录
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("无法获取应用数据目录");

            // 初始化状态
            let app_config = AppConfig::new(app_data_dir.clone());
            let key_store = KeyStore::new(app_data_dir);
            let provider_manager = ProviderManager::new();

            app.manage(app_config);
            app.manage(key_store);
            app.manage(provider_manager);

            // 初始化系统托盘
            let handle = app.handle().clone();
            tray::setup_tray(&handle)?;

            // 窗口关闭事件：隐藏到托盘而非退出
            let window = app.get_webview_window("main").unwrap();
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
            commands::settings_commands::get_settings,
            commands::settings_commands::save_settings,
            commands::window_commands::set_window_opacity,
            commands::window_commands::detect_oauth_tokens,
        ])
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}

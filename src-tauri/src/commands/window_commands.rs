use tauri::{AppHandle, Manager};

/// 设置窗口透明度
///
/// Tauri v2 没有直接的 set_opacity API，
/// 通过 WebviewWindow 的 set_shadow 和透明窗口机制，
/// 由前端 CSS 控制视觉透明度。
#[tauri::command]
pub async fn set_window_opacity(opacity: f64, app: AppHandle) -> Result<(), String> {
    // opacity 由前端 CSS 控制（通过修改 #app 的 background alpha）
    // 这里预留后端接口，方便后续用 Win32 API 实现真实窗口透明度
    let _clamped = opacity.max(0.1).min(1.0);

    // 确认窗口存在
    let _window = app
        .get_webview_window("main")
        .ok_or("找不到主窗口")?;

    Ok(())
}

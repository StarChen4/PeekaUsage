use tauri::{AppHandle, Manager};

/// 璁剧疆鏄惁闅愯棌 Windows 浠诲姟鏍忓浘鏍?
#[tauri::command]
pub async fn set_window_skip_taskbar(skip: bool, app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("鎵句笉鍒颁富绐楀彛")?;

    #[cfg(windows)]
    {
        window
            .set_skip_taskbar(skip)
            .map_err(|error| format!("璁剧疆浠诲姟鏍忓浘鏍囩姸鎬佸け璐? {}", error))?;
    }

    #[cfg(not(windows))]
    {
        let _ = skip;
    }

    Ok(())
}

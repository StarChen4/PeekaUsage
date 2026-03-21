use std::path::Path;

const LEGACY_IDENTIFIER: &str = "com.ai-usage-peek.desktop";
const MIGRATED_FILES: [&str; 2] = ["config.json", "keys.dat"];

/// 首次切换应用标识后，迁移旧目录里的配置和密钥文件。
/// 只在目标文件不存在时复制，避免覆盖用户已经在新标识下产生的数据。
pub fn migrate_legacy_app_data(app_data_dir: &Path) -> Result<(), String> {
    let Some(data_root) = app_data_dir.parent() else {
        return Ok(());
    };

    let legacy_app_data_dir = data_root.join(LEGACY_IDENTIFIER);
    if !legacy_app_data_dir.exists() || legacy_app_data_dir == app_data_dir {
        return Ok(());
    }

    let mut copied_files = Vec::new();

    for file_name in MIGRATED_FILES {
        let legacy_path = legacy_app_data_dir.join(file_name);
        let target_path = app_data_dir.join(file_name);

        if !legacy_path.exists() || target_path.exists() {
            continue;
        }

        std::fs::create_dir_all(app_data_dir)
            .map_err(|e| format!("创建新应用数据目录失败: {}", e))?;
        std::fs::copy(&legacy_path, &target_path)
            .map_err(|e| format!("迁移 {} 失败: {}", file_name, e))?;

        copied_files.push(file_name);
    }

    if !copied_files.is_empty() {
        println!(
            "已从旧标识 {} 迁移应用数据文件: {}",
            LEGACY_IDENTIFIER,
            copied_files.join(", ")
        );
    }

    Ok(())
}

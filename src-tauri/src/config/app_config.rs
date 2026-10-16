use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;

/// 应用设置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub polling_interval: u32,
    #[serde(default)]
    pub polling_mode: PollingMode,
    #[serde(default)]
    pub polling_unit: PollingUnit,
    #[serde(default)]
    pub provider_polling_overrides_enabled: bool,
    #[serde(default)]
    pub provider_polling_overrides: HashMap<String, PollingSettings>,
    #[serde(default)]
    pub compact_color_markers_enabled: bool,
    #[serde(default)]
    pub refresh_on_settings_close: bool,
    #[serde(default)]
    pub auto_expand_window_to_fit_content: bool,
    #[serde(default = "default_edge_dock_collapse_enabled")]
    pub edge_dock_collapse_enabled: bool,
    #[serde(default)]
    pub hide_taskbar_icon: bool,
    #[serde(default)]
    pub hide_taskbar_icon_hint_shown: bool,
    #[serde(default)]
    pub language: AppLanguage,
    #[serde(default)]
    pub widget_display_mode: WidgetDisplayMode,
    pub always_on_top: bool,
    pub launch_at_startup: bool,
    #[serde(default = "default_update_auto_check_enabled")]
    pub update_auto_check_enabled: bool,
    #[serde(default = "default_update_check_on_launch")]
    pub update_check_on_launch: bool,
    #[serde(default = "default_update_check_interval_hours")]
    pub update_check_interval_hours: u32,
    pub window_opacity: f64,
    #[serde(default)]
    pub theme: ThemeMode,
    pub window_position: Option<WindowPosition>,
    pub window_size: Option<WindowSize>,
    #[serde(default = "default_provider_card_expanded")]
    pub provider_card_expanded: HashMap<String, bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum PollingMode {
    #[default]
    Auto,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum PollingUnit {
    Seconds,
    #[default]
    Minutes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollingSettings {
    pub polling_interval: u32,
    #[serde(default)]
    pub polling_mode: PollingMode,
    #[serde(default)]
    pub polling_unit: PollingUnit,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum ThemeMode {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub enum AppLanguage {
    #[default]
    #[serde(rename = "zh-Hans")]
    ZhHans,
    #[serde(rename = "zh-Hant")]
    ZhHant,
    #[serde(rename = "en")]
    En,
}

impl AppLanguage {
    /// 仅用于首次创建配置；旧配置仍沿用简体中文缺省值。
    fn from_system_locale(locale: Option<&str>) -> Self {
        let locale = locale.unwrap_or_default().trim().to_ascii_lowercase();
        let locale = locale.split(['.', '@']).next().unwrap_or_default();
        let mut parts = locale.split(['-', '_']);
        if parts.next() != Some("zh") {
            return Self::En;
        }

        let subtags: Vec<_> = parts.collect();
        if subtags.contains(&"hans") {
            Self::ZhHans
        } else if subtags.contains(&"hant")
            || subtags
                .iter()
                .any(|part| matches!(*part, "tw" | "hk" | "mo"))
        {
            Self::ZhHant
        } else {
            Self::ZhHans
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum WidgetDisplayMode {
    #[default]
    Detailed,
    Compact,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowSize {
    pub width: f64,
    pub height: f64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            polling_interval: 5,
            polling_mode: PollingMode::default(),
            polling_unit: PollingUnit::default(),
            provider_polling_overrides_enabled: false,
            provider_polling_overrides: HashMap::new(),
            compact_color_markers_enabled: false,
            refresh_on_settings_close: false,
            auto_expand_window_to_fit_content: false,
            edge_dock_collapse_enabled: default_edge_dock_collapse_enabled(),
            hide_taskbar_icon: false,
            hide_taskbar_icon_hint_shown: false,
            language: AppLanguage::default(),
            widget_display_mode: WidgetDisplayMode::default(),
            always_on_top: true,
            launch_at_startup: false,
            window_opacity: 100.0,
            theme: ThemeMode::default(),
            window_position: None,
            window_size: None,
            provider_card_expanded: default_provider_card_expanded(),
            update_auto_check_enabled: default_update_auto_check_enabled(),
            update_check_on_launch: default_update_check_on_launch(),
            update_check_interval_hours: default_update_check_interval_hours(),
        }
    }
}

fn default_edge_dock_collapse_enabled() -> bool {
    true
}

impl AppSettings {
    pub fn normalized(mut self) -> Self {
        self.polling_interval = self.polling_interval.clamp(1, 999);
        self.provider_polling_overrides = self
            .provider_polling_overrides
            .into_iter()
            .filter_map(|(provider_id, settings)| {
                if is_supported_provider_id(&provider_id) {
                    Some((provider_id, settings.normalized()))
                } else {
                    None
                }
            })
            .collect();
        #[cfg(not(windows))]
        {
            self.hide_taskbar_icon = false;
        }
        self.window_opacity = self.window_opacity.clamp(10.0, 100.0);
        self
    }
}

impl PollingSettings {
    pub fn normalized(mut self) -> Self {
        self.polling_interval = self.polling_interval.clamp(1, 999);
        self
    }
}

fn default_update_auto_check_enabled() -> bool {
    true
}

fn default_update_check_on_launch() -> bool {
    true
}

fn default_update_check_interval_hours() -> u32 {
    2
}

fn default_provider_card_expanded() -> HashMap<String, bool> {
    HashMap::from([
        ("openai".to_string(), true),
        ("anthropic".to_string(), true),
        ("openrouter".to_string(), true),
        ("newapi".to_string(), true),
    ])
}

fn is_supported_provider_id(provider_id: &str) -> bool {
    matches!(
        provider_id,
        "openai" | "anthropic" | "openrouter" | "newapi"
    )
}

/// 供应商下单个 API Key 的元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderApiKeyEntry {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSubscriptionEntry {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub source: Option<String>,
}

/// 供应商持久化配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderEntry {
    pub provider_id: String,
    pub enabled: bool,
    #[serde(default)]
    pub api_keys: Vec<ProviderApiKeyEntry>,
    #[serde(default)]
    pub subscriptions: Vec<ProviderSubscriptionEntry>,
    #[serde(default)]
    pub active_api_key_id: Option<String>,
    #[serde(default)]
    pub manage_api_key_environment: bool,
}

/// 配置文件内容
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigFile {
    pub settings: AppSettings,
    pub providers: HashMap<String, ProviderEntry>,
    #[serde(default)]
    pub provider_order: Vec<String>,
}

impl Default for ConfigFile {
    fn default() -> Self {
        Self {
            settings: AppSettings::default(),
            providers: HashMap::new(),
            provider_order: Vec::new(),
        }
    }
}

/// 应用配置管理
pub struct AppConfig {
    config: Arc<RwLock<ConfigFile>>,
    config_path: PathBuf,
}

impl AppConfig {
    pub fn new(app_data_dir: PathBuf) -> Result<Self, String> {
        Self::load(app_data_dir, || {
            AppLanguage::from_system_locale(sys_locale::get_locale().as_deref())
        })
    }

    fn load(
        app_data_dir: PathBuf,
        detect_language: impl FnOnce() -> AppLanguage,
    ) -> Result<Self, String> {
        let config_path = app_data_dir.join("config.json");
        let config = if config_path.exists() {
            match std::fs::read_to_string(&config_path) {
                Ok(content) => {
                    let mut config: ConfigFile = serde_json::from_str(&content).unwrap_or_default();
                    config.settings = config.settings.normalized();
                    config
                }
                Err(_) => ConfigFile::default(),
            }
        } else {
            let mut config = ConfigFile::default();
            config.settings.language = detect_language();
            // 首次启动即持久化，之后系统语言变化也不会覆盖用户的选择。
            write_config(&config_path, &config)?;
            config
        };

        Ok(Self {
            config: Arc::new(RwLock::new(config)),
            config_path,
        })
    }

    /// 保存配置到文件
    async fn save(&self) -> Result<(), String> {
        let config = self.config.read().await;
        write_config(&self.config_path, &config)
    }

    pub async fn get_settings(&self) -> AppSettings {
        self.config.read().await.settings.clone()
    }

    pub async fn save_settings(&self, settings: AppSettings) -> Result<(), String> {
        {
            let mut config = self.config.write().await;
            config.settings = settings.normalized();
        }
        self.save().await
    }

    pub async fn get_provider_entry(&self, provider_id: &str) -> Option<ProviderEntry> {
        let config = self.config.read().await;
        config.providers.get(provider_id).cloned()
    }

    pub async fn get_provider_entries(&self) -> HashMap<String, ProviderEntry> {
        self.config.read().await.providers.clone()
    }

    pub async fn save_provider_entry(
        &self,
        provider_id: &str,
        entry: ProviderEntry,
    ) -> Result<(), String> {
        {
            let mut config = self.config.write().await;
            config.providers.insert(provider_id.to_string(), entry);
        }
        self.save().await
    }

    pub async fn get_configured_providers(&self) -> Vec<String> {
        let config = self.config.read().await;
        let mut configured: Vec<String> = config
            .providers
            .iter()
            .filter(|(_, entry)| entry.enabled)
            .map(|(provider_id, _)| provider_id.clone())
            .collect();

        configured
            .sort_by(|left, right| compare_provider_order(&config.provider_order, left, right));
        configured
    }

    pub async fn save_provider_order(&self, order: Vec<String>) -> Result<(), String> {
        {
            let mut config = self.config.write().await;
            config.provider_order = order;
        }
        self.save().await
    }

    pub async fn get_enabled_providers(&self) -> Vec<String> {
        self.get_configured_providers().await
    }
}

fn write_config(config_path: &Path, config: &ConfigFile) -> Result<(), String> {
    let content =
        serde_json::to_string_pretty(config).map_err(|e| format!("序列化配置失败: {}", e))?;
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }
    std::fs::write(config_path, content).map_err(|e| format!("写入配置文件失败: {}", e))
}

fn compare_provider_order(order: &[String], left: &str, right: &str) -> std::cmp::Ordering {
    let left_index = order.iter().position(|id| id == left).unwrap_or(usize::MAX);
    let right_index = order
        .iter()
        .position(|id| id == right)
        .unwrap_or(usize::MAX);

    left_index
        .cmp(&right_index)
        .then_with(|| provider_rank(left).cmp(&provider_rank(right)))
        .then_with(|| left.cmp(right))
}

fn provider_rank(provider_id: &str) -> usize {
    match provider_id {
        "openai" => 0,
        "anthropic" => 1,
        "openrouter" => 2,
        "newapi" => 3,
        _ => usize::MAX,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            Self(std::env::temp_dir().join(format!("peekausage-language-{}", uuid::Uuid::new_v4())))
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn system_locale_selects_supported_language() {
        for (locale, expected) in [
            (Some("zh_CN.UTF-8"), AppLanguage::ZhHans),
            (Some("zh-SG"), AppLanguage::ZhHans),
            (Some("zh"), AppLanguage::ZhHans),
            (Some("zh-Hans-HK"), AppLanguage::ZhHans),
            (Some("zh_TW.UTF-8"), AppLanguage::ZhHant),
            (Some("ZH-hk"), AppLanguage::ZhHant),
            (Some("zh-MO"), AppLanguage::ZhHant),
            (Some("zh-Hant-CN"), AppLanguage::ZhHant),
            (Some("en-US"), AppLanguage::En),
            (Some("ja_JP.UTF-8"), AppLanguage::En),
            (Some("de_DE@euro"), AppLanguage::En),
            (Some("C.UTF-8"), AppLanguage::En),
            (Some(""), AppLanguage::En),
            (None, AppLanguage::En),
        ] {
            assert_eq!(
                AppLanguage::from_system_locale(locale),
                expected,
                "区域设置：{locale:?}"
            );
        }
    }

    #[tokio::test]
    async fn first_launch_persists_language_without_later_overrides() {
        for language in [AppLanguage::ZhHans, AppLanguage::ZhHant, AppLanguage::En] {
            let directory = TestDirectory::new();
            let config = AppConfig::load(directory.0.clone(), || language.clone()).unwrap();
            assert_eq!(config.get_settings().await.language, language);
            let content = std::fs::read_to_string(directory.0.join("config.json")).unwrap();
            let saved: ConfigFile = serde_json::from_str(&content).unwrap();
            assert_eq!(saved.settings.language, language);

            let reloaded = AppConfig::load(directory.0.clone(), || {
                panic!("已有配置时不应再次检测系统语言")
            })
            .unwrap();
            assert_eq!(reloaded.get_settings().await.language, language);
            assert_eq!(
                std::fs::read_to_string(directory.0.join("config.json")).unwrap(),
                content
            );
        }
    }

    #[tokio::test]
    async fn legacy_configuration_keeps_chinese_and_other_settings() {
        let directory = TestDirectory::new();
        std::fs::create_dir_all(&directory.0).unwrap();
        let mut config = ConfigFile::default();
        config.settings.polling_interval = 17;
        config.provider_order = vec!["anthropic".to_string(), "openai".to_string()];
        let mut json = serde_json::to_value(config).unwrap();
        json["settings"].as_object_mut().unwrap().remove("language");
        let content = serde_json::to_string(&json).unwrap();
        std::fs::write(directory.0.join("config.json"), &content).unwrap();

        let loaded = AppConfig::load(directory.0.clone(), || {
            panic!("旧配置缺少语言字段时也不应检测系统语言")
        })
        .unwrap();
        let settings = loaded.get_settings().await;
        assert_eq!(settings.language, AppLanguage::ZhHans);
        assert_eq!(settings.polling_interval, 17);
        assert_eq!(
            loaded.config.read().await.provider_order,
            ["anthropic", "openai"]
        );
        assert_eq!(
            std::fs::read_to_string(directory.0.join("config.json")).unwrap(),
            content
        );
    }

    #[test]
    fn first_launch_reports_persistence_failure() {
        let directory = TestDirectory::new();
        std::fs::write(&directory.0, "阻止把文件当作配置目录").unwrap();
        assert!(AppConfig::load(directory.0.clone(), || AppLanguage::En).is_err());
        std::fs::remove_file(&directory.0).unwrap();
    }

    #[tokio::test]
    async fn new_api_sites_and_order_survive_configuration_reload() {
        let directory = TestDirectory::new();
        let config = AppConfig::load(directory.0.clone(), || AppLanguage::ZhHans).unwrap();
        let entry: ProviderEntry = serde_json::from_value(serde_json::json!({
            "providerId": "newapi", "enabled": true,
            "apiKeys": [
                {"id": "a", "name": "站点甲", "baseUrl": "https://a.example"},
                {"id": "b", "name": "站点乙", "baseUrl": "http://localhost:3000/proxy"}
            ]
        }))
        .unwrap();
        config.save_provider_entry("newapi", entry).await.unwrap();
        config
            .save_provider_order(vec!["newapi".into(), "openai".into()])
            .await
            .unwrap();
        let mut settings = config.get_settings().await;
        settings.provider_polling_overrides_enabled = true;
        settings.provider_polling_overrides.insert(
            "newapi".into(),
            PollingSettings {
                polling_interval: 9,
                polling_mode: PollingMode::Manual,
                polling_unit: PollingUnit::Seconds,
            },
        );
        config.save_settings(settings).await.unwrap();
        let reloaded =
            AppConfig::load(directory.0.clone(), || panic!("已有配置不应检测语言")).unwrap();
        let saved = reloaded.get_provider_entry("newapi").await.unwrap();
        assert_eq!(
            saved.api_keys[0].base_url.as_deref(),
            Some("https://a.example")
        );
        assert_eq!(
            saved.api_keys[1].base_url.as_deref(),
            Some("http://localhost:3000/proxy")
        );
        assert_eq!(reloaded.get_enabled_providers().await, ["newapi"]);
        let settings = reloaded.get_settings().await;
        assert!(settings.provider_card_expanded["newapi"]);
        assert!(settings.provider_polling_overrides_enabled);
        assert!(matches!(
            settings.provider_polling_overrides["newapi"].polling_mode,
            PollingMode::Manual
        ));
        assert_eq!(
            settings.provider_polling_overrides["newapi"].polling_interval,
            9
        );
        assert_eq!(
            reloaded.config.read().await.provider_order,
            ["newapi", "openai"]
        );

        let legacy: ProviderApiKeyEntry =
            serde_json::from_str(r#"{"id":"old","name":"旧密钥"}"#).unwrap();
        assert!(legacy.base_url.is_none());
    }
}

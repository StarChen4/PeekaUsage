use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
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
    pub refresh_on_settings_close: bool,
    #[serde(default)]
    pub auto_expand_window_to_fit_content: bool,
    #[serde(default)]
    pub language: AppLanguage,
    #[serde(default)]
    pub widget_display_mode: WidgetDisplayMode,
    pub always_on_top: bool,
    pub launch_at_startup: bool,
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
            refresh_on_settings_close: false,
            auto_expand_window_to_fit_content: false,
            language: AppLanguage::default(),
            widget_display_mode: WidgetDisplayMode::default(),
            always_on_top: true,
            launch_at_startup: false,
            window_opacity: 100.0,
            theme: ThemeMode::default(),
            window_position: None,
            window_size: None,
            provider_card_expanded: default_provider_card_expanded(),
        }
    }
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

fn default_provider_card_expanded() -> HashMap<String, bool> {
    HashMap::from([
        ("openai".to_string(), true),
        ("anthropic".to_string(), true),
        ("openrouter".to_string(), true),
    ])
}

fn is_supported_provider_id(provider_id: &str) -> bool {
    matches!(provider_id, "openai" | "anthropic" | "openrouter")
}

/// 供应商下单个 API Key 的元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderApiKeyEntry {
    pub id: String,
    pub name: String,
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
    pub fn new(app_data_dir: PathBuf) -> Self {
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
            ConfigFile::default()
        };

        Self {
            config: Arc::new(RwLock::new(config)),
            config_path,
        }
    }

    /// 保存配置到文件
    async fn save(&self) -> Result<(), String> {
        let config = self.config.read().await;
        let content =
            serde_json::to_string_pretty(&*config).map_err(|e| format!("序列化配置失败: {}", e))?;

        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
        }

        std::fs::write(&self.config_path, content)
            .map_err(|e| format!("写入配置文件失败: {}", e))?;

        Ok(())
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
        _ => usize::MAX,
    }
}

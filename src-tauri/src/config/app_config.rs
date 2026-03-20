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
    pub always_on_top: bool,
    pub launch_at_startup: bool,
    pub window_opacity: f64,
    pub window_position: Option<WindowPosition>,
    pub window_size: Option<WindowSize>,
    #[serde(default = "default_provider_card_expanded")]
    pub provider_card_expanded: HashMap<String, bool>,
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
            always_on_top: true,
            launch_at_startup: false,
            window_opacity: 100.0,
            window_position: None,
            window_size: None,
            provider_card_expanded: default_provider_card_expanded(),
        }
    }
}

fn default_provider_card_expanded() -> HashMap<String, bool> {
    HashMap::from([
        ("openai".to_string(), true),
        ("anthropic".to_string(), true),
        ("openrouter".to_string(), true),
    ])
}

/// 供应商持久化配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderEntry {
    pub provider_id: String,
    pub enabled: bool,
    // api_key 存储在加密模块中，这里不存明文
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
                Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
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
        let content = serde_json::to_string_pretty(&*config)
            .map_err(|e| format!("序列化配置失败: {}", e))?;

        // 确保目录存在
        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("创建配置目录失败: {}", e))?;
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
            config.settings = settings;
        }
        self.save().await
    }

    pub async fn get_provider_entry(&self, provider_id: &str) -> Option<ProviderEntry> {
        let config = self.config.read().await;
        config.providers.get(provider_id).cloned()
    }

    pub async fn save_provider_entry(&self, provider_id: &str, entry: ProviderEntry) -> Result<(), String> {
        {
            let mut config = self.config.write().await;
            config.providers.insert(provider_id.to_string(), entry);
        }
        self.save().await
    }

    pub async fn save_provider_order(&self, order: Vec<String>) -> Result<(), String> {
        {
            let mut config = self.config.write().await;
            config.provider_order = order;
        }
        self.save().await
    }

    pub async fn get_enabled_providers(&self) -> Vec<String> {
        let config = self.config.read().await;
        let mut enabled: Vec<String> = config
            .providers
            .iter()
            .filter(|(_, e)| e.enabled)
            .map(|(k, _)| k.clone())
            .collect();

        enabled.sort_by(|left, right| {
            let left_index = config
                .provider_order
                .iter()
                .position(|id| id == left)
                .unwrap_or(usize::MAX);
            let right_index = config
                .provider_order
                .iter()
                .position(|id| id == right)
                .unwrap_or(usize::MAX);

            left_index
                .cmp(&right_index)
                .then_with(|| provider_rank(left).cmp(&provider_rank(right)))
                .then_with(|| left.cmp(right))
        });

        enabled
    }
}

fn provider_rank(provider_id: &str) -> usize {
    match provider_id {
        "openai" => 0,
        "anthropic" => 1,
        "openrouter" => 2,
        _ => usize::MAX,
    }
}

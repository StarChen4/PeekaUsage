use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

/// 简易加密存储（基于文件的 Key 管理）
///
/// 实际生产环境应使用 tauri-plugin-stronghold 或系统 keyring。
/// 这里先用简单的 base64 编码 + 文件存储实现 MVP，后续可升级。
pub struct KeyStore {
    keys: Arc<RwLock<HashMap<String, String>>>,
    store_path: PathBuf,
}

impl KeyStore {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let store_path = app_data_dir.join("keys.dat");
        let keys = if store_path.exists() {
            match std::fs::read_to_string(&store_path) {
                Ok(content) => Self::decode_keys(&content),
                Err(_) => HashMap::new(),
            }
        } else {
            HashMap::new()
        };

        Self {
            keys: Arc::new(RwLock::new(keys)),
            store_path,
        }
    }

    fn encode_keys(keys: &HashMap<String, String>) -> String {
        let json = serde_json::to_string(keys).unwrap_or_default();
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(json.as_bytes())
    }

    fn decode_keys(encoded: &str) -> HashMap<String, String> {
        use base64::Engine;
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(encoded.trim().as_bytes())
            .unwrap_or_default();
        let json_str = String::from_utf8(decoded).unwrap_or_default();
        serde_json::from_str(&json_str).unwrap_or_default()
    }

    async fn save(&self) -> Result<(), String> {
        let keys = self.keys.read().await;
        let encoded = Self::encode_keys(&*keys);

        if let Some(parent) = self.store_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建密钥目录失败: {}", e))?;
        }

        std::fs::write(&self.store_path, encoded).map_err(|e| format!("保存密钥失败: {}", e))?;

        Ok(())
    }

    /// 获取存储中的原始 Key，不读取环境变量
    pub async fn get_stored_key(&self, storage_key: &str) -> Option<String> {
        let keys = self.keys.read().await;
        keys.get(storage_key).cloned()
    }

    /// 获取 Key，优先读取环境变量，再回退到存储
    pub async fn get_key(&self, storage_key: &str, env_var_name: &str) -> Option<String> {
        if let Ok(key) = std::env::var(env_var_name) {
            if !key.is_empty() {
                return Some(key);
            }
        }

        self.get_stored_key(storage_key).await
    }

    /// 存储 Key
    pub async fn set_key(&self, storage_key: &str, key_value: &str) -> Result<(), String> {
        {
            let mut keys = self.keys.write().await;
            if key_value.is_empty() {
                keys.remove(storage_key);
            } else {
                keys.insert(storage_key.to_string(), key_value.to_string());
            }
        }
        self.save().await
    }

    /// 获取掩码后的 Key（用于前端展示）
    pub async fn get_masked_key(&self, storage_key: &str, env_var_name: Option<&str>) -> String {
        let value = if let Some(env_var_name) = env_var_name {
            self.get_key(storage_key, env_var_name).await
        } else {
            self.get_stored_key(storage_key).await
        };

        match value {
            Some(key) if key.len() > 8 => {
                let prefix = &key[..4];
                let suffix = &key[key.len() - 4..];
                format!("{}...{}", prefix, suffix)
            }
            Some(_) => "****".to_string(),
            None => String::new(),
        }
    }
}

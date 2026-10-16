use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// Provider configuration entered by the user (bring-your-own key).
/// Stored as a 0600-permission JSON file in the app config directory.
/// v1 keeps it simple; a OS keyring upgrade can swap this module later.
///
/// Field names are camelCase to match the TS `ProviderSettings` interface:
/// Tauri only converts top-level command argument names, nested struct
/// fields go through serde as-is. `alias` keeps old snake_case files readable.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// "openai" (any OpenAI-compatible endpoint) | "anthropic"
    pub provider: String,
    /// Base URL, e.g. "https://api.openai.com/v1". Empty = provider default.
    #[serde(default, alias = "base_url")]
    pub base_url: String,
    pub model: String,
    #[serde(default, alias = "api_key")]
    pub api_key: String,
    /// UI language: "ru" | "en" (first field of the settings dialog).
    #[serde(default = "default_language")]
    pub language: String,
}

fn default_language() -> String {
    "ru".to_string()
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("failed to resolve the config directory: {e}"))?;
    Ok(dir.join("settings.json"))
}

pub fn load(app: &tauri::AppHandle) -> Result<Option<Settings>, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("failed to read settings: {e}"))?;
    serde_json::from_str(&raw).map(Some).map_err(|e| format!("settings file is corrupted: {e}"))
}

pub fn save(app: &tauri::AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("failed to create the config directory: {e}"))?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&path)
            .map_err(|e| format!("failed to write settings: {e}"))?;
        file.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    }
    #[cfg(not(unix))]
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

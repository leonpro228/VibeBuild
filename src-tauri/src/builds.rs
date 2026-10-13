//! Saved builds: one JSON file per build in `<app_config_dir>/builds/`.
//! The file holds metadata (id, name, savedAt, size) plus the canonical
//! `Build` produced by the frontend validation pipeline. Rust only stores
//! what it is given — semantic validation stays in TS (summary.md §5).

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Canonical build size (mirrors TS `BuildSize`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildSize {
    pub width: u32,
    pub height: u32,
    pub depth: u32,
}

/// A saved build as written to disk / returned by `load_build`.
/// camelCase to match the TS `SavedBuild` interface (see §9d: serde does not
/// convert struct fields, only command argument names).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedBuild {
    pub id: String,
    pub name: String,
    /// Unix epoch milliseconds.
    pub saved_at: u64,
    pub size: BuildSize,
    /// Canonical Build { name, size, layers } as JSON.
    pub build: serde_json::Value,
}

/// Metadata shown in the builds menu (no build payload).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedBuildMeta {
    pub id: String,
    pub name: String,
    pub saved_at: u64,
    pub size: BuildSize,
}

impl SavedBuild {
    fn meta(&self) -> SavedBuildMeta {
        SavedBuildMeta {
            id: self.id.clone(),
            name: self.name.clone(),
            saved_at: self.saved_at,
            size: self.size.clone(),
        }
    }
}

fn builds_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("не удалось определить каталог конфигурации: {e}"))?;
    Ok(dir.join("builds"))
}

fn unix_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Filename-safe id: keeps unicode letters/digits (Cyrillic is fine on every
/// Tauri target), collapses everything else to `-`.
fn slugify(name: &str) -> String {
    let filtered: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    let collapsed = filtered
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let trimmed = collapsed.trim_matches('-');
    let s: String = trimmed.chars().take(64).collect();
    if s.is_empty() { "build".to_string() } else { s }
}

/// Ids travel back to load/delete as command arguments — refuse anything
/// that could escape the builds directory (path traversal).
fn safe_id(id: &str) -> Result<String, String> {
    let ok = !id.is_empty()
        && id.len() <= 80
        && id
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-')
        && !id.starts_with('-');
    if ok {
        Ok(id.to_string())
    } else {
        Err(format!("некорректный идентификатор постройки: {id:?}"))
    }
}

fn unique_id(dir: &Path, base: &str) -> String {
    let mut id = base.to_string();
    let mut n = 2;
    while dir.join(format!("{id}.json")).exists() {
        id = format!("{base}-{n}");
        n += 1;
    }
    id
}

#[tauri::command]
pub fn save_build(app: tauri::AppHandle, build: serde_json::Value) -> Result<SavedBuildMeta, String> {
    let name = build
        .get("name")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Без названия")
        .to_string();
    let size: BuildSize = serde_json::from_value(
        build
            .get("size")
            .cloned()
            .ok_or("в постройке нет size")?,
    )
    .map_err(|e| format!("некорректный size: {e}"))?;
    let layers = build
        .get("layers")
        .and_then(|v| v.as_array())
        .ok_or("в постройке нет layers")?;
    if layers.is_empty() {
        return Err("в постройке нет ни одного слоя".to_string());
    }

    let dir = builds_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("не удалось создать каталог построек: {e}"))?;
    let id = unique_id(&dir, &slugify(&name));
    let saved = SavedBuild {
        id,
        name,
        saved_at: unix_millis(),
        size,
        build,
    };
    let path = dir.join(format!("{}.json", saved.id));
    let json = serde_json::to_string_pretty(&saved).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("не удалось записать постройку: {e}"))?;
    Ok(saved.meta())
}

#[tauri::command]
pub fn list_builds(app: tauri::AppHandle) -> Result<Vec<SavedBuildMeta>, String> {
    let dir = builds_dir(&app)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let entries =
        fs::read_dir(&dir).map_err(|e| format!("не удалось прочитать каталог построек: {e}"))?;
    let mut metas = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(raw) = fs::read_to_string(&path) else { continue };
        // Unreadable/foreign files are skipped, not fatal — the menu must open.
        let Ok(saved) = serde_json::from_str::<SavedBuild>(&raw) else { continue };
        metas.push(saved.meta());
    }
    metas.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
    Ok(metas)
}

#[tauri::command]
pub fn load_build(app: tauri::AppHandle, id: String) -> Result<SavedBuild, String> {
    let id = safe_id(&id)?;
    let path = builds_dir(&app)?.join(format!("{id}.json"));
    let raw =
        fs::read_to_string(&path).map_err(|e| format!("не удалось прочитать постройку: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("постройка повреждена: {e}"))
}

#[tauri::command]
pub fn delete_build(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let id = safe_id(&id)?;
    let path = builds_dir(&app)?.join(format!("{id}.json"));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("не удалось удалить постройку: {e}"))?;
    }
    Ok(())
}

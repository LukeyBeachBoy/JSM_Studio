//! Appearance survives WebView storage loss and is loaded before the UI paints.
use std::{collections::BTreeMap, fs, io::ErrorKind, path::Path, sync::Mutex};
use tauri::{AppHandle, Emitter};
use crate::runtime;

type Preferences = BTreeMap<String, String>;
static LOCK: Mutex<()> = Mutex::new(());

fn valid(key: &str, value: &str) -> bool {
    match key {
        "jsm-theme" => matches!(value, "dark" | "light" | "system"),
        "jsm-accent" => matches!(value, "cyan" | "teal" | "amber" | "violet"),
        "jsm-language" => matches!(value, "en" | "zh-CN"),
        // Console v2: screen distance (V10) and config names beside labels (V12).
        "jsm-density" => matches!(value, "couch" | "desk"),
        "jsm-config-names" => matches!(value, "on" | "off"),
        _ => false,
    }
}

fn read(path: &Path) -> Result<Preferences, String> {
    match fs::read(path) {
        Ok(bytes) => {
            let mut preferences: Preferences = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            preferences.retain(|key, value| valid(key, value));
            Ok(preferences)
        }
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(Preferences::new()),
        Err(error) => Err(error.to_string()),
    }
}

fn write(path: &Path, preferences: &Preferences) -> Result<(), String> {
    runtime::write_file_atomically(path, serde_json::to_vec_pretty(preferences).map_err(|e| e.to_string())?)
}

fn load(path: &Path, legacy: Preferences) -> Result<Preferences, String> {
    let mut preferences = read(path)?;
    let before = preferences.clone();
    for (key, value) in legacy {
        if valid(&key, &value) { preferences.entry(key).or_insert(value); }
    }
    if preferences != before { write(path, &preferences)?; }
    Ok(preferences)
}

#[tauri::command]
pub fn load_appearance_preferences(app: AppHandle, legacy: Preferences) -> Result<Preferences, String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    load(&runtime::runtime_dir(&app)?.join("appearance.json"), legacy)
}

#[tauri::command]
pub fn save_appearance_preference(app: AppHandle, key: String, value: String) -> Result<(), String> {
    if !valid(&key, &value) { return Err("Invalid appearance preference".into()); }
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    let path = runtime::runtime_dir(&app)?.join("appearance.json");
    let mut preferences = read(&path)?;
    preferences.insert(key, value);
    write(&path, &preferences)?;
    let _=app.emit("appearance-preference", ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restores_choices_without_webview_storage_and_ignores_stale_legacy_values() {
        let path = std::env::temp_dir().join(format!("jsm-appearance-{}.json", std::process::id()));
        let choices = Preferences::from([
            ("jsm-theme".into(), "system".into()),
            ("jsm-accent".into(), "violet".into()),
            ("jsm-language".into(), "zh-CN".into()),
        ]);
        write(&path, &choices).unwrap();
        assert_eq!(load(&path, Preferences::new()).unwrap(), choices);
        assert_eq!(load(&path, Preferences::from([("jsm-accent".into(), "cyan".into())])).unwrap(), choices);
        fs::remove_file(&path).unwrap();
        assert_eq!(load(&path, choices.clone()).unwrap(), choices);
        assert_eq!(read(&path).unwrap(), choices);
        fs::remove_file(path).unwrap();
        assert!(!valid("jsm-accent", "unknown"));
        assert!(!valid("arbitrary-setting", "dark"));
    }
}

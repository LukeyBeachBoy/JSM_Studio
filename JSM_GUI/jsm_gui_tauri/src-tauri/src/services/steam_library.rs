//! What Steam knows about the games on this PC (console v2, D23): the games
//! played most recently, their names and install folders, and the art Steam
//! keeps for its library (capsule, header, hero). The Library's covers and the
//! New configuration wizard read it; with no Steam, or a game outside it, the
//! front end draws a flat cover of its own.
//!
//! Sources, all under each Steam install (`steam_layouts::steam_roots`):
//!
//!   userdata/<account>/config/localconfig.vdf
//!       UserLocalConfigStore/Software/Valve/Steam/apps/<appid>/LastPlayed
//!   steamapps/appmanifest_<appid>.acf (in every library folder)
//!       name, installdir, and LastPlayed on newer clients
//!   appcache/librarycache/
//!       <appid>_library_600x900.jpg, <appid>_header.jpg, <appid>_library_hero.jpg
//!       (older clients), or <appid>/[<hash>/]library_600x900.jpg and so on
//!
//! Steam never names a game's executable, so a game picked from "recent" is
//! known by its app id until it runs; a running game is matched back to its
//! app by the library folder its executable sits in.

use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use base64::Engine;
use serde::Serialize;

use crate::services::steam_layouts::{app_name, first_value, library_folders, steam_roots};

/// Art bigger than this is not Steam's library art.
const MAX_ART_BYTES: u64 = 6 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SteamGame {
    pub app_id: String,
    pub name: String,
    /// Unix seconds; 0 when Steam has no record.
    pub last_played: u64,
    pub install_dir: Option<String>,
    pub has_capsule: bool,
    pub has_header: bool,
    pub has_hero: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SteamApp {
    pub app_id: String,
    pub name: String,
    pub install_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningGame {
    pub process_name: String,
    pub pid: u32,
    pub window_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exe_path: Option<String>,
    /// "steam" (a Steam game), "store" (another launcher's game folder) or "app".
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub steam_app_id: Option<String>,
    /// The game's name when a launcher knows it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

// ---- A small VDF reader: quoted strings, bare words and braces.

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum Vdf {
    Text(String),
    Block(Vec<(String, Vdf)>),
}

impl Vdf {
    /// The child named `key`, ignoring case (Steam writes "apps" and "Apps").
    pub(crate) fn get(&self, key: &str) -> Option<&Vdf> {
        match self {
            Vdf::Block(entries) => entries.iter().find(|(name, _)| name.eq_ignore_ascii_case(key)).map(|(_, value)| value),
            Vdf::Text(_) => None,
        }
    }
    pub(crate) fn path(&self, keys: &[&str]) -> Option<&Vdf> {
        keys.iter().try_fold(self, |node, key| node.get(key))
    }
    pub(crate) fn text(&self) -> Option<&str> {
        match self {
            Vdf::Text(value) => Some(value),
            Vdf::Block(_) => None,
        }
    }
    pub(crate) fn entries(&self) -> &[(String, Vdf)] {
        match self {
            Vdf::Block(entries) => entries,
            Vdf::Text(_) => &[],
        }
    }
}

fn tokens(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                let mut value = String::new();
                while let Some(next) = chars.next() {
                    match next {
                        '\\' => {
                            if let Some(escaped) = chars.next() {
                                value.push(match escaped { 'n' => '\n', 't' => '\t', other => other });
                            }
                        }
                        '"' => break,
                        other => value.push(other),
                    }
                }
                out.push(format!("\"{value}"));
            }
            '{' | '}' => out.push(c.to_string()),
            '/' if chars.peek() == Some(&'/') => {
                for next in chars.by_ref() {
                    if next == '\n' {
                        break;
                    }
                }
            }
            c if c.is_whitespace() || c == '\u{feff}' => {}
            c => {
                let mut value = c.to_string();
                while let Some(&next) = chars.peek() {
                    if next.is_whitespace() || next == '{' || next == '}' || next == '"' {
                        break;
                    }
                    value.push(next);
                    chars.next();
                }
                out.push(format!("\"{value}"));
            }
        }
    }
    out
}

pub(crate) fn parse_vdf(text: &str) -> Vdf {
    fn block(tokens: &[String], at: &mut usize) -> Vec<(String, Vdf)> {
        let mut entries = Vec::new();
        while *at < tokens.len() {
            let token = &tokens[*at];
            if token == "}" {
                *at += 1;
                break;
            }
            if token == "{" {
                // A block with no key: skip it whole.
                *at += 1;
                block(tokens, at);
                continue;
            }
            let key = token.trim_start_matches('"').to_string();
            *at += 1;
            match tokens.get(*at).map(String::as_str) {
                Some("{") => {
                    *at += 1;
                    entries.push((key, Vdf::Block(block(tokens, at))));
                }
                Some(value) if value != "}" => {
                    entries.push((key, Vdf::Text(value.trim_start_matches('"').to_string())));
                    *at += 1;
                }
                _ => {}
            }
        }
        entries
    }
    let list = tokens(text);
    let mut at = 0;
    Vdf::Block(block(&list, &mut at))
}

// ---- Recent games.

/// LastPlayed per app id, from every account's localconfig.vdf (the latest
/// wins when two accounts played the same game).
fn last_played_from_local_config(root: &Path) -> HashMap<String, u64> {
    let mut found = HashMap::new();
    let Ok(accounts) = fs::read_dir(root.join("userdata")) else { return found };
    for account in accounts.filter_map(Result::ok) {
        let file = account.path().join("config").join("localconfig.vdf");
        let Ok(bytes) = fs::read(&file) else { continue };
        let tree = parse_vdf(&String::from_utf8_lossy(&bytes));
        let Some(apps) = tree.path(&["UserLocalConfigStore", "Software", "Valve", "Steam", "apps"]) else { continue };
        for (app_id, app) in apps.entries() {
            let Some(played) = app.get("LastPlayed").and_then(Vdf::text).and_then(|value| value.parse::<u64>().ok()) else { continue };
            if played == 0 || !app_id.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            let entry = found.entry(app_id.clone()).or_insert(0);
            *entry = (*entry).max(played);
        }
    }
    found
}

/// Steam's own tools, which are installed like games but are not ones.
fn is_tool(app_id: &str, name: &str) -> bool {
    const TOOL_IDS: [&str; 6] = ["228980", "1070560", "1391110", "1628350", "250820", "1493710"];
    let lower = name.to_ascii_lowercase();
    TOOL_IDS.contains(&app_id)
        || lower.starts_with("proton ")
        || lower.contains("steam linux runtime")
        || lower.contains("steamworks common")
        || lower == "steamvr"
}

/// Installed games, newest played first; games never played are left out.
pub fn recent_games_in(roots: &[PathBuf], limit: usize) -> Vec<SteamGame> {
    let mut games: HashMap<String, SteamGame> = HashMap::new();
    for root in roots {
        let played = last_played_from_local_config(root);
        for library in library_folders(root) {
            let Ok(entries) = fs::read_dir(&library) else { continue };
            for entry in entries.filter_map(Result::ok) {
                let file_name = entry.file_name().to_string_lossy().into_owned();
                let Some(app_id) = file_name.strip_prefix("appmanifest_").and_then(|rest| rest.strip_suffix(".acf")) else { continue };
                let Ok(manifest) = fs::read_to_string(entry.path()) else { continue };
                let name = first_value(&manifest, "name").unwrap_or_else(|| format!("App {app_id}"));
                if is_tool(app_id, &name) {
                    continue;
                }
                let manifest_played = first_value(&manifest, "LastPlayed").and_then(|value| value.parse::<u64>().ok()).unwrap_or(0);
                let last_played = played.get(app_id).copied().unwrap_or(0).max(manifest_played);
                if last_played == 0 {
                    continue;
                }
                let install_dir = first_value(&manifest, "installdir").map(|dir| library.join("common").join(dir).to_string_lossy().into_owned());
                let art = |kind: &str| find_art_in(root, app_id, kind).is_some();
                let game = SteamGame {
                    app_id: app_id.to_string(),
                    name,
                    last_played,
                    install_dir,
                    has_capsule: art("capsule"),
                    has_header: art("header"),
                    has_hero: art("hero"),
                };
                match games.get(app_id) {
                    Some(existing) if existing.last_played >= game.last_played => {}
                    _ => {
                        games.insert(app_id.to_string(), game);
                    }
                }
            }
        }
    }
    let mut list: Vec<SteamGame> = games.into_values().collect();
    list.sort_by(|a, b| b.last_played.cmp(&a.last_played).then_with(|| a.name.cmp(&b.name)));
    list.truncate(limit);
    list
}

// ---- Art.

fn art_names(kind: &str) -> &'static [&'static str] {
    match kind {
        "capsule" => &["library_600x900.jpg", "library_600x900_2x.jpg", "library_capsule.jpg"],
        "header" => &["header.jpg", "library_header.jpg"],
        "hero" => &["library_hero.jpg"],
        "logo" => &["logo.png"],
        _ => &[],
    }
}

/// The art file for one app and kind ("capsule", "header", "hero", "logo"),
/// in either librarycache layout.
pub fn find_art_in(root: &Path, app_id: &str, kind: &str) -> Option<PathBuf> {
    if app_id.is_empty() || !app_id.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let cache = root.join("appcache").join("librarycache");
    for name in art_names(kind) {
        let flat = cache.join(format!("{app_id}_{name}"));
        if flat.is_file() {
            return Some(flat);
        }
    }
    let folder = cache.join(app_id);
    for name in art_names(kind) {
        let direct = folder.join(name);
        if direct.is_file() {
            return Some(direct);
        }
    }
    // Newer clients keep some art one folder down, named by a hash.
    let Ok(entries) = fs::read_dir(&folder) else { return None };
    let mut nested: Vec<PathBuf> = entries.filter_map(Result::ok).map(|entry| entry.path()).filter(|path| path.is_dir()).collect();
    nested.sort();
    for dir in nested {
        for name in art_names(kind) {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn data_url(path: &Path) -> Option<String> {
    let size = fs::metadata(path).ok()?.len();
    if size == 0 || size > MAX_ART_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    let mime = match path.extension().and_then(|ext| ext.to_str()).map(str::to_ascii_lowercase).as_deref() {
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        _ => "image/jpeg",
    };
    Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

pub fn art_data_url_in(roots: &[PathBuf], app_id: &str, kind: &str) -> Option<String> {
    roots.iter().find_map(|root| find_art_in(root, app_id, kind)).and_then(|path| data_url(&path))
}

// ---- Executables and running games.

/// The Steam app an executable belongs to: the library whose `common` folder
/// holds it, and the manifest whose installdir is the folder it sits in.
pub fn app_for_exe_in(roots: &[PathBuf], exe_path: &str) -> Option<SteamApp> {
    let normalized = exe_path.replace('/', "\\").to_ascii_lowercase();
    for root in roots {
        let libraries = library_folders(root);
        for library in &libraries {
            let common = format!("{}\\", library.join("common").to_string_lossy().replace('/', "\\").to_ascii_lowercase());
            let Some(rest) = normalized.strip_prefix(&common) else { continue };
            let folder = rest.split('\\').next().unwrap_or_default();
            if folder.is_empty() {
                continue;
            }
            let Ok(entries) = fs::read_dir(library) else { continue };
            for entry in entries.filter_map(Result::ok) {
                let file_name = entry.file_name().to_string_lossy().into_owned();
                let Some(app_id) = file_name.strip_prefix("appmanifest_").and_then(|rest| rest.strip_suffix(".acf")) else { continue };
                let Ok(manifest) = fs::read_to_string(entry.path()) else { continue };
                if first_value(&manifest, "installdir").is_some_and(|dir| dir.eq_ignore_ascii_case(folder)) {
                    return Some(SteamApp {
                        app_id: app_id.to_string(),
                        name: app_name(&libraries, app_id).unwrap_or_else(|| folder.to_string()),
                        install_dir: library.join("common").join(folder).to_string_lossy().into_owned(),
                    });
                }
            }
        }
    }
    None
}

/// Windows' own shell and launchers: running, titled, and never a game.
fn is_shell_process(exe: &str) -> bool {
    const SHELL: [&str; 12] = [
        "explorer.exe", "steam.exe", "steamwebhelper.exe", "applicationframehost.exe", "textinputhost.exe",
        "systemsettings.exe", "searchhost.exe", "startmenuexperiencehost.exe", "shellexperiencehost.exe",
        "lockapp.exe", "epicgameslauncher.exe", "galaxyclient.exe",
    ];
    SHELL.contains(&exe.to_ascii_lowercase().as_str())
}

/// Folders other launchers install games into.
fn in_store_folder(exe_path: &str) -> bool {
    let lower = exe_path.to_ascii_lowercase().replace('/', "\\");
    ["\\epic games\\", "\\gog galaxy\\games\\", "\\gog games\\", "\\xboxgames\\", "\\ea games\\", "\\ubisoft game launcher\\games\\", "\\riot games\\", "\\battle.net\\"]
        .iter()
        .any(|folder| lower.contains(folder))
}

pub fn rank_running(processes: Vec<crate::services::processes::RunningProcess>, roots: &[PathBuf]) -> Vec<RunningGame> {
    let mut games: Vec<RunningGame> = processes
        .into_iter()
        .filter(|process| !is_shell_process(&process.process_name))
        .map(|process| {
            let app = process.exe_path.as_deref().and_then(|path| app_for_exe_in(roots, path));
            let kind = if app.is_some() {
                "steam"
            } else if process.exe_path.as_deref().is_some_and(in_store_folder) {
                "store"
            } else {
                "app"
            };
            RunningGame {
                process_name: process.process_name,
                pid: process.pid,
                window_title: process.window_title,
                exe_path: process.exe_path,
                kind: kind.to_string(),
                steam_app_id: app.as_ref().map(|app| app.app_id.clone()),
                name: app.map(|app| app.name),
            }
        })
        .collect();
    let rank = |kind: &str| match kind {
        "steam" => 0,
        "store" => 1,
        _ => 2,
    };
    games.sort_by(|a, b| rank(&a.kind).cmp(&rank(&b.kind)).then_with(|| a.process_name.to_ascii_lowercase().cmp(&b.process_name.to_ascii_lowercase())));
    games
}

// ---- Commands.

#[tauri::command(async)]
pub fn list_recent_steam_games(limit: Option<usize>) -> Vec<SteamGame> {
    recent_games_in(&steam_roots(), limit.unwrap_or(12).clamp(1, 60))
}

/// A data URL for one app's art ("capsule", "header", "hero" or "logo").
#[tauri::command(async)]
pub fn steam_game_art(app_id: String, kind: String) -> Option<String> {
    art_data_url_in(&steam_roots(), &app_id, &kind)
}

#[tauri::command(async)]
pub fn steam_app_for_exe(exe_path: String) -> Option<SteamApp> {
    app_for_exe_in(&steam_roots(), &exe_path)
}

/// Running apps, games first: Steam games (named, with art), then other
/// launchers' games, then everything else with a window.
#[tauri::command(async)]
pub fn list_running_games() -> Result<Vec<RunningGame>, String> {
    Ok(rank_running(crate::services::processes::list()?, &steam_roots()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("jsm-steam-library-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(path: PathBuf, bytes: &[u8]) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, bytes).unwrap();
    }

    #[test]
    fn reads_nested_vdf_ignoring_case_and_comments() {
        let tree = parse_vdf("\u{feff}\"UserLocalConfigStore\"\n{\n // a note\n\t\"Software\" { \"valve\" { \"Steam\" { \"Apps\" {\n\t\"548430\" { \"LastPlayed\" \"1759700000\" \"Path\" \"C:\\\\Games\" }\n } } } }\n}\n");
        let apps = tree.path(&["UserLocalConfigStore", "Software", "Valve", "Steam", "apps"]).unwrap();
        assert_eq!(apps.entries().len(), 1);
        assert_eq!(apps.get("548430").unwrap().get("lastplayed").unwrap().text(), Some("1759700000"));
        assert_eq!(apps.get("548430").unwrap().get("Path").unwrap().text(), Some("C:\\Games"));
    }

    #[test]
    fn recent_games_come_newest_first_with_names_art_and_folders() {
        let root = scratch("recent");
        let manifest = |id: &str, name: &str, dir: &str| format!("\"AppState\"\n{{\n\t\"appid\"\t\"{id}\"\n\t\"name\"\t\"{name}\"\n\t\"installdir\"\t\"{dir}\"\n}}\n");
        write(root.join("steamapps/appmanifest_548430.acf"), manifest("548430", "Deep Rock Galactic", "Deep Rock Galactic").as_bytes());
        write(root.join("steamapps/appmanifest_620.acf"), manifest("620", "Portal 2", "Portal 2").as_bytes());
        write(root.join("steamapps/appmanifest_400.acf"), manifest("400", "Portal", "Portal").as_bytes());
        write(root.join("steamapps/appmanifest_228980.acf"), manifest("228980", "Steamworks Common Redistributables", "Steamworks Shared").as_bytes());
        write(
            root.join("userdata/42/config/localconfig.vdf"),
            b"\"UserLocalConfigStore\" { \"Software\" { \"Valve\" { \"Steam\" { \"apps\" { \"548430\" { \"LastPlayed\" \"1759700000\" } \"620\" { \"LastPlayed\" \"1750000000\" } \"228980\" { \"LastPlayed\" \"1759800000\" } } } } } }",
        );
        // Older flat art for one game, the newer folder layout for the other.
        write(root.join("appcache/librarycache/548430_library_600x900.jpg"), b"jpg");
        write(root.join("appcache/librarycache/620/abc123/header.jpg"), b"jpg");

        let games = recent_games_in(&[root.clone()], 10);
        assert_eq!(games.iter().map(|g| g.name.as_str()).collect::<Vec<_>>(), ["Deep Rock Galactic", "Portal 2"], "{games:#?}");
        assert!(games[0].has_capsule && !games[0].has_header);
        assert!(games[1].has_header && !games[1].has_capsule);
        assert!(games[0].install_dir.as_deref().unwrap().ends_with("Deep Rock Galactic"));
        assert_eq!(recent_games_in(&[root.clone()], 1).len(), 1);
        let url = art_data_url_in(&[root.clone()], "548430", "capsule").unwrap();
        assert!(url.starts_with("data:image/jpeg;base64,"));
        assert!(art_data_url_in(&[root.clone()], "../548430", "capsule").is_none(), "an app id is digits only");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn an_executable_is_matched_to_its_steam_app() {
        let root = scratch("exe");
        write(root.join("steamapps/appmanifest_548430.acf"), b"\"AppState\" { \"appid\" \"548430\" \"name\" \"Deep Rock Galactic\" \"installdir\" \"Deep Rock Galactic\" }");
        let exe = root.join("steamapps/common/Deep Rock Galactic/FSD/Binaries/Win64/FSD-Win64-Shipping.exe");
        let app = app_for_exe_in(&[root.clone()], &exe.to_string_lossy()).unwrap();
        assert_eq!(app.app_id, "548430");
        assert_eq!(app.name, "Deep Rock Galactic");
        assert!(app_for_exe_in(&[root.clone()], "C:\\Windows\\notepad.exe").is_none());

        let ranked = rank_running(
            vec![
                crate::services::processes::RunningProcess { process_name: "Discord.exe".into(), pid: 1, window_title: Some("Discord".into()), exe_path: Some("C:\\Discord\\Discord.exe".into()) },
                crate::services::processes::RunningProcess { process_name: "explorer.exe".into(), pid: 2, window_title: Some("Files".into()), exe_path: None },
                crate::services::processes::RunningProcess { process_name: "FSD-Win64-Shipping.exe".into(), pid: 3, window_title: Some("Deep Rock".into()), exe_path: Some(exe.to_string_lossy().into_owned()) },
                crate::services::processes::RunningProcess { process_name: "Fortnite.exe".into(), pid: 4, window_title: Some("Fortnite".into()), exe_path: Some("D:\\Epic Games\\Fortnite\\Fortnite.exe".into()) },
            ],
            &[root.clone()],
        );
        assert_eq!(ranked.iter().map(|g| g.process_name.as_str()).collect::<Vec<_>>(), ["FSD-Win64-Shipping.exe", "Fortnite.exe", "Discord.exe"]);
        assert_eq!(ranked[0].name.as_deref(), Some("Deep Rock Galactic"));
        assert_eq!(ranked[1].kind, "store");
        let _ = fs::remove_dir_all(root);
    }
}

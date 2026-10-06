// Steam Input layouts already on this PC, for the "Import from Steam" dialog.
//
// Steam keeps a controller layout as a .vdf file in three places under its
// install folder:
//
//   steamapps/common/Steam Controller Configs/<account>/config/<game>/*.vdf
//       layouts the person saved or edited themselves
//   userdata/<account>/241100/remote/controller_config/<game>/*.vdf
//       the Steam Cloud copy of the same, which is all some installs have
//   controller_base/templates/*.vdf
//       Valve's own templates ("Gamepad with Mouse Trackpad", ...)
//
// <game> is a Steam app id for Steam games and the shortcut's name for
// non-Steam ones. An app id is turned back into the game's name from its
// appmanifest in whichever library folder holds it.
//
// Only listing and reading happen here. The conversion itself is in the front
// end (utils/steamLayout.ts), next to the profile format it writes.

use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use serde::Serialize;

/// A layout file Steam has written, already titled for the list.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SteamLayout {
    pub path: String,
    pub title: String,
    pub game: String,
    pub app_id: Option<String>,
    pub controller_type: String,
    /// "personal", "cloud" or "template".
    pub source: String,
    pub modified_ms: u64,
}

/// Layout files are a few hundred kilobytes at most; anything bigger is not one.
const MAX_LAYOUT_BYTES: u64 = 4 * 1024 * 1024;

pub fn list_layouts() -> Vec<SteamLayout> {
    list_layouts_in(&steam_roots())
}

/// Reads one layout for conversion. Only a .vdf file is ever read, whatever
/// path the front end passes.
pub fn read_layout(path: &str) -> Result<String, String> {
    let path = Path::new(path);
    let is_vdf = path
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("vdf"));
    if !is_vdf {
        return Err("Only Steam layout (.vdf) files can be imported.".into());
    }
    let size = fs::metadata(path).map_err(|error| format!("Could not open {}: {error}", path.display()))?.len();
    if size > MAX_LAYOUT_BYTES {
        return Err(format!("{} is too large to be a Steam layout.", path.display()));
    }
    let bytes = fs::read(path).map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

pub fn list_layouts_in(roots: &[PathBuf]) -> Vec<SteamLayout> {
    let mut seen = HashSet::new();
    let mut layouts = Vec::new();
    for root in roots {
        let libraries = library_folders(root);
        let mut add = |file: PathBuf, game_folder: Option<&str>, source: &str| {
            let key = fs::canonicalize(&file).unwrap_or_else(|_| file.clone());
            if !seen.insert(key) {
                return;
            }
            if let Some(layout) = describe(&file, game_folder, source, &libraries) {
                layouts.push(layout);
            }
        };

        // <account>/config/<game>/*.vdf
        let personal = root.join("steamapps").join("common").join("Steam Controller Configs");
        for account in subdirs(&personal) {
            for game in subdirs(&account.join("config")) {
                let name = folder_name(&game);
                for file in vdf_files(&game) {
                    add(file, Some(&name), "personal");
                }
            }
        }
        // userdata/<account>/241100/remote/controller_config/<game>/*.vdf
        for account in subdirs(&root.join("userdata")) {
            let configs = account.join("241100").join("remote").join("controller_config");
            for game in subdirs(&configs) {
                let name = folder_name(&game);
                for file in vdf_files(&game) {
                    add(file, Some(&name), "cloud");
                }
            }
        }
        for file in vdf_files(&root.join("controller_base").join("templates")) {
            add(file, None, "template");
        }
    }

    // The person's own layouts first, newest first; Valve's templates last.
    let rank = |source: &str| match source {
        "personal" => 0,
        "cloud" => 1,
        _ => 2,
    };
    layouts.sort_by(|a, b| {
        rank(&a.source)
            .cmp(&rank(&b.source))
            .then(if a.source == "template" {
                a.title.to_lowercase().cmp(&b.title.to_lowercase())
            } else {
                b.modified_ms.cmp(&a.modified_ms)
            })
    });
    layouts
}

fn describe(file: &Path, game_folder: Option<&str>, source: &str, libraries: &[PathBuf]) -> Option<SteamLayout> {
    let metadata = fs::metadata(file).ok()?;
    if metadata.len() > MAX_LAYOUT_BYTES {
        return None;
    }
    let text = String::from_utf8_lossy(&fs::read(file).ok()?).into_owned();
    if !text.to_ascii_lowercase().contains("controller_mappings") {
        return None;
    }
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);

    let app_id = game_folder.filter(|name| !name.is_empty() && name.chars().all(|c| c.is_ascii_digit())).map(str::to_string);
    let game = match (&app_id, game_folder) {
        (Some(id), _) => app_name(libraries, id).unwrap_or_else(|| format!("App {id}")),
        (None, Some(name)) => name.to_string(),
        (None, None) => "Steam template".to_string(),
    };
    let file_stem = file.file_stem().and_then(|stem| stem.to_str()).unwrap_or("Layout").to_string();
    let title = layout_title(&text).unwrap_or(file_stem);

    Some(SteamLayout {
        path: file.to_string_lossy().into_owned(),
        title,
        game,
        app_id,
        controller_type: first_value(&text, "controller_type").unwrap_or_default(),
        source: source.to_string(),
        modified_ms,
    })
}

/// The layout's title, resolving a "#Token" through its English localization.
fn layout_title(text: &str) -> Option<String> {
    let title = first_value(text, "title")?;
    let Some(token) = title.strip_prefix('#') else {
        return Some(title).filter(|t| !t.trim().is_empty());
    };
    let lower = text.to_ascii_lowercase();
    let english = lower.find("\"english\"")?;
    first_value(&text[english..], token).or_else(|| Some(token.replace('_', " ")))
}

/// The first `"key" "value"` pair for `key`, ignoring case.
fn first_value(text: &str, key: &str) -> Option<String> {
    let needle = format!("\"{}\"", key.to_ascii_lowercase());
    let lower = text.to_ascii_lowercase();
    let mut from = 0;
    while let Some(found) = lower[from..].find(&needle) {
        let after = from + found + needle.len();
        let rest = &text[after..];
        let trimmed = rest.trim_start_matches([' ', '\t']);
        if let Some(body) = trimmed.strip_prefix('"') {
            if let Some(end) = body.find('"') {
                return Some(body[..end].to_string());
            }
        }
        from = after;
    }
    None
}

/// Every steamapps folder: the install's own, plus each extra library.
fn library_folders(root: &Path) -> Vec<PathBuf> {
    let mut folders = vec![root.join("steamapps")];
    let listing = root.join("steamapps").join("libraryfolders.vdf");
    if let Ok(text) = fs::read_to_string(listing) {
        let mut rest = text.as_str();
        while let Some(index) = rest.find("\"path\"") {
            rest = &rest[index + 6..];
            if let Some(value) = rest.trim_start().strip_prefix('"').and_then(|body| body.find('"').map(|end| &body[..end])) {
                let path = PathBuf::from(value.replace("\\\\", "\\")).join("steamapps");
                if !folders.contains(&path) {
                    folders.push(path);
                }
            }
        }
    }
    folders
}

fn app_name(libraries: &[PathBuf], app_id: &str) -> Option<String> {
    libraries.iter().find_map(|library| {
        let manifest = fs::read_to_string(library.join(format!("appmanifest_{app_id}.acf"))).ok()?;
        first_value(&manifest, "name")
    })
}

fn subdirs(path: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(path) else { return Vec::new() };
    let mut dirs: Vec<PathBuf> = entries.filter_map(Result::ok).map(|entry| entry.path()).filter(|p| p.is_dir()).collect();
    dirs.sort();
    dirs
}

fn vdf_files(path: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(path) else { return Vec::new() };
    let mut files: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|p| p.is_file() && p.extension().and_then(|ext| ext.to_str()).is_some_and(|ext| ext.eq_ignore_ascii_case("vdf")))
        .collect();
    files.sort();
    files
}

fn folder_name(path: &Path) -> String {
    path.file_name().and_then(|name| name.to_str()).unwrap_or_default().to_string()
}

/// Where Steam is installed. More than one can exist (a Flatpak beside a
/// native install); each is searched.
pub fn steam_roots() -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    #[cfg(windows)]
    {
        if let Some(path) = registry_steam_path() {
            candidates.push(PathBuf::from(path));
        }
        for base in ["ProgramFiles(x86)", "ProgramFiles"] {
            if let Ok(dir) = std::env::var(base) {
                candidates.push(PathBuf::from(dir).join("Steam"));
            }
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(home) = std::env::var("HOME") {
            let home = PathBuf::from(home);
            candidates.push(home.join(".steam").join("steam"));
            candidates.push(home.join(".local").join("share").join("Steam"));
            candidates.push(home.join(".var").join("app").join("com.valvesoftware.Steam").join(".local").join("share").join("Steam"));
            candidates.push(home.join("Library").join("Application Support").join("Steam"));
        }
    }
    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter(|path| path.is_dir())
        .filter(|path| seen.insert(fs::canonicalize(path).unwrap_or_else(|_| path.clone())))
        .collect()
}

#[cfg(windows)]
fn registry_steam_path() -> Option<String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let output = std::process::Command::new("reg.exe")
        .args(["query", r"HKCU\Software\Valve\Steam", "/v", "SteamPath"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout).lines().find_map(|line| {
        let trimmed = line.trim();
        let rest = trimmed.strip_prefix("SteamPath")?.trim_start();
        let value = rest.strip_prefix("REG_SZ")?.trim();
        (!value.is_empty()).then(|| value.replace('/', "\\"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("jsm-steam-layouts-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(path: PathBuf, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    const LAYOUT: &str = "\"controller_mappings\"\n{\n\t\"version\"\t\"3\"\n\t\"title\"\t\"Wardogs aim\"\n\t\"controller_type\"\t\"controller_triton\"\n}\n";
    const TEMPLATE: &str = "\u{feff}\"controller_mappings\"\n{\n\t\"title\" \"#Title\"\n\t\"controller_type\"\t\"controller_neptune\"\n\t\"localization\"\n\t{\n\t\t\"english\"\n\t\t{\n\t\t\t\"Title\" \"Gamepad with Mouse Trackpad\"\n\t\t}\n\t}\n}\n";

    #[test]
    fn finds_personal_cloud_and_template_layouts_with_game_names() {
        let root = scratch("all");
        write(root.join("steamapps/common/Steam Controller Configs/123/config/1203220/controller_triton.vdf"), LAYOUT);
        write(root.join("steamapps/appmanifest_1203220.acf"), "\"AppState\"\n{\n\t\"appid\"\t\"1203220\"\n\t\"name\"\t\"Wardogs\"\n}\n");
        write(root.join("userdata/123/241100/remote/controller_config/my shortcut/layout.vdf"), LAYOUT);
        write(root.join("controller_base/templates/controller_neptune_gamepad+mouse.vdf"), TEMPLATE);
        // Not layouts: wrong extension, and a .vdf that is something else.
        write(root.join("controller_base/templates/readme.txt"), LAYOUT);
        write(root.join("controller_base/templates/other.vdf"), "\"UserLocalConfigStore\" { }");

        let layouts = list_layouts_in(&[root.clone()]);
        assert_eq!(layouts.len(), 3, "{layouts:#?}");
        assert_eq!(layouts[0].source, "personal");
        assert_eq!(layouts[0].game, "Wardogs");
        assert_eq!(layouts[0].app_id.as_deref(), Some("1203220"));
        assert_eq!(layouts[0].title, "Wardogs aim");
        assert_eq!(layouts[0].controller_type, "controller_triton");
        assert_eq!(layouts[1].source, "cloud");
        assert_eq!(layouts[1].game, "my shortcut");
        assert_eq!(layouts[1].app_id, None);
        assert_eq!(layouts[2].source, "template");
        assert_eq!(layouts[2].title, "Gamepad with Mouse Trackpad");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn app_names_come_from_any_library_folder() {
        let root = scratch("libraries");
        let other = scratch("libraries-extra");
        let escaped = other.to_string_lossy().replace('\\', "\\\\");
        write(root.join("steamapps/libraryfolders.vdf"), &format!("\"libraryfolders\"\n{{\n\t\"1\"\n\t{{\n\t\t\"path\"\t\t\"{escaped}\"\n\t}}\n}}\n"));
        write(other.join("steamapps/appmanifest_42.acf"), "\"AppState\" { \"name\" \"Far Library Game\" }");
        write(root.join("steamapps/common/Steam Controller Configs/1/config/42/a.vdf"), LAYOUT);
        let layouts = list_layouts_in(&[root.clone()]);
        assert_eq!(layouts[0].game, "Far Library Game");
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(other);
    }

    #[test]
    fn reads_only_vdf_files() {
        let root = scratch("read");
        write(root.join("a.vdf"), LAYOUT);
        write(root.join("a.txt"), LAYOUT);
        assert!(read_layout(&root.join("a.vdf").to_string_lossy()).unwrap().contains("Wardogs aim"));
        assert!(read_layout(&root.join("a.txt").to_string_lossy()).is_err());
        assert!(read_layout(&root.join("missing.vdf").to_string_lossy()).is_err());
        let _ = fs::remove_dir_all(root);
    }
}

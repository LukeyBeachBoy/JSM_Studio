//! The preset bases JSM Evolved ships (console v2, D24): one per play style,
//! with variants where controllers differ (grips on the Steam Controller, gyro
//! and a touchpad on PlayStation, neither on Xbox).
//!
//! A base is an ordinary JSM file that a game's configuration imports with a
//! bare path line, so it has no RESET_MAPPINGS (that would wipe whatever the
//! game set above the import). The texts are compiled in and written to
//! `jsm-runtime/bases/` on every launch, the way AppNavigation.txt is, so an
//! update ships its improvements. They live outside `profiles-library`, which
//! keeps them out of the library listing and out of reach of every save,
//! rename and delete there: they are read-only like the built-ins.
//!
//! Each file starts with a `# @base {...}` line the New configuration wizard
//! reads for its cards: the preset it belongs to, its title and blurb, the
//! controller families it is written for and what the controller needs.

use std::{fs, path::Path};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::runtime;

/// The runtime subfolder the bases are written to; a game imports
/// `bases/<file>.txt`.
pub const BASES_DIR: &str = "bases";

/// (file name, text). File names keep to letters, digits, spaces and hyphens:
/// the mapper reads an import as a bare path on its own line.
pub const SHIPPED_BASES: [(&str, &str); 8] = [
    ("Shooter gyro aim - Steam Controller.txt", include_str!("bases/Shooter gyro aim - Steam Controller.txt")),
    ("Shooter gyro aim - motion controllers.txt", include_str!("bases/Shooter gyro aim - motion controllers.txt")),
    ("Shooter stick aim.txt", include_str!("bases/Shooter stick aim.txt")),
    ("Third-person action.txt", include_str!("bases/Third-person action.txt")),
    ("Racing and flying.txt", include_str!("bases/Racing and flying.txt")),
    ("Racing and flying - tilt.txt", include_str!("bases/Racing and flying - tilt.txt")),
    ("Strategy and builders - Steam Controller.txt", include_str!("bases/Strategy and builders - Steam Controller.txt")),
    ("Strategy and builders.txt", include_str!("bases/Strategy and builders.txt")),
];

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BaseHeader {
    #[serde(default)]
    preset: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    short: String,
    #[serde(default)]
    blurb: String,
    #[serde(default)]
    families: Vec<String>,
    #[serde(default)]
    needs: Vec<String>,
    #[serde(default)]
    order: u32,
}

/// One shipped base, as the wizard and the Bases tab list it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BuiltinBase {
    /// The path a game imports, relative to the runtime folder.
    pub relative_path: String,
    pub file_name: String,
    pub preset: String,
    pub title: String,
    pub short: String,
    pub blurb: String,
    pub families: Vec<String>,
    pub needs: Vec<String>,
    pub order: u32,
    pub text: String,
}

fn header(text: &str) -> BaseHeader {
    text.lines()
        .find_map(|line| line.trim().strip_prefix("# @base ").map(str::trim))
        .and_then(|json| serde_json::from_str::<BaseHeader>(json).ok())
        .unwrap_or_default()
}

pub fn builtin_bases() -> Vec<BuiltinBase> {
    let mut list: Vec<BuiltinBase> = SHIPPED_BASES
        .iter()
        .map(|(file, text)| {
            let meta = header(text);
            let stem = file.trim_end_matches(".txt").to_string();
            BuiltinBase {
                relative_path: format!("{BASES_DIR}/{file}"),
                file_name: (*file).to_string(),
                preset: if meta.preset.is_empty() { stem.clone() } else { meta.preset },
                title: if meta.title.is_empty() { stem.clone() } else { meta.title },
                short: meta.short,
                blurb: meta.blurb,
                families: meta.families,
                needs: meta.needs,
                order: meta.order,
                text: (*text).to_string(),
            }
        })
        .collect();
    list.sort_by(|a, b| a.order.cmp(&b.order).then_with(|| a.file_name.cmp(&b.file_name)));
    list
}

/// Writes every shipped base into `<runtime>/bases`, replacing a copy that
/// differs (an older version, or one edited by hand outside the app). Files
/// the person added to the folder are left alone.
pub fn seed_into(runtime_dir: &Path) -> Result<(), String> {
    let dir = runtime_dir.join(BASES_DIR);
    fs::create_dir_all(&dir).map_err(|error| format!("Failed to create {}: {error}", dir.display()))?;
    for (file, text) in SHIPPED_BASES {
        let path = dir.join(file);
        if fs::read_to_string(&path).ok().as_deref() == Some(text) {
            continue;
        }
        runtime::write_file_atomically(&path, text)?;
    }
    Ok(())
}

pub fn seed(app: &AppHandle) -> Result<(), String> {
    seed_into(&runtime::runtime_dir(app)?)
}

/// Whether a runtime-relative path is one of the shipped bases (read-only).
pub fn is_builtin_base_path(relative: &str) -> bool {
    let normalized = relative.replace('\\', "/");
    let Some(file) = normalized.strip_prefix(&format!("{BASES_DIR}/")) else { return false };
    SHIPPED_BASES.iter().any(|(name, _)| name.eq_ignore_ascii_case(file))
}

#[tauri::command]
pub fn list_builtin_bases() -> Vec<BuiltinBase> {
    builtin_bases()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_shipped_base_can_be_imported() {
        for (file, text) in SHIPPED_BASES {
            // A base must not reset what the game above the import set, nor
            // claim the controller or telemetry: the game file does that.
            for line in text.lines().map(str::trim).filter(|line| !line.starts_with('#')) {
                let upper = line.to_ascii_uppercase();
                assert!(!upper.starts_with("RESET_MAPPINGS"), "{file} resets mappings");
                assert!(!upper.starts_with("AUTOCONNECT"), "{file} sets AUTOCONNECT");
                assert!(!upper.starts_with("TELEMETRY_"), "{file} sets telemetry");
            }
            assert!(file.chars().all(|c| c.is_ascii_alphanumeric() || " -.".contains(c)), "{file} has a character the mapper may not read in a path");
        }
    }

    #[test]
    fn every_shipped_base_describes_itself() {
        let bases = builtin_bases();
        assert_eq!(bases.len(), SHIPPED_BASES.len());
        for base in &bases {
            assert!(!base.preset.is_empty() && !base.title.is_empty() && !base.blurb.is_empty(), "{} has no header", base.file_name);
            assert!(!base.families.is_empty(), "{} names no controller family", base.file_name);
            assert!(base.relative_path.starts_with("bases/"));
        }
        // Every family gets a variant of every preset that does not need gyro,
        // and the gyro shooter is never offered for a controller without one.
        for family in ["steam", "playstation", "xbox", "nintendo", "generic"] {
            for preset in ["shooter-stick", "third-person", "racing", "strategy"] {
                assert!(bases.iter().any(|base| base.preset == preset && base.families.iter().any(|f| f == family)), "{preset} has no {family} variant");
            }
        }
        assert!(!bases.iter().any(|base| base.preset == "shooter-gyro" && base.families.iter().any(|f| f == "xbox")));
    }

    #[test]
    fn seeding_writes_and_refreshes_the_shipped_files() {
        let dir = std::env::temp_dir().join(format!("jsm-bases-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        seed_into(&dir).unwrap();
        let first = dir.join(BASES_DIR).join(SHIPPED_BASES[0].0);
        assert_eq!(fs::read_to_string(&first).unwrap(), SHIPPED_BASES[0].1);
        fs::write(&first, "edited by hand").unwrap();
        fs::write(dir.join(BASES_DIR).join("Mine.txt"), "S = SPACE").unwrap();
        seed_into(&dir).unwrap();
        assert_eq!(fs::read_to_string(&first).unwrap(), SHIPPED_BASES[0].1, "a changed copy is replaced");
        assert_eq!(fs::read_to_string(dir.join(BASES_DIR).join("Mine.txt")).unwrap(), "S = SPACE", "the person's own file stays");
        assert!(is_builtin_base_path("bases/Shooter stick aim.txt"));
        assert!(is_builtin_base_path("bases\\shooter stick aim.txt"));
        assert!(!is_builtin_base_path("bases/Mine.txt"));
        let _ = fs::remove_dir_all(&dir);
    }
}

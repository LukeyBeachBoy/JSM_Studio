use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

pub const DEFAULT_PROFILE_NAME: &str = "Profile 1";
pub const PROFILE_LIBRARY_RELATIVE: &str = "profiles-library";

/// Where Apply writes the configuration being tried out, so that applying does
/// not overwrite the saved profile it was edited from. It has to live inside
/// the profile library: every path here goes through
/// `normalize_relative_profile_path`, which rejects anything outside it, so a
/// bare file name made Apply fail outright.
pub const APPLIED_PREVIEW_NAME: &str = "applied-preview";
pub const APPLIED_PREVIEW_RELATIVE: &str = "profiles-library/applied-preview.txt";
pub const DEFAULT_PROFILE_RELATIVE: &str = "profiles-library/Profile 1.txt";
pub const CALIBRATION_PROFILE_RELATIVE: &str = "GyroConfigs/_3Dcalibrate.txt";
pub const CALIBRATION_COMMAND: &str = "RecalibrateGyro.txt";

const DEFAULT_BACKEND_CHOICE: &str = "SDL";
const DEFAULT_CALIBRATION_SECONDS: u32 = 5;
const BACKEND_FILE_NAME: &str = "backend.json";
const GUI_STATE_FILE_NAME: &str = "gui-state.json";
const HIDHIDE_STATE_FILE_NAME: &str = "hidhide-state.json";
const AI_SETTINGS_FILE_NAME: &str = "ai-settings.json";
const LEGACY_APP_IDENTIFIER: &str = "com.evanmclean.jsmcustomcurve";
const STARTUP_FILE_NAME: &str = "OnStartUp.txt";
const CALIBRATION_COMMAND_FILE_NAME: &str = "RecalibrateGyro.txt";
const MAPPING_DISABLED_FILE_NAME: &str = "MappingDisabled.txt";
const MAPPING_DISABLED_RELATIVE: &str = MAPPING_DISABLED_FILE_NAME;
const PROFILE_TEMPLATE_LINES: [&str; 4] = [
    "RESET_MAPPINGS",
    "AUTOCONNECT = ON",
    "TELEMETRY_ENABLED = ON",
    "TELEMETRY_PORT = 8974",
];
const STARTUP_HEADER_LINES: [&str; 2] = ["TELEMETRY_ENABLED = ON", "TELEMETRY_PORT = 8974"];
const MAPPING_DISABLED_LINES: [&str; 6] = [
    "RESET_MAPPINGS",
    "AUTOCONNECT = ON",
    "TELEMETRY_ENABLED = ON",
    "TELEMETRY_PORT = 8974",
    "AUTOLOAD = OFF",
    "VIRTUAL_CONTROLLER = NONE",
];
const RECONNECT_HOOK_FILE_NAME: &str = "OnReconnect.txt";
/// Maps the controller to keyboard/mouse while JSM Studio is in the foreground
/// (via an AutoLoad rule named after our own executable). App-owned: refreshed
/// on every launch so an update ships its improvements.
pub const APP_NAVIGATION_FILE_NAME: &str = "AppNavigation.txt";
const USER_OWNED_LAYER_FILES: [&str; 1] = [RECONNECT_HOOK_FILE_NAME];
/// Registry of button(s) -> configuration for the global chord feature: hold
/// the button(s), the whole configuration swaps in; release, the configuration
/// that was active before the hold restores. Stored separately from the
/// profile library since a chord is metadata *about* a profile, not a profile.
const CHORDS_FILE_NAME: &str = "chords.json";
/// Name of the configuration a fresh install ships bound to the default
/// chord, and the chord's own default trigger button (Quick Access on Steam
/// Controller; "extra button 1" generically -- see MISC1 in schema.ts).
const DEFAULT_CHORD_PROFILE_NAME: &str = "Quick Access Chord";
const DEFAULT_CHORD_BUTTON: &str = "MISC1";
const DEFAULT_CHORD_PROFILE_LINES: [&str; 12] = [
    "RESET_MAPPINGS",
    "AUTOCONNECT = ON",
    "TELEMETRY_ENABLED = ON",
    "TELEMETRY_PORT = 8974",
    "RIGHT_TOUCHPAD_MODE = MOUSE",
    "MISC2 = LMOUSE",
    "MISC3 = RMOUSE",
    "N = \"TURN_OFF_CONTROLLER\"",
    "L = LALT\\ !TAB\\",
    "R = TAB",
    "UP = VOLUME_UP",
    "DOWN = VOLUME_DOWN",
];

fn default_polling_ms() -> f64 { 3.0 }

fn default_true() -> bool {
    true
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMappingState {
    #[serde(default = "default_polling_ms")]
    pub default_polling_ms: f64,
    pub active_profile_path: String,
    #[serde(default)]
    pub applied_preview_path: Option<String>,
    pub mapping_enabled: bool,
    pub autoload_enabled: bool,
    /// Whether the built-in AutoLoad rule that lets the controller drive JSM
    /// Studio itself is installed. Only has an effect while AutoLoad is on.
    #[serde(default = "default_true")]
    pub controller_nav_enabled: bool,
    /// Whether the trackpad overlay window is shown. Persisted because it is a
    /// feature you turn on once for a game and expect to still be on the next
    /// time you launch -- it used to reset to off on every start, which read as
    /// the overlay having broken.
    #[serde(default)]
    pub trackpad_overlay_enabled: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoloadRule {
    pub process_name: String,
    pub file_name: String,
    pub kind: String,
    pub profile_name: Option<String>,
    pub profile_path: Option<String>,
    pub missing_profile: bool,
    /// The rule JSM Studio installs for its own window (controller navigation).
    pub built_in: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HidHideState {
    #[serde(default)]
    pub managed_instance_ids: Vec<String>,
}

/// One global chord: hold any button in `buttons`, the configuration at
/// `profile_path` swaps in for as long as it's held.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalChord {
    pub id: String,
    pub buttons: Vec<String>,
    pub profile_path: String,
}

pub fn ensure_required_files(app: &AppHandle) -> Result<(), String> {
    migrate_legacy_app_data(app)?;
    let backend = read_backend_choice(app)?;

    ensure_dir(&runtime_dir(app)?)?;
    ensure_dir(&profile_library_dir(app)?)?;
    ensure_dir(&calibration_dir(app)?)?;
    ensure_dir(&autoload_dir(app)?)?;

    migrate_bundled_runtime_data(app, &backend)?;
    ensure_runtime_support_files(app, &backend)?;

    // Seed a starter configuration only when the library is empty. Recreating
    // it unconditionally resurrected "Profile 1" the moment anything called
    // through here, so deleting it never stuck.
    if list_library_profile_names(app)?.is_empty() {
        ensure_file(
            &absolute_profile_path(app, DEFAULT_PROFILE_RELATIVE)?,
            &profile_template_text(),
        )?;
    }
    ensure_mapping_disabled_file(app)?;
    seed_default_chord_if_missing(app)?;

    let state = ensure_runtime_mapping_state(app)?;
    ensure_file(
        &absolute_profile_path(app, &state.active_profile_path)?,
        &profile_template_text(),
    )?;
    write_startup_file(app, &state)?;
    sync_app_navigation_rule(app, &state)?;
    let seconds = read_calibration_seconds(app)?;
    write_calibration_command_file(app, seconds)?;

    Ok(())
}

pub fn config_directory(app: &AppHandle) -> Result<PathBuf, String> {
    ensure_required_files(app)?;
    profile_library_dir(app)
}

pub fn read_backend_choice(app: &AppHandle) -> Result<String, String> {
    let path = backend_file(app)?;
    let raw = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(_) => return Ok(DEFAULT_BACKEND_CHOICE.to_string()),
    };

    match serde_json::from_str::<String>(&raw) {
        Ok(value) => Ok(normalize_backend_choice(&value).to_string()),
        Err(_) => Ok(DEFAULT_BACKEND_CHOICE.to_string()),
    }
}

pub fn write_backend_choice(app: &AppHandle, choice: &str) -> Result<String, String> {
    let normalized = normalize_backend_choice(choice).to_string();
    let path = backend_file(app)?;
    ensure_parent_dir(&path)?;
    let content = serde_json::to_string(&normalized)
        .map_err(|error| format!("Failed to serialize backend choice: {error}"))?;
    fs::write(path, content)
        .map_err(|error| format!("Failed to persist backend choice: {error}"))?;
    Ok(normalized)
}

pub fn read_calibration_seconds(app: &AppHandle) -> Result<u32, String> {
    let path = calibration_command_file(app)?;
    let content = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(_) => return Ok(DEFAULT_CALIBRATION_SECONDS),
    };

    Ok(parse_sleep_seconds(&content).unwrap_or(DEFAULT_CALIBRATION_SECONDS))
}

pub fn write_calibration_seconds(app: &AppHandle, seconds: u32) -> Result<u32, String> {
    write_calibration_command_file(app, seconds)?;
    Ok(seconds)
}

pub fn get_active_profile(app: &AppHandle) -> Result<(String, String), String> {
    ensure_required_files(app)?;
    let relative = read_runtime_mapping_state(app)?.active_profile_path;
    let absolute = absolute_profile_path(app, &relative)?;
    let content = fs::read_to_string(absolute)
        .map_err(|error| format!("Failed to read active profile: {error}"))?;
    Ok((relative, content))
}

pub fn set_active_profile(app: &AppHandle, relative: &str) -> Result<(), String> {
    ensure_required_files(app)?;
    let absolute = absolute_profile_path(app, relative)?;
    ensure_file(&absolute, "")?;
    let mut state = read_runtime_mapping_state(app)?;
    state.applied_preview_path = None;
    state.active_profile_path = normalize_relative_profile_path(Some(relative))
        .ok_or_else(|| format!("Invalid profile path: {relative}"))?;
    persist_runtime_mapping_state(app, &state)?;
    write_startup_file(app, &state)?;
    Ok(())
}

pub fn write_active_profile(
    app: &AppHandle,
    relative: Option<&str>,
    content: &str,
) -> Result<String, String> {
    ensure_required_files(app)?;
    let resolved = match normalize_relative_profile_path(relative) {
        Some(value) => value,
        None => read_runtime_mapping_state(app)?.active_profile_path,
    };
    let preview = APPLIED_PREVIEW_RELATIVE;
    let absolute = absolute_profile_path(app, preview)?;
    ensure_file(&absolute, "")?;
    fs::write(&absolute, content).map_err(|error| format!("Failed to write profile: {error}"))?;
    let mut state = read_runtime_mapping_state(app)?;
    state.active_profile_path = resolved.clone();
    state.applied_preview_path = Some(preview.to_string());
    persist_runtime_mapping_state(app, &state)?;
    write_startup_file(app, &state)?;
    Ok(preview.to_string())
}

pub fn list_library_profiles(app: &AppHandle) -> Result<Vec<String>, String> {
    ensure_required_files(app)?;
    list_library_profile_names(app)
}

/// The listing on its own, without the `ensure_required_files` pass that
/// `list_library_profiles` runs first. The profile watcher polls this once a
/// second, and `ensure_required_files` *writes* -- the startup file, the
/// calibration command file, the navigation rule -- which has no business
/// repeating on a timer, or racing a save the user just made.
pub fn list_library_profile_names(app: &AppHandle) -> Result<Vec<String>, String> {
    let mut names = Vec::new();
    let entries = fs::read_dir(profile_library_dir(app)?)
        .map_err(|error| format!("Failed to read profile library: {error}"))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to read profile entry: {error}"))?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("txt") {
            continue;
        }
        if let Some(stem) = path.file_stem().and_then(|value| value.to_str()) {
            // The Apply preview is a real file in this directory, but it is not
            // one of the user's configurations and must not appear as one.
            if stem == APPLIED_PREVIEW_NAME {
                continue;
            }
            names.push(stem.to_string());
        }
    }

    names.sort_by(|left, right| {
        left.to_ascii_lowercase()
            .cmp(&right.to_ascii_lowercase())
            .then_with(|| left.cmp(right))
    });

    Ok(names)
}

pub fn save_library_profile(app: &AppHandle, name: &str, content: &str) -> Result<String, String> {
    ensure_library_dir(app)?;
    let safe_name = sanitize_profile_name(name);
    let path = library_profile_path(app, &safe_name)?;
    fs::write(path, content).map_err(|error| format!("Failed to save profile: {error}"))?;
    Ok(safe_name)
}

pub fn load_library_profile(app: &AppHandle, name: &str) -> Result<String, String> {
    ensure_library_dir(app)?;
    let safe_name = sanitize_profile_name(name);
    let path = library_profile_path(app, &safe_name)?;
    fs::read_to_string(path).map_err(|error| format!("Failed to load profile: {error}"))
}

pub fn create_library_profile(
    app: &AppHandle,
    preferred_base_name: Option<&str>,
) -> Result<(String, String), String> {
    ensure_required_files(app)?;
    let name = generate_unique_profile_name(app, preferred_base_name)?;
    let relative = relative_profile_path_from_name(&name);
    let absolute = absolute_profile_path(app, &relative)?;
    let content = profile_template_text();
    fs::write(&absolute, &content).map_err(|error| format!("Failed to create profile: {error}"))?;
    Ok((relative, content))
}

pub fn rename_library_profile(
    app: &AppHandle,
    old_name: &str,
    new_name: &str,
) -> Result<(String, String), String> {
    ensure_required_files(app)?;
    let safe_old = sanitize_profile_name(old_name);
    let mut safe_new = sanitize_profile_name(new_name);

    if safe_new.is_empty() {
        return Err("New profile name cannot be empty.".to_string());
    }

    if safe_old.eq_ignore_ascii_case(&safe_new) {
        let relative = relative_profile_path_from_name(&safe_old);
        let content = fs::read_to_string(absolute_profile_path(app, &relative)?)
            .map_err(|error| format!("Failed to load profile during rename: {error}"))?;
        return Ok((relative, content));
    }

    let existing = list_library_profiles(app)?;
    let has_conflict = existing
        .iter()
        .filter(|entry| !entry.eq_ignore_ascii_case(&safe_old))
        .any(|entry| entry.eq_ignore_ascii_case(&safe_new));

    if has_conflict {
        safe_new = generate_unique_profile_name(app, Some(&safe_new))?;
    }

    let old_relative = relative_profile_path_from_name(&safe_old);
    let new_relative = relative_profile_path_from_name(&safe_new);
    let old_absolute = absolute_profile_path(app, &old_relative)?;
    let new_absolute = absolute_profile_path(app, &new_relative)?;

    ensure_file(&old_absolute, "")?;
    // A plain rename can fail on Windows while something still holds the file
    // open (the backend that just loaded it, a sync client, an indexer). Copy
    // the contents across and drop the original in that case.
    if let Err(rename_error) = fs::rename(&old_absolute, &new_absolute) {
        fs::copy(&old_absolute, &new_absolute)
            .map_err(|error| format!("Failed to rename profile: {rename_error} ({error})"))?;
        fs::remove_file(&old_absolute)
            .map_err(|error| format!("Failed to remove profile after rename: {error}"))?;
    }

    let active = read_runtime_mapping_state(app)?.active_profile_path;
    if active.eq_ignore_ascii_case(&old_relative) {
        set_active_profile_state(app, &new_relative)?;
    }

    update_autoload_profile_references(app, &old_relative, &new_relative)?;
    let mut chords = list_global_chords(app)?;
    for chord in &mut chords {
        if chord.profile_path.eq_ignore_ascii_case(&old_relative) { chord.profile_path = new_relative.clone(); }
    }
    write_global_chords_list(app, &chords)?;

    let content = fs::read_to_string(&new_absolute)
        .map_err(|error| format!("Failed to read renamed profile: {error}"))?;
    Ok((new_relative, content))
}

pub fn copy_active_profile(app: &AppHandle) -> Result<(String, String), String> {
    ensure_required_files(app)?;
    let (active_relative, content) = get_active_profile(app)?;
    let active_name = profile_name_from_relative_path(&active_relative);
    let copy_name = generate_copy_profile_name(app, &active_name)?;
    let copy_relative = relative_profile_path_from_name(&copy_name);
    let copy_absolute = absolute_profile_path(app, &copy_relative)?;
    fs::write(&copy_absolute, &content)
        .map_err(|error| format!("Failed to copy profile: {error}"))?;
    Ok((copy_relative, content))
}

pub fn delete_library_profile(
    app: &AppHandle,
    name: &str,
) -> Result<Option<(String, String)>, String> {
    ensure_required_files(app)?;
    let safe_name = sanitize_profile_name(name);
    let relative = relative_profile_path_from_name(&safe_name);
    let absolute = absolute_profile_path(app, &relative)?;
    let active = read_runtime_mapping_state(app)?.active_profile_path;
    if active.eq_ignore_ascii_case(&relative) || list_global_chords(app)?.iter().any(|chord| chord.profile_path.eq_ignore_ascii_case(&relative)) {
        return Err("Configuration is in use. Apply another configuration and remove chord references first.".into());
    }
    fs::remove_file(absolute).map_err(|error| format!("Failed to delete profile: {error}"))?;

    let active = read_runtime_mapping_state(app)?.active_profile_path;
    if active.eq_ignore_ascii_case(&relative) {
        let remaining = list_library_profiles(app)?;
        if let Some(fallback_name) = remaining.first() {
            let fallback_relative = relative_profile_path_from_name(fallback_name);
            set_active_profile_state(app, &fallback_relative)?;
            let content = fs::read_to_string(absolute_profile_path(app, &fallback_relative)?)
                .map_err(|error| format!("Failed to read fallback profile: {error}"))?;
            return Ok(Some((fallback_relative, content)));
        }

        set_active_profile_state(app, DEFAULT_PROFILE_RELATIVE)?;
        ensure_file(&absolute_profile_path(app, DEFAULT_PROFILE_RELATIVE)?, "")?;
        return Ok(Some((DEFAULT_PROFILE_RELATIVE.to_string(), String::new())));
    }

    Ok(None)
}

pub fn read_calibration_preset(app: &AppHandle) -> Result<String, String> {
    ensure_required_files(app)?;
    let path = calibration_preset_path(app)?;
    ensure_file(&path, "")?;
    fs::read_to_string(path).map_err(|error| format!("Failed to read calibration preset: {error}"))
}

pub fn save_calibration_preset(app: &AppHandle, content: &str) -> Result<(), String> {
    ensure_required_files(app)?;
    let path = calibration_preset_path(app)?;
    fs::write(path, content).map_err(|error| format!("Failed to save calibration preset: {error}"))
}

pub fn calibration_preset_exists(app: &AppHandle) -> Result<bool, String> {
    Ok(calibration_preset_path(app)?.exists())
}

pub fn profile_name_from_relative_path(relative: &str) -> String {
    Path::new(relative)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(DEFAULT_PROFILE_NAME)
        .to_string()
}

pub fn calibration_profile_relative() -> String {
    CALIBRATION_PROFILE_RELATIVE.to_string()
}

pub fn get_runtime_mapping_state(app: &AppHandle) -> Result<RuntimeMappingState, String> {
    ensure_required_files(app)?;
    read_runtime_mapping_state(app)
}

pub fn set_mapping_enabled(app: &AppHandle, enabled: bool) -> Result<RuntimeMappingState, String> {
    ensure_required_files(app)?;
    let mut state = read_runtime_mapping_state(app)?;
    state.mapping_enabled = enabled;
    persist_runtime_mapping_state(app, &state)?;
    write_startup_file(app, &state)?;
    Ok(state)
}

pub fn set_autoload_enabled(app: &AppHandle, enabled: bool) -> Result<RuntimeMappingState, String> {
    ensure_required_files(app)?;
    let mut state = read_runtime_mapping_state(app)?;
    state.autoload_enabled = enabled;
    persist_runtime_mapping_state(app, &state)?;
    write_startup_file(app, &state)?;
    Ok(state)
}

pub fn effective_profile_for_state(state: &RuntimeMappingState) -> String {
    if state.mapping_enabled {
        state.applied_preview_path.clone().unwrap_or_else(|| state.active_profile_path.clone())
    } else {
        MAPPING_DISABLED_RELATIVE.to_string()
    }
}

pub fn list_autoload_rules(app: &AppHandle) -> Result<Vec<AutoloadRule>, String> {
    ensure_required_files(app)?;
    let dir = autoload_dir(app)?;
    ensure_dir(&dir)?;

    let mut rules = Vec::new();
    let entries = fs::read_dir(&dir)
        .map_err(|error| format!("Failed to read AutoLoad directory: {error}"))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to read AutoLoad entry: {error}"))?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("txt") {
            continue;
        }
        if path
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|file_name| file_name.eq_ignore_ascii_case("README.txt"))
        {
            continue;
        }
        rules.push(autoload_rule_from_path(app, &path)?);
    }

    rules.sort_by(|left, right| {
        left.process_name
            .to_ascii_lowercase()
            .cmp(&right.process_name.to_ascii_lowercase())
            .then_with(|| left.process_name.cmp(&right.process_name))
    });

    Ok(rules)
}

pub fn save_autoload_rule(
    app: &AppHandle,
    process_name: &str,
    profile_name: &str,
) -> Result<AutoloadRule, String> {
    ensure_required_files(app)?;
    let process = sanitize_process_name(process_name)?;
    let safe_profile = sanitize_profile_name(profile_name);
    let profile_relative = relative_profile_path_from_name(&safe_profile);
    let profile_absolute = absolute_profile_path(app, &profile_relative)?;
    if !profile_absolute.exists() {
        return Err(format!("Profile does not exist: {safe_profile}"));
    }

    let path = autoload_rule_path(app, &process)?;
    ensure_parent_dir(&path)?;
    fs::write(&path, format!("{profile_relative}\n"))
        .map_err(|error| format!("Failed to save AutoLoad rule: {error}"))?;
    autoload_rule_from_path(app, &path)
}

pub fn delete_autoload_rule(app: &AppHandle, process_name: &str) -> Result<bool, String> {
    ensure_required_files(app)?;
    let process = sanitize_process_name(process_name)?;
    let path = autoload_rule_path(app, &process)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(format!("Failed to delete AutoLoad rule: {error}")),
    }
}

pub fn sanitize_profile_name(raw_name: &str) -> String {
    let trimmed = raw_name.trim();
    let cleaned: String = trimmed
        .chars()
        .filter(|character| {
            character.is_alphanumeric()
                || matches!(character, '-' | '_' | '.' | ',' | '(' | ')' | '\'' | ' ')
        })
        .take(80)
        .collect();

    let normalized = cleaned.trim_end_matches(['.', ' ']);
    if normalized.is_empty() {
        "Profile".to_string()
    } else {
        normalized.to_string()
    }
}

pub fn runtime_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("jsm-runtime"))
}

/// Read a config file the way JoyShockMapper resolves an import: a path
/// relative to the runtime directory, which is both the mapper's working
/// directory and its config folder.
///
/// Not limited to profiles-library, because an import may legitimately point at
/// GyroConfigs or any other runtime subfolder. Every segment is checked instead,
/// so a path cannot climb out of the runtime directory. Missing returns Ok(None)
/// rather than an error: an import naming a file that is not there is something
/// the editor reports to the user, not a failure of the call.
pub fn read_runtime_config(app: &AppHandle, relative: &str) -> Result<Option<String>, String> {
    let normalized = relative.replace('\\', "/");
    let mut absolute = runtime_dir(app)?;
    let mut segments = 0;
    for segment in normalized.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." || segment.contains(':') {
            return Err(format!("Invalid config path: {relative}"));
        }
        absolute.push(segment);
        segments += 1;
    }
    if segments == 0 {
        return Err(format!("Invalid config path: {relative}"));
    }
    match fs::read_to_string(&absolute) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Failed to read {relative}: {error}")),
    }
}

pub fn backend_bin_dir(app: &AppHandle, backend: &str) -> Result<PathBuf, String> {
    let path = bundled_shared_dir(app)?.join(normalize_backend_choice(backend));
    if path.exists() {
        Ok(path)
    } else {
        Err(format!("Backend directory not found: {}", path.display()))
    }
}

pub fn jsm_executable_path(app: &AppHandle, backend: &str) -> Result<PathBuf, String> {
    let file_name = if cfg!(target_os = "windows") {
        "JoyShockMapper.exe"
    } else {
        "JoyShockMapper"
    };
    Ok(backend_bin_dir(app, backend)?.join(file_name))
}

pub fn console_injector_path(app: &AppHandle, backend: &str) -> Result<PathBuf, String> {
    let file_name = if cfg!(target_os = "windows") {
        "jsm-console-injector.exe"
    } else {
        "jsm-console-injector"
    };
    Ok(backend_bin_dir(app, backend)?.join(file_name))
}

pub fn bundled_jsm_executable_paths(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let file_name = if cfg!(target_os = "windows") {
        "JoyShockMapper.exe"
    } else {
        "JoyShockMapper"
    };

    let mut paths = Vec::new();
    for root in bundled_shared_dir_candidates(app) {
        for backend in ["SDL", "legacy"] {
            let path = root.join(normalize_backend_choice(backend)).join(file_name);
            if path.exists() && !paths.iter().any(|existing| existing == &path) {
                paths.push(path);
            }
        }
    }

    Ok(paths)
}

fn source_bundled_shared_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bin")
}

fn bundled_shared_dir_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if cfg!(dev) {
        candidates.push(source_bundled_shared_dir());
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("bin"));
    }

    candidates.push(source_bundled_shared_dir());

    candidates
}

fn bundled_shared_dir(app: &AppHandle) -> Result<PathBuf, String> {
    bundled_shared_dir_candidates(app)
        .into_iter()
        .find(|candidate| candidate.exists())
        .ok_or_else(|| {
            "Unable to resolve bundled bin directory for JoyShockMapper sidecars.".to_string()
        })
}

pub fn read_hidhide_state(app: &AppHandle) -> Result<HidHideState, String> {
    let path = hidhide_state_file(app)?;
    let raw = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(_) => return Ok(HidHideState::default()),
    };

    serde_json::from_str::<HidHideState>(&raw)
        .map_err(|error| format!("Failed to parse HidHide state: {error}"))
}

pub fn write_hidhide_state(app: &AppHandle, state: &HidHideState) -> Result<(), String> {
    let path = hidhide_state_file(app)?;
    ensure_parent_dir(&path)?;
    let content = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Failed to serialize HidHide state: {error}"))?;
    fs::write(path, content).map_err(|error| format!("Failed to write HidHide state: {error}"))
}

fn backend_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(BACKEND_FILE_NAME))
}

fn profile_library_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_dir(app)?.join(PROFILE_LIBRARY_RELATIVE))
}

fn calibration_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_dir(app)?.join("GyroConfigs"))
}

fn autoload_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_dir(app)?.join("AutoLoad"))
}

fn calibration_preset_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(calibration_dir(app)?.join("_3Dcalibrate.txt"))
}

fn startup_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_dir(app)?.join(STARTUP_FILE_NAME))
}

fn gui_state_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(GUI_STATE_FILE_NAME))
}

fn hidhide_state_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(HIDHIDE_STATE_FILE_NAME))
}

fn mapping_disabled_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_dir(app)?.join(MAPPING_DISABLED_FILE_NAME))
}

fn calibration_command_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_dir(app)?.join(CALIBRATION_COMMAND_FILE_NAME))
}

fn ensure_library_dir(app: &AppHandle) -> Result<(), String> {
    ensure_dir(&profile_library_dir(app)?)
}

fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path)
        .map_err(|error| format!("Failed to create directory {}: {error}", path.display()))
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    match path.parent() {
        Some(parent) => ensure_dir(parent),
        None => Ok(()),
    }
}

fn ensure_file(path: &Path, default_content: &str) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }

    ensure_parent_dir(path)?;
    fs::write(path, default_content)
        .map_err(|error| format!("Failed to initialize file {}: {error}", path.display()))
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))
}

fn legacy_app_data_dir(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let current = app_data_dir(app)?;
    let Some(parent) = current.parent() else {
        return Ok(None);
    };

    let legacy = parent.join(LEGACY_APP_IDENTIFIER);
    if legacy == current {
        return Ok(None);
    }

    Ok(Some(legacy))
}

fn migrate_legacy_app_data(app: &AppHandle) -> Result<(), String> {
    let Some(legacy_root) = legacy_app_data_dir(app)? else {
        return Ok(());
    };
    if !legacy_root.exists() {
        return Ok(());
    }

    let current_root = app_data_dir(app)?;
    ensure_dir(&current_root)?;

    copy_file_if_missing(&legacy_root.join(BACKEND_FILE_NAME), &backend_file(app)?)?;
    copy_file_if_missing(
        &legacy_root.join(GUI_STATE_FILE_NAME),
        &gui_state_file(app)?,
    )?;
    copy_file_if_missing(
        &legacy_root.join(AI_SETTINGS_FILE_NAME),
        &current_root.join(AI_SETTINGS_FILE_NAME),
    )?;

    let legacy_runtime_root = legacy_root.join("jsm-runtime");
    if !legacy_runtime_root.exists() {
        return Ok(());
    }

    let runtime_root = runtime_dir(app)?;
    ensure_dir(&runtime_root)?;

    copy_file_if_missing(
        &legacy_runtime_root.join(STARTUP_FILE_NAME),
        &startup_file(app)?,
    )?;
    copy_file_if_missing(
        &legacy_runtime_root.join(CALIBRATION_COMMAND_FILE_NAME),
        &calibration_command_file(app)?,
    )?;
    copy_file_if_missing(
        &legacy_runtime_root.join(MAPPING_DISABLED_FILE_NAME),
        &mapping_disabled_file(app)?,
    )?;

    // Only the reconnect hook is worth carrying over: OnReset.txt is
    // regenerated now and the chord layer did not exist in the legacy app.
    copy_file_if_missing(
        &legacy_runtime_root.join(RECONNECT_HOOK_FILE_NAME),
        &runtime_root.join(RECONNECT_HOOK_FILE_NAME),
    )?;

    copy_directory_files_if_missing(
        &legacy_runtime_root.join(PROFILE_LIBRARY_RELATIVE),
        &profile_library_dir(app)?,
        Some(&|file_name| file_name.to_ascii_lowercase().ends_with(".txt")),
    )?;
    copy_directory_files_if_missing(
        &legacy_runtime_root.join("GyroConfigs"),
        &calibration_dir(app)?,
        None,
    )?;
    copy_directory_files_if_missing(
        &legacy_runtime_root.join("AutoLoad"),
        &autoload_dir(app)?,
        None,
    )?;

    Ok(())
}

fn copy_file_if_missing(source_path: &Path, target_path: &Path) -> Result<(), String> {
    if target_path.exists() || !source_path.exists() {
        return Ok(());
    }

    ensure_parent_dir(target_path)?;
    fs::copy(source_path, target_path)
        .map(|_| ())
        .map_err(|error| {
            format!(
                "Failed to copy {} to {}: {error}",
                source_path.display(),
                target_path.display()
            )
        })
}

fn copy_directory_files_if_missing(
    source_dir: &Path,
    target_dir: &Path,
    include_file: Option<&dyn Fn(&str) -> bool>,
) -> Result<(), String> {
    if !source_dir.exists() {
        return Ok(());
    }

    ensure_dir(target_dir)?;

    for entry in fs::read_dir(source_dir)
        .map_err(|error| format!("Failed to read directory {}: {error}", source_dir.display()))?
    {
        let entry = entry.map_err(|error| format!("Failed to read directory entry: {error}"))?;
        if !entry
            .file_type()
            .map_err(|error| format!("Failed to inspect file type: {error}"))?
            .is_file()
        {
            continue;
        }

        let file_name = entry.file_name();
        let file_name_str = file_name.to_string_lossy();
        if let Some(filter) = include_file {
            if !filter(&file_name_str) {
                continue;
            }
        }

        copy_file_if_missing(&entry.path(), &target_dir.join(&file_name))?;
    }

    Ok(())
}

fn migrate_bundled_runtime_data(app: &AppHandle, backend: &str) -> Result<(), String> {
    let bundled_root = bundled_shared_dir(app)?;
    let backend_dir = backend_bin_dir(app, backend)?;

    copy_file_if_missing(&backend_dir.join(STARTUP_FILE_NAME), &startup_file(app)?)?;
    copy_file_if_missing(
        &backend_dir.join(CALIBRATION_COMMAND_FILE_NAME),
        &calibration_command_file(app)?,
    )?;
    copy_directory_files_if_missing(
        &bundled_root.join("profiles-library"),
        &profile_library_dir(app)?,
        Some(&|file_name| file_name.to_ascii_lowercase().ends_with(".txt")),
    )?;
    copy_directory_files_if_missing(
        &bundled_root.join("GyroConfigs"),
        &calibration_dir(app)?,
        None,
    )?;
    copy_directory_files_if_missing(
        &bundled_root.join("AutoLoad"),
        &autoload_dir(app)?,
        Some(&|file_name| !file_name.eq_ignore_ascii_case("README.txt")),
    )?;

    Ok(())
}

fn ensure_runtime_support_files(app: &AppHandle, backend: &str) -> Result<(), String> {
    let backend_dir = backend_bin_dir(app, backend)?;
    let runtime_root = runtime_dir(app)?;

    for file_name in USER_OWNED_LAYER_FILES {
        copy_file_if_missing(&backend_dir.join(file_name), &runtime_root.join(file_name))?;
    }

    let navigation_source = backend_dir.join(APP_NAVIGATION_FILE_NAME);
    if navigation_source.exists() {
        fs::copy(&navigation_source, runtime_root.join(APP_NAVIGATION_FILE_NAME))
            .map(|_| ())
            .map_err(|error| format!("Failed to refresh {APP_NAVIGATION_FILE_NAME}: {error}"))?;
    }

    // App-owned defaults are separate from user-authored OnReset hooks.
    let defaults = runtime_root.join("StudioDefaults.txt");
    let polling = read_runtime_mapping_state(app)?.default_polling_ms;
    fs::write(defaults, format!("# JSM Studio global defaults\nTICK_TIME = {polling}\n"))
        .map_err(|error| format!("Failed to write controller defaults: {error}"))?;

    Ok(())
}

/// The file stem of the running executable ("JSM Studio" for a packaged build).
/// AutoLoad matches rules by the foreground process's module name, so a rule
/// with this name fires whenever JSM Studio's own window is focused.
pub fn app_process_stem() -> Option<String> {
    std::env::current_exe()
        .ok()?
        .file_stem()?
        .to_str()
        .map(|stem| stem.to_string())
}

fn sync_app_navigation_rule(app: &AppHandle, state: &RuntimeMappingState) -> Result<(), String> {
    let Some(stem) = app_process_stem() else {
        return Ok(());
    };
    let path = autoload_rule_path(app, &stem)?;
    if state.controller_nav_enabled {
        ensure_parent_dir(&path)?;
        fs::write(&path, format!("{APP_NAVIGATION_FILE_NAME}\n"))
            .map_err(|error| format!("Failed to write controller navigation rule: {error}"))
    } else if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("Failed to remove controller navigation rule: {error}"))
    } else {
        Ok(())
    }
}

pub fn set_controller_nav_enabled(
    app: &AppHandle,
    enabled: bool,
) -> Result<RuntimeMappingState, String> {
    ensure_required_files(app)?;
    let mut state = read_runtime_mapping_state(app)?;
    state.controller_nav_enabled = enabled;
    persist_runtime_mapping_state(app, &state)?;
    sync_app_navigation_rule(app, &state)?;
    Ok(state)
}

pub fn set_default_polling_ms(app: &AppHandle, value: f64) -> Result<RuntimeMappingState, String> {
    if !value.is_finite() || !(1.0..=100.0).contains(&value) {
        return Err("Polling interval must be between 1 and 100 ms".to_string());
    }
    let mut state = read_runtime_mapping_state(app)?;
    state.default_polling_ms = value;
    persist_runtime_mapping_state(app, &state)?;
    ensure_runtime_support_files(app, &read_backend_choice(app)?)?;
    Ok(state)
}

fn chords_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_dir(app)?.join(CHORDS_FILE_NAME))
}

pub fn list_global_chords(app: &AppHandle) -> Result<Vec<GlobalChord>, String> {
    ensure_required_files(app)?;
    read_global_chords(app)
}

pub(crate) fn read_global_chords(app: &AppHandle) -> Result<Vec<GlobalChord>, String> {
    let path = chords_file(app)?;
    let raw = match fs::read_to_string(&path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("Failed to read {}: {error}", path.display())),
    };
    serde_json::from_str(&raw).map_err(|error| format!("Failed to parse {}: {error}", path.display()))
}

fn write_global_chords_list(app: &AppHandle, chords: &[GlobalChord]) -> Result<(), String> {
    let path = chords_file(app)?;
    ensure_parent_dir(&path)?;
    let content = serde_json::to_string_pretty(chords)
        .map_err(|error| format!("Failed to serialize chords: {error}"))?;
    fs::write(&path, content).map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

/// Creates or updates a chord (matched by id) and returns the full list.
pub fn save_global_chord(app: &AppHandle, chord: GlobalChord) -> Result<Vec<GlobalChord>, String> {
    if chord.id.trim().is_empty() || chord.profile_path.contains(['\n', '\r', '"']) {
        return Err("Invalid chord configuration.".into());
    }
    let relative = normalize_relative_profile_path(Some(&chord.profile_path)).ok_or("Invalid profile path")?;
    if !absolute_profile_path(app, &relative)?.is_file() { return Err("Chord configuration is missing.".into()); }
    let mut chords = list_global_chords(app)?;
    match chords.iter_mut().find(|existing| existing.id == chord.id) {
        Some(existing) => *existing = chord,
        None => chords.push(chord),
    }
    write_global_chords_list(app, &chords)?;
    Ok(chords)
}

pub fn delete_global_chord(app: &AppHandle, id: &str) -> Result<Vec<GlobalChord>, String> {
    let mut chords = list_global_chords(app)?;
    chords.retain(|existing| existing.id != id);
    write_global_chords_list(app, &chords)?;
    Ok(chords)
}

/// A fresh install (and anyone updating from before chords existed) gets one
/// working example instead of an empty list: a configuration bound to the
/// Quick Access button with a few sensible defaults, editable like any other
/// configuration once created. Called from inside `ensure_required_files`
/// itself (after it has already created the profile library directory), so
/// this deliberately avoids `generate_unique_profile_name` / `create_library_profile`
/// -- both re-enter `ensure_required_files` and would recurse forever here.
fn seed_default_chord_if_missing(app: &AppHandle) -> Result<(), String> {
    if chords_file(app)?.exists() {
        return Ok(());
    }
    let name = sanitize_profile_name(DEFAULT_CHORD_PROFILE_NAME);
    let relative = relative_profile_path_from_name(&name);
    let absolute = absolute_profile_path(app, &relative)?;
    ensure_file(&absolute, &(DEFAULT_CHORD_PROFILE_LINES.join("\n") + "\n"))?;
    write_global_chords_list(
        app,
        &[GlobalChord {
            id: "default".to_string(),
            buttons: vec![DEFAULT_CHORD_BUTTON.to_string()],
            profile_path: relative,
        }],
    )
}

fn profile_template_text() -> String {
    PROFILE_TEMPLATE_LINES.join("\n") + "\n"
}

fn startup_file_text(state: &RuntimeMappingState) -> String {
    let mut lines = STARTUP_HEADER_LINES
        .iter()
        .map(|line| (*line).to_string())
        .collect::<Vec<_>>();
    if state.mapping_enabled {
        lines.push(effective_profile_for_state(state));
        lines.push("AUTOCONNECT = ON".to_string());
        lines.push(format!(
            "AUTOLOAD = {}",
            if state.autoload_enabled { "ON" } else { "OFF" }
        ));
    } else {
        lines.push("AUTOCONNECT = ON".to_string());
        lines.push("AUTOLOAD = OFF".to_string());
        lines.push(MAPPING_DISABLED_RELATIVE.to_string());
    }
    lines.join("\n") + "\n"
}

fn mapping_disabled_text() -> String {
    MAPPING_DISABLED_LINES.join("\n") + "\n"
}

fn calibration_command_text(seconds: u32) -> String {
    format!("RESTART_GYRO_CALIBRATION\nSLEEP {seconds}\nFINISH_GYRO_CALIBRATION\n")
}

fn parse_sleep_seconds(content: &str) -> Option<u32> {
    content.lines().find_map(|line| {
        let trimmed = line.trim();
        let upper = trimmed.to_ascii_uppercase();
        upper
            .strip_prefix("SLEEP ")
            .and_then(|value| value.trim().parse::<u32>().ok())
    })
}

fn get_startup_profile_path(app: &AppHandle) -> Result<Option<String>, String> {
    let path = startup_file(app)?;
    let content = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };

    for line in content.lines().rev() {
        let trimmed = line.trim();
        if trimmed.to_ascii_lowercase().ends_with(".txt") {
            return Ok(Some(trimmed.to_string()));
        }
    }

    Ok(None)
}

fn get_startup_autoload_enabled(app: &AppHandle) -> Result<Option<bool>, String> {
    let path = startup_file(app)?;
    let content = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };

    for line in content.lines().rev() {
        let normalized = line.trim().replace(' ', "").to_ascii_uppercase();
        match normalized.as_str() {
            "AUTOLOAD=ON" => return Ok(Some(true)),
            "AUTOLOAD=OFF" => return Ok(Some(false)),
            _ => {}
        }
    }

    Ok(None)
}

fn write_startup_file(app: &AppHandle, state: &RuntimeMappingState) -> Result<(), String> {
    let path = startup_file(app)?;
    ensure_parent_dir(&path)?;
    fs::write(&path, startup_file_text(state))
        .map_err(|error| format!("Failed to write startup file: {error}"))
}

fn ensure_mapping_disabled_file(app: &AppHandle) -> Result<(), String> {
    let path = mapping_disabled_file(app)?;
    ensure_parent_dir(&path)?;
    fs::write(path, mapping_disabled_text())
        .map_err(|error| format!("Failed to write mapping disabled profile: {error}"))
}

fn ensure_runtime_mapping_state(app: &AppHandle) -> Result<RuntimeMappingState, String> {
    let path = gui_state_file(app)?;
    let mut should_persist = false;
    let mut state = match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<RuntimeMappingState>(&content) {
            Ok(value) => value,
            Err(_) => {
                should_persist = true;
                default_runtime_mapping_state(app)?
            }
        },
        Err(_) => {
            should_persist = true;
            default_runtime_mapping_state(app)?
        }
    };

    let normalized_active = normalize_relative_profile_path(Some(&state.active_profile_path))
        .unwrap_or_else(|| DEFAULT_PROFILE_RELATIVE.to_string());
    if normalized_active != state.active_profile_path {
        state.active_profile_path = normalized_active;
        should_persist = true;
    }

    ensure_file(
        &absolute_profile_path(app, &state.active_profile_path)?,
        &profile_template_text(),
    )?;

    if should_persist {
        persist_runtime_mapping_state(app, &state)?;
    }

    write_startup_file(app, &state)?;
    Ok(state)
}

fn default_runtime_mapping_state(app: &AppHandle) -> Result<RuntimeMappingState, String> {
    let startup_profile = get_startup_profile_path(app)?;
    let mapping_enabled = startup_profile
        .as_deref()
        .map(|candidate| !candidate.eq_ignore_ascii_case(MAPPING_DISABLED_RELATIVE))
        .unwrap_or(true);
    let active_profile_path = startup_profile
        .as_deref()
        .and_then(|candidate| normalize_relative_profile_path(Some(candidate)))
        .filter(|relative| {
            absolute_profile_path(app, relative)
                .map(|path| path.exists())
                .unwrap_or(false)
        })
        .unwrap_or_else(|| DEFAULT_PROFILE_RELATIVE.to_string());

    Ok(RuntimeMappingState {
        default_polling_ms: 3.0,
        active_profile_path,
        applied_preview_path: None,
        mapping_enabled,
        autoload_enabled: get_startup_autoload_enabled(app)?.unwrap_or(true),
        controller_nav_enabled: true,
        trackpad_overlay_enabled: false,
    })
}

pub(crate) fn read_runtime_mapping_state(app: &AppHandle) -> Result<RuntimeMappingState, String> {
    let path = gui_state_file(app)?;
    let raw = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(_) => return default_runtime_mapping_state(app),
    };

    let mut state = serde_json::from_str::<RuntimeMappingState>(&raw)
        .map_err(|error| format!("Failed to parse GUI runtime state: {error}"))?;
    state.active_profile_path = normalize_relative_profile_path(Some(&state.active_profile_path))
        .unwrap_or_else(|| DEFAULT_PROFILE_RELATIVE.to_string());
    Ok(state)
}

fn persist_runtime_mapping_state(
    app: &AppHandle,
    state: &RuntimeMappingState,
) -> Result<(), String> {
    let path = gui_state_file(app)?;
    ensure_parent_dir(&path)?;
    let content = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Failed to serialize GUI runtime state: {error}"))?;
    fs::write(path, content).map_err(|error| format!("Failed to write GUI runtime state: {error}"))
}

fn set_active_profile_state(app: &AppHandle, relative: &str) -> Result<(), String> {
    let normalized = normalize_relative_profile_path(Some(relative))
        .ok_or_else(|| format!("Invalid profile path: {relative}"))?;
    ensure_file(
        &absolute_profile_path(app, &normalized)?,
        &profile_template_text(),
    )?;
    let mut state = read_runtime_mapping_state(app)?;
    state.applied_preview_path = None;
    state.active_profile_path = normalized;
    persist_runtime_mapping_state(app, &state)?;
    write_startup_file(app, &state)
}

fn write_calibration_command_file(app: &AppHandle, seconds: u32) -> Result<(), String> {
    let path = calibration_command_file(app)?;
    ensure_parent_dir(&path)?;
    fs::write(&path, calibration_command_text(seconds))
        .map_err(|error| format!("Failed to write calibration command file: {error}"))
}

fn autoload_rule_path(app: &AppHandle, process_name: &str) -> Result<PathBuf, String> {
    Ok(autoload_dir(app)?.join(format!("{process_name}.txt")))
}

fn autoload_rule_from_path(app: &AppHandle, path: &Path) -> Result<AutoloadRule, String> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();
    let process_name = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();
    let content = fs::read_to_string(path).unwrap_or_default();
    let built_in = app_process_stem().is_some_and(|stem| stem.eq_ignore_ascii_case(&process_name));

    if let Some(profile_path) = parse_linked_autoload_profile(&content) {
        let missing_profile = !absolute_profile_path(app, &profile_path)?.exists();
        return Ok(AutoloadRule {
            process_name,
            file_name,
            kind: "profile".to_string(),
            profile_name: Some(profile_name_from_relative_path(&profile_path)),
            profile_path: Some(profile_path),
            missing_profile,
            built_in,
        });
    }

    Ok(AutoloadRule {
        process_name,
        file_name,
        kind: "advanced".to_string(),
        profile_name: None,
        profile_path: None,
        missing_profile: false,
        built_in,
    })
}

fn parse_linked_autoload_profile(content: &str) -> Option<String> {
    let meaningful_lines = content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#') && !line.starts_with("//"))
        .collect::<Vec<_>>();

    if meaningful_lines.len() != 1 {
        return None;
    }

    let value = meaningful_lines[0].trim_matches('"');
    normalize_relative_profile_path(Some(value))
}

fn update_autoload_profile_references(
    app: &AppHandle,
    old_relative: &str,
    new_relative: &str,
) -> Result<(), String> {
    let dir = autoload_dir(app)?;
    if !dir.exists() {
        return Ok(());
    }

    for entry in
        fs::read_dir(&dir).map_err(|error| format!("Failed to read AutoLoad directory: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Failed to read AutoLoad entry: {error}"))?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("txt") {
            continue;
        }
        let content = fs::read_to_string(&path).unwrap_or_default();
        if parse_linked_autoload_profile(&content)
            .as_deref()
            .is_some_and(|relative| relative.eq_ignore_ascii_case(old_relative))
        {
            fs::write(&path, format!("{new_relative}\n"))
                .map_err(|error| format!("Failed to update AutoLoad profile reference: {error}"))?;
        }
    }

    Ok(())
}

fn sanitize_process_name(raw_name: &str) -> Result<String, String> {
    let normalized = raw_name.trim().replace('\\', "/");
    let mut name = normalized
        .rsplit('/')
        .next()
        .unwrap_or_default()
        .trim()
        .to_string();

    for suffix in [".exe", ".txt"] {
        if name.to_ascii_lowercase().ends_with(suffix) {
            let next_len = name.len().saturating_sub(suffix.len());
            name.truncate(next_len);
        }
    }

    let cleaned = name
        .chars()
        .filter(|character| {
            character.is_alphanumeric() || matches!(character, '-' | '_' | '.' | ' ')
        })
        .take(80)
        .collect::<String>()
        .trim_matches(['.', ' '])
        .to_string();

    if cleaned.is_empty() {
        Err("Process name cannot be empty.".to_string())
    } else {
        Ok(cleaned)
    }
}

fn normalize_relative_profile_path(input: Option<&str>) -> Option<String> {
    let normalized = input?.replace('\\', "/");
    let stripped = normalized
        .strip_prefix("../profiles-library/")
        .or_else(|| normalized.strip_prefix("profiles-library/"))?;

    if stripped.is_empty() || stripped.starts_with('/') || stripped.contains("../") {
        return None;
    }

    Some(format!("{PROFILE_LIBRARY_RELATIVE}/{stripped}"))
}

fn absolute_profile_path(app: &AppHandle, relative_path: &str) -> Result<PathBuf, String> {
    let normalized = normalize_relative_profile_path(Some(relative_path))
        .ok_or_else(|| format!("Invalid profile path: {relative_path}"))?;
    let stripped = normalized
        .strip_prefix("profiles-library/")
        .ok_or_else(|| format!("Invalid profile path: {relative_path}"))?;

    let mut absolute = profile_library_dir(app)?;
    for segment in stripped.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err(format!("Invalid profile path segment: {relative_path}"));
        }
        absolute.push(segment);
    }

    Ok(absolute)
}

fn library_profile_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    Ok(profile_library_dir(app)?.join(format!("{name}.txt")))
}

fn relative_profile_path_from_name(name: &str) -> String {
    format!("{PROFILE_LIBRARY_RELATIVE}/{name}.txt")
}

fn generate_unique_profile_name(
    app: &AppHandle,
    preferred: Option<&str>,
) -> Result<String, String> {
    let existing = list_library_profiles(app)?;
    let used = existing
        .into_iter()
        .map(|entry| entry.to_ascii_lowercase())
        .collect::<Vec<_>>();

    let mut base = sanitize_profile_name(preferred.unwrap_or(DEFAULT_PROFILE_NAME));
    if base.is_empty() {
        base = DEFAULT_PROFILE_NAME.to_string();
    }

    let (prefix, mut counter) = split_trailing_counter(&base);
    let mut candidate = base.clone();

    while used
        .iter()
        .any(|entry| entry == &candidate.to_ascii_lowercase())
    {
        counter += 1;
        candidate = format!("{prefix} {counter}").trim().to_string();
    }

    Ok(candidate)
}

fn generate_copy_profile_name(app: &AppHandle, base_name: &str) -> Result<String, String> {
    let existing = list_library_profiles(app)?;
    let used = existing
        .into_iter()
        .map(|entry| entry.to_ascii_lowercase())
        .collect::<Vec<_>>();

    let safe_base = sanitize_profile_name(base_name);
    let root = safe_base.trim();
    let root = if root.is_empty() {
        DEFAULT_PROFILE_NAME
    } else {
        root
    };

    let mut counter = 0;
    let mut candidate = root.to_string();
    while used
        .iter()
        .any(|entry| entry == &candidate.to_ascii_lowercase())
    {
        counter += 1;
        candidate = format!("{root} ({counter})");
    }

    Ok(candidate)
}

fn split_trailing_counter(base: &str) -> (String, u32) {
    let mut digits = String::new();
    for character in base.chars().rev() {
        if character.is_ascii_digit() {
            digits.insert(0, character);
        } else {
            break;
        }
    }

    if digits.is_empty() {
        return (base.trim().to_string(), 1);
    }

    let prefix = base[..base.len() - digits.len()].trim();
    let normalized_prefix = if prefix.is_empty() {
        DEFAULT_PROFILE_NAME
            .trim_end_matches(|character: char| character.is_ascii_digit())
            .trim()
    } else {
        prefix
    };
    let counter = digits.parse::<u32>().unwrap_or(1);

    (normalized_prefix.to_string(), counter)
}

fn normalize_backend_choice(choice: &str) -> &'static str {
    if choice.eq_ignore_ascii_case("legacy") {
        "legacy"
    } else {
        "SDL"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_apply_preview_path_is_a_valid_profile_path() {
        // Apply writes here every time it runs. A path this rejects makes Apply
        // fail outright, which is exactly what a bare file name did.
        assert_eq!(
            normalize_relative_profile_path(Some(APPLIED_PREVIEW_RELATIVE)).as_deref(),
            Some(APPLIED_PREVIEW_RELATIVE)
        );
    }

    #[test]
    fn the_preview_name_and_path_agree() {
        // list_library_profile_names hides the preview by file stem, so the two
        // constants have to describe the same file.
        assert!(APPLIED_PREVIEW_RELATIVE.ends_with(&format!("/{APPLIED_PREVIEW_NAME}.txt")));
    }

    #[test]
    fn profile_paths_outside_the_library_are_rejected() {
        assert_eq!(normalize_relative_profile_path(Some("applied-preview.txt")), None);
        assert_eq!(normalize_relative_profile_path(Some("../secrets.txt")), None);
        assert_eq!(normalize_relative_profile_path(Some("profiles-library/../x.txt")), None);
    }
}

/// Remembers whether the trackpad overlay is on, so it comes back after a
/// restart instead of silently defaulting to off.
pub fn set_trackpad_overlay_enabled(
    app: &AppHandle,
    enabled: bool,
) -> Result<RuntimeMappingState, String> {
    ensure_required_files(app)?;
    let mut state = read_runtime_mapping_state(app)?;
    state.trackpad_overlay_enabled = enabled;
    persist_runtime_mapping_state(app, &state)?;
    Ok(state)
}

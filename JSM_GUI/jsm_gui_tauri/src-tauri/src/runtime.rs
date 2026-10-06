use std::{
    collections::HashMap,
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
const AUTOLOAD_MATCHES_FILE_NAME: &str = "autoload-matches.json";
/// Names Windows reserves for devices, with or without an extension: a file
/// called CON.txt cannot be created, and NUL.txt swallows every write.
const WINDOWS_RESERVED_NAMES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];
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
/// The exe stem before the rebrand, whose built-in rule is cleaned up on sync.
const LEGACY_APP_PROCESS_STEM: &str = "JSM Studio";
const USER_OWNED_LAYER_FILES: [&str; 1] = [RECONNECT_HOOK_FILE_NAME];
/// Registry of button(s) -> configuration for the global chord feature: hold
/// the button(s), the whole configuration swaps in; release, the configuration
/// that was active before the hold restores. Stored separately from the
/// profile library since a chord is metadata *about* a profile, not a profile.
const CHORDS_FILE_NAME: &str = "chords.json";
/// Name of the configuration a fresh install ships bound to the default
/// chord, and the chord's own default trigger button (Quick Access on Steam
/// Controller; "extra button 1" generically -- see MISC1 in schema.ts).
pub const DEFAULT_CHORD_PROFILE_NAME: &str = "Default Global Chords";
const DEFAULT_CHORD_PROFILE_LINES: [&str; 25] = [
    "RESET_MAPPINGS",
    "AUTOCONNECT = ON",
    "TELEMETRY_ENABLED = ON",
    "TELEMETRY_PORT = 8974",
    "TOUCHPAD_MODE = MOUSE",
    "RIGHT_TOUCHPAD_MODE = MOUSE",
    "LEFT_TOUCHPAD_MODE = SCROLL_WHEEL",
    "LLEFT = SCROLLUP",
    "LRIGHT = SCROLLDOWN",
    "ZR = LMOUSE",
    "ZL = RMOUSE",
    "W = \"OPEN_KEYBOARD\"",
    "S = ENTER",
    "E = ESC",
    "LEFT = LEFT",
    "RIGHT = RIGHT",
    "MISC2 = LMOUSE",
    "MISC3 = RMOUSE",
    "N = SCREENSHOT",
    "L = LALT\\ !TAB\\",
    "R = TAB",
    "UP = VOLUME_UP",
    "DOWN = VOLUME_DOWN",
    "RSL = \"TOGGLE_MAPPING\"",
    "RSR = \"CALIBRATE_GYRO\"",
];

fn default_polling_ms() -> f64 { 3.0 }
// JoyShockMapper's own defaults, in milliseconds (main.cpp's JSMSetting values).
fn default_hold_press_ms() -> f64 { 150.0 }
fn default_dbl_press_ms() -> f64 { 150.0 }
fn default_sim_press_ms() -> f64 { 50.0 }
fn default_turbo_period_ms() -> f64 { 80.0 }

fn default_calibration_seconds() -> f64 { DEFAULT_CALIBRATION_SECONDS as f64 }

fn no_sound() -> i32 { -1 }

/// The mapper's SOUND_ACTUATORS values, as Studio stores them (lower case).
pub const SOUND_ACTUATOR_CHOICES: [&str; 3] = ["grips", "pads", "both"];

fn default_sound_actuators() -> String { SOUND_ACTUATOR_CHOICES[0].to_string() }

/// A stored or submitted actuator choice, or the default for anything else.
fn validated_sound_actuators(value: &str) -> String {
    let lower = value.trim().to_ascii_lowercase();
    if SOUND_ACTUATOR_CHOICES.contains(&lower.as_str()) { lower } else { default_sound_actuators() }
}

fn default_true() -> bool {
    true
}

fn default_led_color() -> String { "#ffffff".to_string() }
fn default_led_brightness() -> i32 { 100 }

fn validated_led_color(value: &str) -> Result<String, String> {
    let hex = value.trim().trim_start_matches('#');
    if hex.len() != 6 || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("LED color must be a six-digit hex color".to_string());
    }
    Ok(format!("#{}", hex.to_ascii_lowercase()))
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMappingState {
    #[serde(default = "default_led_color")]
    pub led_color: String,
    #[serde(default = "default_led_brightness")]
    pub led_brightness: i32,
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
    /// How long CALIBRATE_GYRO calibrates for, and how long it waits first so
    /// the controller can be put down. Written to StudioDefaults.txt, so they
    /// hold for the Studio button, a chord and a binding alike.
    #[serde(default = "default_calibration_seconds")]
    pub gyro_calibration_seconds: f64,
    #[serde(default)]
    pub gyro_calibration_delay: f64,
    /// Built-in controller tune (0-13) played on connect / before a power-off
    /// JoyShockMapper sends. -1 = none.
    #[serde(default = "no_sound")]
    pub connect_sound: i32,
    #[serde(default = "no_sound")]
    pub shutdown_sound: i32,
    /// How loud those tunes play: the firmware's gain in dB, 0 = as recorded.
    #[serde(default)]
    pub sound_gain: i32,
    /// Switch off the Steam Controller's firmware gyro auto-calibration, which
    /// eats slow deliberate movements. On by default.
    #[serde(default = "default_true")]
    pub disable_hardware_gyro_calibration: bool,
    /// Whether the calibration HUD window appears over games. The run itself
    /// is the same either way; Studio's own countdown still shows.
    #[serde(default = "default_true")]
    pub calibration_hud_enabled: bool,
    /// Set once `controller_nav_enabled` has been moved to its redesign
    /// meaning. Before the redesign that switch mapped the controller to
    /// keyboard and mouse inside Studio, and people turned it off; now it is
    /// how Studio pauses the configuration and reads the pad itself, so an old
    /// "off" is not a choice about this feature and is reset to on once.
    #[serde(default)]
    pub studio_navigation_migrated: bool,
    /// The library configuration loaded when the front app has no AutoLoad
    /// rule of its own (Associations, "Desktop · Fallback"). JoyShockMapper's
    /// AutoLoad leaves whatever was last loaded in that case, so Studio does
    /// the load itself from the focus watcher.
    #[serde(default)]
    pub autoload_fallback_profile: Option<String>,
    #[serde(default)]
    pub autoload_fallback_enabled: bool,
    /// Press timing shared by every configuration (console refinement D8):
    /// written to StudioDefaults.txt, which every applied profile includes
    /// first, so a profile that still sets its own line wins while it runs.
    #[serde(default = "default_hold_press_ms")]
    pub hold_press_ms: f64,
    #[serde(default = "default_dbl_press_ms")]
    pub dbl_press_ms: f64,
    #[serde(default = "default_sim_press_ms")]
    pub sim_press_ms: f64,
    #[serde(default = "default_turbo_period_ms")]
    pub turbo_period_ms: f64,
    /// Trackpad orientation (TODO-41): degrees each pad's reading is turned,
    /// positive clockwise as the user sees it. Global, through
    /// StudioDefaults.txt: the pads' mounting angle is not per configuration.
    /// The 2026's pads are canted about 10.7 / -10.5 degrees.
    #[serde(default)]
    pub left_pad_rotation: f64,
    #[serde(default)]
    pub right_pad_rotation: f64,
    /// The Steam Controller's own power-on / power-off jingle volume, which the
    /// controller stores itself: 2 normal, 1 quiet, 0 off, -1 leave it alone.
    #[serde(default = "no_sound")]
    pub boot_sound_level: i32,
    /// The first time a Steam Controller shows up, Studio asks whether to
    /// silence that jingle so its own connect sound plays alone. Either answer
    /// sets this and the question is never asked again.
    #[serde(default)]
    pub firmware_sound_prompt_done: bool,
    /// A library sound (services/sound_library.rs id) to play instead of the
    /// built-in tune above. Takes precedence over `connect_sound` /
    /// `shutdown_sound` when set; None means the built-in choice stands.
    #[serde(default)]
    pub connect_sound_file: Option<String>,
    #[serde(default)]
    pub shutdown_sound_file: Option<String>,
    /// Which of the controller's actuators play those sequences: "grips" (the
    /// two motors behind the grips, where the firmware's own tunes play),
    /// "pads" (the trackpads' actuators) or "both".
    #[serde(default = "default_sound_actuators")]
    pub sound_actuators: String,
}

/// Any of the global timing values, as the Timing page changes them one at a time.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalTiming {
    pub polling_ms: Option<f64>,
    pub hold_press_ms: Option<f64>,
    pub dbl_press_ms: Option<f64>,
    pub sim_press_ms: Option<f64>,
    pub turbo_period_ms: Option<f64>,
}

/// The fallback as the UI sees it: a library profile name, or none.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoloadFallback {
    pub profile_name: Option<String>,
    pub enabled: bool,
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
    /// Kept but not used: the file is named `<app>.txt.paused`, which the
    /// mapper's AutoLoad does not match, so pausing is a rename and loses nothing.
    #[serde(default)]
    pub paused: bool,
    /// Unix milliseconds of the last time this app came to the front while the
    /// rule was live, from `autoload-matches.json`. Left out when never seen.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_matched_at_ms: Option<u64>,
    /// The executable the association was made from (TODO-46), remembered in
    /// the rule file as a `# exe: <path>` comment the mapper ignores. It is
    /// what the game's icon is read from. Left out for rules written by hand
    /// or before the comment existed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exe_path: Option<String>,
}

/// A library profile's file facts, for the Configurations page.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryProfileMeta {
    pub name: String,
    pub modified_at_ms: u64,
}

/// What `delete_library_profile` did: whether the file went to the recycle bin
/// (or was removed outright when that failed), and the configuration made
/// active in its place, if any.
pub struct DeletedProfile {
    pub recycled: bool,
    pub fallback: Option<(String, String)>,
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
    #[serde(default)] pub buttons: Vec<String>,
    #[serde(default)] pub trigger_groups: Vec<Vec<String>>,
    #[serde(default)] pub controller_model: Option<String>,
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
    migrate_calibration_script(app)?;
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
    write_calibration_command_file(app)?;

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
    write_file_atomically(&path, &content)
        .map_err(|error| format!("Failed to persist backend choice: {error}"))?;
    Ok(normalized)
}

pub fn read_calibration_seconds(app: &AppHandle) -> Result<u32, String> {
    Ok(read_runtime_mapping_state(app)?.gyro_calibration_seconds.round().max(1.0) as u32)
}

pub fn write_calibration_seconds(app: &AppHandle, seconds: u32) -> Result<u32, String> {
    let mut state = read_runtime_mapping_state(app)?;
    state.gyro_calibration_seconds = (seconds as f64).clamp(0.5, 60.0);
    persist_runtime_mapping_state(app, &state)?;
    ensure_runtime_support_files(app, &read_backend_choice(app)?)?;
    Ok(seconds)
}

/// RecalibrateGyro.txt used to carry the duration itself (RESTART_GYRO_CALIBRATION,
/// SLEEP n, FINISH_GYRO_CALIBRATION). Carry a customised n into the setting once,
/// before the file is rewritten to just CALIBRATE_GYRO.
fn migrate_calibration_script(app: &AppHandle) -> Result<(), String> {
    let Some(seconds) = fs::read_to_string(calibration_command_file(app)?)
        .ok()
        .as_deref()
        .and_then(parse_sleep_seconds)
    else {
        return Ok(());
    };
    let mut state = read_runtime_mapping_state(app)?;
    state.gyro_calibration_seconds = (seconds as f64).clamp(0.5, 60.0);
    persist_runtime_mapping_state(app, &state)
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
    write_file_atomically(&absolute, content).map_err(|error| format!("Failed to write profile: {error}"))?;
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
    Ok(list_library_profile_entries(app)?.into_iter().map(|(name, _)| name).collect())
}

/// The same files as `list_library_profiles`, with each file's last write as
/// Unix milliseconds. A file whose time cannot be read reports 0 rather than
/// dropping out of the list: the Configurations page still has to show it.
pub fn list_library_profile_meta(app: &AppHandle) -> Result<Vec<LibraryProfileMeta>, String> {
    ensure_required_files(app)?;
    Ok(list_library_profile_entries(app)?
        .into_iter()
        .map(|(name, path)| LibraryProfileMeta {
            name,
            modified_at_ms: fs::metadata(&path)
                .and_then(|meta| meta.modified())
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|elapsed| elapsed.as_millis() as u64)
                .unwrap_or(0),
        })
        .collect())
}

/// Every configuration in the library as (name, path), sorted by name; the
/// one listing behind the names, the meta and the profile watcher.
fn list_library_profile_entries(app: &AppHandle) -> Result<Vec<(String, PathBuf)>, String> {
    let mut entries_out = Vec::new();
    let entries = fs::read_dir(profile_library_dir(app)?)
        .map_err(|error| format!("Failed to read profile library: {error}"))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to read profile entry: {error}"))?;
        let path = entry.path();
        let paused = path.extension().and_then(|ext| ext.to_str()) == Some("paused")
            && path.file_stem().and_then(|stem| Path::new(stem).extension()).and_then(|ext| ext.to_str()) == Some("txt");
        if path.extension().and_then(|ext| ext.to_str()) != Some("txt") && !paused {
            continue;
        }
        if let Some(stem) = path.file_stem().and_then(|value| value.to_str()) {
            // The Apply preview is a real file in this directory, but it is not
            // one of the user's configurations and must not appear as one.
            if stem == APPLIED_PREVIEW_NAME {
                continue;
            }
            entries_out.push((stem.to_string(), path.clone()));
        }
    }

    entries_out.sort_by(|(left, _), (right, _)| {
        left.to_ascii_lowercase()
            .cmp(&right.to_ascii_lowercase())
            .then_with(|| left.cmp(right))
    });

    Ok(entries_out)
}

pub fn save_library_profile(app: &AppHandle, name: &str, content: &str) -> Result<String, String> {
    ensure_library_dir(app)?;
    let safe_name = sanitize_profile_name(name);
    protect_builtin_profile(&safe_name)?;
    let path = library_profile_path(app, &safe_name)?;
    write_file_atomically(path, content).map_err(|error| format!("Failed to save profile: {error}"))?;
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
    write_file_atomically(&absolute, &content).map_err(|error| format!("Failed to create profile: {error}"))?;
    Ok((relative, content))
}

pub fn rename_library_profile(
    app: &AppHandle,
    old_name: &str,
    new_name: &str,
) -> Result<(String, String), String> {
    ensure_required_files(app)?;
    let safe_old = sanitize_profile_name(old_name);
    protect_builtin_profile(&safe_old)?;
    let mut safe_new = sanitize_profile_name(new_name);

    if safe_new.is_empty() {
        return Err("New profile name cannot be empty.".to_string());
    }

    if safe_old == safe_new {
        let relative = relative_profile_path_from_name(&safe_old);
        let content = fs::read_to_string(absolute_profile_path(app, &relative)?)
            .map_err(|error| format!("Failed to load profile during rename: {error}"))?;
        return Ok((relative, content));
    }
    // "wardogs" -> "Wardogs" is a real rename: NTFS keeps the case, the
    // listing shows it, and a rule or chord pointing at the old spelling is
    // matched ignoring case below. It used to be treated as a no-op.
    let case_only = safe_old.eq_ignore_ascii_case(&safe_new);

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
    // the contents across and drop the original in that case -- except for a
    // case-only rename, where old and new are the same file and the copy
    // then the remove would delete it.
    if let Err(rename_error) = fs::rename(&old_absolute, &new_absolute) {
        if case_only {
            return Err(format!("Failed to rename profile: {rename_error}"));
        }
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
    write_file_atomically(&copy_absolute, &content)
        .map_err(|error| format!("Failed to copy profile: {error}"))?;
    Ok((copy_relative, content))
}

pub fn delete_library_profile(
    app: &AppHandle,
    name: &str,
) -> Result<DeletedProfile, String> {
    ensure_required_files(app)?;
    let safe_name = sanitize_profile_name(name);
    protect_builtin_profile(&safe_name)?;
    let relative = relative_profile_path_from_name(&safe_name);
    let absolute = absolute_profile_path(app, &relative)?;
    let active = read_runtime_mapping_state(app)?.active_profile_path;
    if active.eq_ignore_ascii_case(&relative) || list_global_chords(app)?.iter().any(|chord| chord.profile_path.eq_ignore_ascii_case(&relative)) {
        return Err("Configuration is in use. Apply another configuration and remove chord references first.".into());
    }
    // The recycle bin first, so a wrong click is undoable from Explorer. The
    // shell can refuse (a volume with no bin, a path it cannot resolve); then
    // the file goes outright and the caller is told which happened.
    let recycled = match trash::delete(&absolute) {
        Ok(()) => true,
        Err(error) => {
            eprintln!("Recycle bin refused {}: {error}; removing outright", absolute.display());
            fs::remove_file(&absolute).map_err(|error| format!("Failed to delete profile: {error}"))?;
            false
        }
    };

    let active = read_runtime_mapping_state(app)?.active_profile_path;
    if active.eq_ignore_ascii_case(&relative) {
        let remaining = list_library_profiles(app)?;
        if let Some(fallback_name) = remaining.first() {
            let fallback_relative = relative_profile_path_from_name(fallback_name);
            set_active_profile_state(app, &fallback_relative)?;
            let content = fs::read_to_string(absolute_profile_path(app, &fallback_relative)?)
                .map_err(|error| format!("Failed to read fallback profile: {error}"))?;
            return Ok(DeletedProfile { recycled, fallback: Some((fallback_relative, content)) });
        }

        set_active_profile_state(app, DEFAULT_PROFILE_RELATIVE)?;
        ensure_file(&absolute_profile_path(app, DEFAULT_PROFILE_RELATIVE)?, "")?;
        return Ok(DeletedProfile { recycled, fallback: Some((DEFAULT_PROFILE_RELATIVE.to_string(), String::new())) });
    }

    Ok(DeletedProfile { recycled, fallback: None })
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
    write_file_atomically(path, content).map_err(|error| format!("Failed to save calibration preset: {error}"))
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

pub fn set_calibration_hud_enabled(app: &AppHandle, enabled: bool) -> Result<RuntimeMappingState, String> {
    ensure_required_files(app)?;
    let mut state = read_runtime_mapping_state(app)?;
    state.calibration_hud_enabled = enabled;
    persist_runtime_mapping_state(app, &state)?;
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
        // A paused rule is `<app>.txt.paused`: still a rule, shown switched off.
        if !is_autoload_rule_file(&path) {
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

    let matches = read_autoload_matches(app);
    for rule in &mut rules {
        rule.last_matched_at_ms = matches.get(&rule.process_name.to_ascii_lowercase()).copied();
    }

    rules.sort_by(|left, right| {
        left.process_name
            .to_ascii_lowercase()
            .cmp(&right.process_name.to_ascii_lowercase())
            .then_with(|| left.process_name.cmp(&right.process_name))
    });

    Ok(rules)
}

/// Writes or rewrites the rule for `process_name`. `exe_path` given replaces
/// the executable the rule remembers; none keeps what it had. `auto_apply`
/// Some(true) makes the rule live, Some(false) parks it as an association that
/// only lends its icon (TODO-46), None leaves the paused state as it was.
pub fn save_autoload_rule(
    app: &AppHandle,
    process_name: &str,
    profile_name: &str,
    exe_path: Option<&str>,
    auto_apply: Option<bool>,
) -> Result<AutoloadRule, String> {
    ensure_required_files(app)?;
    let process = sanitize_process_name(process_name)?;
    let safe_profile = sanitize_profile_name(profile_name);
    let profile_relative = relative_profile_path_from_name(&safe_profile);
    let profile_absolute = absolute_profile_path(app, &profile_relative)?;
    if !profile_absolute.exists() {
        return Err(format!("Profile does not exist: {safe_profile}"));
    }

    let path = write_autoload_rule_file(&autoload_dir(app)?, &process, &profile_relative, exe_path, auto_apply)?;
    autoload_rule_from_path(app, &path)
}

/// The file behind `save_autoload_rule`, on a directory so it can be tested
/// without an app handle. A paused rule stays paused when only its
/// configuration changes; asking for auto-apply moves it between
/// `<process>.txt` and `<process>.txt.paused`, and the other twin is removed
/// so the mapper never sees two rules for one app.
fn write_autoload_rule_file(
    dir: &Path,
    process: &str,
    profile_relative: &str,
    exe_path: Option<&str>,
    auto_apply: Option<bool>,
) -> Result<PathBuf, String> {
    let active = dir.join(format!("{process}.txt"));
    let parked = dir.join(format!("{process}.txt.paused"));
    let existing = [&parked, &active].into_iter().find(|path| path.exists());
    let remembered = existing
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|content| parse_autoload_exe_path(&content));
    let exe = exe_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or(remembered);

    let paused = match auto_apply {
        Some(live) => !live,
        None => parked.exists(),
    };
    let (target, stale) = if paused { (parked, active) } else { (active, parked) };
    ensure_parent_dir(&target)?;
    write_file_atomically(&target, autoload_rule_text(profile_relative, exe.as_deref()))
        .map_err(|error| format!("Failed to save AutoLoad rule: {error}"))?;
    if stale.exists() {
        fs::remove_file(&stale).map_err(|error| format!("Failed to replace AutoLoad rule: {error}"))?;
    }
    Ok(target)
}

/// A rule file's text: the configuration it loads, then the executable the
/// association remembers as a comment, which JoyShockMapper skips.
fn autoload_rule_text(profile_relative: &str, exe_path: Option<&str>) -> String {
    match exe_path {
        Some(exe) => format!("{profile_relative}\n# exe: {exe}\n"),
        None => format!("{profile_relative}\n"),
    }
}

/// The `# exe: <path>` line of a rule file, if it has one.
fn parse_autoload_exe_path(content: &str) -> Option<String> {
    content
        .lines()
        .map(str::trim)
        .filter_map(|line| line.strip_prefix('#'))
        .map(str::trim_start)
        .filter_map(|line| line.strip_prefix("exe:"))
        .map(|value| value.trim().trim_matches('"').to_string())
        .find(|value| !value.is_empty())
}

pub fn delete_autoload_rule(app: &AppHandle, process_name: &str) -> Result<bool, String> {
    ensure_required_files(app)?;
    let process = sanitize_process_name(process_name)?;
    let _ = fs::remove_file(paused_autoload_rule_path(app, &process)?);
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
    } else if is_windows_reserved_name(normalized) {
        // Keep what was typed recognisable rather than swapping in "Profile".
        format!("{normalized}_")
    } else {
        normalized.to_string()
    }
}

/// Windows applies the reservation to the part before the first dot, so
/// "con", "CON.txt" and "Con.old" are all the console.
fn is_windows_reserved_name(name: &str) -> bool {
    let head = name.split('.').next().unwrap_or_default().trim();
    WINDOWS_RESERVED_NAMES.iter().any(|reserved| reserved.eq_ignore_ascii_case(head))
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
    write_file_atomically(path, content).map_err(|error| format!("Failed to write HidHide state: {error}"))
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

/// Whether AutoLoad will load something for this process: a `<name>.txt` rule
/// that is not paused. Matches the way JoyShockMapper compares names.
pub fn has_live_autoload_rule(app: &AppHandle, process_stem: &str) -> bool {
    let Ok(entries) = autoload_dir(app).and_then(|dir| fs::read_dir(dir).map_err(|error| error.to_string())) else {
        return false;
    };
    entries.flatten().any(|entry| {
        let name = entry.file_name().to_string_lossy().to_string();
        let lower = name.to_ascii_lowercase();
        lower.ends_with(".txt")
            && name.split('.').next().is_some_and(|stem| stem.eq_ignore_ascii_case(process_stem))
    })
}

/// Last time each rule's app came to the front while its rule was live,
/// keyed by lower-cased process name. Studio's own record: JoyShockMapper
/// does not report AutoLoad hits, and the focus watcher already asks who took
/// the front, so the answer is written down there.
fn autoload_matches_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(AUTOLOAD_MATCHES_FILE_NAME))
}

fn read_autoload_matches(app: &AppHandle) -> HashMap<String, u64> {
    // Missing or unparseable is an empty record, not an error: this is a
    // convenience column, and a bad file must not take the Associations page
    // down with it.
    autoload_matches_file(app)
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<HashMap<String, u64>>(&raw).ok())
        .unwrap_or_default()
}

/// Records that `process_stem`'s rule just fired, as Unix milliseconds.
pub fn record_autoload_match(app: &AppHandle, process_stem: &str) -> Result<(), String> {
    let mut matches = read_autoload_matches(app);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0);
    matches.insert(process_stem.to_ascii_lowercase(), now);
    let path = autoload_matches_file(app)?;
    let content = serde_json::to_string_pretty(&matches)
        .map_err(|error| format!("Failed to serialize AutoLoad matches: {error}"))?;
    write_file_atomically(&path, content).map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

pub fn get_autoload_fallback(app: &AppHandle) -> Result<AutoloadFallback, String> {
    let state = read_runtime_mapping_state(app)?;
    Ok(AutoloadFallback {
        profile_name: state.autoload_fallback_profile,
        enabled: state.autoload_fallback_enabled,
    })
}

/// Stores the fallback. The name is sanitized like any library name and must
/// exist when given; "enabled" with no name is allowed (nothing loads until a
/// configuration is picked) so the switch and the picker can be set in
/// either order.
pub fn set_autoload_fallback(app: &AppHandle, fallback: AutoloadFallback) -> Result<AutoloadFallback, String> {
    ensure_required_files(app)?;
    let profile_name = match fallback.profile_name.as_deref().map(str::trim) {
        Some(name) if !name.is_empty() => {
            let safe = sanitize_profile_name(name);
            if !library_profile_path(app, &safe)?.is_file() {
                return Err(format!("Profile does not exist: {safe}"));
            }
            Some(safe)
        }
        _ => None,
    };
    let mut state = read_runtime_mapping_state(app)?;
    state.autoload_fallback_profile = profile_name;
    state.autoload_fallback_enabled = fallback.enabled;
    persist_runtime_mapping_state(app, &state)?;
    Ok(AutoloadFallback {
        profile_name: state.autoload_fallback_profile,
        enabled: state.autoload_fallback_enabled,
    })
}

/// The library path the focus watcher loads for an app without a rule, when
/// the fallback is on, named, and its file is still there. None otherwise.
pub fn autoload_fallback_profile_path(app: &AppHandle, state: &RuntimeMappingState) -> Option<String> {
    if !state.autoload_fallback_enabled {
        return None;
    }
    let name = state.autoload_fallback_profile.as_deref()?;
    let safe = sanitize_profile_name(name);
    let relative = relative_profile_path_from_name(&safe);
    absolute_profile_path(app, &relative).ok()?.is_file().then_some(relative)
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

/// Write a file so that a reader never sees it half-written.
///
/// JoyShockMapper is a separate process that reads these files the moment we
/// tell it to, and `fs::write` truncates before it writes: a reader that opens
/// the file inside that window gets an empty or partial file. That is not
/// theoretical. Applying a configuration while the Quick Access chord was in
/// play produced a load that ran the RESET_MAPPINGS preamble and then stopped
/// -- no VIRTUAL_CONTROLLER, no bindings, every input left unmapped -- because
/// JoyShockMapper opened applied-preview.txt between the truncate and the
/// write. The same window can leave gui-state.json unparseable after a crash,
/// which is how a session loses its active configuration.
///
/// The temporary file is created beside the target so the rename stays on one
/// volume, where Windows replaces atomically as far as any reader is
/// concerned. Its extension is deliberately not `.txt`, so a half-written
/// profile can never show up in the library listing.
pub(crate) fn write_file_atomically(path: impl AsRef<Path>, content: impl AsRef<[u8]>) -> Result<(), String> {
    let path = path.as_ref();
    ensure_parent_dir(path)?;
    let temp = path.with_extension(format!("jsmtmp{}", std::process::id()));
    fs::write(&temp, content.as_ref())
        .map_err(|error| format!("Failed to write {}: {error}", temp.display()))?;

    // A reader holding the target open blocks the replace on Windows, and
    // JoyShockMapper reads these files constantly. Its reads are short, so a
    // brief retry turns a collision into a small delay instead of a failed
    // apply. Failing loudly after that is still better than the silent
    // truncation this exists to prevent.
    let mut last = String::new();
    for attempt in 0..25 {
        match fs::rename(&temp, path) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last = error.to_string();
                if attempt < 24 {
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
            }
        }
    }
    let _ = fs::remove_file(&temp);
    Err(format!("Failed to replace {}: {last}", path.display()))
}

/// `write_file_atomically`, skipped when the file already holds `content`.
/// `ensure_required_files` runs on nearly every command, and each generated
/// file it rewrote was a rename JoyShockMapper could be reading across, plus a
/// changed mtime for anything watching the folder. Same treatment the
/// navigation profile already got.
fn write_file_if_changed(path: impl AsRef<Path>, content: impl AsRef<[u8]>) -> Result<(), String> {
    let path = path.as_ref();
    if fs::read(path).ok().as_deref() == Some(content.as_ref()) {
        return Ok(());
    }
    write_file_atomically(path, content)
}

fn ensure_file(path: &Path, default_content: &str) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }

    ensure_parent_dir(path)?;
    write_file_atomically(path, default_content)
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

    // This runs on nearly every command, including the ones that fire when
    // Studio's window comes to the front -- the very moment AutoLoad (and
    // hand_pad_to_studio) tell the mapper to read this file. fs::copy truncates
    // the target first, so a reader in that window gets an empty or partial
    // navigation profile. Replace it atomically, and only when it changed.
    let navigation_source = backend_dir.join(APP_NAVIGATION_FILE_NAME);
    if let Ok(bundled) = fs::read(&navigation_source) {
        write_file_if_changed(runtime_root.join(APP_NAVIGATION_FILE_NAME), &bundled)
            .map_err(|error| format!("Failed to refresh {APP_NAVIGATION_FILE_NAME}: {error}"))?;
    }

    // App-owned defaults are separate from user-authored OnReset hooks.
    let defaults = runtime_root.join("StudioDefaults.txt");
    write_file_if_changed(defaults, studio_defaults_text(&read_runtime_mapping_state(app)?))
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
    // The rule was named after the exe, so the rename left a "JSM Studio"
    // rule behind on upgraded installs; it can never match again, so drop it.
    if !stem.eq_ignore_ascii_case(LEGACY_APP_PROCESS_STEM) {
        if let Ok(legacy) = autoload_rule_path(app, LEGACY_APP_PROCESS_STEM) {
            let is_ours = fs::read_to_string(&legacy).map(|s| s.trim() == APP_NAVIGATION_FILE_NAME).unwrap_or(false);
            if is_ours {
                let _ = fs::remove_file(&legacy);
            }
        }
    }
    let path = autoload_rule_path(app, &stem)?;
    if state.controller_nav_enabled {
        ensure_parent_dir(&path)?;
        write_file_if_changed(&path, format!("{APP_NAVIGATION_FILE_NAME}\n"))
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
    set_global_timing(app, GlobalTiming { polling_ms: Some(value), ..GlobalTiming::default() })
}

/// The global timing store: validates what changed, keeps it with the rest of
/// Studio's state and rewrites StudioDefaults.txt from it.
pub fn set_global_timing(app: &AppHandle, timing: GlobalTiming) -> Result<RuntimeMappingState, String> {
    let check = |value: Option<f64>, range: std::ops::RangeInclusive<f64>, what: &str| -> Result<(), String> {
        match value {
            Some(v) if !v.is_finite() || !range.contains(&v) => Err(format!("{what} must be between {} and {} ms", range.start(), range.end())),
            _ => Ok(()),
        }
    };
    check(timing.polling_ms, 1.0..=100.0, "Polling interval")?;
    check(timing.hold_press_ms, 1.0..=5000.0, "Hold time")?;
    check(timing.dbl_press_ms, 1.0..=5000.0, "Double-press window")?;
    check(timing.sim_press_ms, 1.0..=5000.0, "Simultaneous-press window")?;
    check(timing.turbo_period_ms, 1.0..=5000.0, "Turbo period")?;
    let mut state = read_runtime_mapping_state(app)?;
    if let Some(value) = timing.polling_ms { state.default_polling_ms = value; }
    if let Some(value) = timing.hold_press_ms { state.hold_press_ms = value; }
    if let Some(value) = timing.dbl_press_ms { state.dbl_press_ms = value; }
    if let Some(value) = timing.sim_press_ms { state.sim_press_ms = value; }
    if let Some(value) = timing.turbo_period_ms { state.turbo_period_ms = value; }
    // JoyShockMapper refuses a hold time at or under the simultaneous-press
    // window; say so here rather than have the mapper drop the line.
    if state.hold_press_ms <= state.sim_press_ms {
        return Err(format!("Hold time must be longer than the simultaneous-press window ({} ms)", state.sim_press_ms));
    }
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
    let chords=serde_json::from_str(&raw).map_err(|error| format!("Failed to parse {}: {error}", path.display()))?;
    Ok(merge_global_chords(chords))
}

pub fn reset_default_settings(app:&AppHandle)->Result<RuntimeMappingState,String> {
    let previous=read_runtime_mapping_state(app)?;
    let mut defaults=default_runtime_mapping_state(app)?;
    defaults.active_profile_path=previous.active_profile_path;
    defaults.applied_preview_path=previous.applied_preview_path;
    defaults.mapping_enabled=true;defaults.autoload_enabled=true;
    persist_runtime_mapping_state(app,&defaults)?;
    ensure_runtime_support_files(app,&read_backend_choice(app)?)?;
    let mut chords=read_global_chords(app)?;
    chords.retain(|c|c.profile_path!=default_global_chord().profile_path);
    chords.push(default_global_chord());
    write_global_chords_list(app,&chords)?;
    crate::services::virtual_keyboard::save_preferences(app,Default::default())?;
    Ok(defaults)
}
pub fn default_global_chord()->GlobalChord {
    GlobalChord { controller_model:None, id:"builtin-default".into(), buttons:vec![], trigger_groups:vec![vec!["HOME".into()],vec!["MISC1".into()]], profile_path:relative_profile_path_from_name(DEFAULT_CHORD_PROFILE_NAME) }
}
fn merge_global_chords(chords:Vec<GlobalChord>)->Vec<GlobalChord> {
    let mut merged:Vec<GlobalChord>=Vec::new();
    for mut chord in chords {
        if chord.trigger_groups.is_empty() && !chord.buttons.is_empty() {chord.trigger_groups.push(chord.buttons.clone());}
        chord.buttons.clear();
        if let Some(existing)=merged.iter_mut().find(|c|c.profile_path==chord.profile_path && c.controller_model==chord.controller_model) {
            for group in chord.trigger_groups {if !existing.trigger_groups.contains(&group) {existing.trigger_groups.push(group);}}
        } else {merged.push(chord);}
    }
    merged
}
fn write_global_chords_list(app: &AppHandle, chords: &[GlobalChord]) -> Result<(), String> {
    let path = chords_file(app)?;
    ensure_parent_dir(&path)?;
    let content = serde_json::to_string_pretty(chords)
        .map_err(|error| format!("Failed to serialize chords: {error}"))?;
    write_file_atomically(&path, content).map_err(|error| format!("Failed to write {}: {error}", path.display()))
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
    let chords=merge_global_chords(chords);
    write_global_chords_list(app, &chords)?;
    Ok(chords)
}

pub fn delete_global_chord(app: &AppHandle, id: &str) -> Result<Vec<GlobalChord>, String> {
    let mut chords = list_global_chords(app)?;
    chords.retain(|existing| existing.id != id);
    let chords=merge_global_chords(chords);
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
fn protect_builtin_profile(name:&str)->Result<(),String> {
    if name.eq_ignore_ascii_case(DEFAULT_CHORD_PROFILE_NAME) { Err("Built-in configurations cannot be edited, renamed or deleted. Clone as Personal first.".into()) } else {Ok(())}
}
/// Upgrade the former Studio comment into an ordinary quoted command while
/// preserving any real binding the user has since assigned to that input.
fn migrate_keyboard_command(text:&str)->Option<String> {
    let command=text.lines().find_map(|line|line.trim().strip_prefix("# @keyboard-open "))?.trim();
    if !["W","N","S","E"].contains(&command) {return None;}
    let mut found=false;
    let mut lines=Vec::new();
    for line in text.lines() {
        if line.trim().starts_with("# @keyboard-open ") {continue;}
        if let Some((input,value))=line.split_once('=') {
            if input.trim()==command {
                found=true;
                if value.split('#').next().unwrap_or("").trim()=="NONE" {lines.push(format!("{command} = \"OPEN_KEYBOARD\""));continue;}
            }
        }
        lines.push(line.into());
    }
    if !found {lines.push(format!("{command} = \"OPEN_KEYBOARD\""));}
    Some(lines.join("\n")+"\n")
}
fn seed_default_chord_if_missing(app: &AppHandle) -> Result<(), String> {
    let relative=relative_profile_path_from_name(DEFAULT_CHORD_PROFILE_NAME);
    let absolute=absolute_profile_path(app,&relative)?;
    let text=DEFAULT_CHORD_PROFILE_LINES.join("\n")+"\n";
    if fs::read_to_string(&absolute).ok().as_deref()!=Some(text.as_str()) {write_file_atomically(&absolute,text)?;}
    let marker=runtime_dir(app)?.join("default-chords-v2.seeded");
    if !marker.exists() {
        for entry in fs::read_dir(profile_library_dir(app)?).map_err(|e|e.to_string())? {
            let path=entry.map_err(|e|e.to_string())?.path();
            if path.is_file() && path.extension().is_some_and(|e|e=="txt") {
                let text=fs::read_to_string(&path).map_err(|e|e.to_string())?;
                if let Some(updated)=migrate_keyboard_command(&text) {write_file_atomically(&path,updated)?;}
            }
        }
        let mut chords=read_global_chords(app)?;
        // Seed once on first installation/upgrade; this marker survives removal
        // of the activation row, so listing profiles never adds it back.
        chords.retain(|c|!c.id.starts_with("builtin-"));
        if !chords.iter().any(|c|c.profile_path==relative) {chords.push(default_global_chord());}
        write_global_chords_list(app,&merge_global_chords(chords))?;
        write_file_atomically(marker,"2")?;
    }
    Ok(())
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

fn studio_defaults_text(state: &RuntimeMappingState) -> String {
    // The simultaneous-press window goes before the hold time: the mapper
    // rejects a hold time that is not longer than it.
    format!(
        "# JSM Evolved global defaults\nTICK_TIME = {}\nSIM_PRESS_WINDOW = {}\nHOLD_PRESS_TIME = {}\nDBL_PRESS_WINDOW = {}\nTURBO_PERIOD = {}\nGYRO_CALIBRATION_DELAY = {}\nGYRO_CALIBRATION_TIME = {}\nCONNECT_SOUND = {}\nSHUTDOWN_SOUND = {}\nSOUND_GAIN = {}\nDISABLE_HARDWARE_GYRO_CALIBRATION = {}\nLEFT_TOUCHPAD_ROTATION = {}\nRIGHT_TOUCHPAD_ROTATION = {}\nBOOT_SOUND_LEVEL = {}\nCONNECT_SOUND_FILE = {}\nSHUTDOWN_SOUND_FILE = {}\nSOUND_ACTUATORS = {}\nLIGHT_BAR = x{}\nLED_BRIGHTNESS = {}\n",
        state.default_polling_ms,
        state.sim_press_ms,
        state.hold_press_ms,
        state.dbl_press_ms,
        state.turbo_period_ms,
        state.gyro_calibration_delay,
        state.gyro_calibration_seconds,
        state.connect_sound,
        state.shutdown_sound,
        state.sound_gain,
        if state.disable_hardware_gyro_calibration { "ON" } else { "OFF" },
        state.left_pad_rotation,
        state.right_pad_rotation,
        state.boot_sound_level,
        sound_file_setting(state.connect_sound_file.as_deref()),
        sound_file_setting(state.shutdown_sound_file.as_deref()),
        validated_sound_actuators(&state.sound_actuators).to_ascii_uppercase(),
        state.led_color.trim_start_matches('#'),
        state.led_brightness,
    )
}

/// The value of a `*_SOUND_FILE` line. NONE is written, not omitted, when no
/// sound is chosen: the file is injected into a running mapper without a
/// reset, so a cleared choice has to be said out loud to reach it.
fn sound_file_setting(id: Option<&str>) -> String {
    match id {
        Some(id) if crate::services::sound_library::is_valid_sound_id(id) => {
            crate::services::sound_library::tones_relative_path(id)
        }
        _ => "NONE".to_string(),
    }
}

/// The timing lives in StudioDefaults.txt; this file only starts the run, so a
/// chord or binding pointed at it gets exactly what the Studio button does.
fn calibration_command_text() -> String {
    "CALIBRATE_GYRO\n".to_string()
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControllerPreferences {
    #[serde(default = "default_led_color")]
    pub led_color: String,
    #[serde(default = "default_led_brightness")]
    pub led_brightness: i32,
    pub gyro_calibration_seconds: f64,
    pub gyro_calibration_delay: f64,
    pub connect_sound: i32,
    pub shutdown_sound: i32,
    #[serde(default)]
    pub sound_gain: i32,
    #[serde(default = "default_true")]
    pub disable_hardware_gyro_calibration: bool,
    #[serde(default)]
    pub left_pad_rotation: f64,
    #[serde(default)]
    pub right_pad_rotation: f64,
    #[serde(default = "no_sound")]
    pub boot_sound_level: i32,
    #[serde(default)]
    pub firmware_sound_prompt_done: bool,
    #[serde(default)]
    pub connect_sound_file: Option<String>,
    #[serde(default)]
    pub shutdown_sound_file: Option<String>,
    #[serde(default = "default_sound_actuators")]
    pub sound_actuators: String,
}

pub fn set_controller_preferences(
    app: &AppHandle,
    preferences: ControllerPreferences,
) -> Result<RuntimeMappingState, String> {
    let finite = |value: f64, name: &str| {
        if value.is_finite() { Ok(value) } else { Err(format!("{name} must be a number")) }
    };
    let connect_sound_file = validated_sound_file(app, preferences.connect_sound_file, "Connect sound")?;
    let shutdown_sound_file = validated_sound_file(app, preferences.shutdown_sound_file, "Shutdown sound")?;
    let mut state = read_runtime_mapping_state(app)?;
    state.led_color = validated_led_color(&preferences.led_color)?;
    state.led_brightness = preferences.led_brightness.clamp(0, 100);
    state.gyro_calibration_seconds = finite(preferences.gyro_calibration_seconds, "Calibration time")?.clamp(0.5, 60.0);
    state.gyro_calibration_delay = finite(preferences.gyro_calibration_delay, "Calibration delay")?.clamp(0.0, 30.0);
    state.connect_sound = preferences.connect_sound.clamp(-1, 13);
    state.shutdown_sound = preferences.shutdown_sound.clamp(-1, 13);
    state.sound_gain = preferences.sound_gain.clamp(-30, 0);
    state.disable_hardware_gyro_calibration = preferences.disable_hardware_gyro_calibration;
    state.left_pad_rotation = finite(preferences.left_pad_rotation, "Left pad rotation")?.clamp(-180.0, 180.0);
    state.right_pad_rotation = finite(preferences.right_pad_rotation, "Right pad rotation")?.clamp(-180.0, 180.0);
    state.boot_sound_level = preferences.boot_sound_level.clamp(-1, 2);
    // A latch: once the first-connect question has been answered it stays
    // answered, so a save from a page that does not carry the flag (or an
    // older payload) cannot bring the prompt back.
    state.firmware_sound_prompt_done |= preferences.firmware_sound_prompt_done;
    state.connect_sound_file = connect_sound_file;
    state.shutdown_sound_file = shutdown_sound_file;
    state.sound_actuators = validated_sound_actuators(&preferences.sound_actuators);
    persist_runtime_mapping_state(app, &state)?;
    crate::services::virtual_keyboard::set_pad_orientation(state.left_pad_rotation,state.right_pad_rotation);
    ensure_runtime_support_files(app, &read_backend_choice(app)?)?;
    Ok(state)
}

/// A sound choice as the Preferences page sends it. A malformed id is refused
/// outright (nothing else should ever produce one); a well-formed id whose
/// sound is no longer converted or was removed behind Studio's back is
/// dropped to None with a note, so one missing folder does not block every
/// other preference on the page from saving.
fn validated_sound_file(app: &AppHandle, id: Option<String>, what: &str) -> Result<Option<String>, String> {
    let Some(id) = id.map(|id| id.trim().to_string()).filter(|id| !id.is_empty()) else {
        return Ok(None);
    };
    if !crate::services::sound_library::is_valid_sound_id(&id) {
        return Err(format!("{what}: invalid sound id {id}"));
    }
    if !crate::services::sound_library::is_ready(app, &id) {
        eprintln!("{what}: library sound {id} is not converted or is missing; using the built-in tune");
        return Ok(None);
    }
    Ok(Some(id))
}

/// A library sound is being deleted: a Connect or Shutdown choice pointing at
/// it goes back to None and StudioDefaults.txt is rewritten, so the mapper is
/// told NONE rather than left with a path to a file that is about to vanish.
pub(crate) fn clear_sound_file_selection(app: &AppHandle, id: &str) -> Result<(), String> {
    let mut state = read_runtime_mapping_state(app)?;
    let mut changed = false;
    for slot in [&mut state.connect_sound_file, &mut state.shutdown_sound_file] {
        if slot.as_deref() == Some(id) {
            *slot = None;
            changed = true;
        }
    }
    if !changed {
        return Ok(());
    }
    persist_runtime_mapping_state(app, &state)?;
    ensure_runtime_support_files(app, &read_backend_choice(app)?)
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
    write_file_if_changed(&path, startup_file_text(state))
        .map_err(|error| format!("Failed to write startup file: {error}"))
}

fn ensure_mapping_disabled_file(app: &AppHandle) -> Result<(), String> {
    let path = mapping_disabled_file(app)?;
    ensure_parent_dir(&path)?;
    write_file_if_changed(path, mapping_disabled_text())
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

    if !state.studio_navigation_migrated {
        state.controller_nav_enabled = true;
        state.studio_navigation_migrated = true;
        should_persist = true;
    }

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
        led_color: default_led_color(),
        led_brightness: default_led_brightness(),
        default_polling_ms: 3.0,
        active_profile_path,
        applied_preview_path: None,
        mapping_enabled,
        autoload_enabled: get_startup_autoload_enabled(app)?.unwrap_or(true),
        controller_nav_enabled: true,
        trackpad_overlay_enabled: false,
        gyro_calibration_seconds: default_calibration_seconds(),
        gyro_calibration_delay: 0.0,
        connect_sound: -1,
        shutdown_sound: -1,
        sound_gain: 0,
        disable_hardware_gyro_calibration: true,
        calibration_hud_enabled: true,
        studio_navigation_migrated: true,
        autoload_fallback_profile: None,
        autoload_fallback_enabled: false,
        hold_press_ms: default_hold_press_ms(),
        dbl_press_ms: default_dbl_press_ms(),
        sim_press_ms: default_sim_press_ms(),
        turbo_period_ms: default_turbo_period_ms(),
        left_pad_rotation: 0.0,
        right_pad_rotation: 0.0,
        boot_sound_level: -1,
        firmware_sound_prompt_done: false,
        connect_sound_file: None,
        shutdown_sound_file: None,
        sound_actuators: default_sound_actuators(),
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
    state.led_color = validated_led_color(&state.led_color).unwrap_or_else(|_| default_led_color());
    state.led_brightness = state.led_brightness.clamp(0, 100);
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
    write_file_atomically(path, content).map_err(|error| format!("Failed to write GUI runtime state: {error}"))
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

fn write_calibration_command_file(app: &AppHandle) -> Result<(), String> {
    let path = calibration_command_file(app)?;
    ensure_parent_dir(&path)?;
    write_file_if_changed(&path, calibration_command_text())
        .map_err(|error| format!("Failed to write calibration command file: {error}"))
}

fn autoload_rule_path(app: &AppHandle, process_name: &str) -> Result<PathBuf, String> {
    Ok(autoload_dir(app)?.join(format!("{process_name}.txt")))
}

fn paused_autoload_rule_path(app: &AppHandle, process_name: &str) -> Result<PathBuf, String> {
    Ok(autoload_dir(app)?.join(format!("{process_name}.txt.paused")))
}

/// Pauses or resumes one association by renaming its file.
pub fn set_autoload_rule_paused(app: &AppHandle, process_name: &str, paused: bool) -> Result<AutoloadRule, String> {
    ensure_required_files(app)?;
    let process = sanitize_process_name(process_name)?;
    let (active, parked) = (autoload_rule_path(app, &process)?, paused_autoload_rule_path(app, &process)?);
    let (from, to) = if paused { (&active, &parked) } else { (&parked, &active) };
    if from.exists() {
        fs::rename(from, to).map_err(|error| format!("Failed to {} AutoLoad rule: {error}", if paused { "pause" } else { "resume" }))?;
    }
    autoload_rule_from_path(app, if to.exists() { to } else { from })
}

fn autoload_rule_from_path(app: &AppHandle, path: &Path) -> Result<AutoloadRule, String> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();
    let paused = file_name.to_ascii_lowercase().ends_with(".txt.paused");
    let process_name = file_name
        .strip_suffix(".paused")
        .unwrap_or(&file_name)
        .rsplit_once('.')
        .map(|(stem, _)| stem.to_string())
        .unwrap_or_default();
    let content = fs::read_to_string(path).unwrap_or_default();
    let built_in = app_process_stem().is_some_and(|stem| stem.eq_ignore_ascii_case(&process_name));
    let exe_path = parse_autoload_exe_path(&content);

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
            paused,
            last_matched_at_ms: None,
            exe_path,
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
        paused,
        last_matched_at_ms: None,
        exe_path,
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
        // Paused rules included: resuming one must not point at the old name.
        if !is_autoload_rule_file(&path) {
            continue;
        }
        let content = fs::read_to_string(&path).unwrap_or_default();
        if let Some(retargeted) = retarget_autoload_rule_text(&content, old_relative, new_relative) {
            write_file_atomically(&path, retargeted)
                .map_err(|error| format!("Failed to update AutoLoad profile reference: {error}"))?;
        }
    }

    Ok(())
}

/// A rule file's text pointed at a renamed configuration, keeping the
/// executable it remembers; None when the rule loads something else.
fn retarget_autoload_rule_text(content: &str, old_relative: &str, new_relative: &str) -> Option<String> {
    let points_at_old = parse_linked_autoload_profile(content)
        .as_deref()
        .is_some_and(|relative| relative.eq_ignore_ascii_case(old_relative));
    points_at_old.then(|| autoload_rule_text(new_relative, parse_autoload_exe_path(content).as_deref()))
}

/// `<app>.txt` or its paused form `<app>.txt.paused`.
fn is_autoload_rule_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .is_some_and(|name| name.ends_with(".txt") || name.ends_with(".txt.paused"))
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
    } else if is_windows_reserved_name(&cleaned) {
        Err(format!("{cleaned} is a name Windows reserves for a device."))
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

pub(crate) fn absolute_profile_path(app: &AppHandle, relative_path: &str) -> Result<PathBuf, String> {
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

    #[test] fn legacy_keyboard_comment_becomes_regular_binding_without_overwriting_custom_actions() {
        let migrated=migrate_keyboard_command("# @keyboard-open W\nW = NONE # Open controller keyboard (Studio)\nS = ENTER\n").unwrap();
        assert_eq!(migrated,"W = \"OPEN_KEYBOARD\"\nS = ENTER\n");
        assert_eq!(migrate_keyboard_command("# @keyboard-open N\nN = SPACE\n").unwrap(),"N = SPACE\n");
        assert!(migrate_keyboard_command("W = SPACE\n").is_none());
    }
    #[test] fn legacy_chord_rows_merge_and_empty_list_stays_empty() {
        let a=GlobalChord{controller_model:None,id:"a".into(),buttons:vec!["HOME".into()],trigger_groups:vec![],profile_path:"profile.txt".into()};
        let b=GlobalChord{id:"b".into(),buttons:vec!["MISC1".into()],..a.clone()};
        let merged=merge_global_chords(vec![a,b]);
        assert_eq!(merged.len(),1);
        assert_eq!(merged[0].trigger_groups,vec![vec!["HOME"],vec!["MISC1"]]);
        assert!(merged[0].buttons.is_empty());
        assert!(merge_global_chords(vec![]).is_empty());
    }
    #[test]
    fn builtin_configuration_is_protected_and_ships_keyboard_command() {
        assert!(protect_builtin_profile(DEFAULT_CHORD_PROFILE_NAME).is_err());
        assert!(protect_builtin_profile("default global chords").is_err());
        assert!(protect_builtin_profile("Personal Default Global Chords").is_ok());
        assert!(DEFAULT_CHORD_PROFILE_LINES.contains(&"W = \"OPEN_KEYBOARD\""));
        assert!(DEFAULT_CHORD_PROFILE_LINES.contains(&"RSL = \"TOGGLE_MAPPING\""));
        assert!(DEFAULT_CHORD_PROFILE_LINES.contains(&"RSR = \"CALIBRATE_GYRO\""));
        assert!(DEFAULT_CHORD_PROFILE_LINES.contains(&"RIGHT_TOUCHPAD_MODE = MOUSE"));
    }

    #[test]
    fn older_states_get_white_led_defaults_and_color_is_validated() {
        let state: RuntimeMappingState = serde_json::from_str(
            r#"{"activeProfilePath":"profiles-library/Game.txt","mappingEnabled":true,"autoloadEnabled":false}"#,
        ).unwrap();
        assert_eq!(state.led_color, "#ffffff");
        assert_eq!(state.led_brightness, 100);
        let defaults = studio_defaults_text(&state);
        assert!(defaults.contains("LIGHT_BAR = xffffff\nLED_BRIGHTNESS = 100\n"));
        assert_eq!(validated_led_color("#A1b2C3").unwrap(), "#a1b2c3");
        assert!(validated_led_color("#fffffZ").is_err());
    }

    /// The global timing store (console refinement D8) reaches every profile
    /// through StudioDefaults.txt. A state saved before it existed reads as
    /// JoyShockMapper's own defaults, and the simultaneous-press window is
    /// written before the hold time, which the mapper refuses unless it is
    /// longer.
    #[test]
    fn studio_defaults_carry_the_global_timing() {
        let state: RuntimeMappingState = serde_json::from_str(
            r#"{"activeProfilePath":"profiles-library/Wardogs.txt","mappingEnabled":true,"autoloadEnabled":true}"#,
        )
        .expect("an older state file still parses");
        assert_eq!((state.hold_press_ms, state.dbl_press_ms, state.sim_press_ms, state.turbo_period_ms), (150.0, 150.0, 50.0, 80.0));
        let text = studio_defaults_text(&state);
        for line in ["TICK_TIME = 3", "SIM_PRESS_WINDOW = 50", "HOLD_PRESS_TIME = 150", "DBL_PRESS_WINDOW = 150", "TURBO_PERIOD = 80", "LEFT_TOUCHPAD_ROTATION = 0", "RIGHT_TOUCHPAD_ROTATION = 0", "BOOT_SOUND_LEVEL = -1"] {
            assert!(text.lines().any(|candidate| candidate == line), "missing {line} in {text}");
        }
        let sim = text.find("SIM_PRESS_WINDOW").unwrap();
        let hold = text.find("HOLD_PRESS_TIME").unwrap();
        assert!(sim < hold, "the simultaneous-press window must be set before the hold time");
    }

    /// Trackpad orientation and the controller's jingle volume are global too:
    /// they reach the mapper as LEFT_/RIGHT_TOUCHPAD_ROTATION (degrees, as
    /// typed) and BOOT_SOUND_LEVEL.
    #[test]
    fn studio_defaults_carry_pad_orientation_and_jingle_level() {
        let state: RuntimeMappingState = serde_json::from_str(
            r#"{"activeProfilePath":"profiles-library/Wardogs.txt","mappingEnabled":true,"autoloadEnabled":true,"leftPadRotation":10.7,"rightPadRotation":-10.5,"bootSoundLevel":0}"#,
        )
        .expect("state with orientation parses");
        let text = studio_defaults_text(&state);
        for line in ["LEFT_TOUCHPAD_ROTATION = 10.7", "RIGHT_TOUCHPAD_ROTATION = -10.5", "BOOT_SOUND_LEVEL = 0"] {
            assert!(text.lines().any(|candidate| candidate == line), "missing {line} in {text}");
        }
        // No library sound chosen: NONE is still written, so a cleared choice
        // reaches a mapper the file is injected into without a reset.
        assert!(!state.firmware_sound_prompt_done, "an older state has not answered the prompt");
        assert_eq!((state.connect_sound_file.as_deref(), state.shutdown_sound_file.as_deref()), (None, None));
        for line in ["CONNECT_SOUND_FILE = NONE", "SHUTDOWN_SOUND_FILE = NONE", "SOUND_ACTUATORS = GRIPS"] {
            assert!(text.lines().any(|candidate| candidate == line), "missing {line} in {text}");
        }
    }

    /// The actuator choice reaches the mapper as SOUND_ACTUATORS, upper case,
    /// after the sound files; anything unrecognised falls back to the grips,
    /// where the controller's own tunes play.
    #[test]
    fn studio_defaults_carry_the_sound_actuators() {
        let state: RuntimeMappingState = serde_json::from_str(
            r#"{"activeProfilePath":"profiles-library/Wardogs.txt","mappingEnabled":true,"autoloadEnabled":true,"soundActuators":"pads"}"#,
        )
        .expect("state with an actuator choice parses");
        let text = studio_defaults_text(&state);
        assert!(text.lines().any(|line| line == "SOUND_ACTUATORS = PADS"), "{text}");
        let files = text.find("SHUTDOWN_SOUND_FILE").unwrap();
        let actuators = text.find("SOUND_ACTUATORS").unwrap();
        assert!(files < actuators, "SOUND_ACTUATORS follows the sound files");
        for (stored, written) in [("both", "BOTH"), ("GRIPS", "GRIPS"), ("speaker", "GRIPS"), ("", "GRIPS")] {
            let mut state = state.clone();
            state.sound_actuators = stored.to_string();
            assert!(studio_defaults_text(&state).lines().any(|line| line == format!("SOUND_ACTUATORS = {written}")), "{stored}");
        }
        assert_eq!(validated_sound_actuators(" Pads "), "pads");
        assert_eq!(validated_sound_actuators("nowhere"), "grips");
    }

    /// A library sound chosen for connect or shutdown reaches the mapper as the
    /// path it resolves against JSM_DIRECTORY, after BOOT_SOUND_LEVEL; an id
    /// that somehow is not well formed is written as NONE rather than as a path.
    #[test]
    fn studio_defaults_carry_library_sound_files() {
        let state: RuntimeMappingState = serde_json::from_str(
            r#"{"activeProfilePath":"profiles-library/Wardogs.txt","mappingEnabled":true,"autoloadEnabled":true,"firmwareSoundPromptDone":true,"connectSoundFile":"snd-1727640000000-1a2b","shutdownSoundFile":"../oops"}"#,
        )
        .expect("state with sound files parses");
        assert!(state.firmware_sound_prompt_done);
        let text = studio_defaults_text(&state);
        for line in ["CONNECT_SOUND_FILE = sounds/snd-1727640000000-1a2b/tones.txt", "SHUTDOWN_SOUND_FILE = NONE"] {
            assert!(text.lines().any(|candidate| candidate == line), "missing {line} in {text}");
        }
        let level = text.find("BOOT_SOUND_LEVEL").unwrap();
        let connect = text.find("CONNECT_SOUND_FILE").unwrap();
        let shutdown = text.find("SHUTDOWN_SOUND_FILE").unwrap();
        assert!(level < connect && connect < shutdown, "the sound file lines follow BOOT_SOUND_LEVEL");
        // Round trip: the fields survive a save of the state file.
        let saved: RuntimeMappingState = serde_json::from_str(&serde_json::to_string(&state).unwrap()).unwrap();
        assert_eq!(saved.connect_sound_file.as_deref(), Some("snd-1727640000000-1a2b"));
        assert!(saved.firmware_sound_prompt_done);
    }

    /// A reader racing the writer must see the whole old file or the whole new
    /// one, never an empty or partial one.
    ///
    /// Applying a configuration used to truncate the file in place, and
    /// JoyShockMapper -- a separate process told to load it immediately --
    /// read it in that window. Its console showed the load running the
    /// RESET_MAPPINGS preamble and then stopping: no VIRTUAL_CONTROLLER, no
    /// bindings, every input unmapped, the virtual pad destroyed.
    #[test]
    fn a_reader_never_observes_a_half_written_file() {
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;

        let dir = std::env::temp_dir().join(format!("jsm-atomic-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("applied-preview.txt");

        let old = "RESET_MAPPINGS\nVIRTUAL_CONTROLLER = DS4\nS = PS_CROSS\n";
        let new = "RESET_MAPPINGS\nVIRTUAL_CONTROLLER = XBOX\nS = X_A\n";
        write_file_atomically(&path, old).expect("seed");

        let stop = Arc::new(AtomicBool::new(false));
        let reader_stop = stop.clone();
        let reader_path = path.clone();
        // Reads as JoyShockMapper does: open, take the whole file, move on.
        let reader = std::thread::spawn(move || {
            let mut seen_bad = 0_usize;
            let mut reads = 0_usize;
            while !reader_stop.load(Ordering::Relaxed) {
                if let Ok(text) = fs::read_to_string(&reader_path) {
                    reads += 1;
                    if text != old && text != new {
                        seen_bad += 1;
                    }
                }
            }
            (reads, seen_bad)
        });

        for index in 0..300 {
            let content = if index % 2 == 0 { new } else { old };
            write_file_atomically(&path, content).expect("rewrite");
        }
        stop.store(true, Ordering::Relaxed);
        let (reads, seen_bad) = reader.join().expect("reader");

        assert!(reads > 0, "the reader never got to read, so this proves nothing");
        assert_eq!(
            seen_bad, 0,
            "the reader saw {seen_bad} truncated or partial file(s) out of {reads} reads"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    /// The temporary file must never look like a configuration, or a half
    /// written profile turns up in the library listing.
    #[test]
    fn the_temporary_file_is_not_mistaken_for_a_profile() {
        let temp = Path::new("profiles-library/Wardogs.txt")
            .with_extension(format!("jsmtmp{}", std::process::id()));
        assert_ne!(temp.extension().and_then(|value| value.to_str()), Some("txt"));
    }

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
    fn reserved_device_names_never_become_file_names() {
        // CON.txt cannot be created and NUL.txt swallows every write, so a
        // profile keeps its spelling with a mark, and a rule is refused.
        assert_eq!(sanitize_profile_name("CON"), "CON_");
        assert_eq!(sanitize_profile_name("nul.old"), "nul.old_");
        assert_eq!(sanitize_profile_name("Console"), "Console");
        assert_eq!(sanitize_profile_name("COM10"), "COM10");
        assert!(sanitize_process_name("com1").is_err());
        assert!(sanitize_process_name("lpt9.exe").is_err());
        assert_eq!(sanitize_process_name("Conan.exe").as_deref(), Ok("Conan"));
    }

    #[test]
    fn an_unchanged_generated_file_is_left_alone() {
        let dir = std::env::temp_dir().join(format!("jsm-unchanged-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("OnStartUp.txt");
        write_file_if_changed(&path, "A\n").expect("first write");
        let first = fs::metadata(&path).and_then(|meta| meta.modified()).expect("mtime");
        std::thread::sleep(std::time::Duration::from_millis(30));
        write_file_if_changed(&path, "A\n").expect("same content");
        assert_eq!(fs::metadata(&path).and_then(|meta| meta.modified()).expect("mtime"), first);
        write_file_if_changed(&path, "B\n").expect("new content");
        assert_eq!(fs::read_to_string(&path).expect("read"), "B\n");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn profile_paths_outside_the_library_are_rejected() {
        assert_eq!(normalize_relative_profile_path(Some("applied-preview.txt")), None);
        assert_eq!(normalize_relative_profile_path(Some("../secrets.txt")), None);
        assert_eq!(normalize_relative_profile_path(Some("profiles-library/../x.txt")), None);
    }

    /// TODO-46: the executable an association was made from rides in the rule
    /// file as a comment. The mapper skips `#` lines, so the rule still reads
    /// as a one-line profile rule, and a file without the comment is unchanged.
    #[test]
    fn the_exe_comment_round_trips_without_changing_what_the_rule_loads() {
        let text = autoload_rule_text("profiles-library/Doom.txt", Some(r"C:\Games\DOOM\DOOMx64.exe"));
        assert_eq!(text, "profiles-library/Doom.txt\n# exe: C:\\Games\\DOOM\\DOOMx64.exe\n");
        assert_eq!(parse_linked_autoload_profile(&text).as_deref(), Some("profiles-library/Doom.txt"));
        assert_eq!(parse_autoload_exe_path(&text).as_deref(), Some(r"C:\Games\DOOM\DOOMx64.exe"));

        assert_eq!(autoload_rule_text("profiles-library/Doom.txt", None), "profiles-library/Doom.txt\n");
        assert_eq!(parse_autoload_exe_path("profiles-library/Doom.txt\n"), None);
        // Spacing and quotes are forgiven; other comments are not paths.
        assert_eq!(parse_autoload_exe_path("#exe:\"D:\\x.exe\"\n# note\nprofiles-library/A.txt\n").as_deref(), Some(r"D:\x.exe"));
        assert_eq!(parse_autoload_exe_path("# exe:\nprofiles-library/A.txt\n"), None);
    }

    /// Renaming a configuration keeps the association's executable, so the
    /// icon does not vanish with the rename.
    #[test]
    fn a_renamed_configuration_keeps_its_associated_executable() {
        let content = "profiles-library/Old.txt\n# exe: C:\\Games\\g.exe\n";
        assert_eq!(
            retarget_autoload_rule_text(content, "profiles-library/Old.txt", "profiles-library/New.txt").as_deref(),
            Some("profiles-library/New.txt\n# exe: C:\\Games\\g.exe\n"),
        );
        assert_eq!(retarget_autoload_rule_text(content, "profiles-library/Other.txt", "profiles-library/New.txt"), None);
    }

    /// "Associated, not applied" is a paused rule: `<app>.txt.paused`, which
    /// AutoLoad never matches. Saving again without an exe keeps the one it
    /// had; asking for auto-apply moves the file, never duplicates it.
    #[test]
    fn an_association_without_auto_apply_is_a_paused_rule_that_keeps_its_exe() {
        let dir = std::env::temp_dir().join(format!("jsm-assoc-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let active = dir.join("Doom.txt");
        let parked = dir.join("Doom.txt.paused");

        let written = write_autoload_rule_file(&dir, "Doom", "profiles-library/Doom.txt", Some(r"C:\Games\DOOM.exe"), Some(false)).expect("park");
        assert_eq!(written, parked);
        assert!(parked.exists() && !active.exists(), "an icon-only association must be the paused twin");
        assert_eq!(parse_autoload_exe_path(&fs::read_to_string(&parked).unwrap()).as_deref(), Some(r"C:\Games\DOOM.exe"));

        // Changing what it loads, without saying anything about the exe or
        // auto-apply, keeps both.
        write_autoload_rule_file(&dir, "Doom", "profiles-library/FPS.txt", None, None).expect("retarget");
        assert!(parked.exists() && !active.exists());
        let text = fs::read_to_string(&parked).unwrap();
        assert_eq!(parse_linked_autoload_profile(&text).as_deref(), Some("profiles-library/FPS.txt"));
        assert_eq!(parse_autoload_exe_path(&text).as_deref(), Some(r"C:\Games\DOOM.exe"));

        // Turning auto-apply on makes it live; off parks it again.
        let written = write_autoload_rule_file(&dir, "Doom", "profiles-library/FPS.txt", None, Some(true)).expect("resume");
        assert_eq!(written, active);
        assert!(active.exists() && !parked.exists());
        assert_eq!(parse_autoload_exe_path(&fs::read_to_string(&active).unwrap()).as_deref(), Some(r"C:\Games\DOOM.exe"));
        write_autoload_rule_file(&dir, "Doom", "profiles-library/FPS.txt", Some("  "), Some(false)).expect("pause");
        assert!(parked.exists() && !active.exists());
        assert_eq!(parse_autoload_exe_path(&fs::read_to_string(&parked).unwrap()).as_deref(), Some(r"C:\Games\DOOM.exe"));

        // A rule that never had an exe stays a plain one-line rule.
        write_autoload_rule_file(&dir, "Quake", "profiles-library/FPS.txt", None, None).expect("plain");
        assert_eq!(fs::read_to_string(dir.join("Quake.txt")).unwrap(), "profiles-library/FPS.txt\n");
        let _ = fs::remove_dir_all(&dir);
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

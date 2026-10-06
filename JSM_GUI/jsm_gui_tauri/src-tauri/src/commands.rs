use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State, Window};

use crate::{
    runtime,
    services::{ai, app_state::AppState, autostart, hidhide, input_debug, jsm_process, overlay, telemetry},
};

type CommandResult<T> = Result<T, String>;
const PROFILE_INJECTION_ATTEMPTS: usize = 3;
const PROFILE_INJECTION_RETRY_DELAY_MS: u64 = 150;
const CONTROLLER_LIST_ATTEMPTS: usize = 5;
const CONTROLLER_LIST_RETRY_DELAY_MS: u64 = 200;
const CONTROLLER_LIST_EMPTY_CONFIRM_DELAY_MS: u64 = 300;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyProfileResult {
    restarted: bool,
    path: Option<String>,
    mapping_enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedProfile {
    path: String,
    name: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadLibraryProfileResult {
    name: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteLibraryProfileResult {
    success: bool,
    fallback: Option<NamedProfile>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetBackendChoiceResult {
    success: bool,
    backend: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleSuccessResult {
    success: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconnectControllersResult {
    success: bool,
    restarted: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControllerCandidate {
    device_id: i32,
    name: String,
    vendor_id: Option<u16>,
    product_id: Option<u16>,
    is_gamepad: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalibrationPresetLoadResult {
    success: bool,
    active_profile: Option<String>,
    calibration_profile: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalibrationPresetReadResult {
    success: bool,
    calibration_profile: Option<String>,
    content: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalibrationCommandResult {
    success: bool,
    output: String,
}

#[tauri::command]
pub fn launch_jsm(
    app: AppHandle,
    state: State<'_, AppState>,
    calibration_seconds: Option<u32>,
) -> CommandResult<()> {
    if let Some(seconds) = calibration_seconds {
        runtime::write_calibration_seconds(&app, seconds)?;
    }
    jsm_process::launch_jsm(&app, state.inner())
}

#[tauri::command]
pub fn terminate_jsm(app: AppHandle, state: State<'_, AppState>) -> CommandResult<()> {
    jsm_process::terminate_jsm(&app, state.inner())
}

/// Shows or hides the calibration HUD over games.
#[tauri::command]
pub fn set_calibration_hud_enabled(app: AppHandle, enabled: bool) -> CommandResult<runtime::RuntimeMappingState> {
    runtime::set_calibration_hud_enabled(&app, enabled)
}

/// Turns Studio's reserved chords (pause mapping, calibrate gyro) on or off.
#[tauri::command]
pub fn set_reserved_chords(app: AppHandle, enabled: bool) -> CommandResult<runtime::RuntimeMappingState> {
    runtime::set_reserved_chords(&app, enabled)
}

/// Pauses or resumes one association without losing it.
#[tauri::command]
pub fn set_autoload_rule_paused(app: AppHandle, process_name: String, paused: bool) -> CommandResult<runtime::AutoloadRule> {
    runtime::set_autoload_rule_paused(&app, &process_name, paused)
}

/// The configuration layers active right now, in stack order.
/// Steam Input layouts found in the local Steam install, for the import dialog.
#[tauri::command]
pub fn list_steam_layouts() -> Vec<crate::services::steam_layouts::SteamLayout> {
    crate::services::steam_layouts::list_layouts()
}

#[tauri::command]
pub fn read_steam_layout(path: String) -> CommandResult<String> {
    crate::services::steam_layouts::read_layout(&path)
}

#[tauri::command]
pub fn get_layer_stack() -> serde_json::Value {
    crate::services::global_chords::layer_stack()
}

/// Whether the mapper is running, and if it stopped by itself, its exit code,
/// when, and the last line it printed.
#[tauri::command]
pub fn get_mapper_status(state: State<'_, AppState>) -> CommandResult<serde_json::Value> {
    jsm_process::status(state.inner())
}

#[tauri::command]
pub fn minimize_temporarily(window: Window) -> CommandResult<()> {
    window
        .minimize()
        .map_err(|error| format!("Failed to minimize window: {error}"))?;

    let window_clone = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(2500));
        let _ = window_clone.unminimize();
        let _ = window_clone.set_focus();
    });

    Ok(())
}

#[tauri::command]
pub fn apply_profile(
    app: AppHandle,
    state: State<'_, AppState>,
    profile_path: Option<String>,
    text: String,
) -> CommandResult<ApplyProfileResult> {
    let path = runtime::write_active_profile(&app, profile_path.as_deref(), &text)?;
    crate::services::config_layers::prepare(&app, &path)?;
    let runtime_state = runtime::get_runtime_mapping_state(&app)?;
    if !runtime_state.mapping_enabled {
        return Ok(ApplyProfileResult {
            restarted: false,
            path: Some(path),
            mapping_enabled: false,
        });
    }

    let mut restarted = false;
    if jsm_process::is_running(state.inner())? {
        let injected = inject_profile_with_retry(&app, state.inner(), &path)?;
        if !injected {
            jsm_process::terminate_jsm(&app, state.inner())?;
            jsm_process::launch_jsm(&app, state.inner())?;
            restarted = true;
        } else {
            let _ = jsm_process::inject_console_command(&app, state.inner(), "AUTOCONNECT = ON")?;
            keep_studio_navigation(&app, state.inner(), &runtime_state)?;
        }
    } else {
        jsm_process::launch_jsm(&app, state.inner())?;
        restarted = true;
    }

    crate::services::config_layers::applied();
    Ok(ApplyProfileResult {
        restarted,
        path: Some(path),
        mapping_enabled: true,
    })
}

#[tauri::command]
pub fn get_runtime_mapping_state(app: AppHandle) -> CommandResult<runtime::RuntimeMappingState> {
    runtime::get_runtime_mapping_state(&app)
}

#[tauri::command]
pub fn set_mapping_enabled(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> CommandResult<runtime::RuntimeMappingState> {
    let runtime_state = runtime::set_mapping_enabled(&app, enabled)?;
    apply_runtime_mapping_state(&app, state.inner(), &runtime_state)?;
    Ok(runtime_state)
}

#[tauri::command]
pub fn set_autoload_enabled(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> CommandResult<runtime::RuntimeMappingState> {
    let runtime_state = runtime::set_autoload_enabled(&app, enabled)?;
    if jsm_process::is_running(state.inner())? {
        let command = if runtime_state.mapping_enabled && runtime_state.autoload_enabled {
            "AUTOLOAD = ON"
        } else {
            "AUTOLOAD = OFF"
        };
        let _ = jsm_process::inject_console_command(&app, state.inner(), command)?;
    }
    Ok(runtime_state)
}

#[tauri::command]
pub fn set_controller_nav_enabled(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> CommandResult<runtime::RuntimeMappingState> {
    let runtime_state = runtime::set_controller_nav_enabled(&app, enabled)?;
    // The switch is flipped from inside Studio, where AutoLoad will not run
    // again until the foreground app changes, so it takes effect here: on
    // hands the pad to Studio, off gives it back to the configuration.
    if runtime_state.mapping_enabled && jsm_process::is_running(state.inner())? {
        if enabled {
            keep_studio_navigation(&app, state.inner(), &runtime_state)?;
        } else {
            let profile = runtime::effective_profile_for_state(&runtime_state);
            let _ = inject_profile_with_retry(&app, state.inner(), &profile)?;
        }
    }
    Ok(runtime_state)
}

#[tauri::command]
pub fn list_global_chords(app: AppHandle) -> CommandResult<Vec<runtime::GlobalChord>> {
    runtime::list_global_chords(&app)
}

#[tauri::command]
pub fn save_global_chord(
    app: AppHandle,
    chord: runtime::GlobalChord,
) -> CommandResult<Vec<runtime::GlobalChord>> {
    runtime::save_global_chord(&app, chord)
}

#[tauri::command]
pub fn delete_global_chord(app: AppHandle, id: String) -> CommandResult<Vec<runtime::GlobalChord>> {
    runtime::delete_global_chord(&app, &id)
}

#[tauri::command]
pub fn list_autoload_rules(app: AppHandle) -> CommandResult<Vec<runtime::AutoloadRule>> {
    runtime::list_autoload_rules(&app)
}

#[tauri::command]
pub fn save_autoload_rule(
    app: AppHandle,
    process_name: String,
    profile_name: String,
) -> CommandResult<runtime::AutoloadRule> {
    runtime::save_autoload_rule(&app, &process_name, &profile_name)
}

#[tauri::command]
pub fn delete_autoload_rule(
    app: AppHandle,
    process_name: String,
) -> CommandResult<SimpleSuccessResult> {
    let success = runtime::delete_autoload_rule(&app, &process_name)?;
    Ok(SimpleSuccessResult { success })
}

pub(crate) fn apply_runtime_mapping_state(
    app: &AppHandle,
    state: &AppState,
    runtime_state: &runtime::RuntimeMappingState,
) -> CommandResult<()> {
    let target_profile = runtime::effective_profile_for_state(runtime_state);
    if jsm_process::is_running(state)? {
        let injected = inject_profile_with_retry(app, state, &target_profile)?;
        if !injected {
            jsm_process::terminate_jsm(app, state)?;
            jsm_process::launch_jsm(app, state)?;
        }
    } else {
        jsm_process::launch_jsm(app, state)?;
    }

    if runtime_state.mapping_enabled {
        let _ = jsm_process::inject_console_command(app, state, "AUTOCONNECT = ON")?;
        keep_studio_navigation(app, state, runtime_state)?;
    }

    if runtime_state.mapping_enabled {
        let autoload_command = if runtime_state.autoload_enabled {
            "AUTOLOAD = ON"
        } else {
            "AUTOLOAD = OFF"
        };
        let _ = jsm_process::inject_console_command(app, state, autoload_command)?;
    }

    Ok(())
}

/// Whether Studio should have the controller right now: its window is in
/// front, the navigation rule is live, and no Test is running.
fn studio_holds_controller(state: &AppState, runtime_state: &runtime::RuntimeMappingState) -> bool {
    runtime_state.mapping_enabled
        && runtime_state.autoload_enabled
        && runtime_state.controller_nav_enabled
        && state.telemetry_ui_active.load(std::sync::atomic::Ordering::Relaxed)
        && !state.studio_testing.load(std::sync::atomic::Ordering::Relaxed)
}

/// Loading a configuration while Studio is in front would hand it the pad
/// inside Studio: AutoLoad only switches when the foreground app changes, so
/// nothing would pause it again until you left and came back. Applying from
/// Studio updates what games get; Studio keeps the controller.
fn keep_studio_navigation(app: &AppHandle, state: &AppState, runtime_state: &runtime::RuntimeMappingState) -> CommandResult<()> {
    if studio_holds_controller(state, runtime_state) {
        let _ = jsm_process::inject_console_command(app, state, runtime::APP_NAVIGATION_FILE_NAME)?;
    }
    Ok(())
}

/// Studio's window gained or lost focus. AutoLoad only acts when the
/// foreground app changes and only for apps with a rule, so Studio does the
/// handover itself rather than trusting it: coming to the front, the
/// navigation profile takes the pad (and any Test is over); leaving for an app
/// without its own rule, the applied configuration comes back -- otherwise
/// that app would be left with the navigation profile, which maps nothing.
/// Apps with a rule are left to AutoLoad, which loads theirs.
pub(crate) fn studio_focus_changed(app: &AppHandle, focused: bool) {
    let state = tauri::Manager::state::<AppState>(app);
    if focused {
        state.studio_testing.store(false, std::sync::atomic::Ordering::Relaxed);
        hand_pad_to_studio(app);
        return;
    }
    let Ok(runtime_state) = runtime::get_runtime_mapping_state(app) else { return };
    if !(runtime_state.mapping_enabled && runtime_state.autoload_enabled && runtime_state.controller_nav_enabled) {
        return;
    }
    if !jsm_process::is_running(state.inner()).unwrap_or(false) {
        return;
    }
    // Let the new window settle in front before asking who it is.
    std::thread::sleep(std::time::Duration::from_millis(120));
    if state.telemetry_ui_active.load(std::sync::atomic::Ordering::Relaxed) {
        return; // Studio came straight back.
    }
    let foreground = jsm_process::foreground_process_stem();
    let own = runtime::app_process_stem();
    match foreground {
        Some(stem) if own.as_deref().is_some_and(|own| own.eq_ignore_ascii_case(&stem)) => {}
        Some(stem) if runtime::has_live_autoload_rule(app, &stem) => {}
        _ => {
            let profile = runtime::effective_profile_for_state(&runtime_state);
            let _ = inject_profile_with_retry(app, state.inner(), &profile);
        }
    }
}

/// The mapper has just come up (its first telemetry after a launch or a
/// silence). A focus event at launch can arrive before it can take commands,
/// and then OnStartUp's applied configuration would keep the pad inside
/// Studio; so Studio takes it once the mapper is listening.
pub(crate) fn mapper_came_up(app: &AppHandle) {
    let state = tauri::Manager::state::<AppState>(app);
    if state.telemetry_ui_active.load(std::sync::atomic::Ordering::Relaxed)
        && !state.studio_testing.load(std::sync::atomic::Ordering::Relaxed)
    {
        hand_pad_to_studio(app);
    }
}

/// Load the navigation profile, when Studio should have the controller.
fn hand_pad_to_studio(app: &AppHandle) {
    let state = tauri::Manager::state::<AppState>(app);
    let Ok(runtime_state) = runtime::get_runtime_mapping_state(app) else { return };
    if !(runtime_state.mapping_enabled && runtime_state.autoload_enabled && runtime_state.controller_nav_enabled) {
        return;
    }
    if !jsm_process::is_running(state.inner()).unwrap_or(false) {
        return;
    }
    let _ = inject_profile_with_retry(app, state.inner(), runtime::APP_NAVIGATION_FILE_NAME);
}

/// Test mode starts or ends. While it runs, Apply leaves the configuration
/// with the controller.
#[tauri::command]
pub fn set_studio_testing(state: State<'_, AppState>, testing: bool) {
    state.studio_testing.store(testing, std::sync::atomic::Ordering::Relaxed);
}

/// Ends Studio's Test mode: loads the navigation profile again so the pad
/// drives Studio instead of the configuration. AutoLoad only switches when the
/// foreground app changes, and Studio stays in front throughout a test, so it
/// has to be loaded explicitly. Does nothing unless the navigation rule is
/// live (mapping, AutoLoad and controller navigation all on).
#[tauri::command]
pub fn resume_studio_navigation(app: AppHandle, state: State<'_, AppState>) -> CommandResult<bool> {
    let runtime_state = runtime::get_runtime_mapping_state(&app)?;
    if !(runtime_state.mapping_enabled && runtime_state.autoload_enabled && runtime_state.controller_nav_enabled) {
        return Ok(false);
    }
    if !jsm_process::is_running(state.inner())? {
        return Ok(false);
    }
    inject_profile_with_retry(&app, state.inner(), runtime::APP_NAVIGATION_FILE_NAME)
}

fn inject_profile_with_retry(app: &AppHandle, state: &AppState, path: &str) -> CommandResult<bool> {
    let _ = inject_console_command_with_retry(app, state, "STUDIO_CHORD_END")?;
    inject_console_command_with_retry(app, state, path)
}

fn inject_console_command_with_retry(
    app: &AppHandle,
    state: &AppState,
    command: &str,
) -> CommandResult<bool> {
    for attempt in 0..PROFILE_INJECTION_ATTEMPTS {
        if jsm_process::inject_console_command(app, state, command)? {
            return Ok(true);
        }
        if attempt + 1 < PROFILE_INJECTION_ATTEMPTS {
            std::thread::sleep(std::time::Duration::from_millis(
                PROFILE_INJECTION_RETRY_DELAY_MS,
            ));
        }
    }
    Ok(false)
}

#[tauri::command]
pub fn recalibrate_gyro(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<SimpleSuccessResult> {
    runtime::ensure_required_files(&app)?;
    // JoyShockMapper runs the whole thing (delay, then calibration) and reports
    // its progress over telemetry, which is what drives both the in-app
    // countdown and the overlay -- so a chord or binding shows the same thing.
    let success =
        jsm_process::inject_console_command(&app, state.inner(), runtime::CALIBRATION_COMMAND)?;
    if !success {
        telemetry::stop_calibration_countdown(&app, state.inner())?;
    }
    Ok(SimpleSuccessResult { success })
}

/// Saves the gyro calibration timing and controller sounds, and hands them to
/// the running mapper at once rather than waiting for the next profile load.
#[tauri::command]
pub fn set_controller_preferences(
    app: AppHandle,
    state: State<'_, AppState>,
    preferences: runtime::ControllerPreferences,
) -> CommandResult<runtime::RuntimeMappingState> {
    let saved = runtime::set_controller_preferences(&app, preferences)?;
    let _ = jsm_process::inject_console_command(&app, state.inner(), "StudioDefaults.txt");
    Ok(saved)
}

#[tauri::command]
pub fn play_controller_sound(
    app: AppHandle,
    state: State<'_, AppState>,
    sound: i32,
) -> CommandResult<SimpleSuccessResult> {
    if !(0..=13).contains(&sound) {
        return Err("Sound must be 0-13.".into());
    }
    let success = jsm_process::inject_console_command(&app, state.inner(), &format!("PLAY_SOUND {sound}"))?;
    Ok(SimpleSuccessResult { success })
}

#[tauri::command]
pub fn get_calibration_seconds(app: AppHandle) -> CommandResult<u32> {
    runtime::read_calibration_seconds(&app)
}

#[tauri::command]
pub fn set_calibration_seconds(app: AppHandle, seconds: u32) -> CommandResult<u32> {
    runtime::write_calibration_seconds(&app, seconds)
}

#[tauri::command]
pub fn library_list_profiles(app: AppHandle) -> CommandResult<Vec<String>> {
    runtime::list_library_profiles(&app)
}

#[tauri::command]
pub fn library_save_profile(
    app: AppHandle,
    name: String,
    content: String,
) -> CommandResult<LoadLibraryProfileResult> {
    let saved_name = runtime::save_library_profile(&app, &name, &content)?;
    Ok(LoadLibraryProfileResult {
        name: saved_name,
        content,
    })
}

#[tauri::command]
pub fn library_load_profile(
    app: AppHandle,
    name: String,
) -> CommandResult<LoadLibraryProfileResult> {
    let content = runtime::load_library_profile(&app, &name)?;
    Ok(LoadLibraryProfileResult { name, content })
}

/// Read one file a profile imports, so the editor can resolve the same imports
/// the mapper does. Returns null for a path that is not there, which the editor
/// surfaces as a broken import.
#[tauri::command]
pub fn read_config_file(app: AppHandle, path: String) -> CommandResult<Option<String>> {
    Ok(runtime::read_runtime_config(&app, &path)?)
}

#[tauri::command]
pub fn get_active_profile(app: AppHandle) -> CommandResult<NamedProfile> {
    let (path, content) = runtime::get_active_profile(&app)?;
    Ok(named_profile(path, content))
}

#[tauri::command]
pub fn activate_library_profile(app: AppHandle, name: String) -> CommandResult<NamedProfile> {
    let safe_name = runtime::sanitize_profile_name(&name);
    let path = format!("{}/{}.txt", runtime::PROFILE_LIBRARY_RELATIVE, safe_name);
    runtime::set_active_profile(&app, &path)?;
    let content = runtime::load_library_profile(&app, &safe_name)?;
    Ok(named_profile(path, content))
}

#[tauri::command]
pub fn library_create_profile(
    app: AppHandle,
    preferred_base_name: Option<String>,
) -> CommandResult<NamedProfile> {
    let (path, content) = runtime::create_library_profile(&app, preferred_base_name.as_deref())?;
    Ok(named_profile(path, content))
}

#[tauri::command]
pub fn library_rename_profile(
    app: AppHandle,
    old_name: String,
    new_name: String,
) -> CommandResult<NamedProfile> {
    let (path, content) = runtime::rename_library_profile(&app, &old_name, &new_name)?;
    Ok(named_profile(path, content))
}

#[tauri::command]
pub fn library_delete_profile(
    app: AppHandle,
    name: String,
) -> CommandResult<DeleteLibraryProfileResult> {
    let fallback = runtime::delete_library_profile(&app, &name)?
        .map(|(path, content)| named_profile(path, content));

    Ok(DeleteLibraryProfileResult {
        success: true,
        fallback,
    })
}

#[tauri::command]
pub fn library_copy_active_profile(app: AppHandle) -> CommandResult<NamedProfile> {
    let (path, content) = runtime::copy_active_profile(&app)?;
    Ok(named_profile(path, content))
}

#[tauri::command]
pub fn load_calibration_preset(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<CalibrationPresetLoadResult> {
    runtime::ensure_required_files(&app)?;
    let (active_profile, _) = runtime::get_active_profile(&app)?;
    let success = if runtime::calibration_preset_exists(&app)? {
        jsm_process::inject_console_command(
            &app,
            state.inner(),
            &runtime::calibration_profile_relative(),
        )?
    } else {
        false
    };
    Ok(CalibrationPresetLoadResult {
        success,
        active_profile: Some(active_profile),
        calibration_profile: Some(runtime::calibration_profile_relative()),
    })
}

#[tauri::command]
pub fn read_calibration_preset(app: AppHandle) -> CommandResult<CalibrationPresetReadResult> {
    let content = runtime::read_calibration_preset(&app)?;
    Ok(CalibrationPresetReadResult {
        success: true,
        calibration_profile: Some(runtime::calibration_profile_relative()),
        content: Some(content),
    })
}

#[tauri::command]
pub fn save_calibration_preset(
    app: AppHandle,
    content: String,
) -> CommandResult<SimpleSuccessResult> {
    runtime::save_calibration_preset(&app, &content)?;
    Ok(SimpleSuccessResult { success: true })
}

#[tauri::command]
pub fn run_calibration_command(
    app: AppHandle,
    state: State<'_, AppState>,
    command: String,
) -> CommandResult<CalibrationCommandResult> {
    runtime::ensure_required_files(&app)?;
    let result = jsm_process::run_console_command_with_output(&app, state.inner(), &command)?;
    Ok(CalibrationCommandResult {
        success: result.success,
        output: result.output,
    })
}

#[tauri::command]
pub fn list_jsm_controllers(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<Vec<ControllerCandidate>> {
    ensure_hidhide_visibility_for_jsm(&app, state.inner())?;
    jsm_process::launch_jsm(&app, state.inner())?;

    let mut last_error = None;
    let mut saw_empty_list = false;
    for attempt in 0..CONTROLLER_LIST_ATTEMPTS {
        let result =
            jsm_process::run_console_command_with_output(&app, state.inner(), "LIST_CONTROLLERS")?;
        if result.success {
            match parse_controller_candidates(&result.output) {
                Ok(candidates) if !candidates.is_empty() => return Ok(candidates),
                Ok(candidates) => {
                    if saw_empty_list || attempt + 1 == CONTROLLER_LIST_ATTEMPTS {
                        return Ok(candidates);
                    }
                    saw_empty_list = true;
                    std::thread::sleep(std::time::Duration::from_millis(
                        CONTROLLER_LIST_EMPTY_CONFIRM_DELAY_MS,
                    ));
                    continue;
                }
                Err(error) => {
                    last_error = Some(error);
                }
            }
        } else {
            let output = result.output.trim();
            last_error = Some(if output.is_empty() {
                "LIST_CONTROLLERS response was not captured.".to_string()
            } else {
                format!("Failed to query JoyShockMapper controllers. {output}")
            });
        }

        if attempt + 1 < CONTROLLER_LIST_ATTEMPTS {
            std::thread::sleep(std::time::Duration::from_millis(
                CONTROLLER_LIST_RETRY_DELAY_MS,
            ));
        }
    }

    Err(last_error.unwrap_or_else(|| "LIST_CONTROLLERS response was not captured.".to_string()))
}

#[tauri::command]
pub fn reconnect_jsm_controllers(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<ReconnectControllersResult> {
    ensure_hidhide_visibility_for_jsm(&app, state.inner())?;
    jsm_process::launch_jsm(&app, state.inner())?;

    let autoconnect_enabled =
        inject_console_command_with_retry(&app, state.inner(), "AUTOCONNECT = ON")?;
    let reconnected = autoconnect_enabled
        && inject_console_command_with_retry(&app, state.inner(), "RECONNECT_CONTROLLERS")?;
    if reconnected {
        return Ok(ReconnectControllersResult {
            success: true,
            restarted: false,
        });
    }

    jsm_process::terminate_jsm(&app, state.inner())?;
    jsm_process::launch_jsm(&app, state.inner())?;
    Ok(ReconnectControllersResult {
        success: true,
        restarted: true,
    })
}

fn ensure_hidhide_visibility_for_jsm(app: &AppHandle, state: &AppState) -> CommandResult<()> {
    let latest_packet = telemetry::latest_packet(state)?;
    let status = hidhide::get_status(app, latest_packet.as_ref())?;
    if !status.supported || !status.installed {
        return Ok(());
    }
    if status.requires_elevation {
        return Err(
            "HidHide is installed, but JSM Studio cannot repair the whitelist without administrator rights. Restart JSM Studio as administrator."
                .to_string(),
        );
    }
    if status.whitelist_synced {
        return Ok(());
    }

    hidhide::sync_whitelist(app, latest_packet.as_ref())?;
    if jsm_process::is_running(state)? {
        jsm_process::terminate_jsm(app, state)?;
    }

    Ok(())
}

fn parse_controller_candidates(output: &str) -> CommandResult<Vec<ControllerCandidate>> {
    if output.trim().is_empty() {
        return Err("LIST_CONTROLLERS response was not captured.".to_string());
    }

    let mut current_block: Option<Vec<&str>> = None;
    let mut last_complete_block: Option<Vec<&str>> = None;
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed == "JSM_CONTROLLER_LIST_BEGIN" {
            current_block = Some(Vec::new());
            continue;
        }
        if trimmed == "JSM_CONTROLLER_LIST_END" {
            if let Some(block) = current_block.take() {
                last_complete_block = Some(block);
            }
            continue;
        }
        if let Some(block) = current_block.as_mut() {
            block.push(trimmed);
        }
    }

    if let Some(block) = last_complete_block {
        return Ok(parse_controller_candidate_lines(block.into_iter()));
    }

    let fallback = parse_controller_candidate_lines(output.lines().map(str::trim));
    if !fallback.is_empty() {
        return Ok(fallback);
    }

    Err("LIST_CONTROLLERS response was not captured.".to_string())
}

fn parse_controller_candidate_lines<'a>(
    lines: impl IntoIterator<Item = &'a str>,
) -> Vec<ControllerCandidate> {
    let mut candidates = Vec::new();

    for trimmed in lines {
        if !trimmed.starts_with("JSM_CONTROLLER") {
            continue;
        }

        let fields = trimmed.split_whitespace().collect::<Vec<_>>();
        if fields.len() < 5 || fields[0] != "JSM_CONTROLLER" {
            continue;
        }
        let Ok(device_id) = fields[1].parse::<i32>() else {
            continue;
        };
        let vendor_id = parse_vid_pid(fields[2]);
        let product_id = parse_vid_pid(fields[3]);
        let is_gamepad = fields[4] == "1";
        let name = fields
            .get(5..)
            .map(|parts| parts.join(" "))
            .unwrap_or_default();
        let name = name.trim();

        candidates.push(ControllerCandidate {
            device_id,
            name: if name.is_empty() {
                "Unknown controller".to_string()
            } else {
                name.to_string()
            },
            vendor_id,
            product_id,
            is_gamepad,
        });
    }

    candidates
}

fn parse_vid_pid(value: &str) -> Option<u16> {
    let parsed = value.parse::<u32>().ok()?;
    if parsed == 0 || parsed > u16::MAX as u32 {
        return None;
    }
    Some(parsed as u16)
}

#[tauri::command]
pub fn get_backend_choice(app: AppHandle) -> CommandResult<String> {
    runtime::read_backend_choice(&app)
}

#[tauri::command]
pub fn set_backend_choice(
    app: AppHandle,
    state: State<'_, AppState>,
    choice: String,
) -> CommandResult<SetBackendChoiceResult> {
    if choice != "SDL" && choice != "legacy" {
        let backend = runtime::read_backend_choice(&app)?;
        return Ok(SetBackendChoiceResult {
            success: false,
            backend,
        });
    }

    let current = runtime::read_backend_choice(&app)?;
    if current == choice {
        return Ok(SetBackendChoiceResult {
            success: true,
            backend: current,
        });
    }

    jsm_process::terminate_jsm(&app, state.inner())?;
    let backend = runtime::write_backend_choice(&app, &choice)?;
    runtime::ensure_required_files(&app)?;
    jsm_process::launch_jsm(&app, state.inner())?;
    Ok(SetBackendChoiceResult {
        success: true,
        backend,
    })
}

#[tauri::command]
pub fn get_latest_telemetry_sample(state: State<'_, AppState>) -> CommandResult<Option<Value>> {
    telemetry::latest_packet(state.inner())
}

#[tauri::command]
pub fn get_hidhide_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<hidhide::HidHideStatus> {
    let latest_packet = telemetry::latest_packet(state.inner())?;
    hidhide::get_status(&app, latest_packet.as_ref())
}

#[tauri::command]
pub fn set_hidhide_active(
    app: AppHandle,
    state: State<'_, AppState>,
    active: bool,
) -> CommandResult<hidhide::HidHideStatus> {
    let latest_packet = telemetry::latest_packet(state.inner())?;
    hidhide::set_active(&app, active, latest_packet.as_ref())
}

#[tauri::command]
pub fn set_hidhide_device_hidden(
    app: AppHandle,
    state: State<'_, AppState>,
    instance_id: String,
    hidden: bool,
) -> CommandResult<hidhide::HidHideStatus> {
    let latest_packet = telemetry::latest_packet(state.inner())?;
    hidhide::set_device_hidden(&app, &instance_id, hidden, latest_packet.as_ref())
}

#[tauri::command]
pub fn sync_hidhide_whitelist(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<hidhide::HidHideStatus> {
    let latest_packet = telemetry::latest_packet(state.inner())?;
    hidhide::sync_whitelist(&app, latest_packet.as_ref())
}

#[tauri::command]
pub fn install_bundled_hidhide(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<hidhide::HidHideInstallResult> {
    let latest_packet = telemetry::latest_packet(state.inner())?;
    hidhide::install_bundled(&app, latest_packet.as_ref())
}

#[tauri::command]
pub fn open_hidhide_client(app: AppHandle) -> CommandResult<()> {
    hidhide::open_configuration_client(&app)
}

#[tauri::command]
pub fn open_external(url: String) -> CommandResult<()> {
    open::that(url).map_err(|error| format!("Failed to open external link: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn open_config_directory(app: AppHandle) -> CommandResult<()> {
    let path = runtime::config_directory(&app)?;
    open::that(path).map_err(|error| format!("Failed to open config directory: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn start_input_debug_hook(app: AppHandle) -> CommandResult<input_debug::InputDebugHookStatus> {
    input_debug::start(app)
}

#[tauri::command]
pub fn stop_input_debug_hook() -> CommandResult<input_debug::InputDebugHookStatus> {
    input_debug::stop()
}

#[tauri::command]
pub fn get_input_debug_hook_status() -> CommandResult<input_debug::InputDebugHookStatus> {
    input_debug::status()
}

fn named_profile(path: String, content: String) -> NamedProfile {
    let name = runtime::profile_name_from_relative_path(&path);
    NamedProfile {
        path,
        name,
        content,
    }
}

#[tauri::command]
pub fn get_ai_settings(app: AppHandle) -> CommandResult<ai::AiSettings> {
    ai::load_settings(&app)
}

#[tauri::command]
pub fn save_ai_settings(
    app: AppHandle,
    settings: ai::AiSettingsInput,
) -> CommandResult<ai::AiSettings> {
    ai::save_settings(&app, settings)
}

#[tauri::command]
pub async fn generate_ai_mapping(
    app: AppHandle,
    request: ai::GenerateMappingRequest,
) -> CommandResult<ai::GenerateMappingResponse> {
    ai::generate_mapping(&app, request).await
}

#[tauri::command]
pub fn get_autostart_enabled() -> CommandResult<bool> {
    autostart::is_autostart_enabled()
}

#[tauri::command]
pub fn set_autostart_enabled(enabled: bool) -> CommandResult<()> {
    autostart::set_autostart_enabled(enabled)
}


// --- Trackpad overlay ------------------------------------------------------
// The overlay is a separate always-on-top window, not a hook into any game. See
// services/overlay.rs for why that boundary matters and what it costs.

#[tauri::command]
pub fn overlay_set_enabled(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> CommandResult<()> {
    overlay::set_enabled(&app, &state, enabled)?;
    // Remembered, so turning the overlay on is a decision that survives a
    // restart rather than something to redo on every launch.
    runtime::set_trackpad_overlay_enabled(&app, enabled)?;
    Ok(())
}

/// Called by the main window once it has measured its display, so the preview
/// is drawn at the panel's refresh rate rather than a fixed 60 Hz.
#[tauri::command]
pub fn ui_set_refresh_hz(state: State<'_, AppState>, hz: u32) -> CommandResult<()> {
    telemetry::set_ui_refresh_hz(&state, hz);
    Ok(())
}

/// Called by the overlay window once it has measured its display, so the
/// telemetry emitter runs at the panel's rate rather than the main UI's 60 Hz.
#[tauri::command]
pub fn overlay_set_refresh_hz(state: State<'_, AppState>, hz: u32) -> CommandResult<()> {
    overlay::set_refresh_hz(&state, hz);
    Ok(())
}

#[tauri::command]
pub fn overlay_set_bounds(
    app: AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> CommandResult<()> {
    overlay::set_bounds(&app, x, y, width, height)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayWorkarea {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[tauri::command]
pub fn overlay_workarea(app: AppHandle) -> CommandResult<OverlayWorkarea> {
    let (x, y, width, height) = overlay::workarea(&app)?;
    Ok(OverlayWorkarea { x, y, width, height })
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_complete_controller_list() {
        let output = "\
JSM_CONTROLLER_LIST_BEGIN
JSM_CONTROLLER\t4\t1356\t3302\t1\tDualSense Wireless Controller
JSM_CONTROLLER_LIST_END
";

        let candidates = parse_controller_candidates(output).expect("controller list");

        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].device_id, 4);
        assert_eq!(candidates[0].vendor_id, Some(1356));
        assert_eq!(candidates[0].product_id, Some(3302));
        assert!(candidates[0].is_gamepad);
        assert_eq!(candidates[0].name, "DualSense Wireless Controller");
    }

    #[test]
    fn parses_last_complete_controller_list() {
        let output = "\
JSM_CONTROLLER_LIST_BEGIN
JSM_CONTROLLER\t1\t1111\t2222\t1\tOld Controller
JSM_CONTROLLER_LIST_END
noise
JSM_CONTROLLER_LIST_BEGIN
JSM_CONTROLLER\t4\t1356\t3302\t1\tDualSense Wireless Controller
JSM_CONTROLLER_LIST_END
";

        let candidates = parse_controller_candidates(output).expect("controller list");

        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].device_id, 4);
        assert_eq!(candidates[0].name, "DualSense Wireless Controller");
    }

    #[test]
    fn parses_controller_rows_without_markers_as_fallback() {
        let output = "\
LIST_CONTROLLERS
JSM_CONTROLLER\t4\t1356\t3302\t1\tDualSense Wireless Controller
";

        let candidates = parse_controller_candidates(output).expect("controller list");

        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].device_id, 4);
    }

    #[test]
    fn complete_empty_controller_list_is_valid() {
        let output = "\
JSM_CONTROLLER_LIST_BEGIN
JSM_CONTROLLER_LIST_END
";

        let candidates = parse_controller_candidates(output).expect("controller list");

        assert!(candidates.is_empty());
    }

    #[test]
    fn empty_or_unrelated_output_is_capture_failure() {
        assert!(parse_controller_candidates("").is_err());
        assert!(parse_controller_candidates("LIST_CONTROLLERS\n").is_err());
    }
}

#[tauri::command]
pub fn set_default_polling_ms(app: AppHandle, value: f64) -> CommandResult<runtime::RuntimeMappingState> {
    runtime::set_default_polling_ms(&app, value)
}

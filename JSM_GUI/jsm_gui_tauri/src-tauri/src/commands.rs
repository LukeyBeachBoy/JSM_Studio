use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, State, Window};

use crate::{
    runtime,
    services::{ai, app_state::AppState, area_picker, autostart, hidhide, input_debug, jsm_process, overlay, sound_library, telemetry},
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

#[derive(Serialize, Clone)]
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
    /// The file went to the recycle bin rather than being removed outright.
    recycled: bool,
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

// A plain sync command runs inside the WebView's IPC callback, on the main
// thread: while it runs, no window message is handled and every emit --
// telemetry, HUD, overlay, mapper-status -- sits in the event loop's queue.
// Commands that spawn a process (the console injector, msiexec, schtasks),
// sleep between retries, or restart the mapper are marked `async`, which
// moves them onto the runtime's worker threads. Ones that only touch files
// or the overlay/HUD windows stay put.
#[tauri::command(async)]
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

#[tauri::command(async)]
pub fn terminate_jsm(app: AppHandle, state: State<'_, AppState>) -> CommandResult<()> {
    jsm_process::terminate_jsm(&app, state.inner())
}

/// Shows or hides the calibration HUD over games.
#[tauri::command]
pub fn set_calibration_hud_enabled(app: AppHandle, enabled: bool) -> CommandResult<runtime::RuntimeMappingState> {
    runtime::set_calibration_hud_enabled(&app, enabled)
}

#[tauri::command(async)]
pub fn reset_default_settings(app:AppHandle,state:State<'_,AppState>)->CommandResult<()> {
    let next=runtime::reset_default_settings(&app)?;
    apply_runtime_mapping_state(&app,state.inner(),&next)?;
    let _=app.emit("runtime-mapping-state",&next);
    Ok(())
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

#[tauri::command(async)]
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

#[tauri::command(async)]
pub fn set_mapping_enabled(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> CommandResult<runtime::RuntimeMappingState> {
    let runtime_state = runtime::set_mapping_enabled(&app, enabled)?;
    apply_runtime_mapping_state(&app, state.inner(), &runtime_state)?;
    Ok(runtime_state)
}

#[tauri::command(async)]
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

#[tauri::command(async)]
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

/// Apps with a window, for "+ Add app". Walks every top-level window and a
/// process snapshot, so it runs off the main thread.
#[tauri::command(async)]
pub fn list_running_processes() -> CommandResult<Vec<crate::services::processes::RunningProcess>> {
    crate::services::processes::list()
}

#[tauri::command]
pub fn get_autoload_fallback(app: AppHandle) -> CommandResult<runtime::AutoloadFallback> {
    runtime::get_autoload_fallback(&app)
}

#[tauri::command]
pub fn set_autoload_fallback(
    app: AppHandle,
    fallback: runtime::AutoloadFallback,
) -> CommandResult<runtime::AutoloadFallback> {
    runtime::set_autoload_fallback(&app, fallback)
}

/// `exe_path` is the executable the association was made from (its icon);
/// `auto_apply` false saves the rule paused, so it associates without
/// switching configurations (TODO-46). Both optional: the Associations page
/// still changes what an app loads without touching either.
#[tauri::command]
pub fn save_autoload_rule(
    app: AppHandle,
    process_name: String,
    profile_name: String,
    exe_path: Option<String>,
    auto_apply: Option<bool>,
) -> CommandResult<runtime::AutoloadRule> {
    runtime::save_autoload_rule(&app, &process_name, &profile_name, exe_path.as_deref(), auto_apply)
}

/// The icon inside an executable, for a configuration associated with it.
/// Reads the file through GDI, so off the main thread; cached per path.
#[tauri::command(async)]
pub fn app_icon(exe_path: String) -> Option<crate::services::app_icon::AppIcon> {
    crate::services::app_icon::icon_for(&exe_path)
}

/// The standard Open dialog filtered to .exe, for "Browse…" in the
/// configuration dialog. Runs on its own thread; None when cancelled.
#[tauri::command(async)]
pub fn pick_executable() -> Option<String> {
    crate::services::app_icon::pick_executable()
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

/// A binding inside a held global chord loaded a library configuration
/// (`HOME = "profiles-library/Gamepad.txt"` in the Quick Access chord). That
/// is a choice, the same as picking it here: it becomes the applied
/// configuration, so leaving Studio or restarting keeps it rather than
/// bringing the old one back. If Studio is in front it keeps the controller,
/// as it does after Apply.
pub(crate) fn adopt_profile_loaded_by_binding(app: &AppHandle, state: &AppState, path: &str) {
    use tauri::Emitter;
    if let Err(error) = runtime::set_active_profile(app, path) {
        eprintln!("Could not make {path} the applied configuration: {error}");
        return;
    }
    let Ok(runtime_state) = runtime::get_runtime_mapping_state(app) else { return };
    let _ = app.emit("runtime-mapping-state", &runtime_state);
    if let Ok((path, content)) = runtime::get_active_profile(app) {
        let _ = app.emit("applied-profile-changed", named_profile(path, content));
    }
    let _ = keep_studio_navigation(app, state, &runtime_state);
}

/// Studio's window gained or lost focus. AutoLoad only acts when the
/// foreground app changes and only for apps with a rule, so Studio does the
/// handover itself rather than trusting it: coming to the front, the
/// navigation profile takes the pad (and any Test is over); leaving for an app
/// without its own rule, the fallback configuration loads when one is set,
/// otherwise the applied configuration comes back -- either way that app is
/// not left with the navigation profile, which maps nothing. Apps with a rule
/// are left to AutoLoad, which loads theirs; Studio only notes the time.
pub(crate) fn studio_focus_changed(app: &AppHandle, focused: bool) {
    if crate::services::virtual_keyboard::requested() { return; }
    use std::sync::atomic::Ordering::Relaxed;
    let state = tauri::Manager::state::<AppState>(app);
    if focused {
        state.studio_testing.store(false, Relaxed);
        state.handover_foreground_pid.store(0, Relaxed);
        hand_pad_to_studio(app);
        return;
    }
    let Ok(runtime_state) = runtime::get_runtime_mapping_state(app) else { return };
    if !(runtime_state.mapping_enabled && runtime_state.autoload_enabled) {
        return; // AutoLoad is off: no rule fires and nothing is handed over.
    }
    // Let the new window settle in front before asking who it is.
    std::thread::sleep(std::time::Duration::from_millis(120));
    if state.telemetry_ui_active.load(Relaxed) {
        return; // Studio came straight back.
    }
    if !jsm_process::is_running(state.inner()).unwrap_or(false) {
        return; // No mapper, so no rule fired and nothing to load into.
    }
    let own = runtime::app_process_stem();
    let (pid, stem) = match jsm_process::foreground_process() {
        Some((_, stem)) if own.as_deref().is_some_and(|own| own.eq_ignore_ascii_case(&stem)) => return,
        Some((_, stem)) if runtime::has_live_autoload_rule(app, &stem) => {
            if let Err(error) = runtime::record_autoload_match(app, &stem) {
                eprintln!("Could not record the AutoLoad match for {stem}: {error}");
            }
            return;
        }
        Some(found) => found,
        // Nobody identifiable in front (the desktop, a secure window): the
        // applied configuration, as before.
        None => (0, String::new()),
    };
    if !(runtime_state.controller_nav_enabled || runtime_state.autoload_fallback_enabled) {
        return; // Studio never took the pad and no fallback is wanted.
    }
    // Once per foreground change: a window can lose and regain activation
    // several times while it comes up, and every load is a RESET_MAPPINGS.
    if pid != 0 && state.handover_foreground_pid.swap(pid, Relaxed) == pid {
        return;
    }
    let testing = state.studio_testing.load(Relaxed);
    let fallback = if pid != 0 && !testing {
        runtime::autoload_fallback_profile_path(app, &runtime_state)
    } else {
        None
    };
    let loaded = match &fallback {
        Some(path) => {
            let injected = inject_profile_with_retry(app, state.inner(), path).unwrap_or(false);
            eprintln!("AutoLoad fallback for {stem} (pid {pid}): {} {path}", if injected { "loaded" } else { "could not load" });
            injected
        }
        None => false,
    };
    if !loaded && runtime_state.controller_nav_enabled {
        let profile = runtime::effective_profile_for_state(&runtime_state);
        let _ = inject_profile_with_retry(app, state.inner(), &profile);
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

/// A tick, click or rumble on the controller for Studio's own UI (selecting,
/// stepping sections and pages). Only while Studio's window is in front and
/// not testing: otherwise a configuration owns the pad and a stray tick would
/// land in a game. In-memory checks only -- this runs on every D-pad move, and
/// Studio only asks while its navigation has the pad. `grips` plays it as the
/// grip sensors' own haptic would (the Grip sensors sheet's preview).
#[tauri::command]
pub fn controller_feedback(state: State<'_, AppState>, effect: u8, intensity: f32, side: u8, rumble_ms: u32, rumble: f32, grips: Option<bool>) {
    use std::sync::atomic::Ordering::Relaxed;
    if state.telemetry_ui_active.load(Relaxed) && !state.studio_testing.load(Relaxed) {
        crate::services::feedback::send(effect, intensity, side, rumble_ms, rumble, grips.unwrap_or(false));
    }
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
#[tauri::command(async)]
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

/// Windows' pointer speed (Settings ▸ Mouse): SPI_GETMOUSESPEED's 1-20, where
/// 10 is the default 6-of-11 notch, and whether Enhance pointer precision
/// (mouse acceleration) is on. Gyro ▸ Speed ▸ Advanced ▸ Game & lean shows it
/// beside "Ignore Windows pointer speed". None off Windows or if it can't be read.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsPointerSpeed {
    speed: u32,
    enhance_precision: bool,
}

#[tauri::command]
pub fn get_windows_pointer_speed() -> Option<WindowsPointerSpeed> {
    read_windows_pointer_speed()
}

#[cfg(target_os = "windows")]
fn read_windows_pointer_speed() -> Option<WindowsPointerSpeed> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{SystemParametersInfoW, SPI_GETMOUSE, SPI_GETMOUSESPEED};
    let mut speed: u32 = 0;
    // SPI_GETMOUSE fills three ints: two thresholds and the acceleration flag.
    let mut mouse: [i32; 3] = [0; 3];
    let ok_speed = unsafe { SystemParametersInfoW(SPI_GETMOUSESPEED, 0, &mut speed as *mut u32 as *mut core::ffi::c_void, 0) };
    let ok_mouse = unsafe { SystemParametersInfoW(SPI_GETMOUSE, 0, mouse.as_mut_ptr() as *mut core::ffi::c_void, 0) };
    if ok_speed == 0 || !(1..=20).contains(&speed) {
        return None;
    }
    Some(WindowsPointerSpeed { speed, enhance_precision: ok_mouse != 0 && mouse[2] != 0 })
}

#[cfg(not(target_os = "windows"))]
fn read_windows_pointer_speed() -> Option<WindowsPointerSpeed> {
    None
}

#[tauri::command(async)]
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
#[tauri::command(async)]
pub fn set_controller_preferences(
    app: AppHandle,
    state: State<'_, AppState>,
    preferences: runtime::ControllerPreferences,
) -> CommandResult<runtime::RuntimeMappingState> {
    let previous = runtime::get_runtime_mapping_state(&app)?;
    let saved = runtime::set_controller_preferences(&app, preferences)?;
    let _ = jsm_process::inject_console_command(&app, state.inner(), "StudioDefaults.txt");
    // StudioDefaults is loaded first when a profile starts. Reapply an active
    // manual profile after changing the LED defaults so its own values still
    // take precedence without waiting for the next profile switch. AutoLoad
    // chooses the foreground application's profile on its next focus update.
    if !saved.autoload_enabled && saved.mapping_enabled
        && (previous.led_color != saved.led_color || previous.led_brightness != saved.led_brightness)
    {
        let profile = runtime::effective_profile_for_state(&saved);
        let _ = inject_profile_with_retry(&app, state.inner(), &profile)?;
    }
    Ok(saved)
}

/// Plays a built-in tune (`sound` 0-13) or, when `sound_id` names a library
/// sound, that sound's tone sequence, on every connected controller.
#[tauri::command(async)]
pub fn play_controller_sound(
    app: AppHandle,
    state: State<'_, AppState>,
    sound: i32,
    gain: Option<i32>,
    sound_id: Option<String>,
) -> CommandResult<SimpleSuccessResult> {
    let target = match sound_id.as_deref().map(str::trim).filter(|id| !id.is_empty()) {
        Some(id) => {
            // The id becomes part of a path handed to the mapper, so it is
            // checked here as well as by the library.
            sound_library::validate_sound_id(id)?;
            if !sound_library::is_ready(&app, id) {
                return Err("This sound has not been converted yet.".into());
            }
            sound_library::tones_relative_path(id)
        }
        None => {
            if !(0..=13).contains(&sound) {
                return Err("Sound must be 0-13.".into());
            }
            sound.to_string()
        }
    };
    // The gain the preview names, so it plays at the level just picked.
    let command = match gain {
        Some(gain) => format!("PLAY_SOUND {target} {}", gain.clamp(-30, 6)),
        None => format!("PLAY_SOUND {target}"),
    };
    let success = jsm_process::inject_console_command(&app, state.inner(), &command)?;
    Ok(SimpleSuccessResult { success })
}

/// Hear the current trim before it is saved to the sound library.
#[tauri::command(async)]
pub fn preview_controller_tones(
    app: AppHandle,
    state: State<'_, AppState>,
    tones: Vec<sound_library::Tone>,
    gain: Option<i32>,
) -> CommandResult<SimpleSuccessResult> {
    let path = sound_library::preview_tones(&app, &tones)?;
    let command = format!("PLAY_SOUND {path} {}", gain.unwrap_or(0).clamp(-30, 6));
    let success = jsm_process::inject_console_command(&app, state.inner(), &command)?;
    Ok(SimpleSuccessResult { success })
}

// --- Sound library --------------------------------------------------------------
// MP3s the user added and converted to tone sequences (services/sound_library.rs).
// All async: each touches files, and import/read move tens of megabytes of
// base64 that have no business on the main thread.

#[tauri::command(async)]
pub fn sound_library_list(app: AppHandle) -> CommandResult<Vec<sound_library::SoundEntry>> {
    sound_library::list(&app)
}

#[tauri::command(async)]
pub fn sound_library_import(app: AppHandle, name: String, mp3_base64: String) -> CommandResult<sound_library::SoundEntry> {
    sound_library::import(&app, &name, &mp3_base64)
}

#[tauri::command(async)]
pub fn sound_library_read_audio(app: AppHandle, id: String) -> CommandResult<String> {
    sound_library::read_audio(&app, &id)
}

#[tauri::command(async)]
pub fn sound_library_save(
    app: AppHandle,
    id: String,
    name: String,
    duration_ms: u32,
    trim_start_ms: u32,
    trim_end_ms: u32,
    tones: Vec<sound_library::Tone>,
    midi_track: Option<String>,
) -> CommandResult<sound_library::SoundEntry> {
    sound_library::save(&app, &id, &name, duration_ms, trim_start_ms, trim_end_ms, &tones, midi_track.as_deref())
}

/// "Volume on a button" for a library sound (console v2, D15).
#[tauri::command(async)]
pub fn sound_library_set_gain(app: AppHandle, id: String, gain_db: f32) -> CommandResult<sound_library::SoundEntry> {
    sound_library::set_default_gain(&app, &id, gain_db)
}

#[tauri::command(async)]
pub fn sound_library_rename(app: AppHandle, id: String, name: String) -> CommandResult<sound_library::SoundEntry> {
    sound_library::rename(&app, &id, &name)
}

/// Deletes a sound. If it was the Connect or Shutdown sound the choice is
/// cleared and the running mapper is handed the rewritten defaults, the way
/// `set_controller_preferences` does, so it stops looking for the file.
#[tauri::command(async)]
pub fn sound_library_delete(app: AppHandle, state: State<'_, AppState>, id: String) -> CommandResult<()> {
    let was_selected = runtime::get_runtime_mapping_state(&app)
        .map(|s| s.connect_sound_file.as_deref() == Some(id.as_str()) || s.shutdown_sound_file.as_deref() == Some(id.as_str()))
        .unwrap_or(false);
    sound_library::delete(&app, &id)?;
    if was_selected {
        let _ = jsm_process::inject_console_command(&app, state.inner(), "StudioDefaults.txt");
    }
    Ok(())
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
    let deleted = runtime::delete_library_profile(&app, &name)?;
    let fallback = deleted.fallback.map(|(path, content)| named_profile(path, content));

    Ok(DeleteLibraryProfileResult {
        success: true,
        fallback,
        recycled: deleted.recycled,
    })
}

#[tauri::command]
pub fn library_list_profile_meta(app: AppHandle) -> CommandResult<Vec<runtime::LibraryProfileMeta>> {
    runtime::list_library_profile_meta(&app)
}

#[tauri::command]
pub fn library_copy_active_profile(app: AppHandle) -> CommandResult<NamedProfile> {
    let (path, content) = runtime::copy_active_profile(&app)?;
    Ok(named_profile(path, content))
}

#[tauri::command(async)]
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

#[tauri::command(async)]
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

#[tauri::command(async)]
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

#[tauri::command(async)]
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
            "HidHide is installed, but JSM Evolved cannot repair the whitelist without administrator rights. Restart JSM Evolved as administrator."
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

#[tauri::command(async)]
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

#[tauri::command(async)]
pub fn get_hidhide_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<hidhide::HidHideStatus> {
    let latest_packet = telemetry::latest_packet(state.inner())?;
    hidhide::get_status(&app, latest_packet.as_ref())
}

#[tauri::command(async)]
pub fn set_hidhide_active(
    app: AppHandle,
    state: State<'_, AppState>,
    active: bool,
) -> CommandResult<hidhide::HidHideStatus> {
    let latest_packet = telemetry::latest_packet(state.inner())?;
    hidhide::set_active(&app, active, latest_packet.as_ref())
}

#[tauri::command(async)]
pub fn set_hidhide_device_hidden(
    app: AppHandle,
    state: State<'_, AppState>,
    instance_id: String,
    hidden: bool,
) -> CommandResult<hidhide::HidHideStatus> {
    let latest_packet = telemetry::latest_packet(state.inner())?;
    hidhide::set_device_hidden(&app, &instance_id, hidden, latest_packet.as_ref())
}

#[tauri::command(async)]
pub fn sync_hidhide_whitelist(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<hidhide::HidHideStatus> {
    let latest_packet = telemetry::latest_packet(state.inner())?;
    hidhide::sync_whitelist(&app, latest_packet.as_ref())
}

#[tauri::command(async)]
pub fn install_bundled_hidhide(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<hidhide::HidHideInstallResult> {
    let latest_packet = telemetry::latest_packet(state.inner())?;
    hidhide::install_bundled(&app, latest_packet.as_ref())
}

#[tauri::command(async)]
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

#[tauri::command(async)]
pub fn start_input_debug_hook(app: AppHandle) -> CommandResult<input_debug::InputDebugHookStatus> {
    input_debug::start(app)
}

#[tauri::command(async)]
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

#[tauri::command(async)]
pub fn get_autostart_enabled() -> CommandResult<bool> {
    autostart::is_autostart_enabled()
}

#[tauri::command(async)]
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
    scale: f64,
}

#[tauri::command]
pub fn overlay_workarea(app: AppHandle) -> CommandResult<OverlayWorkarea> {
    let (x, y, width, height, scale) = overlay::workarea(&app)?;
    Ok(OverlayWorkarea { x, y, width, height, scale })
}

// --- Mouse area picker -------------------------------------------------------
// Drawing a MOUSE_AREA trackpad's rectangle on the screen itself, over the
// game. See services/area_picker.rs.

// Async on purpose: a synchronous command runs on the main thread, and on
// Windows building a window from there deadlocks -- Draw on screen used to hang
// right here, with the picker window never created.
#[tauri::command]
pub async fn area_picker_open(app: AppHandle, request: area_picker::AreaRequest) -> CommandResult<area_picker::PickerState> {
    area_picker::open(&app, request)
}

/// The picker window asks for this once it has loaded, since the open event
/// may have fired before it was listening.
#[tauri::command]
pub fn area_picker_state(app: AppHandle) -> CommandResult<Option<area_picker::PickerState>> {
    Ok(area_picker::state(&app))
}

#[tauri::command]
pub fn area_picker_next_monitor(app: AppHandle) -> CommandResult<Option<area_picker::PickerState>> {
    area_picker::next_monitor(&app)
}

/// `area` kept, or None to cancel. Either way Studio comes back.
#[tauri::command]
pub fn area_picker_close(app: AppHandle, area: Option<area_picker::AreaRect>) -> CommandResult<()> {
    area_picker::close(&app, area)
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

/// The global timing store (console refinement D8). Saved, then handed to the
/// running mapper at once through StudioDefaults.txt, the way controller
/// preferences are, so a change takes effect without applying a profile.
#[tauri::command(async)]
pub fn set_global_timing(
    app: AppHandle,
    state: State<'_, AppState>,
    timing: runtime::GlobalTiming,
) -> CommandResult<runtime::RuntimeMappingState> {
    let saved = runtime::set_global_timing(&app, timing)?;
    if saved.mapping_enabled {
        let _ = jsm_process::inject_console_command(&app, state.inner(), "StudioDefaults.txt");
    }
    Ok(saved)
}

/// The tray menu has laid out at this size (CSS pixels): place it and show it.
#[tauri::command]
pub fn tray_menu_place(app: AppHandle, width: f64, height: f64) -> CommandResult<()> {
    crate::services::tray_menu::place(&app, width, height)
}

#[tauri::command]
pub fn tray_menu_hide(app: AppHandle) {
    crate::services::tray_menu::hide(&app);
}

#[tauri::command]
pub fn tray_show_studio(app: AppHandle) {
    crate::services::tray_menu::hide(&app);
    crate::show_main_window(&app);
}

#[tauri::command]
pub fn tray_quit(app: AppHandle) {
    app.exit(0);
}

// --- Brand icon --------------------------------------------------------------
// The Appearance page draws the chosen mark and sends the pixels; see
// services/brand_icon.rs.
#[tauri::command]
pub fn set_brand_icon(app: AppHandle, request: tauri::ipc::Request<'_>) -> CommandResult<()> {
    crate::services::brand_icon::set_from_request(&app, request)
}

// --- Console v2 SHELL: updates, startup, Hold to swap order, the log ---------

/// The shared update status (D19), without asking GitHub.
#[tauri::command]
pub fn get_update_status(app: AppHandle) -> crate::services::updates::UpdateStatus {
    crate::services::updates::status(&app)
}

/// Ask GitHub's latest release now ("Check now", X on About).
#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> CommandResult<crate::services::updates::UpdateStatus> {
    Ok(crate::services::updates::check(&app).await)
}

/// Download the new version's installer, start it and close the app.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> CommandResult<()> {
    crate::services::updates::install(&app).await
}

/// Settings ▸ Startup: Start in the tray and What loads first (D20).
#[tauri::command(async)]
pub fn get_startup_preferences(app: AppHandle) -> CommandResult<runtime::StartupPreferences> {
    runtime::get_startup_preferences(&app)
}

#[tauri::command(async)]
pub fn set_startup_preferences(app: AppHandle, preferences: runtime::StartupPreferences) -> CommandResult<runtime::StartupPreferences> {
    runtime::set_startup_preferences(&app, preferences)
}

/// Settings ▸ Hold to swap: the list top to bottom; the higher card wins.
#[tauri::command(async)]
pub fn reorder_global_chords(app: AppHandle, ids: Vec<String>) -> CommandResult<Vec<runtime::GlobalChord>> {
    runtime::reorder_global_chords(&app, &ids)
}

/// Settings ▸ Troubleshooting log's Recent commands, newest first.
#[tauri::command(async)]
pub fn list_recent_console_commands(app: AppHandle) -> CommandResult<Vec<String>> {
    crate::services::console_history::list(&app)
}

#[tauri::command(async)]
pub fn record_console_command(app: AppHandle, command: String) -> CommandResult<Vec<String>> {
    crate::services::console_history::record(&app, &command)
}

#[tauri::command(async)]
pub fn clear_recent_console_commands(app: AppHandle) -> CommandResult<Vec<String>> {
    crate::services::console_history::clear(&app)
}

/// The app in front other than this one (Library ▸ Launch with game's "Right
/// now"); changes arrive as the "foreground-app" event.
#[tauri::command]
pub fn get_foreground_app() -> Option<crate::services::foreground::ForegroundApp> {
    crate::services::foreground::current_app()
}

/// "Restart the mapper" (Troubleshooting log ▸ Fix it): stop it and start it
/// again on the live configuration.
#[tauri::command(async)]
pub fn restart_mapper(app: AppHandle, state: State<'_, AppState>) -> CommandResult<()> {
    jsm_process::terminate_jsm(&app, state.inner())?;
    jsm_process::launch_jsm(&app, state.inner())?;
    Ok(())
}

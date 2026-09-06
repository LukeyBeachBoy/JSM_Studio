mod commands;
mod runtime;
mod services;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WindowEvent,
};

use services::{app_state::AppState, hidhide, input_debug, jsm_process, telemetry};

const TRAY_SHOW_ID: &str = "show";
const TRAY_QUIT_ID: &str = "quit";

/// True when this invocation came from the logon scheduled task rather than a
/// person opening the app. See `autostart.rs` and the setup hook below.
fn launched_at_autostart<I: IntoIterator<Item = String>>(arguments: I) -> bool {
    arguments.into_iter().any(|argument| argument == "--autostart")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // Registered before anything else so a second launch hands its arguments
        // to the running app and exits here, rather than getting as far as
        // spawning a second JoyShockMapper -- two mappers fight over the same
        // controller and telemetry port, and the tray leaves the first window
        // hidden, which is exactly how a duplicate goes unnoticed.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // A person re-opening the app expects the window back; the logon
            // task firing while the app already runs must not pop one open.
            if !launched_at_autostart(argv) {
                show_main_window(app);
            }
        }))
        .plugin(tauri_plugin_process::init())
        .manage(AppState::default())
        .setup(|app| {
            let state = app.state::<AppState>().inner().clone();
            if let Err(error) = runtime::ensure_required_files(&app.handle()) {
                eprintln!("Failed to initialize Tauri runtime files: {error}");
            }
            telemetry::start(app.handle().clone(), state.clone());
            services::global_chords::start(app.handle().clone(), state.clone());
            if let Err(error) = sync_hidhide_whitelist_if_available(&app.handle()) {
                eprintln!(
                    "Failed to sync HidHide whitelist before launching JoyShockMapper: {error}"
                );
            }
            if let Err(error) = jsm_process::launch_jsm(&app.handle(), &state) {
                eprintln!("Failed to auto-launch JoyShockMapper from Tauri: {error}");
            }

            // Closing the window (see the on_window_event handler below) hides
            // it rather than quitting -- JoyShockMapper keeps running and the
            // controller keeps working, matching Steam Input's own background
            // behavior. The tray icon is what makes that discoverable/reversible
            // instead of the app just vanishing with no way back but the taskbar.
            let show_item = MenuItem::with_id(app, TRAY_SHOW_ID, "Show JSM Studio", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, TRAY_QUIT_ID, "Quit", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &separator, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().expect("bundled tray icon"))
                .tooltip("JSM Studio")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app_handle, event| match event.id.as_ref() {
                    TRAY_SHOW_ID => show_main_window(app_handle),
                    TRAY_QUIT_ID => app_handle.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Left-click restores the window, matching how every other
                    // tray icon on Windows behaves; right-click's context menu
                    // is handled by TrayIconBuilder itself (menu() above).
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // The window starts hidden (tauri.conf.json) so an autostart launch
            // never flashes it visible before this decides otherwise. Everything
            // that makes the controller usable (JoyShockMapper, telemetry) has
            // already started above regardless of this flag -- only the window's
            // visibility depends on it.
            if !launched_at_autostart(std::env::args()) {
                show_main_window(&app.handle());
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::launch_jsm,
            commands::terminate_jsm,
            commands::minimize_temporarily,
            commands::apply_profile,
            commands::get_runtime_mapping_state,
            commands::set_mapping_enabled,
            commands::set_autoload_enabled,
            commands::list_autoload_rules,
            commands::set_controller_nav_enabled,
            commands::list_global_chords,
            commands::save_global_chord,
            commands::delete_global_chord,
            commands::save_autoload_rule,
            commands::delete_autoload_rule,
            commands::recalibrate_gyro,
            commands::get_calibration_seconds,
            commands::set_calibration_seconds,
            commands::library_list_profiles,
            commands::library_save_profile,
            commands::library_load_profile,
            commands::get_active_profile,
            commands::activate_library_profile,
            commands::library_create_profile,
            commands::library_rename_profile,
            commands::library_delete_profile,
            commands::library_copy_active_profile,
            commands::load_calibration_preset,
            commands::read_calibration_preset,
            commands::save_calibration_preset,
            commands::run_calibration_command,
            commands::list_jsm_controllers,
            commands::reconnect_jsm_controllers,
            commands::get_backend_choice,
            commands::set_backend_choice,
            commands::get_latest_telemetry_sample,
            commands::get_hidhide_status,
            commands::set_hidhide_active,
            commands::set_hidhide_device_hidden,
            commands::sync_hidhide_whitelist,
            commands::install_bundled_hidhide,
            commands::open_hidhide_client,
            commands::open_external,
            commands::open_config_directory,
            commands::start_input_debug_hook,
            commands::stop_input_debug_hook,
            commands::get_input_debug_hook_status,
            commands::get_ai_settings,
            commands::save_ai_settings,
            commands::generate_ai_mapping,
            commands::get_autostart_enabled,
            commands::set_autostart_enabled,
        ])
        .on_window_event(|window, event| {
            // Hide instead of destroying: JoyShockMapper and the telemetry
            // socket keep running, so the controller never stops working just
            // because the window closed. Only the tray's Quit item (or an
            // explicit app_handle.exit()) tears anything down -- see below.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
            let state = app_handle.state::<AppState>();
            if let Err(error) = jsm_process::terminate_jsm(app_handle, state.inner()) {
                eprintln!("Failed to terminate JoyShockMapper during Tauri shutdown: {error}");
            }
            if let Err(error) = input_debug::stop() {
                eprintln!("Failed to stop input debug hook during Tauri shutdown: {error}");
            }
        }
    });
}

fn show_main_window(app_handle: &tauri::AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn sync_hidhide_whitelist_if_available(app: &tauri::AppHandle) -> Result<(), String> {
    let status = hidhide::get_status(app, None)?;
    if status.supported
        && status.installed
        && !status.requires_elevation
        && !status.whitelist_synced
    {
        let _ = hidhide::sync_whitelist(app, None)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::launched_at_autostart;

    #[test]
    fn only_the_autostart_flag_suppresses_the_window() {
        let exe = "JSM Studio.exe".to_string();
        assert!(launched_at_autostart(vec![exe.clone(), "--autostart".into()]));
        // A second launch from the shortcut must still restore the window.
        assert!(!launched_at_autostart(vec![exe.clone()]));
        assert!(!launched_at_autostart(vec![exe, "--autostarted".into()]));
    }
}

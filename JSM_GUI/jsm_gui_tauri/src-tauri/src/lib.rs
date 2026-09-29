mod commands;
mod runtime;
mod services;

use tauri::{Manager, RunEvent, WindowEvent};

use services::{app_state::AppState, hidhide, input_debug, jsm_process, telemetry};

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
            // Whether Studio is in front, from Windows rather than the
            // window's focus events (services/foreground.rs).
            services::foreground::start(app.handle().clone());
            services::global_chords::start(app.handle().clone(), state.clone());
            // Built hidden and click-through up front: creating a WebView window
            // costs around 100ms, which is not something to spend on the first
            // touch of a pad menu. It draws nothing and receives nothing until
            // overlay_set_enabled turns the emitter on.
            if let Err(error) = services::overlay::ensure(&app.handle()) {
                eprintln!("Failed to prepare the trackpad overlay: {error}");
            }
            services::overlay::start_stacking_guard(app.handle().clone());
            if let Err(error) = services::hud::ensure(&app.handle()) {
                eprintln!("Failed to prepare the calibration HUD: {error}");
            }
            // ... and put it back on if that is how it was left. Without this
            // the overlay silently defaults to off on every launch, which reads
            // as the feature having broken rather than as a setting.
            if runtime::read_runtime_mapping_state(&app.handle())
                .map(|s| s.trackpad_overlay_enabled)
                .unwrap_or(false)
            {
                if let Err(error) = services::overlay::set_enabled(&app.handle(), &state, true) {
                    eprintln!("Failed to restore the trackpad overlay: {error}");
                }
            }
            services::profile_library::start(app.handle().clone());
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
            // It is the only icon: the mapper's own is off (services/tray_menu.rs).
            services::tray_menu::install(&app.handle())?;
            // ... in the accent chosen last time (services/brand_icon.rs).
            services::brand_icon::restore(&app.handle());
            // The logon task points at the exe by path; refresh it in case the
            // install moved (the JSM Studio -> JSM Evolved rename did that).
            std::thread::spawn(services::autostart::refresh_after_launch);

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
            commands::get_mapper_status,
            commands::get_layer_stack,
            commands::set_autoload_rule_paused,
            commands::set_reserved_chords,
            commands::set_calibration_hud_enabled,
            commands::overlay_set_enabled,
            commands::ui_set_refresh_hz,
            commands::overlay_set_refresh_hz,
            commands::overlay_set_bounds,
            commands::overlay_workarea,
            commands::terminate_jsm,
            commands::minimize_temporarily,
            commands::resume_studio_navigation,
            commands::apply_profile,
            commands::get_runtime_mapping_state,
            commands::set_mapping_enabled,
            commands::set_autoload_enabled,
            commands::list_autoload_rules,
            commands::list_running_processes,
            commands::get_autoload_fallback,
            commands::set_autoload_fallback,
            commands::set_controller_nav_enabled,
            commands::set_studio_testing,
            commands::controller_feedback,
            commands::set_default_polling_ms,
            commands::set_global_timing,
            commands::list_global_chords,
            commands::save_global_chord,
            commands::delete_global_chord,
            commands::save_autoload_rule,
            commands::delete_autoload_rule,
            commands::recalibrate_gyro,
            commands::get_calibration_seconds,
            commands::set_calibration_seconds,
            commands::set_controller_preferences,
            commands::play_controller_sound,
            commands::library_list_profiles,
            commands::library_list_profile_meta,
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
            commands::read_config_file,
            commands::start_input_debug_hook,
            commands::stop_input_debug_hook,
            commands::get_input_debug_hook_status,
            commands::get_ai_settings,
            commands::save_ai_settings,
            commands::generate_ai_mapping,
            commands::get_autostart_enabled,
            commands::set_autostart_enabled,
            commands::tray_menu_place,
            commands::tray_menu_hide,
            commands::tray_show_studio,
            commands::tray_quit,
            commands::set_brand_icon,
        ])
        .on_window_event(|window, event| {
            // The tray menu dismisses as a native menu does: on losing focus.
            if window.label() == services::tray_menu::TRAY_MENU_LABEL {
                if let WindowEvent::Focused(false) = event {
                    let _ = window.hide();
                }
                return;
            }
            if window.label() == "main" {
                let state = window.state::<AppState>();
                match event {
                    WindowEvent::Focused(focused) if services::foreground::FOLLOW_WINDOW_EVENTS => {
                        state.telemetry_ui_active.store(*focused, std::sync::atomic::Ordering::Relaxed);
                        let app = window.app_handle().clone();
                        let focused = *focused;
                        std::thread::spawn(move || commands::studio_focus_changed(&app, focused));
                    }
                    WindowEvent::CloseRequested { .. } => state.telemetry_ui_active.store(
                        false, std::sync::atomic::Ordering::Relaxed),
                    _ => {}
                }
            }
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

pub(crate) fn show_main_window(app_handle: &tauri::AppHandle) {
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
        let exe = "JSM Evolved.exe".to_string();
        assert!(launched_at_autostart(vec![exe.clone(), "--autostart".into()]));
        // A second launch from the shortcut must still restore the window.
        assert!(!launched_at_autostart(vec![exe.clone()]));
        assert!(!launched_at_autostart(vec![exe, "--autostarted".into()]));
    }
}

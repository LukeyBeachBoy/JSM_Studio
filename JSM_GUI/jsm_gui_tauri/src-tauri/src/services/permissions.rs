//! Normal-user launch, explicit UAC restart and a per-user launch preference.
//! The replacement waits for the old process before acquiring the single-instance
//! lock, so accepting UAC cannot create a second mapper or lose the restart.
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionPreferences {
    #[serde(default)]
    pub request_admin_on_launch: bool,
    #[serde(default)]
    pub introduction_seen: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionStatus {
    pub elevated: bool,
    pub legacy_startup_task: bool,
    pub windows_sign_in_enabled: bool,
    #[serde(flatten)]
    pub preferences: PermissionPreferences,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map(|p| p.join("permissions.json")).map_err(|e| e.to_string())
}

const SIGN_IN_CONSENT: &str = "enabled-v1\n";

fn sign_in_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::runtime::runtime_dir(app)?.join("windows-sign-in-consent"))
}

fn sign_in_enabled(path: &std::path::Path) -> bool {
    fs::read(path).map(|bytes| bytes == SIGN_IN_CONSENT.as_bytes()).unwrap_or(false)
}

/// This is separate from profile content and administrator/driver preferences.
/// Never seed or migrate consent from an existing profile or installed driver.
#[tauri::command]
pub fn set_windows_sign_in_enabled(app: AppHandle, enabled: bool) -> Result<PermissionStatus, String> {
    let path = sign_in_path(&app)?;
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    crate::runtime::write_file_atomically(&path, if enabled { SIGN_IN_CONSENT } else { "disabled-v1\n" })?;
    permission_status(app)
}

fn read(app: &AppHandle) -> Result<PermissionPreferences, String> {
    match fs::read(settings_path(app)?) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| format!("Could not read permission preferences: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(PermissionPreferences::default()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn is_elevated() -> bool {
    // IsUserAnAdmin checks the effective token, not simply group membership.
    unsafe { windows_sys::Win32::UI::Shell::IsUserAnAdmin() != 0 }
}

pub fn should_request_admin(preferences: &PermissionPreferences, elevated: bool, autostart: bool) -> bool {
    preferences.request_admin_on_launch && !elevated && !autostart
}

#[tauri::command]
pub fn permission_status(app: AppHandle) -> Result<PermissionStatus, String> {
    Ok(PermissionStatus {
        elevated: is_elevated(),
        legacy_startup_task: super::autostart::has_legacy_task(),
        windows_sign_in_enabled: sign_in_enabled(&sign_in_path(&app)?),
        preferences: read(&app)?,
    })
}

#[tauri::command]
pub fn save_permission_preferences(app: AppHandle, preferences: PermissionPreferences) -> Result<PermissionStatus, String> {
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    crate::runtime::write_file_atomically(&path, serde_json::to_string_pretty(&preferences).map_err(|e| e.to_string())?)?;
    permission_status(app)
}

fn wide(value: &std::ffi::OsStr) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    value.encode_wide().chain(Some(0)).collect()
}

/// Only called with a bundled driver installer or installed HidHide client.
/// ShellExecute supports elevation-required executables where Command::spawn
/// would fail with ERROR_ELEVATION_REQUIRED on a normal-user launch.
pub fn run_elevated_file(file: &std::path::Path, arguments: Option<&str>, wait: bool) -> Result<u32, String> {
    use windows_sys::Win32::{Foundation::{CloseHandle, GetLastError, WAIT_OBJECT_0}, System::Threading::{GetExitCodeProcess, WaitForSingleObject}, UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW, SEE_MASK_NOCLOSEPROCESS}};
    let file = wide(file.as_os_str());
    let verb = wide(std::ffi::OsStr::new("runas"));
    let args = arguments.map(|s| wide(std::ffi::OsStr::new(s)));
    let mut info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
    info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
    info.fMask = SEE_MASK_NOCLOSEPROCESS;
    info.lpVerb = verb.as_ptr();
    info.lpFile = file.as_ptr();
    info.lpParameters = args.as_ref().map_or(std::ptr::null(), |v| v.as_ptr());
    info.nShow = 1;
    if unsafe { ShellExecuteExW(&mut info) } == 0 {
        return Err(format!("Windows did not approve or could not open the requested tool (error {}).", unsafe { GetLastError() }));
    }
    if info.hProcess.is_null() { return if wait { Err("Windows did not return an installer process to verify.".into()) } else { Ok(0) }; }
    let result = if wait {
        let completed = unsafe { WaitForSingleObject(info.hProcess, 600_000) };
        let mut code = 0;
        if completed == WAIT_OBJECT_0 && unsafe { GetExitCodeProcess(info.hProcess, &mut code) } != 0 { Ok(code) }
        else { Err("The driver setup is still running or its result could not be read. Finish it before trying again.".into()) }
    } else { Ok(0) };
    unsafe { CloseHandle(info.hProcess); }
    result
}

#[tauri::command]
pub async fn restart_as_administrator(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || request_restart(&app)).await.map_err(|e| e.to_string())?
}

fn request_restart(app: &AppHandle) -> Result<(), String> {
    if is_elevated() { return Ok(()); }
    let exe = wide(std::env::current_exe().map_err(|e| e.to_string())?.as_os_str());
    let verb = wide(std::ffi::OsStr::new("runas"));
    let arguments = wide(std::ffi::OsStr::new(&format!("--wait-for-restart-pid={}", std::process::id())));
    // Only our executable and a generated numeric PID are passed to Windows.
    // ShellExecute waits for the consent decision. Cancellation keeps this app
    // and its mapper alive; exit only follows an accepted launch.
    let result = unsafe {
        windows_sys::Win32::UI::Shell::ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), exe.as_ptr(), arguments.as_ptr(), std::ptr::null(), 1)
    } as isize;
    if result <= 32 { return Err("Administrator restart was cancelled or Windows could not open the app. JSM Evolved is still running normally.".into()); }
    app.exit(0);
    Ok(())
}

pub fn request_at_launch(app: &AppHandle, autostart: bool) -> bool {
    let preferences = read(app).unwrap_or_default();
    if should_request_admin(&preferences, is_elevated(), autostart) {
        match request_restart(app) {
            Ok(()) => return true,
            Err(error) => eprintln!("{error}"),
        }
    }
    false
}

fn restart_pid(arguments: impl IntoIterator<Item = String>) -> Result<Option<u32>, String> {
    let Some(argument) = arguments.into_iter().find(|arg| arg.starts_with("--wait-for-restart-pid=")) else { return Ok(None); };
    let pid = argument.trim_start_matches("--wait-for-restart-pid=").parse::<u32>().map_err(|_| "Invalid restart process ID".to_string())?;
    if pid == 0 || pid == std::process::id() { return Err("Invalid restart process ID".into()); }
    Ok(Some(pid))
}

/// Must run before the single-instance plugin is constructed.
pub fn wait_for_previous_instance() -> Result<(), String> {
    use windows_sys::Win32::{Foundation::{CloseHandle, GetLastError, ERROR_INVALID_PARAMETER, WAIT_OBJECT_0}, System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE}};
    let Some(pid) = restart_pid(std::env::args())? else { return Ok(()); };
    let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
    if handle.is_null() {
        return if unsafe { GetLastError() } == ERROR_INVALID_PARAMETER { Ok(()) } else { Err("Could not wait for the previous JSM Evolved process to close.".into()) };
    }
    let result = unsafe { WaitForSingleObject(handle, 30_000) };
    unsafe { CloseHandle(handle); }
    if result == WAIT_OBJECT_0 { Ok(()) } else { Err("The previous JSM Evolved process did not close. Quit it from the tray and open the app again.".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sign_in_consent_is_separate_and_fails_closed() {
        let path = std::env::temp_dir().join(format!("jsm-sign-in-consent-{}", std::process::id()));
        let _ = fs::remove_file(&path);
        assert!(!sign_in_enabled(&path));
        for bytes in ["", "true", "enabled-v1", "enabled-v1\nextra", "disabled-v1\n"] {
            fs::write(&path, bytes).unwrap();
            assert!(!sign_in_enabled(&path));
        }
        crate::runtime::write_file_atomically(&path, SIGN_IN_CONSENT).unwrap();
        assert!(sign_in_enabled(&path));
        crate::runtime::write_file_atomically(&path, "disabled-v1\n").unwrap();
        assert!(!sign_in_enabled(&path));
        fs::remove_file(path).unwrap();
        let old: PermissionPreferences = serde_json::from_str(r#"{"requestAdminOnLaunch":true,"introductionSeen":true}"#).unwrap();
        assert!(old.request_admin_on_launch); // admin preference never grants sign-in
    }
    #[test]
    fn ordinary_and_windows_startup_launches_do_not_request_admin() {
        let mut preferences = PermissionPreferences::default();
        assert!(!should_request_admin(&preferences, false, false));
        preferences.request_admin_on_launch = true;
        assert!(should_request_admin(&preferences, false, false));
        assert!(!should_request_admin(&preferences, true, false));
        assert!(!should_request_admin(&preferences, false, true));
    }
    #[test]
    fn restart_wait_accepts_only_a_nonzero_other_process() {
        assert_eq!(restart_pid(vec!["app.exe".into()]).unwrap(), None);
        assert_eq!(restart_pid(vec!["--wait-for-restart-pid=42".into()]).unwrap(), Some(42));
        for value in ["0", "abc", "42 & whoami"] { assert!(restart_pid(vec![format!("--wait-for-restart-pid={value}")]).is_err()); }
    }
}

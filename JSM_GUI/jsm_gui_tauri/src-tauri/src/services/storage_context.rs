//! Keep the NSIS app outside a launcher's MSIX filesystem view. A packaged
//! parent otherwise makes the same AppData path refer to a different library.
#[cfg(windows)]
const RELAUNCH_MARKER: &str = "--jsm-storage-context";

/// Quote one argument for CommandLineToArgvW / the Windows CRT. Always quote,
/// doubling backslashes before quotes and the closing quote.
#[cfg(windows)]
fn quote_argument(value: &std::ffi::OsStr) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    let mut result = vec![b'"' as u16];
    let mut slashes = 0;
    for unit in value.encode_wide() {
        if unit == b'\\' as u16 { slashes += 1; continue; }
        result.extend(std::iter::repeat_n(b'\\' as u16, slashes * if unit == b'"' as u16 { 2 } else { 1 }));
        if unit == b'"' as u16 { result.push(b'\\' as u16); }
        result.push(unit);
        slashes = 0;
    }
    result.extend(std::iter::repeat_n(b'\\' as u16, slashes * 2));
    result.push(b'"' as u16);
    result
}

#[cfg(windows)]
pub fn normalize_launch(identifier: &str) -> Result<bool, String> {
    let root = data_directory(identifier)?;
    std::fs::create_dir_all(&root).map_err(|e| format!("Cannot access configuration directory {}: {e}", root.display()))?;
    let physical_root = std::fs::canonicalize(&root).map_err(|e| format!("Cannot verify configuration directory: {e}"))?;
    // Directory handles may resolve to the real folder while its individual
    // files are virtualized. Verify a new disposable file before any settings
    // or profile initialization, not just the directory's spelling.
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let probe = root.join(format!(".storage-context-{}-{nonce}.tmp", std::process::id()));
    let file = std::fs::OpenOptions::new().write(true).create_new(true).open(&probe)
        .map_err(|e| format!("Cannot access configuration directory {}: {e}", root.display()))?;
    let physical = std::fs::canonicalize(&probe);
    drop(file);
    std::fs::remove_file(&probe).map_err(|e| format!("Cannot finish configuration directory check: {e}"))?;
    let physical = physical.map_err(|e| format!("Cannot verify configuration directory: {e}"))?;
    if physical.parent() == Some(physical_root.as_path()) && !private_package_path(&physical) { return Ok(false); }
    if std::env::args_os().any(|arg| arg == RELAUNCH_MARKER) {
        return Err("Windows kept this launch in a private package storage context. The configuration library was not opened or changed.".into());
    }
    use windows::{core::{BSTR, Interface}, Win32::{
        System::{Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_LOCAL_SERVER, COINIT_APARTMENTTHREADED, IDispatch, IServiceProvider}, Variant::VARIANT},
        UI::Shell::{IShellWindows, IShellBrowser, IShellFolderViewDual, IShellDispatch2, ShellWindows, SID_STopLevelBrowser, SWC_DESKTOP, SWFO_NEEDDISPATCH, SVGIO_BACKGROUND},
    }};
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut command = Vec::new();
    for arg in std::env::args_os().skip(1).chain(Some(RELAUNCH_MARKER.into())) {
        if !command.is_empty() { command.push(b' ' as u16); }
        command.extend(quote_argument(&arg));
    }
    let launch = unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok().map_err(|e| e.to_string())?;
        let launch = (|| -> windows::core::Result<()> {
            let shell: IShellWindows = CoCreateInstance(&ShellWindows, None, CLSCTX_LOCAL_SERVER)?;
            let mut hwnd = 0;
            let desktop = shell.FindWindowSW(&VARIANT::from(0i32), &VARIANT::default(), SWC_DESKTOP, &mut hwnd, SWFO_NEEDDISPATCH)?;
            let services: IServiceProvider = desktop.cast()?;
            let browser: IShellBrowser = services.QueryService(&SID_STopLevelBrowser)?;
            let view = browser.QueryActiveShellView()?;
            let dispatch: IDispatch = view.GetItemObject(SVGIO_BACKGROUND)?;
            let folder: IShellFolderViewDual = dispatch.cast()?;
            let application: IShellDispatch2 = folder.Application()?.cast()?;
            use std::os::windows::ffi::OsStrExt;
            application.ShellExecute(&BSTR::from_wide(&exe.as_os_str().encode_wide().collect::<Vec<_>>()),
                &VARIANT::from(BSTR::from_wide(&command)), &VARIANT::default(),
                // The app itself decides Start in tray. Do not give Windows a
                // hidden startup show-state that suppresses its first window.
                &VARIANT::from("open"), &VARIANT::from(1i32))
        })();
        CoUninitialize();
        launch
    };
    launch.map_err(|e| format!("Cannot launch with the normal configuration library: {e}"))?;
    Ok(true)
}

#[cfg(windows)]
pub fn data_directory(identifier: &str) -> Result<std::path::PathBuf, String> {
    use std::{os::windows::ffi::OsStringExt, path::PathBuf};
    use windows_sys::Win32::{UI::Shell::{SHGetKnownFolderPath, FOLDERID_RoamingAppData, KF_FLAG_NO_PACKAGE_REDIRECTION}, System::Com::CoTaskMemFree};
    let mut path = std::ptr::null_mut();
    let result = unsafe { SHGetKnownFolderPath(&FOLDERID_RoamingAppData, KF_FLAG_NO_PACKAGE_REDIRECTION as u32, std::ptr::null_mut(), &mut path) };
    if result < 0 { return Err(format!("Cannot resolve configuration directory (Windows error {result:#x})")); }
    let mut length = 0;
    unsafe {
        while *path.add(length) != 0 { length += 1; }
        let root = PathBuf::from(std::ffi::OsString::from_wide(std::slice::from_raw_parts(path, length)));
        CoTaskMemFree(path.cast());
        Ok(root.join(identifier))
    }
}

#[cfg(windows)]
fn private_package_path(path: &std::path::Path) -> bool {
    let path = path.to_string_lossy().replace('/', "\\").to_ascii_lowercase();
    path.contains("\\packages\\") && path.contains("\\localcache\\")
}

#[cfg(not(windows))]
pub fn normalize_launch(_identifier: &str) -> Result<bool, String> { Ok(false) }

pub fn report_startup_error(error: &str) {
    eprintln!("Configuration storage unavailable: {error}");
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
        let title: Vec<u16> = "JSM Evolved — configuration unavailable".encode_utf16().chain(Some(0)).collect();
        let message: Vec<u16> = format!("{error}\n\nJSM Evolved stopped before loading profiles or starting the mapper. Your saved configurations have not been replaced.").encode_utf16().chain(Some(0)).collect();
        MessageBoxW(std::ptr::null_mut(), message.as_ptr(), title.as_ptr(), MB_OK | MB_ICONERROR);
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[test]
    fn arguments_preserve_spaces_quotes_and_trailing_slashes() {
        let quote = |s: &str| String::from_utf16(&quote_argument(std::ffi::OsStr::new(s))).unwrap();
        assert_eq!(quote(""), "\"\"");
        assert_eq!(quote("C:\\Program Files\\JSM Evolved.exe"), "\"C:\\Program Files\\JSM Evolved.exe\"");
        assert_eq!(quote("a\"b"), "\"a\\\"b\"");
        assert_eq!(quote("path\\"), "\"path\\\\\"");
    }
    #[test]
    fn detect_physical_redirection_without_rejecting_normal_or_relocated_data() {
        assert!(private_package_path(std::path::Path::new(r"\\?\C:\Users\someone\AppData\Local\Packages\Launcher\LocalCache\Roaming\com.lukeybeachboy.jsmstudio")));
        assert!(!private_package_path(std::path::Path::new(r"C:\Users\someone\AppData\Roaming\com.lukeybeachboy.jsmstudio")));
        assert!(!private_package_path(std::path::Path::new(r"D:\User Data\JSM")));
        assert!(private_package_path(std::path::Path::new(r"D:\Local\Packages\Launcher\LocalCache\Roaming\JSM")));
    }
}

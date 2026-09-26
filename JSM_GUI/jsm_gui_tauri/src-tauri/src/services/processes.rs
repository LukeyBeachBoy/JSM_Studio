//! The apps a person can pick an association for: every process that owns a
//! visible, titled top-level window, one row per executable. Games and tools
//! show up; services, helpers and Studio's own machinery do not. This is the
//! same set AutoLoad can ever match, since it keys on the foreground window's
//! process.

use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningProcess {
    /// Executable name, e.g. Cyberpunk2077.exe.
    pub process_name: String,
    pub pid: u32,
    pub window_title: Option<String>,
}

/// Studio itself, the mapper and its console injector are never candidates:
/// Studio's rule is built in, and the other two never take the foreground.
fn is_excluded(exe_name: &str) -> bool {
    let own = std::env::current_exe()
        .ok()
        .and_then(|path| path.file_name().map(|name| name.to_string_lossy().into_owned()));
    own.as_deref().is_some_and(|own| own.eq_ignore_ascii_case(exe_name))
        || exe_name.eq_ignore_ascii_case("JoyShockMapper.exe")
        || exe_name.eq_ignore_ascii_case("jsm-console-injector.exe")
}

/// One row per executable, sorted by name ignoring case. The first titled
/// window found for a process names the row; a process with only untitled
/// visible windows is not listed, since that is what message-only helpers
/// and hidden hosts look like.
fn collapse(windows: Vec<(u32, String)>, exe_names: &std::collections::HashMap<u32, String>) -> Vec<RunningProcess> {
    let mut by_exe: std::collections::HashMap<String, RunningProcess> = std::collections::HashMap::new();
    for (pid, title) in windows {
        let Some(exe) = exe_names.get(&pid) else { continue };
        if is_excluded(exe) {
            continue;
        }
        by_exe
            .entry(exe.to_ascii_lowercase())
            .or_insert_with(|| RunningProcess {
                process_name: exe.clone(),
                pid,
                window_title: Some(title.clone()),
            });
    }
    let mut rows: Vec<RunningProcess> = by_exe.into_values().collect();
    rows.sort_by(|left, right| {
        left.process_name
            .to_ascii_lowercase()
            .cmp(&right.process_name.to_ascii_lowercase())
            .then_with(|| left.process_name.cmp(&right.process_name))
    });
    rows
}

#[cfg(target_os = "windows")]
pub fn list() -> Result<Vec<RunningProcess>, String> {
    Ok(collapse(windows::visible_titled_windows(), &windows::exe_names_by_pid()?))
}

#[cfg(not(target_os = "windows"))]
pub fn list() -> Result<Vec<RunningProcess>, String> {
    Ok(Vec::new())
}

#[cfg(target_os = "windows")]
mod windows {
    use std::{collections::HashMap, ffi::OsString, os::windows::ffi::OsStringExt};

    use windows_sys::Win32::{
        Foundation::{CloseHandle, HWND, INVALID_HANDLE_VALUE, LPARAM},
        System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
        },
        UI::WindowsAndMessaging::{
            EnumWindows, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
        },
    };

    /// (pid, title) for every visible top-level window with a title.
    pub fn visible_titled_windows() -> Vec<(u32, String)> {
        let mut found: Vec<(u32, String)> = Vec::new();
        unsafe extern "system" fn visit(window: HWND, lparam: LPARAM) -> i32 {
            // SAFETY: lparam is the Vec passed below and outlives EnumWindows.
            let found = unsafe { &mut *(lparam as *mut Vec<(u32, String)>) };
            if unsafe { IsWindowVisible(window) } == 0 {
                return 1;
            }
            let length = unsafe { GetWindowTextLengthW(window) };
            if length <= 0 {
                return 1;
            }
            let mut buffer = vec![0u16; length as usize + 1];
            let copied = unsafe { GetWindowTextW(window, buffer.as_mut_ptr(), buffer.len() as i32) };
            if copied <= 0 {
                return 1;
            }
            let title = String::from_utf16_lossy(&buffer[..copied as usize]);
            let mut pid = 0u32;
            unsafe { GetWindowThreadProcessId(window, &mut pid) };
            if pid != 0 && !title.trim().is_empty() {
                found.push((pid, title));
            }
            1
        }
        unsafe {
            let _ = EnumWindows(Some(visit), &mut found as *mut _ as LPARAM);
        }
        found
    }

    /// pid -> executable file name, from one ToolHelp snapshot. Cheaper and
    /// broader than opening every process: QueryFullProcessImageName is
    /// refused for elevated or protected processes, which a snapshot still names.
    pub fn exe_names_by_pid() -> Result<HashMap<u32, String>, String> {
        let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(format!("Failed to snapshot processes: {}", std::io::Error::last_os_error()));
        }
        let mut names = HashMap::new();
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut has_entry = unsafe { Process32FirstW(snapshot, &mut entry) } != 0;
        while has_entry {
            let end = entry.szExeFile.iter().position(|value| *value == 0).unwrap_or(entry.szExeFile.len());
            let name = OsString::from_wide(&entry.szExeFile[..end]).to_string_lossy().into_owned();
            if !name.is_empty() {
                names.insert(entry.th32ProcessID, name);
            }
            has_entry = unsafe { Process32NextW(snapshot, &mut entry) } != 0;
        }
        unsafe {
            let _ = CloseHandle(snapshot);
        }
        Ok(names)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_row_per_executable_sorted_by_name_without_studio_or_the_mapper() {
        let exe_names = std::collections::HashMap::from([
            (10, "Cyberpunk2077.exe".to_string()),
            (11, "Cyberpunk2077.exe".to_string()),
            (20, "explorer.exe".to_string()),
            (30, "JoyShockMapper.exe".to_string()),
            (40, "jsm-console-injector.exe".to_string()),
        ]);
        let windows = vec![
            (20, "File Explorer".to_string()),
            (10, "Cyberpunk 2077".to_string()),
            (11, "Cyberpunk 2077 (second window)".to_string()),
            (30, "JoyShockMapper".to_string()),
            (40, "".to_string()),
            (99, "No such process".to_string()),
        ];
        let rows = collapse(windows, &exe_names);
        let names: Vec<_> = rows.iter().map(|row| row.process_name.as_str()).collect();
        assert_eq!(names, ["Cyberpunk2077.exe", "explorer.exe"]);
        assert_eq!(rows[0].pid, 10);
        assert_eq!(rows[0].window_title.as_deref(), Some("Cyberpunk 2077"));
    }
}

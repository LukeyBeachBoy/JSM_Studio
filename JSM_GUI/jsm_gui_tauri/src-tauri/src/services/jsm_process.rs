use std::{
    ffi::OsStr,
    path::Path,
    process::{Command, Stdio},
};

use tauri::AppHandle;

use crate::{
    runtime,
    services::{
        app_state::{AppState, ProcessState},
        telemetry,
    },
};

#[cfg(target_os = "windows")]
use std::{
    ffi::OsString,
    iter,
    os::windows::{
        ffi::{OsStrExt, OsStringExt},
        process::CommandExt,
    },
};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
use crate::services::app_state::{JobObject, ManagedProcess};
#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
    System::{
        Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        },
        JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        },
        Threading::{
            CreateProcessW, OpenProcess, QueryFullProcessImageNameW, TerminateProcess,
            PROCESS_INFORMATION, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
            STARTF_USESHOWWINDOW, STARTUPINFOW,
        },
    },
};

pub struct ConsoleCommandResult {
    pub success: bool,
    pub output: String,
}

pub fn launch_jsm(app: &AppHandle, state: &AppState) -> Result<(), String> {
    runtime::ensure_required_files(app)?;

    let backend = runtime::read_backend_choice(app)?;
    let jsm_executable = runtime::jsm_executable_path(app, &backend)?;
    let backend_dir = runtime::backend_bin_dir(app, &backend)?;
    let runtime_dir = runtime::runtime_dir(app)?;

    if !jsm_executable.exists() {
        return Err(format!(
            "JoyShockMapper executable not found: {}",
            jsm_executable.display()
        ));
    }

    let mut process_state = lock_process_state(state)?;
    sync_child_state(&mut process_state)?;

    // Anything running our mapper binary that we are not tracking is a leftover
    // -- a previous run that outlived its job object, or a copy started by hand.
    // Two mappers bind the same telemetry port and both write to the controller,
    // so the second one to start looks like "the app stopped responding".
    // Swept on every launch attempt, including the already-running path below,
    // so the invariant holds even when we are not the one spawning.
    terminate_stray_mappers(
        &jsm_executable,
        process_state.child.as_ref().map(|child| child.id()),
    );

    if process_state.child.is_some() {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    let mut child = spawn_hidden_jsm_windows(&jsm_executable, &backend_dir, &runtime_dir)?;

    #[cfg(not(target_os = "windows"))]
    let mut child = {
        let mut command = Command::new(&jsm_executable);
        command
            .arg(&runtime_dir)
            .current_dir(&backend_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        apply_hidden_process_flags(&mut command, false);
        command
            .spawn()
            .map_err(|error| format!("Failed to launch JoyShockMapper: {error}"))?
    };

    #[cfg(target_os = "windows")]
    let job = match create_kill_on_close_job(&child) {
        Ok(job) => Some(job),
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };

    process_state.child = Some(child);
    #[cfg(target_os = "windows")]
    {
        process_state.job = job;
    }
    drop(process_state);

    telemetry::stop_calibration_countdown(app, state)?;
    Ok(())
}

pub fn terminate_jsm(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let child = {
        let mut process_state = lock_process_state(state)?;
        sync_child_state(&mut process_state)?;
        #[cfg(target_os = "windows")]
        let _ = process_state.job.take();
        process_state.child.take()
    };

    if let Some(mut child) = child {
        let _ = child.kill();
        let _ = child.wait();
    }

    // Stopping has to mean stopping. A mapper we lost track of would otherwise
    // keep remapping the controller with the toggle showing "off", which reads
    // as the switch doing nothing at all.
    if let Ok(backend) = runtime::read_backend_choice(app) {
        if let Ok(executable) = runtime::jsm_executable_path(app, &backend) {
            terminate_stray_mappers(&executable, None);
        }
    }

    telemetry::broadcast_empty_devices(app, state)?;
    telemetry::stop_calibration_countdown(app, state)?;
    Ok(())
}

pub fn is_running(state: &AppState) -> Result<bool, String> {
    let mut process_state = lock_process_state(state)?;
    sync_child_state(&mut process_state)?;
    Ok(process_state.child.is_some())
}

pub fn inject_console_command(
    app: &AppHandle,
    state: &AppState,
    command: &str,
) -> Result<bool, String> {
    if !cfg!(target_os = "windows") {
        return Ok(false);
    }

    let pid = current_pid(state)?;
    let Some(pid) = pid else {
        return Ok(false);
    };

    let backend = runtime::read_backend_choice(app)?;
    let injector_path = runtime::console_injector_path(app, &backend)?;
    let backend_dir = runtime::backend_bin_dir(app, &backend)?;

    if !injector_path.exists() {
        return Ok(false);
    }

    let mut injector = Command::new(&injector_path);
    injector
        .arg(pid.to_string())
        .arg(command)
        .current_dir(backend_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    apply_hidden_process_flags(&mut injector, false);

    let status = injector
        .status()
        .map_err(|error| format!("Failed to launch console injector: {error}"))?;

    Ok(status.success())
}

pub fn run_console_command_with_output(
    app: &AppHandle,
    state: &AppState,
    command: &str,
) -> Result<ConsoleCommandResult, String> {
    if !cfg!(target_os = "windows") {
        return Ok(ConsoleCommandResult {
            success: false,
            output: String::new(),
        });
    }

    let pid = current_pid(state)?;
    let Some(pid) = pid else {
        return Ok(ConsoleCommandResult {
            success: false,
            output: String::new(),
        });
    };

    let backend = runtime::read_backend_choice(app)?;
    let injector_path = runtime::console_injector_path(app, &backend)?;
    let backend_dir = runtime::backend_bin_dir(app, &backend)?;

    if !injector_path.exists() {
        return Ok(ConsoleCommandResult {
            success: false,
            output: String::new(),
        });
    }

    let mut injector = Command::new(&injector_path);
    injector
        .arg(pid.to_string())
        .arg(command)
        .arg("--capture")
        .current_dir(backend_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_hidden_process_flags(&mut injector, false);

    let output = injector
        .output()
        .map_err(|error| format!("Failed to capture console command output: {error}"))?;

    let mut combined = String::new();
    combined.push_str(&String::from_utf8_lossy(&output.stdout));
    combined.push_str(&String::from_utf8_lossy(&output.stderr));

    Ok(ConsoleCommandResult {
        success: output.status.success(),
        output: combined,
    })
}

/// Kills every process running `executable` except `keep_pid`, so exactly one
/// mapper can be alive. Matched on the full image path rather than the file
/// name: a JoyShockMapper the user installed separately elsewhere is theirs to
/// manage, and is not ours to kill.
#[cfg(target_os = "windows")]
fn terminate_stray_mappers(executable: &Path, keep_pid: Option<u32>) {
    let target = executable.canonicalize().unwrap_or_else(|_| executable.to_path_buf());
    let file_name = match executable.file_name() {
        Some(name) => name.to_os_string(),
        None => return,
    };

    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return;
    }

    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };

    let mut has_entry = unsafe { Process32FirstW(snapshot, &mut entry) } != 0;
    let own_pid = std::process::id();
    while has_entry {
        let pid = entry.th32ProcessID;
        let name_matches = OsString::from_wide(&trim_wide(&entry.szExeFile)) == file_name;
        if name_matches && pid != own_pid && Some(pid) != keep_pid {
            if let Some(path) = process_image_path(pid) {
                let same_binary = path.canonicalize().unwrap_or(path) == target;
                if same_binary {
                    terminate_process(pid);
                }
            }
        }
        has_entry = unsafe { Process32NextW(snapshot, &mut entry) } != 0;
    }

    unsafe {
        let _ = CloseHandle(snapshot);
    }
}

#[cfg(target_os = "windows")]
fn process_image_path(pid: u32) -> Option<std::path::PathBuf> {
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return None;
    }

    let mut buffer = vec![0u16; 32768];
    let mut size = buffer.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut size) };
    unsafe {
        let _ = CloseHandle(handle);
    }

    if ok == 0 {
        return None;
    }
    Some(std::path::PathBuf::from(OsString::from_wide(
        &buffer[..size as usize],
    )))
}

#[cfg(target_os = "windows")]
fn terminate_process(pid: u32) {
    let handle = unsafe { OpenProcess(PROCESS_TERMINATE, 0, pid) };
    if handle.is_null() {
        return;
    }
    unsafe {
        let _ = TerminateProcess(handle, 1);
        let _ = CloseHandle(handle);
    }
}

/// `szExeFile` is a fixed-size buffer padded with NULs.
#[cfg(target_os = "windows")]
fn trim_wide(buffer: &[u16]) -> &[u16] {
    let end = buffer.iter().position(|value| *value == 0).unwrap_or(buffer.len());
    &buffer[..end]
}

#[cfg(not(target_os = "windows"))]
fn terminate_stray_mappers(_executable: &Path, _keep_pid: Option<u32>) {}

fn current_pid(state: &AppState) -> Result<Option<u32>, String> {
    let mut process_state = lock_process_state(state)?;
    sync_child_state(&mut process_state)?;
    Ok(process_state.child.as_ref().map(|child| child.id()))
}

fn lock_process_state(state: &AppState) -> Result<std::sync::MutexGuard<'_, ProcessState>, String> {
    state
        .process
        .lock()
        .map_err(|_| "Process state lock poisoned.".to_string())
}

fn sync_child_state(process_state: &mut ProcessState) -> Result<(), String> {
    let exited = match process_state.child.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(Some(_)) => true,
            Ok(None) => false,
            Err(error) => {
                return Err(format!(
                    "Failed to inspect JoyShockMapper process state: {error}"
                ));
            }
        },
        None => false,
    };

    if exited {
        process_state.child = None;
        #[cfg(target_os = "windows")]
        {
            process_state.job = None;
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn apply_hidden_process_flags(command: &mut Command, _detach_console: bool) {
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

#[cfg(target_os = "windows")]
fn create_kill_on_close_job(child: &ManagedProcess) -> Result<JobObject, String> {
    let job_handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
    if job_handle.is_null() {
        return Err(format!(
            "Failed to create JoyShockMapper job object: {}",
            std::io::Error::last_os_error()
        ));
    }

    let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

    let set_result = unsafe {
        SetInformationJobObject(
            job_handle,
            JobObjectExtendedLimitInformation,
            &mut limits as *mut _ as *mut _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    };
    if set_result == 0 {
        drop(JobObject::new(job_handle));
        return Err(format!(
            "Failed to configure JoyShockMapper job object: {}",
            std::io::Error::last_os_error()
        ));
    }

    let process_handle = child.handle();
    let assign_result = unsafe { AssignProcessToJobObject(job_handle, process_handle) };
    if assign_result == 0 {
        drop(JobObject::new(job_handle));
        return Err(format!(
            "Failed to attach JoyShockMapper to shutdown job object: {}",
            std::io::Error::last_os_error()
        ));
    }

    Ok(JobObject::new(job_handle))
}

#[cfg(not(target_os = "windows"))]
fn apply_hidden_process_flags(_command: &mut Command, _detach_console: bool) {}

#[cfg(target_os = "windows")]
fn spawn_hidden_jsm_windows(
    executable: &Path,
    working_dir: &Path,
    runtime_dir: &Path,
) -> Result<ManagedProcess, String> {
    let mut startup_info = STARTUPINFOW::default();
    startup_info.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
    startup_info.dwFlags = STARTF_USESHOWWINDOW;
    startup_info.wShowWindow = 0;

    let mut process_info = PROCESS_INFORMATION::default();
    let application_name = wide_null(executable.as_os_str());
    let current_directory = wide_null(working_dir.as_os_str());
    let mut command_line =
        build_windows_command_line([executable.as_os_str(), runtime_dir.as_os_str()]);

    let success = unsafe {
        CreateProcessW(
            application_name.as_ptr(),
            command_line.as_mut_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            0,
            CREATE_NO_WINDOW,
            std::ptr::null(),
            current_directory.as_ptr(),
            &startup_info,
            &mut process_info,
        )
    };

    if success == 0 {
        return Err(format!(
            "Failed to launch JoyShockMapper: {}",
            std::io::Error::last_os_error()
        ));
    }

    unsafe {
        let _ = CloseHandle(process_info.hThread);
    }

    Ok(ManagedProcess::new(
        process_info.dwProcessId,
        process_info.hProcess,
    ))
}

#[cfg(target_os = "windows")]
fn build_windows_command_line<'a>(arguments: impl IntoIterator<Item = &'a OsStr>) -> Vec<u16> {
    let command_line = arguments
        .into_iter()
        .map(quote_windows_argument)
        .collect::<Vec<_>>()
        .join(" ");
    OsStr::new(&command_line)
        .encode_wide()
        .chain(iter::once(0))
        .collect()
}

#[cfg(target_os = "windows")]
fn wide_null(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn quote_windows_argument(value: &OsStr) -> String {
    let text = value.to_string_lossy();
    if text.is_empty() {
        return "\"\"".to_string();
    }

    let needs_quotes = text
        .chars()
        .any(|character| matches!(character, ' ' | '\t' | '"'));
    if !needs_quotes {
        return text.into_owned();
    }

    let mut quoted = String::from("\"");
    let mut backslashes = 0;
    for character in text.chars() {
        match character {
            '\\' => backslashes += 1,
            '"' => {
                quoted.push_str(&"\\".repeat(backslashes * 2 + 1));
                quoted.push('"');
                backslashes = 0;
            }
            _ => {
                quoted.push_str(&"\\".repeat(backslashes));
                backslashes = 0;
                quoted.push(character);
            }
        }
    }

    quoted.push_str(&"\\".repeat(backslashes * 2));
    quoted.push('"');
    quoted
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    #[test]
    fn exe_name_comparison_ignores_the_nul_padding_toolhelp_returns() {
        // PROCESSENTRY32W hands back a fixed 260-wide buffer, so comparing the
        // whole thing would never match the name we are looking for.
        let mut buffer = [0u16; 260];
        for (slot, value) in buffer.iter_mut().zip("JoyShockMapper.exe".encode_utf16()) {
            *slot = value;
        }

        assert_eq!(
            OsString::from_wide(trim_wide(&buffer)),
            OsString::from("JoyShockMapper.exe")
        );
    }

    #[test]
    fn trim_wide_handles_empty_and_unterminated_buffers() {
        assert!(trim_wide(&[0u16; 8]).is_empty());
        let full: Vec<u16> = "abc".encode_utf16().collect();
        assert_eq!(trim_wide(&full).len(), 3);
    }
}

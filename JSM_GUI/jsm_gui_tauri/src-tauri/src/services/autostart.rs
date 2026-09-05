// "Start with Windows" via a Scheduled Task rather than the usual Registry Run
// key / tauri-plugin-autostart approach.
//
// This app's manifest (app.manifest.xml) sets requireAdministrator, which it
// needs for HidHide and input injection. A Run-key entry launches the exe the
// same way a double-click does, so Windows shows the interactive UAC consent
// prompt every single logon -- exactly the friction the user wants gone, and
// it would defeat the point of "launch at startup, controller instantly
// usable" if a popup sat in front of it waiting to be clicked.
//
// Task Scheduler has a specific, documented exception to that: a task whose
// principal RunLevel is HighestAvailable launches already elevated with NO
// UAC prompt, because the consent was captured once, when the task was
// registered, rather than at every launch. This is the standard mechanism
// Windows itself provides for "elevated app, launch at logon, no popup" --
// it is not a UAC bypass or a security downgrade, since creating such a task
// still requires the creating process to already be elevated (true here: the
// app is only ever running at all because the user already passed UAC once
// to start it).
use std::env;
use std::os::windows::process::CommandExt;
use std::process::Command;

const TASK_NAME: &str = "JSM Studio Autostart";
// Suppresses the console window schtasks.exe would otherwise flash briefly.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn run_schtasks(args: &[&str]) -> Result<std::process::Output, String> {
    Command::new("schtasks.exe")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("Failed to run schtasks.exe: {error}"))
}

pub fn is_autostart_enabled() -> Result<bool, String> {
    let output = run_schtasks(&["/Query", "/TN", TASK_NAME])?;
    Ok(output.status.success())
}

pub fn set_autostart_enabled(enabled: bool) -> Result<(), String> {
    if enabled {
        let exe_path = env::current_exe()
            .map_err(|error| format!("Failed to resolve the running executable's path: {error}"))?;
        let exe_path = exe_path
            .to_str()
            .ok_or_else(|| "The executable path contains characters schtasks can't accept.".to_string())?;
        // /F overwrites a pre-existing task instead of erroring, so re-enabling
        // (or upgrading from an older exe path) is idempotent. /RL HIGHEST is
        // the whole point -- see module comment.
        let output = run_schtasks(&[
            "/Create",
            "/TN",
            TASK_NAME,
            "/TR",
            exe_path,
            "/SC",
            "ONLOGON",
            "/RL",
            "HIGHEST",
            "/F",
        ])?;
        if !output.status.success() {
            let message = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to create the startup task: {message}"));
        }
    } else {
        let output = run_schtasks(&["/Delete", "/TN", TASK_NAME, "/F"]);
        // Deleting a task that was never created is not a failure from the
        // caller's point of view -- the end state (no autostart) is already
        // what they asked for.
        if let Ok(result) = &output {
            if !result.status.success() {
                let message = String::from_utf8_lossy(&result.stderr);
                if !message.contains("cannot find") && !message.contains("does not exist") {
                    return Err(format!("Failed to remove the startup task: {message}"));
                }
            }
        }
    }
    Ok(())
}

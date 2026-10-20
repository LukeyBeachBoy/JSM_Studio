//! Startup belongs to the signed-in user and never grants administrator rights.
//! Older versions created a highest-privilege task. Remove that task before
//! enabling the Run entry; never leave two startup mechanisms active.
use std::{env, os::windows::process::CommandExt, process::{Command, Output}};

const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const VALUE_NAME: &str = "JSM Evolved";
const OLD_TASKS: [&str; 2] = ["JSM Evolved Autostart", "JSM Studio Autostart"];

fn run(program: &str, args: &[&str]) -> Result<Output, String> {
    Command::new(program).args(args).creation_flags(0x0800_0000).output().map_err(|e| format!("Could not run {program}: {e}"))
}

fn task_exists(name: &str) -> bool {
    run("schtasks.exe", &["/Query", "/TN", name]).map(|o| o.status.success()).unwrap_or(false)
}

pub fn has_legacy_task() -> bool { OLD_TASKS.iter().any(|name| task_exists(name)) }

fn run_entry_exists() -> Result<bool, String> {
    Ok(run("reg.exe", &["query", RUN_KEY, "/v", VALUE_NAME])?.status.success())
}

pub fn is_autostart_enabled() -> Result<bool, String> {
    Ok(run_entry_exists()? || has_legacy_task())
}

fn remove_old_tasks() -> Result<(), String> {
    for name in OLD_TASKS {
        if task_exists(name) && !run("schtasks.exe", &["/Delete", "/TN", name, "/F"])?.status.success() {
            return Err("An older administrator startup task could not be removed. Use Restart as administrator in Settings > Startup once, then change Start with Windows again.".into());
        }
    }
    Ok(())
}

fn startup_command(executable: &str) -> String { format!("\"{executable}\" --autostart") }

pub fn set_autostart_enabled(enabled: bool) -> Result<(), String> {
    remove_old_tasks()?;
    let output = if enabled {
        let exe = env::current_exe().map_err(|e| e.to_string())?;
        let exe = exe.to_str().ok_or("The app path cannot be represented as text.")?;
        run("reg.exe", &["add", RUN_KEY, "/v", VALUE_NAME, "/t", "REG_SZ", "/d", &startup_command(exe), "/f"])?
    } else if run_entry_exists()? {
        run("reg.exe", &["delete", RUN_KEY, "/v", VALUE_NAME, "/f"])?
    } else { return Ok(()); };
    if output.status.success() { Ok(()) } else { Err("Windows could not update Start with Windows for your account.".into()) }
}

pub fn refresh_after_launch() {
    // Existing users retain their choice. A normal launch that cannot remove
    // an old task leaves it intact and exposes the migration in permission_status.
    if is_autostart_enabled().unwrap_or(false) {
        if let Err(error) = set_autostart_enabled(true) { eprintln!("Could not refresh startup: {error}"); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn startup_quotes_the_executable_and_keeps_arguments_outside_it() {
        assert_eq!(startup_command(r"C:\Users\A B\JSM Evolved.exe"), r#""C:\Users\A B\JSM Evolved.exe" --autostart"#);
    }
}

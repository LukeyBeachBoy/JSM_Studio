//! Settings ▸ Troubleshooting log's "Recent" commands (console v2): the last
//! commands typed into the mapper's command line, newest first, kept in the
//! runtime folder so they are there after a restart.

use std::fs;

use tauri::AppHandle;

use crate::runtime;

const FILE_NAME: &str = "recent-commands.json";
pub const MAX_RECENT: usize = 8;

fn path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(runtime::runtime_dir(app)?.join(FILE_NAME))
}

pub fn list(app: &AppHandle) -> Result<Vec<String>, String> {
    let raw = match fs::read_to_string(path(app)?) {
        Ok(raw) => raw,
        Err(_) => return Ok(Vec::new()),
    };
    Ok(serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default())
}

/// `command` moves to the front; a repeat is not listed twice.
pub fn remember(previous: Vec<String>, command: &str) -> Vec<String> {
    let command = command.trim();
    if command.is_empty() {
        return previous;
    }
    let mut next = vec![command.to_string()];
    next.extend(previous.into_iter().filter(|existing| !existing.eq_ignore_ascii_case(command)));
    next.truncate(MAX_RECENT);
    next
}

pub fn record(app: &AppHandle, command: &str) -> Result<Vec<String>, String> {
    let next = remember(list(app)?, command);
    let content = serde_json::to_string_pretty(&next).map_err(|error| format!("Could not save recent commands: {error}"))?;
    runtime::write_file_atomically(path(app)?, content)?;
    Ok(next)
}

pub fn clear(app: &AppHandle) -> Result<Vec<String>, String> {
    runtime::write_file_atomically(path(app)?, "[]")?;
    Ok(Vec::new())
}

#[cfg(test)]
mod tests {
    use super::remember;

    #[test]
    fn newest_first_without_repeats_and_capped() {
        let list = remember(vec!["HELP".into(), "LIST_CONTROLLERS".into()], "list_controllers");
        assert_eq!(list, vec!["list_controllers", "HELP"]);
        let mut many = Vec::new();
        for index in 0..20 { many = remember(many, &format!("GYRO_SENS = {index}")); }
        assert_eq!(many.len(), super::MAX_RECENT);
        assert_eq!(many[0], "GYRO_SENS = 19");
        assert_eq!(remember(vec!["A".into()], "   "), vec!["A"]);
    }
}

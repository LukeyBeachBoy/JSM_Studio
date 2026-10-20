//! GitHub release checks. Updates open a validated release page in the browser.
//! No installer is downloaded or executed, and the app stays running.

use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

pub const RELEASES_API: &str = "https://api.github.com/repos/LukeyBeachBoy/JSM_Studio/releases/latest";
pub const RELEASES_PAGE: &str = "https://github.com/LukeyBeachBoy/JSM_Studio/releases";
const USER_AGENT: &str = "JSM-Evolved-update-check";

/// The shared status the UI shows.
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// This app's version ("0.7.135").
    pub current_version: String,
    /// The newest release's version, once asked.
    pub latest_version: Option<String>,
    /// A newer version exists.
    pub available: bool,
    /// A check is running now.
    pub checking: bool,
    /// When the last check finished, Unix milliseconds.
    pub checked_at_ms: Option<u64>,
    /// The release page, to read what changed.
    pub release_url: Option<String>,
    /// Why the last check failed, in words.
    pub error: Option<String>,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: Option<String>,

}


static STATUS: Mutex<Option<UpdateStatus>> = Mutex::new(None);

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

/// "v0.7.135", "0.7.135-beta" -> [0, 7, 135]. Anything after the numbers is ignored.
pub fn version_parts(version: &str) -> Vec<u64> {
    version
        .trim()
        .trim_start_matches(['v', 'V'])
        .split(|c: char| c == '-' || c == '+')
        .next()
        .unwrap_or("")
        .split('.')
        .map(|part| part.chars().take_while(char::is_ascii_digit).collect::<String>().parse::<u64>().unwrap_or(0))
        .collect()
}

/// Whether `latest` is a newer version than `current`.
pub fn is_newer(latest: &str, current: &str) -> bool {
    let (a, b) = (version_parts(latest), version_parts(current));
    let length = a.len().max(b.len());
    for index in 0..length {
        let (x, y) = (a.get(index).copied().unwrap_or(0), b.get(index).copied().unwrap_or(0));
        if x != y {
            return x > y;
        }
    }
    false
}

/// Only open this project's HTTPS release pages, never an asset or local path.
fn release_page(candidate: Option<&str>) -> String {
    let Some(candidate) = candidate else { return RELEASES_PAGE.into(); };
    let prefix = format!("{RELEASES_PAGE}/tag/");
    let valid = candidate.strip_prefix(&prefix).is_some_and(|tag|
        !tag.is_empty() && tag != "." && tag != ".." && tag.bytes().all(|c| c.is_ascii_alphanumeric() || b".-_".contains(&c)));
    if valid { candidate.into() } else { RELEASES_PAGE.into() }
}

fn current_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

/// The status as it stands, without asking GitHub.
pub fn status(app: &AppHandle) -> UpdateStatus {
    let guard = STATUS.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.clone().unwrap_or_else(|| UpdateStatus { current_version: current_version(app), ..Default::default() })
}

fn publish(app: &AppHandle, next: UpdateStatus) -> UpdateStatus {
    *STATUS.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(next.clone());
    let _ = app.emit("update-status", &next);
    next
}

/// Ask GitHub now. Every reader hears the answer through the "update-status" event.
pub async fn check(app: &AppHandle) -> UpdateStatus {
    let current = current_version(app);
    let mut checking = status(app);
    checking.current_version = current.clone();
    checking.checking = true;
    publish(app, checking.clone());

    let result: Result<GithubRelease, String> = async {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent(USER_AGENT)
            .build()
            .map_err(|error| format!("Could not start the check: {error}"))?;
        let response = client
            .get(RELEASES_API)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|_| "Could not reach GitHub. Check the connection and try again.".to_string())?;
        if !response.status().is_success() {
            return Err(format!("GitHub answered {}.", response.status().as_u16()));
        }
        response.json::<GithubRelease>().await.map_err(|error| format!("GitHub's answer could not be read: {error}"))
    }
    .await;

    let next = match result {
        Ok(release) => {
            let latest = release.tag_name.trim().trim_start_matches(['v', 'V']).to_string();
            UpdateStatus {
                current_version: current.clone(),
                available: is_newer(&latest, &current),
                latest_version: Some(latest),
                checking: false,
                checked_at_ms: Some(now_ms()),
                release_url: Some(release_page(release.html_url.as_deref())),
                error: None,
            }
        }
        Err(error) => UpdateStatus { current_version: current, checking: false, checked_at_ms: Some(now_ms()), error: Some(error), ..checking },
    };
    publish(app, next)
}

/// Retain the command name for existing callers, but only open the release page.
pub async fn install(app: &AppHandle) -> Result<(), String> {
    let page = release_page(status(app).release_url.as_deref());
    open::that_detached(&page).map_err(|error| format!("Could not open the release page: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_compare_by_number_not_by_text() {
        assert!(is_newer("0.7.140", "0.7.135"));
        assert!(is_newer("v0.8.0", "0.7.135"));
        assert!(is_newer("1.0", "0.9.99"));
        assert!(!is_newer("0.7.135", "0.7.135"));
        assert!(!is_newer("0.7.99", "0.7.135"), "135 is newer than 99");
        assert!(!is_newer("v0.7.135-beta", "0.7.135"));
        assert_eq!(version_parts("v1.2.3+build"), vec![1, 2, 3]);
    }

    #[test]
    fn update_action_accepts_only_project_release_pages() {
        let good = format!("{RELEASES_PAGE}/tag/v0.7.155");
        assert_eq!(release_page(Some(&good)), good);
        assert_eq!(release_page(None), RELEASES_PAGE);
        for bad in ["file:///C:/setup.exe", "https://evil.example/setup.exe",
            "https://github.com/LukeyBeachBoy/JSM_Studio/releases/download/v1/setup.exe",
            "https://github.com/LukeyBeachBoy/JSM_Studio/releases/tag/../download",
            "https://github.com/LukeyBeachBoy/JSM_Studio/releases/tag/v1?redirect=evil",
            "https://github.com.evil.example/LukeyBeachBoy/JSM_Studio/releases/tag/v1"] {
            assert_eq!(release_page(Some(bad)), RELEASES_PAGE);
        }
    }
}

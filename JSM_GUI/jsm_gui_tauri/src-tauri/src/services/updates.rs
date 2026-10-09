//! Update checks (console v2, D19): GitHub's latest release for the project,
//! compared with this app's version. The update line under the header, Settings
//! ▸ About and Settings ▸ Startup all read the one status kept here, checked
//! once when the app starts and again on "Check now". No Tauri updater plugin:
//! installing downloads the release's installer, starts it and closes the app,
//! and the installer offers to open the new version.

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
    /// The installer asset an install downloads, when the release has one.
    pub installer_url: Option<String>,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: Option<String>,
    #[serde(default)]
    assets: Vec<GithubAsset>,
}

#[derive(Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
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

/// The installer among a release's files: the Windows setup executable first,
/// then an MSI.
fn installer_asset(assets: &[GithubAsset]) -> Option<String> {
    let lower = |asset: &GithubAsset| asset.name.to_ascii_lowercase();
    assets
        .iter()
        .find(|asset| lower(asset).ends_with("-setup.exe") || lower(asset).ends_with("_setup.exe"))
        .or_else(|| assets.iter().find(|asset| lower(asset).ends_with(".exe")))
        .or_else(|| assets.iter().find(|asset| lower(asset).ends_with(".msi")))
        .map(|asset| asset.browser_download_url.clone())
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
                release_url: release.html_url.or_else(|| Some(RELEASES_PAGE.to_string())),
                error: None,
                installer_url: installer_asset(&release.assets),
            }
        }
        Err(error) => UpdateStatus { current_version: current, checking: false, checked_at_ms: Some(now_ms()), error: Some(error), ..checking },
    };
    publish(app, next)
}

/// Download the installer with progress ("update-progress", 0-100), start it and
/// close the app so it can replace the files. Without an installer in the
/// release, the release page opens instead.
pub async fn install(app: &AppHandle) -> Result<(), String> {
    let current = status(app);
    let Some(url) = current.installer_url.clone() else {
        let page = current.release_url.clone().unwrap_or_else(|| RELEASES_PAGE.to_string());
        open::that_detached(&page).map_err(|error| format!("Could not open {page}: {error}"))?;
        return Ok(());
    };
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|error| format!("Could not start the download: {error}"))?;
    let mut response = client.get(&url).send().await.map_err(|error| format!("Could not download the update: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("The download answered {}.", response.status().as_u16()));
    }
    let total = response.content_length().unwrap_or(0);
    let name = url.rsplit('/').next().filter(|name| !name.is_empty()).unwrap_or("JSM-Evolved-setup.exe").to_string();
    let path = std::env::temp_dir().join(format!("jsm-evolved-update-{}", name));
    let mut bytes: Vec<u8> = Vec::with_capacity(total as usize);
    let mut last = 0u64;
    while let Some(chunk) = response.chunk().await.map_err(|error| format!("The download stopped: {error}"))? {
        bytes.extend_from_slice(&chunk);
        if total > 0 {
            let percent = (bytes.len() as u64 * 100 / total).min(100);
            if percent != last {
                last = percent;
                let _ = app.emit("update-progress", percent);
            }
        }
    }
    std::fs::write(&path, &bytes).map_err(|error| format!("Could not save the installer: {error}"))?;
    let _ = app.emit("update-progress", 100u64);
    open::that_detached(&path).map_err(|error| format!("Could not start the installer: {error}"))?;
    // The installer replaces the running files; leave it the way clear.
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(800));
        handle.exit(0);
    });
    Ok(())
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
    fn the_setup_executable_is_the_installer() {
        let asset = |name: &str| GithubAsset { name: name.into(), browser_download_url: format!("https://x/{name}") };
        let assets = vec![asset("JSM.Evolved_0.7.140_x64.msi"), asset("JSM.Evolved_0.7.140_x64-setup.exe"), asset("latest.json")];
        assert_eq!(installer_asset(&assets).as_deref(), Some("https://x/JSM.Evolved_0.7.140_x64-setup.exe"));
        assert_eq!(installer_asset(&[asset("JSM.msi")]).as_deref(), Some("https://x/JSM.msi"));
        assert_eq!(installer_asset(&[asset("source.zip")]), None);
    }
}

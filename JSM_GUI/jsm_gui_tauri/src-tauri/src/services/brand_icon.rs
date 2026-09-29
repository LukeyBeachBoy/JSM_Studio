//! The window and tray icons, in the accent the person chose.
//!
//! The exe carries one icon (the cyan mark). The WebView rasterises the chosen
//! mark and sends the pixels here (`set_brand_icon`), which puts them on the
//! main window and the tray and writes them beside the runtime state, so the
//! next launch shows the right icon from the first frame rather than cyan
//! until the page has loaded and drawn it again.
//!
//! Raw RGBA rather than PNG: decoding PNG in the backend would pull an image
//! crate in for two icons, and the WebView already has the bytes decoded.

use std::fs;
use std::path::PathBuf;

use tauri::{image::Image, ipc::InvokeBody, ipc::Request, AppHandle, Manager};

use crate::runtime;

const TRAY_FILE: &str = "brand-tray.rgba";
const WINDOW_FILE: &str = "brand-window.rgba";
const MAX_SIDE: u32 = 512;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Target {
    Tray,
    Window,
}

impl Target {
    fn file(self) -> &'static str {
        match self {
            Target::Tray => TRAY_FILE,
            Target::Window => WINDOW_FILE,
        }
    }
}

fn path(app: &AppHandle, target: Target) -> Result<PathBuf, String> {
    Ok(runtime::runtime_dir(app)?.join(target.file()))
}

fn apply(app: &AppHandle, target: Target, width: u32, height: u32, rgba: &[u8]) -> Result<(), String> {
    if width == 0 || height == 0 || width > MAX_SIDE || height > MAX_SIDE {
        return Err(format!("Icon size {width}x{height} is out of range"));
    }
    if rgba.len() != (width * height * 4) as usize {
        return Err(format!("Icon bytes ({}) do not match {width}x{height} RGBA", rgba.len()));
    }
    let image = Image::new_owned(rgba.to_vec(), width, height);
    match target {
        Target::Tray => {
            let tray = app.tray_by_id("main").ok_or("The tray icon is not installed")?;
            tray.set_icon(Some(image)).map_err(|error| format!("Failed to set the tray icon: {error}"))
        }
        Target::Window => {
            let window = app.get_webview_window("main").ok_or("No main window")?;
            window.set_icon(image).map_err(|error| format!("Failed to set the window icon: {error}"))
        }
    }
}

/// The `set_brand_icon` command body: raw RGBA with the size in headers.
pub fn set_from_request(app: &AppHandle, request: Request<'_>) -> Result<(), String> {
    let header = |name: &str| -> Result<String, String> {
        request
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string)
            .ok_or_else(|| format!("Missing {name} header"))
    };
    let width: u32 = header("x-width")?.parse().map_err(|_| "x-width is not a number")?;
    let height: u32 = header("x-height")?.parse().map_err(|_| "x-height is not a number")?;
    let target = match header("x-target")?.as_str() {
        "tray" => Target::Tray,
        "window" => Target::Window,
        other => return Err(format!("Unknown icon target {other}")),
    };
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw RGBA bytes".into());
    };
    apply(app, target, width, height, bytes)?;
    // Remembered for the next launch; a failure to write is not a failure to
    // show the icon, so it only logs.
    if let Err(error) = persist(app, target, width, height, bytes) {
        eprintln!("Could not remember the app icon: {error}");
    }
    Ok(())
}

/// File layout: width u32 LE, height u32 LE, then RGBA. Written to a sibling
/// and renamed, as every file the mapper might read live is (the icon is
/// not one of those, but the habit costs nothing).
fn persist(app: &AppHandle, target: Target, width: u32, height: u32, rgba: &[u8]) -> Result<(), String> {
    let path = path(app, target)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut bytes = Vec::with_capacity(8 + rgba.len());
    bytes.extend_from_slice(&width.to_le_bytes());
    bytes.extend_from_slice(&height.to_le_bytes());
    bytes.extend_from_slice(rgba);
    let temp = path.with_extension("rgba.tmp");
    fs::write(&temp, &bytes).map_err(|error| error.to_string())?;
    fs::rename(&temp, &path).map_err(|error| error.to_string())
}

fn load(app: &AppHandle, target: Target) -> Option<(u32, u32, Vec<u8>)> {
    let bytes = fs::read(path(app, target).ok()?).ok()?;
    if bytes.len() < 8 {
        return None;
    }
    let width = u32::from_le_bytes(bytes[0..4].try_into().ok()?);
    let height = u32::from_le_bytes(bytes[4..8].try_into().ok()?);
    Some((width, height, bytes[8..].to_vec()))
}

/// At startup, after the tray exists: put back whatever was chosen last time.
pub fn restore(app: &AppHandle) {
    for target in [Target::Tray, Target::Window] {
        if let Some((width, height, rgba)) = load(app, target) {
            if let Err(error) = apply(app, target, width, height, &rgba) {
                eprintln!("Could not restore the app icon: {error}");
            }
        }
    }
}

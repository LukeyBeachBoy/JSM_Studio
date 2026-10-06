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
//!
//! The taskbar is the one place the window icon does not reach: a pinned
//! taskbar button, and a Start Menu entry, show their *shortcut's* icon, and
//! the installer's shortcuts have none of their own, so they fall back to the
//! exe's cyan mark whatever the window says (TODO-45). So the window icon is
//! also written out as an .ico in the runtime folder, and every shortcut that
//! carries the product name is pointed at it. The file name carries a hash of
//! the pixels: Explorer caches icons by path, and a new path is the one
//! reliable way to make it look again.

use std::fs;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::{image::Image, ipc::InvokeBody, ipc::Request, AppHandle, Manager};

use crate::runtime;

const TRAY_FILE: &str = "brand-tray.rgba";
const WINDOW_FILE: &str = "brand-window.rgba";
const ICO_PREFIX: &str = "brand-window-";
const MAX_SIDE: u32 = 512;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

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
            window.set_icon(image).map_err(|error| format!("Failed to set the window icon: {error}"))?;
            // The shortcuts, off the IPC thread: a PowerShell round trip and a
            // shell notification are slow next to a window message.
            let app = app.clone();
            let rgba = rgba.to_vec();
            std::thread::spawn(move || {
                if let Err(error) = refresh_shortcut_icons(&app, width, height, &rgba) {
                    eprintln!("Could not update the shortcut icons: {error}");
                }
            });
            Ok(())
        }
    }
}

// --- the taskbar and Start Menu shortcuts ---------------------------------------

/// FNV-1a over the pixels: the file name, so a changed accent is a new path.
fn pixel_hash(rgba: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in rgba {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    hash
}

/// Nearest-box downsample of a square RGBA image to `side`, premultiplying
/// nothing: the marks are opaque or fully transparent, so a plain average of
/// the covered pixels is right.
fn downsample(rgba: &[u8], width: u32, height: u32, side: u32) -> Vec<u8> {
    let mut out = Vec::with_capacity((side * side * 4) as usize);
    for y in 0..side {
        let y0 = y * height / side;
        let y1 = ((y + 1) * height / side).max(y0 + 1).min(height);
        for x in 0..side {
            let x0 = x * width / side;
            let x1 = ((x + 1) * width / side).max(x0 + 1).min(width);
            let mut sum = [0u64; 4];
            let mut count = 0u64;
            for sy in y0..y1 {
                for sx in x0..x1 {
                    let at = ((sy * width + sx) * 4) as usize;
                    for channel in 0..4 {
                        sum[channel] += u64::from(rgba[at + channel]);
                    }
                    count += 1;
                }
            }
            for channel in 0..4 {
                out.push((sum[channel] / count.max(1)) as u8);
            }
        }
    }
    out
}

/// A Windows .ico holding the mark at the taskbar's usual sizes, as 32-bit
/// DIBs (the format every Windows since XP reads; PNG entries would need the
/// PNG the backend does not have). Rows are bottom-up BGRA, followed by an
/// all-clear 1-bit AND mask.
fn ico_bytes(rgba: &[u8], width: u32, height: u32) -> Vec<u8> {
    let mut sides: Vec<u32> = [256u32, 64, 48, 32, 24, 16].into_iter().filter(|side| *side <= width.min(height)).collect();
    if sides.is_empty() {
        sides.push(width.min(height));
    }
    let images: Vec<(u32, Vec<u8>)> = sides.iter().map(|side| (*side, downsample(rgba, width, height, *side))).collect();
    let mut file = Vec::new();
    file.extend_from_slice(&0u16.to_le_bytes());
    file.extend_from_slice(&1u16.to_le_bytes());
    file.extend_from_slice(&(images.len() as u16).to_le_bytes());
    let mut offset = 6 + 16 * images.len() as u32;
    let mut bodies: Vec<Vec<u8>> = Vec::new();
    for (side, pixels) in &images {
        let side = *side;
        let mask_row = ((side + 31) / 32) * 4;
        let mut body = Vec::with_capacity(40 + (side * side * 4 + mask_row * side) as usize);
        body.extend_from_slice(&40u32.to_le_bytes());
        body.extend_from_slice(&(side as i32).to_le_bytes());
        body.extend_from_slice(&((side * 2) as i32).to_le_bytes());
        body.extend_from_slice(&1u16.to_le_bytes());
        body.extend_from_slice(&32u16.to_le_bytes());
        body.extend_from_slice(&0u32.to_le_bytes());
        body.extend_from_slice(&(side * side * 4 + mask_row * side).to_le_bytes());
        body.extend_from_slice(&[0u8; 16]);
        for y in (0..side).rev() {
            for x in 0..side {
                let at = ((y * side + x) * 4) as usize;
                body.extend_from_slice(&[pixels[at + 2], pixels[at + 1], pixels[at], pixels[at + 3]]);
            }
        }
        body.resize(body.len() + (mask_row * side) as usize, 0);
        file.push(if side >= 256 { 0 } else { side as u8 });
        file.push(if side >= 256 { 0 } else { side as u8 });
        file.push(0);
        file.push(0);
        file.extend_from_slice(&1u16.to_le_bytes());
        file.extend_from_slice(&32u16.to_le_bytes());
        file.extend_from_slice(&(body.len() as u32).to_le_bytes());
        file.extend_from_slice(&offset.to_le_bytes());
        offset += body.len() as u32;
        bodies.push(body);
    }
    for body in bodies {
        file.extend_from_slice(&body);
    }
    file
}

/// Every shortcut Windows might show for the app: the pinned taskbar button,
/// the Start Menu (per user and all users) and the desktop. Missing ones are
/// simply skipped.
fn shortcut_candidates(product: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let name = format!("{product}.lnk");
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let appdata = PathBuf::from(appdata);
        paths.push(appdata.join(r"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar").join(&name));
        paths.push(appdata.join(r"Microsoft\Windows\Start Menu\Programs").join(&name));
    }
    if let Some(programdata) = std::env::var_os("PROGRAMDATA") {
        paths.push(PathBuf::from(programdata).join(r"Microsoft\Windows\Start Menu\Programs").join(&name));
    }
    if let Some(profile) = std::env::var_os("USERPROFILE") {
        paths.push(PathBuf::from(profile).join("Desktop").join(&name));
    }
    if let Some(public) = std::env::var_os("PUBLIC") {
        paths.push(PathBuf::from(public).join("Desktop").join(&name));
    }
    paths.into_iter().filter(|path| path.is_file()).collect()
}

/// Writes the .ico for these pixels (once per distinct image) and points the
/// current shortcuts at it. Shortcuts can be created or replaced after the
/// icon file, for example by an installer or a new taskbar pin.
fn refresh_shortcut_icons(app: &AppHandle, width: u32, height: u32, rgba: &[u8]) -> Result<(), String> {
    let dir = runtime::runtime_dir(app)?;
    let ico = dir.join(format!("{ICO_PREFIX}{:016x}.ico", pixel_hash(rgba)));
    if !ico.is_file() {
        fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
        let temp = ico.with_extension("ico.tmp");
        fs::write(&temp, ico_bytes(rgba, width, height)).map_err(|error| error.to_string())?;
        fs::rename(&temp, &ico).map_err(|error| error.to_string())?;
    }
    // Older accents' files go, once nothing points at them any more.
    let shortcuts = shortcut_candidates(&app.package_info().name);
    let result = point_shortcuts_at(&shortcuts, &ico);
    if result.is_ok() {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if name.starts_with(ICO_PREFIX) && name.ends_with(".ico") && entry.path() != ico {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
        notify_shell();
    }
    result
}

/// WScript.Shell through a hidden PowerShell: the one supported way to edit a
/// .lnk without a COM dependency in the app. `-Command` consumes the rest of
/// its command line as script text, so paths must travel through the child
/// environment, never as trailing command-line arguments (which can open the
/// .ico in its associated viewer at launch).
fn point_shortcuts_at(shortcuts: &[PathBuf], ico: &Path) -> Result<(), String> {
    if shortcuts.is_empty() {
        return Ok(());
    }
    let paths: Vec<String> = shortcuts.iter().map(|path| path.to_string_lossy().into_owned()).collect();
    let paths_json = serde_json::to_string(&paths).map_err(|error| error.to_string())?;
    let script = "$ErrorActionPreference = 'Stop'; $shell = New-Object -ComObject WScript.Shell; $ico = $env:JSM_BRAND_ICON_PATH; foreach ($p in (ConvertFrom-Json -InputObject $env:JSM_BRAND_SHORTCUT_PATHS)) { $l = $shell.CreateShortcut($p); $l.IconLocation = \"$ico,0\"; $l.Save() }";
    let mut command = Command::new("powershell.exe");
    command.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
    command.env("JSM_BRAND_ICON_PATH", ico);
    command.env("JSM_BRAND_SHORTCUT_PATHS", paths_json);
    let output = command
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("Failed to run PowerShell: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Tells Explorer the shortcuts changed, so the taskbar and Start Menu redraw
/// with the new icon instead of what their cache holds.
fn notify_shell() {
    use windows_sys::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};
    // SAFETY: a plain notification with no item pointers.
    unsafe { SHChangeNotify(SHCNE_ASSOCCHANGED as i32, SHCNF_IDLIST, std::ptr::null(), std::ptr::null()) };
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u16_at(bytes: &[u8], at: usize) -> u16 { u16::from_le_bytes([bytes[at], bytes[at + 1]]) }
    fn u32_at(bytes: &[u8], at: usize) -> u32 { u32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]]) }

    #[test]
    fn downsample_averages_the_covered_pixels() {
        // 4x4: the left half red, the right half blue, all opaque.
        let mut rgba = Vec::new();
        for _y in 0..4 {
            for x in 0..4 {
                rgba.extend_from_slice(if x < 2 { &[255, 0, 0, 255] } else { &[0, 0, 255, 255] });
            }
        }
        let small = downsample(&rgba, 4, 4, 2);
        assert_eq!(small.len(), 16);
        assert_eq!(&small[0..4], &[255, 0, 0, 255]);
        assert_eq!(&small[4..8], &[0, 0, 255, 255]);
        // Same size in and out is the identity.
        assert_eq!(downsample(&rgba, 4, 4, 4), rgba);
    }

    #[test]
    fn ico_holds_every_taskbar_size_that_fits() {
        let rgba = vec![0x10u8; 64 * 64 * 4];
        let ico = ico_bytes(&rgba, 64, 64);
        assert_eq!(u16_at(&ico, 0), 0);
        assert_eq!(u16_at(&ico, 2), 1, "type 1 = icon");
        assert_eq!(u16_at(&ico, 4), 5, "64, 48, 32, 24 and 16 fit in a 64 px source");
        // Entries point at consecutive, correctly sized DIBs.
        let mut expected_offset = 6 + 16 * 5;
        for entry in 0..5 {
            let at = 6 + entry * 16;
            let side = [64u32, 48, 32, 24, 16][entry];
            assert_eq!(u32_at(&ico, at + 12), expected_offset, "entry {entry} offset");
            let size = u32_at(&ico, at + 8);
            let mask_row = ((side + 31) / 32) * 4;
            assert_eq!(size, 40 + side * side * 4 + mask_row * side, "entry {entry} size");
            assert_eq!(u16_at(&ico, at + 6), 32, "32 bpp");
            // The DIB header says twice the height: colour rows then the mask.
            assert_eq!(u32_at(&ico, expected_offset as usize + 8), side * 2);
            expected_offset += size;
        }
        assert_eq!(ico.len() as u32, expected_offset);
        // 256 px is written with a zero size byte, as the format requires.
        let big = ico_bytes(&vec![0u8; 256 * 256 * 4], 256, 256);
        assert_eq!(big[6], 0);
        assert_eq!(u16_at(&big, 4), 6);
        // A tiny source still yields one entry.
        assert_eq!(u16_at(&ico_bytes(&[1, 2, 3, 4], 1, 1), 4), 1);
    }

    #[test]
    fn ico_pixels_are_bottom_up_bgra() {
        // 2x2: top-left red, the rest black; the DIB stores the bottom row first.
        let mut rgba = vec![0u8; 16];
        rgba[0..4].copy_from_slice(&[255, 0, 0, 255]);
        let ico = ico_bytes(&rgba, 2, 2);
        let dib = 6 + 16;
        let pixels = dib + 40;
        // Bottom row (two black pixels) comes first, then the top row.
        assert_eq!(&ico[pixels..pixels + 8], &[0, 0, 0, 0, 0, 0, 0, 0]);
        assert_eq!(&ico[pixels + 8..pixels + 12], &[0, 0, 255, 255], "BGRA of red");
    }

    #[test]
    fn a_different_accent_is_a_different_file_name() {
        assert_ne!(pixel_hash(&[1, 2, 3]), pixel_hash(&[1, 2, 4]));
        assert_eq!(pixel_hash(&[9; 40]), pixel_hash(&[9; 40]));
    }

    #[test]
    fn shortcut_update_treats_the_icon_path_as_data() {
        let dir = std::env::temp_dir().join(format!("jsm-brand-shortcut-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let shortcut = dir.join("JSM icon test.lnk");
        let ico = Path::new(env!("CARGO_MANIFEST_DIR")).join("icons").join("icon.ico");
        let result = point_shortcuts_at(&[shortcut.clone()], &ico);
        assert!(result.is_ok(), "{result:?}");
        assert!(shortcut.is_file(), "PowerShell did not save the shortcut");
        fs::remove_file(shortcut).unwrap();
        fs::remove_dir(dir).unwrap();
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

//! The game an association points at (TODO-46): its icon, read out of the
//! executable for the Configurations list and the Home card, and the Open
//! dialog that picks the executable in the first place.
//!
//! The icon comes back as raw RGBA so the front end can paint it once into a
//! canvas and keep the data URL; results are cached per path for the life of
//! the process, since the file is read with a handful of GDI calls each time.

use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};

use serde::Serialize;

/// Preferred edge for the extracted icon: the list rows draw it at 32 px on
/// a 2x display, and most executables carry a 64 px image.
const ICON_SIZE: i32 = 64;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppIcon {
    pub width: u32,
    pub height: u32,
    /// `width * height * 4` bytes, row-major from the top-left, base64.
    pub rgba_base64: String,
}

fn cache() -> &'static Mutex<HashMap<String, Option<AppIcon>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<AppIcon>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The icon for `exe_path`, extracted once per path (misses are remembered
/// too: an executable without an icon is asked about once, not on every
/// list refresh).
pub fn icon_for(exe_path: &str) -> Option<AppIcon> {
    cached(exe_path, extract)
}

/// Windows paths compare without case; two spellings share one entry.
fn cache_key(exe_path: &str) -> String {
    exe_path.trim().replace('/', "\\").to_lowercase()
}

fn cached(exe_path: &str, extract: impl FnOnce(&str) -> Option<AppIcon>) -> Option<AppIcon> {
    let key = cache_key(exe_path);
    if key.is_empty() {
        return None;
    }
    if let Some(hit) = cache().lock().ok().and_then(|map| map.get(&key).cloned()) {
        return hit;
    }
    let icon = extract(exe_path.trim());
    if let Ok(mut map) = cache().lock() {
        map.insert(key, icon.clone());
    }
    icon
}

/// Standard base64 (RFC 4648, padded). Hand-rolled: it is the only place the
/// crate needs it, and a dependency for forty lines is not worth a build.
fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[(triple >> 18) as usize & 63] as char);
        out.push(TABLE[(triple >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { TABLE[(triple >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[triple as usize & 63] as char } else { '=' });
    }
    out
}

/// BGRA rows straight from GDI to RGBA. When the colour bitmap carries no
/// alpha at all (an old 24-bit icon padded to 32), the mask says which
/// pixels are drawn: a set mask bit means transparent.
fn bgra_to_rgba(bgra: &[u8], mask: Option<&[u8]>) -> Vec<u8> {
    let has_alpha = bgra.chunks_exact(4).any(|px| px[3] != 0);
    bgra.chunks_exact(4)
        .enumerate()
        .flat_map(|(index, px)| {
            let alpha = if has_alpha {
                px[3]
            } else {
                match mask.and_then(|mask| mask.get(index * 4)) {
                    // The mask rendered as 32-bit: white where the pixel is cut out.
                    Some(masked) if *masked != 0 => 0,
                    _ => 255,
                }
            };
            [px[2], px[1], px[0], alpha]
        })
        .collect()
}

#[cfg(target_os = "windows")]
fn extract(exe_path: &str) -> Option<AppIcon> {
    windows::extract(exe_path)
}

#[cfg(not(target_os = "windows"))]
fn extract(_exe_path: &str) -> Option<AppIcon> {
    None
}

/// The standard Open dialog, filtered to executables. Modal on the calling
/// thread, so the command that uses it runs it on a thread of its own. None
/// when cancelled or unavailable.
#[cfg(target_os = "windows")]
pub fn pick_executable() -> Option<String> {
    std::thread::spawn(windows::pick_executable).join().ok().flatten()
}

#[cfg(not(target_os = "windows"))]
pub fn pick_executable() -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
mod windows {
    use std::{ffi::c_void, os::windows::ffi::OsStrExt, ptr};

    use windows_sys::Win32::{
        Graphics::Gdi::{
            CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
            DIB_RGB_COLORS, HBITMAP,
        },
        UI::{
            Controls::Dialogs::{GetOpenFileNameW, OFN_EXPLORER, OFN_FILEMUSTEXIST, OFN_NOCHANGEDIR, OFN_PATHMUSTEXIST, OPENFILENAMEW},
            Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON},
            WindowsAndMessaging::{DestroyIcon, GetIconInfo, PrivateExtractIconsW, HICON, ICONINFO},
        },
    };

    use super::{base64_encode, bgra_to_rgba, AppIcon, ICON_SIZE};

    fn wide(text: &str) -> Vec<u16> {
        std::ffi::OsStr::new(text).encode_wide().chain(std::iter::once(0)).collect()
    }

    pub fn extract(exe_path: &str) -> Option<AppIcon> {
        let icon = load_icon(exe_path)?;
        let result = icon_to_rgba(icon);
        // SAFETY: the icon came from PrivateExtractIconsW / SHGetFileInfoW and is ours to destroy.
        unsafe { DestroyIcon(icon) };
        result
    }

    /// The executable's first icon at ICON_SIZE, or the shell's large icon
    /// for it when the file has none of its own (a stub launcher, say).
    fn load_icon(exe_path: &str) -> Option<HICON> {
        let path = wide(exe_path);
        let mut icon: HICON = ptr::null_mut();
        let mut id = 0u32;
        // SAFETY: path is NUL-terminated; icon and id are valid out-pointers for one icon.
        let count = unsafe { PrivateExtractIconsW(path.as_ptr(), 0, ICON_SIZE, ICON_SIZE, &mut icon, &mut id, 1, 0) };
        if count >= 1 && !icon.is_null() {
            return Some(icon);
        }
        let mut info: SHFILEINFOW = unsafe { std::mem::zeroed() };
        // SAFETY: info is a zeroed SHFILEINFOW of the size passed; SHGFI_ICON fills hIcon.
        let result = unsafe {
            SHGetFileInfoW(path.as_ptr(), 0, &mut info, std::mem::size_of::<SHFILEINFOW>() as u32, SHGFI_ICON | SHGFI_LARGEICON)
        };
        (result != 0 && !info.hIcon.is_null()).then_some(info.hIcon)
    }

    fn icon_to_rgba(icon: HICON) -> Option<AppIcon> {
        let mut info: ICONINFO = unsafe { std::mem::zeroed() };
        // SAFETY: icon is a live HICON; info receives two bitmaps we must delete.
        if unsafe { GetIconInfo(icon, &mut info) } == 0 {
            return None;
        }
        let result = (|| {
            let (width, height, colour) = bitmap_pixels(info.hbmColor)?;
            let mask = bitmap_pixels(info.hbmMask).and_then(|(w, h, px)| (w == width && h == height).then_some(px));
            let rgba = bgra_to_rgba(&colour, mask.as_deref());
            Some(AppIcon { width, height, rgba_base64: base64_encode(&rgba) })
        })();
        // SAFETY: GetIconInfo hands the caller both bitmaps to free.
        unsafe {
            if !info.hbmColor.is_null() {
                DeleteObject(info.hbmColor as *mut c_void);
            }
            if !info.hbmMask.is_null() {
                DeleteObject(info.hbmMask as *mut c_void);
            }
        }
        result
    }

    /// A bitmap's pixels as top-down 32-bit BGRA rows.
    fn bitmap_pixels(bitmap: HBITMAP) -> Option<(u32, u32, Vec<u8>)> {
        if bitmap.is_null() {
            return None;
        }
        let mut bm: BITMAP = unsafe { std::mem::zeroed() };
        // SAFETY: bitmap is a live HBITMAP; bm is sized for a BITMAP.
        if unsafe { GetObjectW(bitmap as *mut c_void, std::mem::size_of::<BITMAP>() as i32, &mut bm as *mut BITMAP as *mut c_void) } == 0 {
            return None;
        }
        // A monochrome mask for a colour icon is twice as tall (XOR half
        // under the AND half); only the AND half, the top, is wanted.
        let width = bm.bmWidth.max(0) as u32;
        let height = bm.bmHeight.max(0) as u32;
        if width == 0 || height == 0 || width > 1024 || height > 2048 {
            return None;
        }
        let mut header: BITMAPINFOHEADER = unsafe { std::mem::zeroed() };
        header.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        header.biWidth = width as i32;
        // Negative height: rows top-down, as the canvas wants them.
        header.biHeight = -(height as i32);
        header.biPlanes = 1;
        header.biBitCount = 32;
        header.biCompression = BI_RGB as u32;
        let mut info: BITMAPINFO = unsafe { std::mem::zeroed() };
        info.bmiHeader = header;
        let mut pixels = vec![0u8; width as usize * height as usize * 4];
        // SAFETY: the DC is ours; pixels is sized for width × height 32-bit pixels.
        let dc = unsafe { CreateCompatibleDC(ptr::null_mut()) };
        if dc.is_null() {
            return None;
        }
        let rows = unsafe {
            GetDIBits(dc, bitmap, 0, height, pixels.as_mut_ptr() as *mut c_void, &mut info, DIB_RGB_COLORS)
        };
        unsafe { DeleteDC(dc) };
        (rows > 0).then_some((width, height, pixels))
    }

    pub fn pick_executable() -> Option<String> {
        let mut file = vec![0u16; 32 * 1024];
        let filter = wide("Programs (*.exe)\0*.exe\0All files (*.*)\0*.*\0");
        let title = wide("Choose the game or app");
        let mut ofn: OPENFILENAMEW = unsafe { std::mem::zeroed() };
        ofn.lStructSize = std::mem::size_of::<OPENFILENAMEW>() as u32;
        ofn.lpstrFilter = filter.as_ptr();
        ofn.nFilterIndex = 1;
        ofn.lpstrFile = file.as_mut_ptr();
        ofn.nMaxFile = file.len() as u32;
        ofn.lpstrTitle = title.as_ptr();
        ofn.Flags = OFN_EXPLORER | OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
        // SAFETY: every pointer in ofn outlives the call; file is NUL-filled and its length declared.
        if unsafe { GetOpenFileNameW(&mut ofn) } == 0 {
            return None;
        }
        let end = file.iter().position(|value| *value == 0).unwrap_or(0);
        let chosen = String::from_utf16_lossy(&file[..end]);
        (!chosen.is_empty()).then_some(chosen)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn base64_matches_the_standard_alphabet_and_padding() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
        assert_eq!(base64_encode(&[0xff, 0xfe, 0xfd, 0x00]), "//79AA==");
    }

    #[test]
    fn bgra_becomes_rgba_and_the_mask_supplies_alpha_when_the_bitmap_has_none() {
        // Two pixels with real alpha: kept, channels swapped.
        let with_alpha = [1, 2, 3, 128, 4, 5, 6, 0];
        assert_eq!(bgra_to_rgba(&with_alpha, None), vec![3, 2, 1, 128, 6, 5, 4, 0]);
        // No alpha anywhere: the mask decides, white (masked) is transparent.
        let no_alpha = [1, 2, 3, 0, 4, 5, 6, 0];
        let mask = [255, 255, 255, 0, 0, 0, 0, 0];
        assert_eq!(bgra_to_rgba(&no_alpha, Some(&mask)), vec![3, 2, 1, 0, 6, 5, 4, 255]);
        // No alpha and no mask: everything opaque.
        assert_eq!(bgra_to_rgba(&no_alpha, None), vec![3, 2, 1, 255, 6, 5, 4, 255]);
    }

    /// One extraction per path, whatever its spelling, and a miss is
    /// remembered too. The real Win32 extraction is not exercised here: the
    /// test hands in its own extractor.
    #[test]
    fn icons_are_extracted_once_per_path_ignoring_case_and_slashes() {
        let calls = AtomicUsize::new(0);
        let fake = |path: &str| {
            calls.fetch_add(1, Ordering::SeqCst);
            (!path.contains("blank")).then(|| AppIcon { width: 1, height: 1, rgba_base64: base64_encode(&[9, 8, 7, 255]) })
        };
        let path = format!("C:\\Games\\cache-test-{}\\Game.exe", std::process::id());
        let first = cached(&path, fake).expect("icon");
        let again = cached(&path.to_uppercase().replace('\\', "/"), fake).expect("icon from cache");
        assert_eq!(first, again);
        assert_eq!(calls.load(Ordering::SeqCst), 1, "the second spelling must hit the cache");

        let blank = format!("C:\\Games\\cache-test-{}\\blank.exe", std::process::id());
        assert_eq!(cached(&blank, fake), None);
        assert_eq!(cached(&blank, fake), None);
        assert_eq!(calls.load(Ordering::SeqCst), 2, "a miss is cached as well");
        assert_eq!(cached("   ", fake), None);
        assert_eq!(calls.load(Ordering::SeqCst), 2, "an empty path is never looked up");
    }
}

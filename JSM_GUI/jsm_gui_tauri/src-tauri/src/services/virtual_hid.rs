//! Shared native HID transport for the controller keyboard. No IPC or key logging.
#[cfg(target_os = "windows")]
pub fn send(vk: Option<u16>, text: &[u16]) -> Option<Result<(), String>> {
    use std::{ffi::c_void, os::windows::ffi::OsStrExt, sync::OnceLock};
    type Key = unsafe extern "C" fn(u16, i32) -> i32;
    type Text = unsafe extern "C" fn(*const u16, u32) -> i32;
    struct Api { key: Key, text: Text }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn LoadLibraryExW(path: *const u16, file: *mut c_void, flags: u32) -> *mut c_void;
        fn GetProcAddress(module: *mut c_void, name: *const u8) -> *mut c_void;
    }
    static API: OnceLock<Option<Api>> = OnceLock::new();
    let api = API.get_or_init(|| {
        let installed = std::env::current_exe().ok()?.parent()?.join("bin/SDL/jsm-input.dll");
        let development = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("bin/SDL/jsm-input.dll");
        for path in [installed, development] {
            if !path.is_file() { continue; }
            let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
            // Restrict dependency lookup to this exact DLL's directory and System32.
            let module = unsafe { LoadLibraryExW(wide.as_ptr(), std::ptr::null_mut(), 0x100 | 0x800) };
            if module.is_null() { continue; }
            let key = unsafe { GetProcAddress(module, c"jsm_hid_key".as_ptr().cast()) };
            let text = unsafe { GetProcAddress(module, c"jsm_hid_text".as_ptr().cast()) };
            if !key.is_null() && !text.is_null() {
                // Module deliberately remains loaded for the lifetime of these pointers.
                return Some(Api { key: unsafe { std::mem::transmute::<*mut c_void, Key>(key) }, text: unsafe { std::mem::transmute::<*mut c_void, Text>(text) } });
            }
        }
        None
    }).as_ref()?;
    let result = if let Some(key) = vk {
        if unsafe { (api.key)(key, 1) } == 0 { return None; }
        if unsafe { (api.key)(key, 0) } == 0 { -1 } else { 1 }
    } else {
        unsafe { (api.text)(text.as_ptr(), u32::try_from(text.len()).ok()?) }
    };
    match result {
        1 => Some(Ok(())),
        0 => None, // absent driver or a character unavailable in the current layout
        _ => Some(Err("The virtual keyboard device stopped accepting input.".into())),
    }
}

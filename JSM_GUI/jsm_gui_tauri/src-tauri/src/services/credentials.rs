//! Secrets in Windows Credential Manager (console v2, D18): the assistant's API
//! keys and the ChatGPT sign-in tokens. They never reach the settings file or
//! the web view; the UI is told only whether a key is stored and its last few
//! characters.
//!
//! Each secret is a generic credential named `JSM Evolved/<what>`, visible in
//! Control Panel ▸ Credential Manager ▸ Windows Credentials, scoped to this
//! Windows user. Outside Windows (tests, a future port) an in-process map
//! stands in, so nothing is ever written to disk in the clear.

const TARGET_PREFIX: &str = "JSM Evolved/";

fn target(name: &str) -> String {
    format!("{TARGET_PREFIX}{name}")
}

/// "…a1b2": enough to tell two keys apart, never enough to use one.
pub fn hint(secret: &str) -> String {
    let tail: String = secret.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    if secret.chars().count() <= 8 {
        "…".to_string()
    } else {
        format!("…{tail}")
    }
}

#[cfg(windows)]
mod platform {
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND, FILETIME};
    use windows_sys::Win32::Security::Credentials::{
        CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn write(target: &str, secret: &str) -> Result<(), String> {
        let mut name = wide(target);
        let mut user = wide("JSM Evolved");
        let blob = secret.as_bytes().to_vec();
        let credential = CREDENTIALW {
            Flags: 0,
            Type: CRED_TYPE_GENERIC,
            TargetName: name.as_mut_ptr(),
            Comment: std::ptr::null_mut(),
            LastWritten: FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 },
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_ptr() as *mut u8,
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount: 0,
            Attributes: std::ptr::null_mut(),
            TargetAlias: std::ptr::null_mut(),
            UserName: user.as_mut_ptr(),
        };
        // SAFETY: every pointer refers to a buffer that outlives the call.
        let ok = unsafe { CredWriteW(&credential, 0) };
        if ok == 0 {
            return Err(format!("Windows Credential Manager refused to store it (error {}).", unsafe { GetLastError() }));
        }
        Ok(())
    }

    pub fn read(target: &str) -> Result<Option<String>, String> {
        let name = wide(target);
        let mut found: *mut CREDENTIALW = std::ptr::null_mut();
        // SAFETY: CredReadW fills `found` with a block CredFree releases.
        let ok = unsafe { CredReadW(name.as_ptr(), CRED_TYPE_GENERIC, 0, &mut found) };
        if ok == 0 {
            let error = unsafe { GetLastError() };
            return if error == ERROR_NOT_FOUND { Ok(None) } else { Err(format!("Windows Credential Manager could not read it (error {error}).")) };
        }
        // SAFETY: on success `found` points at a valid CREDENTIALW.
        let secret = unsafe {
            let credential = &*found;
            let bytes = std::slice::from_raw_parts(credential.CredentialBlob, credential.CredentialBlobSize as usize).to_vec();
            CredFree(found as *const _);
            bytes
        };
        Ok(Some(String::from_utf8_lossy(&secret).into_owned()))
    }

    pub fn delete(target: &str) -> Result<(), String> {
        let name = wide(target);
        // SAFETY: a valid, nul-terminated target name.
        let ok = unsafe { CredDeleteW(name.as_ptr(), CRED_TYPE_GENERIC, 0) };
        if ok == 0 {
            let error = unsafe { GetLastError() };
            if error != ERROR_NOT_FOUND {
                return Err(format!("Windows Credential Manager could not remove it (error {error})."));
            }
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod platform {
    use std::{collections::HashMap, sync::Mutex, sync::OnceLock};
    fn store() -> &'static Mutex<HashMap<String, String>> {
        static STORE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
        STORE.get_or_init(|| Mutex::new(HashMap::new()))
    }
    pub fn write(target: &str, secret: &str) -> Result<(), String> {
        store().lock().map_err(|e| e.to_string())?.insert(target.to_string(), secret.to_string());
        Ok(())
    }
    pub fn read(target: &str) -> Result<Option<String>, String> {
        Ok(store().lock().map_err(|e| e.to_string())?.get(target).cloned())
    }
    pub fn delete(target: &str) -> Result<(), String> {
        store().lock().map_err(|e| e.to_string())?.remove(target);
        Ok(())
    }
}

pub fn store(name: &str, secret: &str) -> Result<(), String> {
    if secret.is_empty() {
        return forget(name);
    }
    platform::write(&target(name), secret)
}

pub fn load(name: &str) -> Option<String> {
    platform::read(&target(name)).ok().flatten().filter(|secret| !secret.is_empty())
}

pub fn forget(name: &str) -> Result<(), String> {
    platform::delete(&target(name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hints_show_only_the_last_four_characters() {
        assert_eq!(hint("sk-ant-api03-abcdefa1b2"), "…a1b2");
        assert_eq!(hint("short"), "…");
    }

    #[test]
    fn a_secret_round_trips_and_is_forgotten() {
        let name = format!("test/{}", std::process::id());
        store(&name, "secret-value-1234").unwrap();
        assert_eq!(load(&name).as_deref(), Some("secret-value-1234"));
        forget(&name).unwrap();
        assert_eq!(load(&name), None);
        // Forgetting what is not there is not an error.
        forget(&name).unwrap();
    }
}

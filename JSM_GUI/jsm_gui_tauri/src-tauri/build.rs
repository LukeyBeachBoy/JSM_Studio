fn main() {
    #[cfg(windows)]
    {
        println!("cargo:rerun-if-env-changed=JSM_TEST_NO_ELEVATION");
        // Test binaries inherit the app manifest. Release packaging always
        // retains its administrator requirement.
        let manifest = if std::env::var_os("JSM_TEST_NO_ELEVATION").is_some() && std::env::var("PROFILE").as_deref() != Ok("release") {
            include_str!("app.manifest.xml").replace("requireAdministrator", "asInvoker")
        } else { include_str!("app.manifest.xml").to_owned() };
        let windows =
            tauri_build::WindowsAttributes::new().app_manifest(&manifest);
        let attrs = tauri_build::Attributes::new().windows_attributes(windows);
        tauri_build::try_build(attrs).expect("failed to run Tauri build script");
    }

    #[cfg(not(windows))]
    tauri_build::build()
}

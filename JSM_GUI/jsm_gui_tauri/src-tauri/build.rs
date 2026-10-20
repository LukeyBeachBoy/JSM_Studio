fn main() {
    #[cfg(windows)]
    {
        // Ordinary launches and test binaries use the current user's rights.
        // Privileged operations use the explicit administrator restart flow.
        let manifest = include_str!("app.manifest.xml");
        let windows =
            tauri_build::WindowsAttributes::new().app_manifest(&manifest);
        let attrs = tauri_build::Attributes::new().windows_attributes(windows);
        tauri_build::try_build(attrs).expect("failed to run Tauri build script");
    }

    #[cfg(not(windows))]
    tauri_build::build()
}

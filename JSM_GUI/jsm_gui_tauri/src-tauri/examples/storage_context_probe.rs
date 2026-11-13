//! Run from both a packaged launcher and Explorer with --report=<absolute
//! JSON path> --profile=Cyberpunk. Physical library and profile hash must agree.
#[path = "../src/services/storage_context.rs"]
#[allow(dead_code)]
#[cfg(windows)]
mod storage_context;

#[cfg(windows)]
fn main() {
    use sha2::{Digest, Sha256};
    let arguments: Vec<String> = std::env::args().collect();
    let report = arguments.iter().find_map(|arg| arg.strip_prefix("--report=")).expect("--report=<absolute path> is required");
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let identifier = config["identifier"].as_str().unwrap();
    let result = storage_context::normalize_launch(identifier);
    if matches!(result, Ok(true)) { return; }
    let library = storage_context::data_directory(identifier).unwrap().join("jsm-runtime/profiles-library");
    let profile = arguments.iter().find_map(|arg| arg.strip_prefix("--profile="));
    let bytes = profile.and_then(|name| std::fs::read(library.join(format!("{name}.txt"))).ok());
    let output = serde_json::json!({
        "result":format!("{result:?}"), "physicalLibrary":std::fs::canonicalize(&library).ok(),
        "profileBytes":bytes.as_ref().map(Vec::len),
        "profileHash":bytes.map(|bytes| format!("{:X}", Sha256::digest(bytes))),
        "desktopHandoff":arguments.iter().any(|arg| arg == "--jsm-storage-context"),
    });
    std::fs::write(report, output.to_string()).unwrap();
}

#[cfg(not(windows))]
fn main() { eprintln!("This probe tests Windows launch contexts."); }

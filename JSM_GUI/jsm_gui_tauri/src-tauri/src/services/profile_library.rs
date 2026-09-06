use std::{thread, time::Duration};

use tauri::{AppHandle, Emitter};

use crate::runtime;

// The profile list was only ever read when the front end asked for it, so a
// .txt copied into profiles-library by hand -- or written by another tool --
// stayed invisible until the next launch. This worker closes that gap.
//
// It polls rather than taking a filesystem-watch dependency. The directory
// holds a handful of tiny files, the app already runs its background work this
// way (see global_chords), and a diff of the listing cannot miss a change or
// fire twice for a single save the way a raw watcher does on Windows, where one
// logical write arrives as several events.
const POLL_INTERVAL_MS: u64 = 1000;

pub fn start(app: AppHandle) {
    thread::spawn(move || {
        let mut last: Option<Vec<String>> = None;
        loop {
            // list_library_profile_names, not list_library_profiles: the latter
            // runs ensure_required_files, which writes.
            if let Ok(names) = runtime::list_library_profile_names(&app) {
                if last.as_ref() != Some(&names) {
                    // The first successful listing only establishes a baseline.
                    // The front end fetches the list itself on mount, so
                    // emitting here would just duplicate that.
                    if last.is_some() {
                        if let Err(error) = app.emit("library-profiles-changed", &names) {
                            eprintln!("Failed to emit profile library change: {error}");
                        }
                    }
                    last = Some(names);
                }
            }
            thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
        }
    });
}

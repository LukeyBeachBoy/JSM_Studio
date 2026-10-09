//! The user's sound library: MP3s and MIDI files trimmed and converted into tone
//! sequences the controller's haptics can play (docs/plans/controller-sounds-library.md).
//!
//! Layout, under the runtime directory so the mapper resolves the relative
//! path exactly as it resolves a configuration name:
//!
//! ```text
//! sounds/<id>/original.mp3   the upload, kept so the sound can be re-trimmed
//! sounds/<id>/original.mid   used instead for MIDI imports
//! sounds/<id>/sound.json     name, timestamps, trim window, note count
//! sounds/<id>/tones.txt      the sequence the mapper plays; present once converted
//! ```
//!
//! Every write is temp-file + rename: the mapper reads these live, and a
//! CONNECT_SOUND_FILE pointing at a half-written tones.txt would play garbage.

use std::{
    collections::hash_map::RandomState,
    fs,
    hash::{BuildHasher, Hash, Hasher},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::runtime;

pub const SOUNDS_DIR_NAME: &str = "sounds";
const ORIGINAL_FILE_NAME: &str = "original.mp3";
const MIDI_FILE_NAME: &str = "original.mid";
const METADATA_FILE_NAME: &str = "sound.json";
const TONES_FILE_NAME: &str = "tones.txt";

const MAX_IMPORT_BYTES: usize = 25 * 1024 * 1024;
const MAX_NAME_CHARS: usize = 60;
/// The tone file's hard limits (ToneSequence.h; the mapper stops reading at
/// either one, so anything past them would be silently dropped anyway).
/// Generous on purpose: a whole song can be a sound.
const MAX_NOTES: usize = 20000;
const MAX_TOTAL_MS: u32 = 600_000;
const FREQUENCY_RANGE: std::ops::RangeInclusive<u16> = 40..=2000;
const DURATION_RANGE: std::ops::RangeInclusive<u16> = 10..=2000;
const GAIN_RANGE: std::ops::RangeInclusive<i8> = -60..=0;

/// One note of a sequence as the editor sends it. `frequency_hz` 0 is a rest;
/// `gain_db` is relative, the mapper adds SOUND_GAIN when it plays.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Tone {
    pub frequency_hz: u16,
    pub duration_ms: u16,
    pub gain_db: i8,
}

/// What `sound.json` holds. The trim fields are absent until the sound has
/// been converted, which is also what `SoundEntry::ready` reports.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SoundMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    midi_track: Option<String>,
    id: String,
    name: String,
    created_at: u64,
    #[serde(default)]
    duration_ms: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    trim_start_ms: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    trim_end_ms: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    note_count: Option<u32>,
    /// "Volume on a button" (console v2, D15): the gain a new binding of this
    /// sound starts at, in dB. A binding's own gain still overrides it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    default_gain_db: Option<f32>,
}

/// A library sound as the UI sees it.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundEntry {
    pub source_format: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub midi_track: Option<String>,
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub duration_ms: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trim_start_ms: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trim_end_ms: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_gain_db: Option<f32>,
    /// `tones.txt` exists, so the sound can be chosen and played.
    pub ready: bool,
}

// --- ids ---------------------------------------------------------------------

/// `snd-<unix-ms>-<4 hex>`. Checked before any path is built from an id, so an
/// id can never carry a separator or `..` into the sounds folder.
pub fn is_valid_sound_id(id: &str) -> bool {
    let Some(rest) = id.strip_prefix("snd-") else { return false };
    let Some((millis, suffix)) = rest.split_once('-') else { return false };
    !millis.is_empty()
        && millis.bytes().all(|byte| byte.is_ascii_digit())
        && suffix.len() == 4
        && suffix.bytes().all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

pub fn validate_sound_id(id: &str) -> Result<&str, String> {
    if is_valid_sound_id(id) {
        Ok(id)
    } else {
        Err(format!("Invalid sound id: {id}"))
    }
}

fn generate_sound_id(existing: &Path) -> String {
    let now = unix_millis();
    // No rand crate: the std hasher is randomly seeded per process, and the
    // nanosecond clock and a counter keep two ids made in the same
    // millisecond apart. Collisions are checked against the folder anyway.
    let mut counter = 0u32;
    loop {
        let mut hasher = RandomState::new().build_hasher();
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0)
            .hash(&mut hasher);
        counter.hash(&mut hasher);
        let id = format!("snd-{now}-{:04x}", (hasher.finish() & 0xffff) as u16);
        if !existing.join(&id).exists() {
            return id;
        }
        counter += 1;
    }
}

fn unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

/// The path the mapper is given for a sound: relative to JSM_DIRECTORY, forward
/// slashes, no spaces (PLAY_SOUND splits its argument on whitespace).
pub fn tones_relative_path(id: &str) -> String {
    format!("{SOUNDS_DIR_NAME}/{id}/{TONES_FILE_NAME}")
}

pub fn sounds_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime::runtime_dir(app)?.join(SOUNDS_DIR_NAME))
}

/// Whether `id` names a converted sound in this install's library.
pub fn is_ready(app: &AppHandle, id: &str) -> bool {
    is_valid_sound_id(id)
        && sounds_dir(app)
            .map(|root| root.join(id).join(TONES_FILE_NAME).is_file())
            .unwrap_or(false)
}

// --- names -------------------------------------------------------------------

fn validate_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Sound name cannot be empty.".to_string());
    }
    if trimmed.chars().count() > MAX_NAME_CHARS {
        return Err(format!("Sound name must be {MAX_NAME_CHARS} characters or fewer."));
    }
    if trimmed.chars().any(char::is_control) {
        return Err("Sound name cannot contain control characters.".to_string());
    }
    Ok(trimmed.to_string())
}

// --- the library ------------------------------------------------------------

pub fn list(app: &AppHandle) -> Result<Vec<SoundEntry>, String> {
    list_in(&sounds_dir(app)?)
}

pub fn import(app: &AppHandle, name: &str, mp3_base64: &str) -> Result<SoundEntry, String> {
    import_in(&sounds_dir(app)?, name, mp3_base64)
}

pub fn read_audio(app: &AppHandle, id: &str) -> Result<String, String> {
    read_audio_in(&sounds_dir(app)?, id)
}

pub fn save(
    app: &AppHandle,
    id: &str,
    name: &str,
    duration_ms: u32,
    trim_start_ms: u32,
    trim_end_ms: u32,
    tones: &[Tone],
    midi_track: Option<&str>,
) -> Result<SoundEntry, String> {
    save_in(&sounds_dir(app)?, id, name, duration_ms, trim_start_ms, trim_end_ms, tones, midi_track)
}

/// A temporary conversion for the trim editor. It is deliberately outside the
/// id namespace, so it cannot appear in the library or replace a saved sound.
pub fn preview_tones(app: &AppHandle, tones: &[Tone]) -> Result<String, String> {
    if tones.is_empty() || !tones.iter().any(|tone| tone.frequency_hz > 0) {
        return Err("No clear melody was found in this selection.".to_string());
    }
    let relative = format!("{SOUNDS_DIR_NAME}/preview/{TONES_FILE_NAME}");
    let path = sounds_dir(app)?.join("preview").join(TONES_FILE_NAME);
    runtime::write_file_atomically(&path, &tones_file_text(tones))?;
    Ok(relative)
}

pub fn rename(app: &AppHandle, id: &str, name: &str) -> Result<SoundEntry, String> {
    rename_in(&sounds_dir(app)?, id, name)
}

/// Removes the sound. A Connect or Shutdown choice pointing at it is cleared
/// first, so StudioDefaults.txt says NONE before the file it named is gone.
pub fn delete(app: &AppHandle, id: &str) -> Result<(), String> {
    validate_sound_id(id)?;
    runtime::clear_sound_file_selection(app, id)?;
    delete_in(&sounds_dir(app)?, id)
}

fn list_in(root: &Path) -> Result<Vec<SoundEntry>, String> {
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("Failed to read the sound library: {error}")),
    };
    let mut sounds = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to read a sound library entry: {error}"))?;
        let Some(id) = entry.file_name().to_str().map(str::to_string) else { continue };
        if !is_valid_sound_id(&id) || !entry.path().is_dir() {
            continue;
        }
        // A folder with an unreadable sound.json is skipped, not fatal: one
        // broken sound must not hide the rest of the library.
        match read_metadata(&entry.path(), &id) {
            Ok(metadata) => sounds.push(entry_from(&entry.path(), metadata)),
            Err(error) => eprintln!("Skipping sound {id}: {error}"),
        }
    }
    sounds.sort_by(|left, right| left.created_at.cmp(&right.created_at).then_with(|| left.id.cmp(&right.id)));
    Ok(sounds)
}

fn import_in(root: &Path, name: &str, mp3_base64: &str) -> Result<SoundEntry, String> {
    let name = validate_name(name)?;
    // Three base64 characters at most per two decoded bytes: refuse the
    // obviously oversized before decoding tens of megabytes.
    if mp3_base64.len() / 4 * 3 > MAX_IMPORT_BYTES + 3 {
        return Err("Sound files must be 25 MB or smaller.".to_string());
    }
    let bytes = decode_base64(mp3_base64)?;
    if bytes.is_empty() {
        return Err("The sound file is empty.".to_string());
    }
    if bytes.len() > MAX_IMPORT_BYTES {
        return Err("Sound files must be 25 MB or smaller.".to_string());
    }

    fs::create_dir_all(root).map_err(|error| format!("Failed to create the sound library: {error}"))?;
    let id = generate_sound_id(root);
    let dir = root.join(&id);
    fs::create_dir_all(&dir).map_err(|error| format!("Failed to create the sound folder: {error}"))?;
    let original = if bytes.starts_with(b"MThd") { MIDI_FILE_NAME } else { ORIGINAL_FILE_NAME };
    runtime::write_file_atomically(dir.join(original), &bytes)?;
    let metadata = SoundMetadata {
        midi_track: None,
        id,
        name,
        created_at: unix_millis(),
        duration_ms: 0,
        trim_start_ms: None,
        trim_end_ms: None,
        note_count: None,
        default_gain_db: None,
    };
    write_metadata(&dir, &metadata)?;
    Ok(entry_from(&dir, metadata))
}

fn read_audio_in(root: &Path, id: &str) -> Result<String, String> {
    validate_sound_id(id)?;
    let dir = root.join(id);
    let path = dir.join(if dir.join(MIDI_FILE_NAME).is_file() { MIDI_FILE_NAME } else { ORIGINAL_FILE_NAME });
    let bytes = fs::read(&path).map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    Ok(encode_base64(&bytes))
}

fn save_in(
    root: &Path,
    id: &str,
    name: &str,
    duration_ms: u32,
    trim_start_ms: u32,
    trim_end_ms: u32,
    tones: &[Tone],
    midi_track: Option<&str>,
) -> Result<SoundEntry, String> {
    validate_sound_id(id)?;
    let name = validate_name(name)?;
    if duration_ms == 0 || trim_end_ms <= trim_start_ms || trim_end_ms > duration_ms {
        return Err("The trim must be within the original sound and have a positive length.".to_string());
    }
    let dir = root.join(id);
    let mut metadata = read_metadata(&dir, id)?;
    let text = tones_file_text(tones);
    let note_count = count_notes(&text);
    if note_count == 0 {
        return Err("The selection produced no notes the controller can play.".to_string());
    }
    // tones.txt before sound.json: the entry only reports ready once the
    // file it points at is there.
    runtime::write_file_atomically(dir.join(TONES_FILE_NAME), &text)?;
    metadata.name = name;
    metadata.duration_ms = duration_ms;
    metadata.trim_start_ms = Some(trim_start_ms);
    metadata.trim_end_ms = Some(trim_end_ms);
    metadata.note_count = Some(note_count as u32);
    metadata.midi_track = midi_track.map(str::to_string);
    write_metadata(&dir, &metadata)?;
    Ok(entry_from(&dir, metadata))
}

fn rename_in(root: &Path, id: &str, name: &str) -> Result<SoundEntry, String> {
    validate_sound_id(id)?;
    let name = validate_name(name)?;
    let dir = root.join(id);
    let mut metadata = read_metadata(&dir, id)?;
    metadata.name = name;
    write_metadata(&dir, &metadata)?;
    Ok(entry_from(&dir, metadata))
}

/// The lowest a binding can play a sound at, as in utils/controllerSounds.ts.
pub const SOUND_GAIN_MIN_DB: f32 = -30.0;

pub fn set_default_gain(app: &AppHandle, id: &str, gain_db: f32) -> Result<SoundEntry, String> {
    set_default_gain_in(&sounds_dir(app)?, id, gain_db)
}

fn set_default_gain_in(root: &Path, id: &str, gain_db: f32) -> Result<SoundEntry, String> {
    validate_sound_id(id)?;
    if !gain_db.is_finite() {
        return Err("The volume must be a number of decibels.".to_string());
    }
    let dir = root.join(id);
    let mut metadata = read_metadata(&dir, id)?;
    let gain = gain_db.clamp(SOUND_GAIN_MIN_DB, 0.0);
    metadata.default_gain_db = if gain == 0.0 { None } else { Some((gain * 10.0).round() / 10.0) };
    write_metadata(&dir, &metadata)?;
    Ok(entry_from(&dir, metadata))
}

fn delete_in(root: &Path, id: &str) -> Result<(), String> {
    validate_sound_id(id)?;
    let dir = root.join(id);
    match fs::remove_dir_all(&dir) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Failed to delete sound {id}: {error}")),
    }
}

fn read_metadata(dir: &Path, id: &str) -> Result<SoundMetadata, String> {
    let path = dir.join(METADATA_FILE_NAME);
    let raw = fs::read_to_string(&path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            format!("Sound {id} is not in the library.")
        } else {
            format!("Failed to read {}: {error}", path.display())
        }
    })?;
    let mut metadata: SoundMetadata = serde_json::from_str(&raw)
        .map_err(|error| format!("Failed to parse {}: {error}", path.display()))?;
    // The folder name is the id; a copied or hand-edited file does not get to
    // disagree with it.
    metadata.id = id.to_string();
    Ok(metadata)
}

fn write_metadata(dir: &Path, metadata: &SoundMetadata) -> Result<(), String> {
    let content = serde_json::to_string_pretty(metadata)
        .map_err(|error| format!("Failed to serialize sound metadata: {error}"))?;
    runtime::write_file_atomically(dir.join(METADATA_FILE_NAME), content)
}

fn entry_from(dir: &Path, metadata: SoundMetadata) -> SoundEntry {
    SoundEntry {
        source_format: if dir.join(MIDI_FILE_NAME).is_file() { "midi" } else { "mp3" }.to_string(),
        midi_track: metadata.midi_track,
        ready: dir.join(TONES_FILE_NAME).is_file(),
        id: metadata.id,
        name: metadata.name,
        created_at: metadata.created_at,
        duration_ms: metadata.duration_ms,
        trim_start_ms: metadata.trim_start_ms,
        trim_end_ms: metadata.trim_end_ms,
        note_count: metadata.note_count,
        default_gain_db: metadata.default_gain_db,
    }
}

// --- tones.txt ----------------------------------------------------------------

/// The file the mapper reads, in the contract's format. Each note is clamped
/// to what the firmware can play; the sequence stops at 400 notes or 8000 ms,
/// where the mapper would stop reading anyway.
fn tones_file_text(tones: &[Tone]) -> String {
    let mut text = String::from(
        "# JSM Evolved tone sequence v1\n# frequency_hz duration_ms gain_db      (frequency 0 = rest, gain relative)\n",
    );
    let mut total_ms = 0u32;
    let mut count = 0usize;
    for tone in tones {
        if count >= MAX_NOTES {
            break;
        }
        let frequency = if tone.frequency_hz == 0 {
            0
        } else {
            tone.frequency_hz.clamp(*FREQUENCY_RANGE.start(), *FREQUENCY_RANGE.end())
        };
        let mut duration = tone.duration_ms.clamp(*DURATION_RANGE.start(), *DURATION_RANGE.end());
        let remaining = MAX_TOTAL_MS.saturating_sub(total_ms);
        if remaining < u32::from(*DURATION_RANGE.start()) {
            break;
        }
        // The last note is shortened to fit rather than dropped, so a clip
        // that runs just over the limit keeps its ending.
        if u32::from(duration) > remaining {
            duration = remaining as u16;
        }
        let gain = tone.gain_db.clamp(*GAIN_RANGE.start(), *GAIN_RANGE.end());
        text.push_str(&format!("{frequency} {duration} {gain}\n"));
        total_ms += u32::from(duration);
        count += 1;
    }
    text
}

fn count_notes(text: &str) -> usize {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .count()
}

// --- base64 -------------------------------------------------------------------
// Standard alphabet with padding, as the WebView produces it; the decoder also
// takes the URL-safe alphabet, missing padding and whitespace, and a
// `data:...;base64,` prefix, since it costs nothing and saves a round trip
// when the caller hands over a data URL. No crate: the app has none of the
// base64 crates as a direct dependency and this is thirty lines.

const BASE64_ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn encode_base64(bytes: &[u8]) -> String {
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(BASE64_ALPHABET[(triple >> 18) as usize & 63] as char);
        out.push(BASE64_ALPHABET[(triple >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { BASE64_ALPHABET[(triple >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { BASE64_ALPHABET[triple as usize & 63] as char } else { '=' });
    }
    out
}

fn decode_base64(text: &str) -> Result<Vec<u8>, String> {
    let body = match text.find(";base64,") {
        Some(index) if text.starts_with("data:") => &text[index + ";base64,".len()..],
        _ => text,
    };
    let mut out = Vec::with_capacity(body.len() / 4 * 3);
    let mut buffer = 0u32;
    let mut bits = 0u32;
    for byte in body.bytes() {
        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' | b'\n' | b'\r' | b' ' | b'\t' => continue,
            other => return Err(format!("Invalid base64 character: {:?}", other as char)),
        };
        buffer = (buffer << 6) | u32::from(value);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("jsm-sounds-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn only_well_formed_ids_reach_the_file_system() {
        assert!(is_valid_sound_id("snd-1727640000000-1a2b"));
        assert!(is_valid_sound_id("snd-1-0000"));
        for bad in [
            "",
            "snd-",
            "snd-1727640000000",
            "snd-1727640000000-1a2",
            "snd-1727640000000-1a2bc",
            "snd-1727640000000-1A2B",
            "snd-1727640000000-zzzz",
            "snd-abc-1a2b",
            "snd-1727640000000-1a2b/../x",
            "../snd-1727640000000-1a2b",
            "snd-1727640000000-1a2b ",
            "profiles-library/x.txt",
        ] {
            assert!(!is_valid_sound_id(bad), "{bad:?} must be rejected");
        }
        let generated = generate_sound_id(Path::new("nowhere"));
        assert!(is_valid_sound_id(&generated), "{generated}");
        assert_eq!(tones_relative_path("snd-1-0000"), "sounds/snd-1-0000/tones.txt");
    }

    #[test]
    fn tones_file_matches_the_contract_and_clamps_each_note() {
        let text = tones_file_text(&[
            Tone { frequency_hz: 588, duration_ms: 80, gain_db: 0 },
            Tone { frequency_hz: 0, duration_ms: 20, gain_db: 0 },
            // Out of range on every field: pulled back rather than refused.
            Tone { frequency_hz: 5, duration_ms: 3, gain_db: 9 },
            Tone { frequency_hz: 9000, duration_ms: 5000, gain_db: -90 },
        ]);
        assert_eq!(
            text,
            "# JSM Evolved tone sequence v1\n\
             # frequency_hz duration_ms gain_db      (frequency 0 = rest, gain relative)\n\
             588 80 0\n\
             0 20 0\n\
             40 10 0\n\
             2000 2000 -60\n"
        );
        assert_eq!(count_notes(&text), 4);
    }

    #[test]
    fn tones_file_stops_at_the_note_and_length_limits() {
        let many = vec![Tone { frequency_hz: 440, duration_ms: 10, gain_db: 0 }; MAX_NOTES + 100];
        assert_eq!(count_notes(&tones_file_text(&many)), MAX_NOTES);

        // One 2000 ms note more than fits: the last fills the limit exactly,
        // the extra never appears, and nothing was left half-written.
        let fitting = MAX_TOTAL_MS as usize / 2000;
        let long = vec![Tone { frequency_hz: 440, duration_ms: 2000, gain_db: 0 }; fitting + 1];
        let text = tones_file_text(&long);
        assert_eq!(count_notes(&text), fitting);
        let total: u32 = text
            .lines()
            .filter(|line| !line.starts_with('#'))
            .map(|line| line.split(' ').nth(1).unwrap().parse::<u32>().unwrap())
            .sum();
        assert_eq!(total, MAX_TOTAL_MS);

        // A note that only partly fits is shortened, not dropped: 500 ms of
        // room left, a 900 ms note asked for.
        let mut nearly_full = vec![Tone { frequency_hz: 440, duration_ms: 2000, gain_db: 0 }; fitting - 1];
        nearly_full.push(Tone { frequency_hz: 440, duration_ms: 1500, gain_db: 0 });
        nearly_full.push(Tone { frequency_hz: 660, duration_ms: 900, gain_db: -3 });
        let text = tones_file_text(&nearly_full);
        assert!(text.ends_with("660 500 -3\n"), "{text}");
    }

    #[test]
    fn base64_round_trips_and_tolerates_what_browsers_send() {
        let bytes: Vec<u8> = (0..=255u8).chain([0, 1, 2].into_iter()).collect();
        let encoded = encode_base64(&bytes);
        assert_eq!(decode_base64(&encoded).unwrap(), bytes);
        assert_eq!(encode_base64(b"Man"), "TWFu");
        assert_eq!(encode_base64(b"Ma"), "TWE=");
        assert_eq!(encode_base64(b"M"), "TQ==");
        assert_eq!(decode_base64("TQ").unwrap(), b"M");
        assert_eq!(decode_base64("TW\nFu").unwrap(), b"Man");
        assert_eq!(decode_base64("data:audio/mpeg;base64,TWFu").unwrap(), b"Man");
        assert!(decode_base64("TW*u").is_err());
    }

    #[test]
    fn a_sound_round_trips_through_the_library() {
        let root = temp_root("roundtrip");
        assert!(list_in(&root).unwrap().is_empty(), "a missing library lists as empty");

        let mp3 = b"ID3\x03\x00fake mp3 bytes".to_vec();
        let imported = import_in(&root, "  Victory riff  ", &encode_base64(&mp3)).unwrap();
        assert!(is_valid_sound_id(&imported.id));
        assert_eq!(imported.name, "Victory riff");
        assert!(!imported.ready);
        assert_eq!((imported.trim_start_ms, imported.trim_end_ms, imported.note_count), (None, None, None));
        assert_eq!(decode_base64(&read_audio_in(&root, &imported.id).unwrap()).unwrap(), mp3);

        // The metadata file is exactly the contract's shape, without the
        // optional fields until the sound is converted.
        let json: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(root.join(&imported.id).join(METADATA_FILE_NAME)).unwrap()).unwrap();
        assert_eq!(json["id"], imported.id);
        assert_eq!(json["name"], "Victory riff");
        assert!(json["createdAt"].is_u64());
        assert_eq!(json["durationMs"], 0);
        assert!(json.get("trimStartMs").is_none());

        let saved = save_in(
            &root,
            &imported.id,
            "Victory riff",
            12340,
            1000,
            4200,
            &[Tone { frequency_hz: 588, duration_ms: 80, gain_db: 0 }, Tone { frequency_hz: 699, duration_ms: 80, gain_db: -3 }],
            None,
        )
        .unwrap();
        assert!(saved.ready);
        assert_eq!((saved.duration_ms, saved.trim_start_ms, saved.trim_end_ms, saved.note_count), (12340, Some(1000), Some(4200), Some(2)));
        assert_eq!(
            fs::read_to_string(root.join(&imported.id).join(TONES_FILE_NAME)).unwrap(),
            "# JSM Evolved tone sequence v1\n# frequency_hz duration_ms gain_db      (frequency 0 = rest, gain relative)\n588 80 0\n699 80 -3\n"
        );
        let json: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(root.join(&imported.id).join(METADATA_FILE_NAME)).unwrap()).unwrap();
        assert_eq!(json["trimStartMs"], 1000);
        assert_eq!(json["trimEndMs"], 4200);
        assert_eq!(json["noteCount"], 2);
        assert_eq!(json["durationMs"], 12340);

        let renamed = rename_in(&root, &imported.id, "Fanfare").unwrap();
        assert_eq!(renamed.name, "Fanfare");
        assert!(renamed.ready, "a rename keeps the converted sequence");

        let listed = list_in(&root).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "Fanfare");
        assert_eq!(listed[0].created_at, imported.created_at);

        delete_in(&root, &imported.id).unwrap();
        assert!(list_in(&root).unwrap().is_empty());
        assert!(delete_in(&root, &imported.id).is_ok(), "deleting twice is not an error");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn midi_source_and_track_round_trip() {
        let root = temp_root("midi");
        let bytes = b"MThd\0\0\0\x06\0\0\0\x01\x01\xe0MTrk\0\0\0\x04\0\xff\x2f\0";
        let imported = import_in(&root, "Portal MIDI", &encode_base64(bytes)).unwrap();
        assert_eq!(imported.source_format, "midi");
        assert!(root.join(&imported.id).join(MIDI_FILE_NAME).is_file());
        assert_eq!(decode_base64(&read_audio_in(&root, &imported.id).unwrap()).unwrap(), bytes);
        let saved = save_in(&root, &imported.id, "Portal MIDI", 10000, 1000, 2000,
            &[Tone { frequency_hz: 440, duration_ms: 1000, gain_db: 0 }], Some("1:0")).unwrap();
        assert_eq!(saved.midi_track.as_deref(), Some("1:0"));
        let listed = list_in(&root).unwrap();
        assert_eq!(listed[0].source_format, "midi");
        assert_eq!(listed[0].midi_track.as_deref(), Some("1:0"));
        delete_in(&root, &imported.id).unwrap();
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn imports_and_saves_are_validated() {
        let root = temp_root("validation");
        let mp3 = encode_base64(b"bytes");
        assert!(import_in(&root, "   ", &mp3).is_err(), "empty name");
        assert!(import_in(&root, &"x".repeat(61), &mp3).is_err(), "name too long");
        assert!(import_in(&root, "ok", "").is_err(), "empty file");
        assert!(import_in(&root, "ok", "not base64!").is_err(), "bad base64");
        assert!(import_in(&root, "ok", &"A".repeat(40 * 1024 * 1024)).is_err(), "too large");
        assert!(read_audio_in(&root, "../etc").is_err(), "bad id");
        assert!(save_in(&root, "snd-1-0000", "ok", 10, 0, 5, &[], None).is_err(), "unknown sound");

        let imported = import_in(&root, "ok", &mp3).unwrap();
        assert!(save_in(&root, &imported.id, "ok", 10, 5, 5, &[Tone { frequency_hz: 440, duration_ms: 100, gain_db: 0 }], None).is_err(), "empty trim window");
        assert!(save_in(&root, &imported.id, "ok", 10, 0, 11, &[Tone { frequency_hz: 440, duration_ms: 100, gain_db: 0 }], None).is_err(), "trim beyond the original");
        assert!(save_in(&root, &imported.id, "ok", 10, 0, 5, &[], None).is_err(), "no notes");
        assert!(!list_in(&root).unwrap()[0].ready, "a failed save leaves the sound unconverted");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn listing_sorts_by_creation_and_skips_broken_folders() {
        let root = temp_root("listing");
        for (id, created) in [("snd-3-0000", 3000u64), ("snd-1-0000", 1000), ("snd-2-0000", 2000)] {
            let dir = root.join(id);
            fs::create_dir_all(&dir).unwrap();
            fs::write(
                dir.join(METADATA_FILE_NAME),
                format!(r#"{{"id":"{id}","name":"{id}","createdAt":{created},"durationMs":1}}"#),
            )
            .unwrap();
        }
        fs::create_dir_all(root.join("snd-4-0000")).unwrap();
        fs::write(root.join("snd-4-0000").join(METADATA_FILE_NAME), "{not json").unwrap();
        fs::create_dir_all(root.join("not-a-sound")).unwrap();
        fs::write(root.join("snd-5-0000"), "a file, not a folder").unwrap();

        let ids: Vec<String> = list_in(&root).unwrap().into_iter().map(|entry| entry.id).collect();
        assert_eq!(ids, ["snd-1-0000", "snd-2-0000", "snd-3-0000"]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn volume_on_a_button_is_kept_per_sound() {
        let root = temp_root("gain");
        let imported = import_in(&root, "Low ammo", &encode_base64(b"ID3 fake")).unwrap();
        assert_eq!(imported.default_gain_db, None);
        let quieter = set_default_gain_in(&root, &imported.id, -12.34).unwrap();
        assert_eq!(quieter.default_gain_db, Some(-12.3));
        assert_eq!(list_in(&root).unwrap()[0].default_gain_db, Some(-12.3));
        assert_eq!(set_default_gain_in(&root, &imported.id, -80.0).unwrap().default_gain_db, Some(SOUND_GAIN_MIN_DB));
        assert_eq!(set_default_gain_in(&root, &imported.id, 6.0).unwrap().default_gain_db, None, "0 dB and louder is as recorded");
        assert!(set_default_gain_in(&root, &imported.id, f32::NAN).is_err());
        let _ = fs::remove_dir_all(&root);
    }
}

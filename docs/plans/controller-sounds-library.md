# Controller sounds: first-connect prompt, silence toggle, custom sound library — contract (2026-09-29)

Three pieces built in parallel (mapper / Studio Rust / Studio TS). This file is the
contract between them: names, formats and behaviour. Anything not stated here is
the implementer's call, but do not change what is stated without updating it.

## What the user gets

1. **First-connect prompt.** The first time a Steam Controller 2026 shows up in
   Studio (ever, per install), a centred dialog asks whether to silence the
   controller's own power-on / power-off jingle so JSM Evolved's connect and
   shutdown sounds play alone. It explains that otherwise the controller's own
   start-up jingle always plays first, followed by the JSM Evolved connect
   sound. Buttons: **Silence the controller's sounds** (writes level 0),
   **Keep them** (writes nothing). A link opens Preferences → Controller sounds.
   Either choice marks the prompt done; it never shows again.
2. **Preferences toggle.** Preferences → Controller sounds → *Silence the
   controller's own sounds*: on = jingle level 0 (off), off = level 2 (the
   factory volume, so switching it off restores the default). It replaces the
   four-way "Power jingle" control. Copy notes that off also silences the
   controller's lost-connection and low-battery cues.
3. **Sound library.** Users add MP3 files, trim them in a waveform editor, and
   keep as many as they like in Studio's user storage. Any library sound can be
   the Connect sound, the Shutdown sound, or the target of a **Play sound**
   binding action (alongside the 14 built-in tunes). Sounds can be renamed,
   re-trimmed and deleted, and previewed on the PC (in the editor) and on the
   controller.

## The honest limit, stated in the UI

The controller has no speaker: its haptic actuators play **tones** (frequency,
duration, gain). Studio therefore converts the trimmed clip into a single-voice
melody track by pitch analysis. Jingles, melodies and simple riffs come through;
speech, chords and dense mixes become an approximation. The trim editor says so
in one sentence, and offers "Preview on controller" so the result is judged by
ear before it is chosen.

## Why the built-in tunes sounded better, and what closed the gap (2026-09-30)

Read from firmware 6AA43B55 (`docs/triton-firmware-customisation.md` §2):

- A haptic script's steps are **tone requests of exactly the kind the 0x83 LFO
  tone report produces** (type 3, gain, frequency as a float, duration, LFO
  fields zero). The boot jingle is three 80 ms requests, 588 / 699 / 882 Hz,
  the second and third 3 dB below the first, preceded by a 1 ms click.
- Those requests are aimed at **channels 2 and 3, the two motors behind the
  grips** (Steam's ping `85 05 0c 00` names the same pair). The custom player
  used to send every note to channels 0 and 1, the trackpads' actuators, which
  are quieter and thinner for the same request: a different instrument.
- The firmware issues one request per step for the pair; the player sent two
  reports per note, so the right side started a few milliseconds after the
  left.

So: tone sequences now play on the grip motors by default (`SOUND_ACTUATORS`,
below), one report per note, timed against the sequence start; the converters
arrange for the instrument (octave placement, repeated-note articulation,
`utils/toneArrangement.ts`). Luke judged the mapper's path and the firmware's
script identical by ear on 2026-09-30, so the A/B reference button was removed
again. The remaining difference is host scheduling of note starts, at the
mapper's 0.5 ms clock.

## Tone sequence file — `tones.txt`

Written by Studio (Rust), read by the mapper. Lives at
`<JSM_DIRECTORY>/sounds/<id>/tones.txt`; the mapper resolves the relative path
against `JSM_DIRECTORY` exactly as it resolves a configuration file name.

```
# JSM Evolved tone sequence v1
# frequency_hz duration_ms gain_db      (frequency 0 = rest, gain relative)
588 80 0
0 20 0
699 80 -3
```

- One note per line: three integers separated by spaces. `#` starts a comment;
  blank lines are ignored. Order is playback order.
- `frequency_hz`: 0 (rest) or 40..2000. `duration_ms`: 10..2000. `gain_db`:
  −60..0, relative; the mapper adds `SOUND_GAIN` (or the gain a `PLAY_SOUND`
  call names) and clamps to −127..6.
- Limits: at most 20000 notes and 600000 ms (ten minutes) in total; a reader
  stops at either limit rather than rejecting the file. They exist so a
  runaway file cannot be read forever, not to shape the feature: a new
  selection starts at eight seconds (`DEFAULT_SELECTION_MS`) and the user
  takes it from there. A file with no valid notes plays nothing and logs why.

## Sound ids and storage (Rust owns this)

- `sounds/` under the runtime directory (`runtime_dir(app)`, the same folder as
  `StudioDefaults.txt`). One folder per sound: `sounds/<id>/`.
- `id` = `snd-<unix-ms>-<4 hex>`; never contains spaces or path separators, and
  every command validates ids against `^snd-[0-9]+-[0-9a-f]{4}$` before touching
  the file system.
- Files: `original.mp3` (the upload, kept so the sound can be re-trimmed),
  `sound.json` (metadata below), `tones.txt` (present once trimmed/converted).
- `sound.json`:
  ```json
  { "id": "snd-1727640000000-1a2b", "name": "Victory riff", "createdAt": 1727640000000,
    "durationMs": 12340, "trimStartMs": 1000, "trimEndMs": 4200, "noteCount": 37 }
  ```
  `durationMs` is the whole original (as decoded by Studio); `trimStartMs` /
  `trimEndMs` / `noteCount` are absent until the sound has been converted.
- Every file write is temp-file + rename (the mapper reads these live).

## Tauri commands (Rust implements, TS calls) — all `async`, all return `CommandResult<T>`

| command | args (camelCase over IPC) | returns |
|---|---|---|
| `sound_library_list` | — | `Vec<SoundEntry>` sorted by `createdAt` ascending |
| `sound_library_import` | `name: String, mp3Base64: String` | `SoundEntry` (no trim yet) |
| `sound_library_read_audio` | `id: String` | `String` (base64 of `original.mp3`) |
| `sound_library_save` | `id: String, name: String, durationMs: u32, trimStartMs: u32, trimEndMs: u32, tones: Vec<Tone>` | `SoundEntry` |
| `sound_library_rename` | `id: String, name: String` | `SoundEntry` |
| `sound_library_delete` | `id: String` | `()` — also clears it from connect/shutdown if selected |
| `play_controller_sound` | `sound: i32, gain: Option<i32>, soundId: Option<String>` | existing; with `soundId` set it injects `PLAY_SOUND sounds/<id>/tones.txt <gain>` |
| `preview_controller_tones` | `tones: Vec<Tone>, gain: Option<i32>` | writes a temporary `sounds/preview/tones.txt` and plays it without saving a library entry |

`SoundEntry` (serde camelCase): `{ id, name, createdAt, durationMs, trimStartMs?, trimEndMs?, noteCount?, ready: bool }` where `ready` = `tones.txt` exists.
`Tone` (serde camelCase): `{ frequencyHz: u16, durationMs: u16, gainDb: i8 }`. Rust validates and clamps to the file limits when writing `tones.txt`. Import rejects files over 25 MB and names over 60 characters; names are trimmed and may not be empty.

## Runtime state and StudioDefaults.txt (Rust owns this)

New `RuntimeMappingState` / `ControllerPreferences` fields (serde camelCase,
defaults for old state files):

- `firmware_sound_prompt_done: bool` (default false).
- `connect_sound_file: Option<String>` and `shutdown_sound_file: Option<String>`:
  a sound **id** or `None`. When set, they take precedence over
  `connect_sound` / `shutdown_sound` (the built-in indexes, unchanged).
- `boot_sound_level` stays as today (−1 leave, 0 off, 1 quiet, 2 normal); the
  new toggle only ever writes 0 or 2.

`studio_defaults_text` gains, after `BOOT_SOUND_LEVEL`:

```
CONNECT_SOUND_FILE = sounds/<id>/tones.txt     or   CONNECT_SOUND_FILE = NONE
SHUTDOWN_SOUND_FILE = sounds/<id>/tones.txt    or   SHUTDOWN_SOUND_FILE = NONE
SOUND_ACTUATORS = GRIPS                        (or PADS, BOTH)
```

`NONE` is always written when unset so a cleared choice reaches a running
mapper (the file is injected without a reset). `sound_actuators` is stored
lower case (`"grips"` default) and written upper case; anything unrecognised
is written as `GRIPS`.

## Mapper (JoyShockMapper submodule owns this)

- `include/ToneSequence.h`: `struct Tone { uint16_t frequencyHz; uint16_t durationMs; int8_t gainDb; }`;
  `std::vector<Tone> parseToneSequence(std::istream&)` (format above, clamps,
  stops at the limits) and `std::vector<Tone> loadToneSequence(const std::string &path)`.
  Pure functions, unit-tested in `tests/tone_sequence_tests.cpp` (assert-style
  like `tests/triton_led_tests.cpp`).
- `JslWrapper.h`: `virtual int PlayToneSequence(int deviceId, const std::vector<Tone> &tones, int gainDb) { return 0; }`
  returns the sequence's total length in ms (0 when the device cannot play it).
  Playing starts a new sequence at once, cancelling one still playing on that
  device.
- `SDLWrapper.cpp`: a per-device player thread (or one worker per device
  started on demand) sends each note as **one** full 10-byte LFO-tone report
  (`MsgHapticLfoTone`, LFO fields zero) per route from
  `tone_sequence::toneRoutes(SOUND_ACTUATORS)`: side 5 (both grip motors, the
  firmware's own pair) at `gain = clamp(note.gainDb + gainDb, -127, 6)`, and/or
  side 2 (both pads) at `+6` dB, the offset tuned for the quieter pad
  actuators. Note starts are scheduled against the sequence's start time
  (`wait_until`), so a slow report shortens the next wait instead of pushing
  the tune late; a rest only waits. A generation counter makes a newer sequence
  cancel the old one between notes; `~ControllerDevice` stops and joins the
  thread before closing the gamepad.
- `SOUND_ACTUATORS` (`JSMSetting<SoundActuators>`, `GRIPS` default, `PADS`,
  `BOTH`): where tone sequences play. Read when a sequence is queued.
- Settings: `CONNECT_SOUND_FILE` and `SHUTDOWN_SOUND_FILE` (`JSMSetting<PathString>`,
  default empty; the value `NONE`, any case, means none). When set and loadable
  they replace the built-in `CONNECT_SOUND` / `SHUTDOWN_SOUND` tune; on a load
  failure the mapper logs once and falls back to the built-in. The connect
  sound plays where `CONNECT_SOUND` plays today (once per connection, 1.5 s
  after connect); `do_TURN_OFF_CONTROLLER` waits the returned length (capped at
  8 s) before sending the power-off report.
- `PLAY_SOUND` accepts `PLAY_SOUND <0..13> [gain]` as today, or
  `PLAY_SOUND <path> [gain]` where `<path>` is a relative path without spaces
  (it is resolved against `JSM_DIRECTORY`); a trailing integer token is the gain.
  Help text updated. Errors are one `CERR` line naming the path.
- Windows line endings where the file already uses them (`JslWrapper.h` is CRLF).

## Studio TS (owns `JSM_GUI/jsm_gui_tauri/src/**` and the node tests)

- `platform/desktopBridge.ts`: types (`SoundEntry`, `Tone`), the six library
  methods plus `playControllerSound(sound, gain, soundId?)`, and **mock
  implementations** for the `?mock` / browser preview that keep an in-memory
  library (so the dialog can be exercised without Tauri).
- `utils/toneArrangement.ts` (pure): what both converters do to a finished
  voice. `octaveShiftForPitches` / `placeInControllerRange` move the whole
  voice by whole octaves so the geometric middle of its duration-weighted
  15th–85th percentile pitches lands nearest 650 Hz, penalising notes outside
  400–1200 Hz (intervals are untouched). `articulateRepeats` carves a rest of
  up to 30 ms (a third of the note, 10 ms steps) from a note that is followed
  by another at the same pitch, so the second is heard starting; total length
  is unchanged and different pitches run together, as the firmware's own
  phrase does. Both editors offer an octave nudge (`components/OctaveNudge.tsx`,
  Lower / Auto / Higher) on top of the automatic placement.
- `utils/midiTones.ts`: MIDI (formats 0/1) parsed per channel; tracks ranked
  for a controller melody (`scoreMidiTrackForController`); `midiToTones` keeps
  the highest sounding note, folds events under 40 ms into their neighbours
  (rejoining a note interrupted by a brief chord tone), then applies the
  arrangement above. Tracks are labelled "<name or Track n> · <General MIDI
  instrument> · channel c" so a melody can be picked by eye.
- `components/MidiTrimEditor.tsx`: the selection is a start and a *length*
  (default eight seconds; `DEFAULT_SELECTION_MS`), so scrubbing the start
  against the song's end shortens the window only while it is there and it
  grows back on the way out. The "No notes in this selection" line is always in
  the layout (`.midi-status`) so the dialog's height, and therefore its
  centred position, does not change while scrubbing across a rest.
- `components/ui/Select.module.css`: the popover sits at `--z-popover` (65),
  above `--z-dialog` (60); at `--z-menu` (50) a select inside a dialog opened
  behind it, which read as "only the chosen track exists".
- `utils/toneExtraction.ts` (pure, no DOM): `extractToneSequence(samples: Float32Array, sampleRate: number, startMs: number, endMs: number, octaveNudge = 0): Tone[]`.
  Hop 20 ms, window ~64 ms; input is high-pass/low-pass filtered and downsampled
  before pitch analysis. Pitch uses normalised autocorrelation over 90..1500 Hz
  with a clarity threshold, then semitone quantisation and single-frame gap
  repair. Gain is compressed relative to the loudest pitched frame to make
  custom sounds more consistent. Consecutive matching frames merge into one
  note; notes shorter than 40 ms are dropped or merged;
  output frequencies rounded to whole Hz; the notes then go through the
  arrangement above; total capped at 8000 ms / 400 notes.
  Tested in `tests/tone_extraction_regression.cjs` with synthesised input (a
  440 Hz then 660 Hz sine, silence in between → two notes and a rest; a low
  A3–E4 line lifted into the band with its fifth intact).
- `components/SoundLibraryDialog.tsx`: the library (Dialog from `components/ui/Dialog.tsx`):
  list with name, length, ready state; Add MP3 (`<input type="file" accept=".mp3,audio/mpeg">`,
  read with `arrayBuffer()`, base64 → `soundLibraryImport`, then straight into
  the editor); per row: Trim, Rename, Preview on controller, Delete (confirm).
- `components/SoundTrimEditor.tsx`: decodes the original with
  `OfflineAudioContext.decodeAudioData` (mixed to mono), draws the waveform on a
  canvas, start/end handles (drag or number fields), Play selection on the PC
  (Web Audio), the one-sentence fidelity note, and **Convert and save** →
  `extractToneSequence` → `soundLibrarySave`; saving closes the trim editor and
  returns to the library. "Preview on controller" converts the current trim
  temporarily before it is saved. A preview volume slider applies to both PC
  and controller playback.
- `components/ControllerPreferences.tsx`: derive its state from the preference
  store (`usePreferences().runtime`) instead of a per-instance copy, so the
  three instances on the page never save stale values over each other; the
  Connect / Shutdown pickers get a "Your sounds" group; **Play Sounds On**
  (Grip motors / Trackpads / Both → `soundActuators`) sits under Sound
  Intensity and previews the chosen library sound after a pick; the silence toggle
  replaces the Power jingle control (copy: "Off also silences the controller's
  lost-connection and low-battery cues"); a "Manage sounds…" row opens the
  library; the orientation note reads "holds until this preference changes or
  the configuration is reloaded" rather than "wins".
- `components/FirmwareSoundPrompt.tsx` + a hook in `App.tsx`: shown when
  telemetry lists a Steam-family device (`controllerVisualFamily(type) === 'steam'`),
  `runtime.firmwareSoundPromptDone` is false, and no other dialog is open.
- Action picker (`components/keymap/ActionPicker.tsx`, `utils/bindingDescription.ts`,
  `utils/commandLabels.ts` as needed): a **Play sound** entry per built-in tune
  (`PLAY_SOUND <n>`) and per ready library sound (`PLAY_SOUND sounds/<id>/tones.txt`),
  described as "Play sound · <name>". Library names come from `soundLibraryList`
  through a small cached hook (`hooks/useSoundLibrary.ts`).
- `components/HelpDocsPage.tsx`: the Steam Controller notes' sound section
  describes the toggle, the library and the fidelity limit.
- i18n: the Preferences page uses plain English strings today; keep to that.
  Keymap strings go through `t()` with `en.ts` / `zh-CN.ts` entries.

## Out of scope

Playing MP3s through the PC speakers, polyphony, per-configuration sound
choices, importing formats other than MP3 and MIDI. Streaming real audio to the
actuators (the firmware's PCM output reports 0x86–0x89, which SteamHapticsPlayer
uses at 8 kHz) is a separate item, TODO-43.

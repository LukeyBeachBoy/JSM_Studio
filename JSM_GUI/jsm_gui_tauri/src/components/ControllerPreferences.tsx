import { useRef, useState } from 'react'
import { NumberField } from './NumberField'
import { AppSelect } from './ui/AppSelect'
import { desktopBridge, type ControllerPreferences as Preferences, type SoundActuators } from '../platform/desktopBridge'
import { showToast } from '../utils/toast'
import { getPreferenceSnapshot, patchRuntimePreferences } from '../platform/preferenceStore'
import { usePreferences } from '../platform/preferenceStore'
import { controllerPreferencesFromRuntime } from '../utils/controllerPreferences'
import { BUILT_IN_SOUNDS } from '../utils/controllerSounds'
import { useSoundLibrary } from '../hooks/useSoundLibrary'
import { SoundLibraryDialog } from './SoundLibraryDialog'
import { SummaryRow } from './ui/SummaryRow'
import { LightBarPicker } from './keymap/LightBarPicker'

// Steam's own names for the Steam Controller's built-in tunes, in script order
// (SettingController_HapticSound_0..13). Script 12 is also what Steam's
// "Identify Controller" ping plays.
const SOUNDS = BUILT_IN_SOUNDS

// How loud the tunes play: the firmware's gain in dB. Full is the tune as the
// controller plays it (and what played before there was a choice).
const INTENSITIES = [
  { gain: -18, label: 'Quiet' },
  { gain: -12, label: 'Soft' },
  { gain: -6, label: 'Medium' },
  { gain: 0, label: 'Full' },
]
const gainHelp = 'How strongly the controller plays the connect and shutdown sounds, and their previews.'

function SoundIntensity({ gain, onChange, onPreview }: { gain: number; onChange: (gain: number) => void; onPreview: (gain: number) => void }) {
  const nearest = INTENSITIES.reduce((best, option) => Math.abs(option.gain - gain) < Math.abs(best.gain - gain) ? option : best)
  const choose = (next: number) => { onChange(next); onPreview(next) }
  return (
    <div className="controller-sound-row" data-hints="MOVE:Choose;A:Select;B:Back">
      <div className="controller-sound-label controller-sound-intensity" title={gainHelp}>
        <span>Sound Intensity</span>
        <small>{gainHelp}</small>
        <div className="segmented" role="radiogroup" aria-label="Sound intensity">
          {INTENSITIES.map(option => (
            <button key={option.gain} type="button" role="radio" aria-checked={option === nearest}
              onClick={() => choose(option.gain)}>
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Where a custom sound plays. The controller's own tunes are tone requests
// aimed at the two motors behind the grips, so that pair is the default: a
// converted sound comes out with the same voice as the built-in ones. The
// trackpads' actuators are quieter and thinner for the same notes.
const ACTUATORS: { value: SoundActuators; label: string }[] = [
  { value: 'grips', label: 'Grip motors' },
  { value: 'pads', label: 'Trackpads' },
  { value: 'both', label: 'Both' },
]
const actuatorsHelp = "Which actuators play your own sounds. The grip motors are where the controller's built-in tunes play; the trackpads sound thinner."

function SoundActuatorsPicker({ value, onChange, onPreview }: { value: SoundActuators; onChange: (value: SoundActuators) => void; onPreview: () => void }) {
  return (
    <div className="controller-sound-row" data-hints="MOVE:Choose;A:Select;B:Back">
      <div className="controller-sound-label controller-sound-intensity" title={actuatorsHelp}>
        <span>Play Sounds On</span>
        <small>{actuatorsHelp}</small>
        <div className="segmented" role="radiogroup" aria-label="Play sounds on">
          {ACTUATORS.map(option => (
            <button key={option.value} type="button" role="radio" aria-checked={option.value === value}
              onClick={() => { onChange(option.value); onPreview() }}>
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// The controller's own power-on / power-off jingle. Its tune is fixed in the
// firmware; how loud it plays is a byte the controller keeps in its own store,
// so the choice holds with JSM Evolved closed. Off also silences the cue the
// controller plays when it loses its link (docs/triton-firmware-customisation.md).
const jingleHelp = "Silences the Steam Controller's own power-on and power-off jingles. This also silences its lost-connection and low-battery cues. Turning this off restores the factory volume."

function JingleLevel({ level, onChange }: { level: number; onChange: (level: number) => void }) {
  return <SummaryRow label="Silence the controller's own sounds" hint={jingleHelp} help={jingleHelp}
    adjust={{ kind: 'choice', value: String(level),
      options: [{ value: level === 0 ? '2' : String(level), label: 'Off' }, { value: '0', label: 'On' }],
      onChange: next => onChange(Number(next)), onRevert: start => onChange(Number(start)) }} />
}

// The 2026's pads are mounted about 10.6 degrees outward (measured from the
// controller artwork: left 10.7, right -10.5 in the same sense JoyShockMapper
// uses). "Level" turns each reading back by that much, so a swipe straight up
// the controller reads as straight up. Kept in step with
// touchpad_rotation::kLeftPadCantDegrees / kRightPadCantDegrees in the mapper.
const PAD_CANT = { left: 10.7, right: -10.5 } as const
const ORIENTATIONS = [
  { key: 'mounted', label: 'As mounted', left: 0, right: 0 },
  { key: 'level', label: 'Level with the controller', left: PAD_CANT.left, right: PAD_CANT.right },
]
const rotationHelp = 'Turns each pad’s reading about its centre. Positive is clockwise as you look at the controller. Applies to menus, the touch stick, the mouse, the virtual keyboard touch cursor and the live touch Studio draws, in every configuration.'
const nearDegrees = (a: number, b: number) => Math.abs(a - b) < 0.05
const clampDegrees = (value: number) => Math.min(180, Math.max(-180, value))

function TrackpadOrientation({ prefs, disabled, onChange }: { prefs: Preferences; disabled: boolean; onChange: (patch: Partial<Preferences>) => void }) {
  const preset = ORIENTATIONS.find(option => nearDegrees(option.left, prefs.leftPadRotation) && nearDegrees(option.right, prefs.rightPadRotation))
  return <>
    <div className="controller-sound-row" data-hints="MOVE:Choose;A:Select;B:Back">
      <div className="controller-sound-label controller-sound-intensity" title={rotationHelp}>
        <span>Orientation</span>
        <small>{rotationHelp}</small>
        <div className="segmented" role="radiogroup" aria-label="Pad orientation">
          {ORIENTATIONS.map(option => (
            <button key={option.key} type="button" role="radio" aria-checked={preset?.key === option.key} disabled={disabled}
              onClick={() => onChange({ leftPadRotation: option.left, rightPadRotation: option.right })}>
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
    <NumberField label="Left pad" value={prefs.leftPadRotation} min={-180} max={180} step={0.5} unit="°" disabled={disabled}
      hint="Degrees the left pad’s reading is turned; 10.7 levels it with the controller body."
      onChange={value => { if (value !== '') onChange({ leftPadRotation: clampDegrees(Number(value)) }) }} />
    <NumberField label="Right pad" value={prefs.rightPadRotation} min={-180} max={180} step={0.5} unit="°" disabled={disabled}
      hint="Degrees the right pad’s reading is turned; -10.5 levels it with the controller body."
      onChange={value => { if (value !== '') onChange({ rightPadRotation: clampDegrees(Number(value)) }) }} />
    <p className="prefs-note">A configuration can still set <code>LEFT_TOUCHPAD_ROTATION</code> or <code>RIGHT_TOUCHPAD_ROTATION</code> itself; that value holds until this preference changes or the configuration is reloaded.</p>
  </>
}

const hardwareCalibrationHelp = 'Steam Controller only. Its firmware recalibrates the gyro whenever the controller seems to be still, and a bug lets slow, deliberate movements pass as still: small aim adjustments get cancelled out and the cursor slides back. Keep this on and correct drift with Recalibrate instead.'

function HardwareCalibrationSwitch({ value, disabled, onChange }: { value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <SummaryRow label="Disable hardware calibration" hint={hardwareCalibrationHelp} help={hardwareCalibrationHelp} disabled={disabled}
    toggle={{ on: value, onChange, onRevert: onChange }} />
}

const delayHelp ='Seconds to wait before calibration starts, so a chord or binding leaves time to put the controller down. The countdown shows in the overlay.'
const timeHelp = 'Seconds the gyro is sampled for. Keep the controller still on a flat surface for the whole time.'
const soundHelp = 'Played by the controller when it connects to JSM Evolved. The controller’s own power-on jingle is built into its firmware and still plays first.'
const shutdownHelp = 'Played before JSM Evolved turns the controller off (Turn off controller, or a binding to it). Turning it off with its own button still plays the firmware’s jingle.'

const preview = (sound: number, gain: number, soundId?: string) => desktopBridge.playControllerSound(sound, gain, soundId).then(result => {
  if (!result.success) showToast('No controller is connected to play the sound on.', 'error')
}).catch(error => showToast(String(error), 'error'))

function SoundPicker({ label, value, file, gain, hint, onChange }: { label: string; value: number; file: string | null; gain: number; hint: string; onChange: (value: number, file: string | null) => void }) {
  const { sounds } = useSoundLibrary()
  const selected = file ? `file:${file}` : String(value)
  return (
    <div className="controller-sound-row">
      <label className="controller-sound-label" title={hint}>
        <span>{label}</span>
        <small>{hint}</small>
        <AppSelect className="app-select" aria-label={label} value={selected} onChange={event => {
          const next = event.target.value
          onChange(next.startsWith('file:') ? value : Number(next), next.startsWith('file:') ? next.slice(5) : null)
        }}>
          <option value="-1">None</option>
          {SOUNDS.map((name, index) => <option key={name} value={String(index)}>{name}</option>)}
          {sounds.some(sound => sound.ready) && <optgroup label="Your sounds">{sounds.filter(sound => sound.ready).map(sound => <option key={sound.id} value={`file:${sound.id}`}>{sound.name}</option>)}</optgroup>}
        </AppSelect>
      </label>
      <button
        type="button"
        className="icon-button controller-sound-play"
        aria-label={`Preview ${label}`}
        title="Preview"
        disabled={!file && value < 0}
        onClick={() => void preview(value, gain, file ?? undefined)}
      >
        ▶
      </button>
    </div>
  )
}

export function ControllerPreferences({ part = 'all' }: { part?: 'all' | 'calibration' | 'sounds' | 'trackpads' | 'light' }) {
  const { runtime } = usePreferences()
  const prefs = controllerPreferencesFromRuntime(runtime)
  const ready = !!runtime
  const [libraryOpen, setLibraryOpen] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Saved as you go: each value reaches the running mapper immediately, so
  // there is nothing to apply. Number fields fire per keystroke, hence the wait.
  const update = (patch: Partial<Preferences>) => {
    patchRuntimePreferences(patch)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const latest = controllerPreferencesFromRuntime(getPreferenceSnapshot().runtime)
      desktopBridge.setControllerPreferences(latest).then(state => patchRuntimePreferences(state)).catch(error => showToast(String(error), 'error'))
    }, 400)
  }

  return (
    <section className="prefs-section">
      {(part === 'all' || part === 'light') && <>
      <h3 className="prefs-eyebrow">Controller light</h3>
      <p className="prefs-note">Default LED color and brightness for profiles that do not set their own.</p>
      <div className="prefs-light-picker"><LightBarPicker value={prefs.ledColor} allowClear={false} disabled={!ready} onChange={ledColor => { if (ledColor) update({ ledColor }) }} /></div>
      <NumberField label="Default brightness" value={prefs.ledBrightness} min={0} max={100} step={5} unit="%" disabled={!ready}
        onChange={value => { if (value !== '') update({ ledBrightness: Math.min(100, Math.max(0, Number(value))) }) }} />
      </>}
      {(part === 'all' || part === 'calibration') && <>
      <h3 className="prefs-eyebrow">Gyro calibration</h3>
      <HardwareCalibrationSwitch value={prefs.disableHardwareGyroCalibration} disabled={!ready}
        onChange={disableHardwareGyroCalibration => update({ disableHardwareGyroCalibration })} />
      <NumberField label="Start Delay" value={prefs.gyroCalibrationDelay} min={0} max={30} step={1} unit="s" hint={delayHelp} disabled={!ready}
        onChange={value => { if (value !== '') update({ gyroCalibrationDelay: Math.min(30, Math.max(0, Number(value))) }) }} />
      <NumberField label="Duration" value={prefs.gyroCalibrationSeconds} min={0.5} max={60} step={1} unit="s" hint={timeHelp} disabled={!ready}
        onChange={value => { if (value !== '') update({ gyroCalibrationSeconds: Math.min(60, Math.max(0.5, Number(value))) }) }} />
      <p className="prefs-note">Runs from the Recalibrate button, a Calibrate gyro command binding, or a binding that loads <code>RecalibrateGyro.txt</code>.</p>
      </>}
      {(part === 'all' || part === 'trackpads') && <>
      <h3 className="prefs-eyebrow">Trackpad orientation</h3>
      <TrackpadOrientation prefs={prefs} disabled={!ready} onChange={update} />
      </>}
      {(part === 'all' || part === 'sounds') && <>
      <h3 className="prefs-eyebrow">Controller sounds</h3>
      <SoundPicker label="Connect Sound" value={prefs.connectSound} file={prefs.connectSoundFile} gain={prefs.soundGain} hint={soundHelp} onChange={(connectSound, connectSoundFile) => update({ connectSound, connectSoundFile })} />
      <SoundPicker label="Shutdown Sound" value={prefs.shutdownSound} file={prefs.shutdownSoundFile} gain={prefs.soundGain} hint={shutdownHelp} onChange={(shutdownSound, shutdownSoundFile) => update({ shutdownSound, shutdownSoundFile })} />
      {/* Picking a level plays the connect sound at it (or the shutdown
          sound, when only that one is set), so it can be judged by feel. */}
      <SoundIntensity gain={prefs.soundGain} onChange={soundGain => update({ soundGain })}
        onPreview={gain => { const file = prefs.connectSoundFile ?? prefs.shutdownSoundFile; const sound = prefs.connectSound >= 0 ? prefs.connectSound : prefs.shutdownSound; if (file || sound >= 0) void preview(sound, gain, file ?? undefined) }} />
      {/* Only a library sound is routed by this choice, so the preview after a
          pick plays one of those when there is one to play. The saved
          preference has to reach the mapper before the preview reads it. */}
      <SoundActuatorsPicker value={prefs.soundActuators} onChange={soundActuators => update({ soundActuators })}
        onPreview={() => { const file = prefs.connectSoundFile ?? prefs.shutdownSoundFile; if (file) setTimeout(() => void preview(-1, prefs.soundGain, file), 700) }} />
      <JingleLevel level={prefs.bootSoundLevel} onChange={bootSoundLevel => update({ bootSoundLevel })} />
      <button type="button" className="button button--secondary" onClick={() => setLibraryOpen(true)}>Manage sounds…</button>
      </>}
      {libraryOpen && <SoundLibraryDialog onClose={() => setLibraryOpen(false)} />}
    </section>
  )
}

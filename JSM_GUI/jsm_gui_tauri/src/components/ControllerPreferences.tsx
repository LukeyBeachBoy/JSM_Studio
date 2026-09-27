import { useEffect, useRef, useState } from 'react'
import { NumberField } from './NumberField'
import { AppSelect } from './ui/AppSelect'
import { desktopBridge, type ControllerPreferences as Preferences } from '../platform/desktopBridge'
import { showToast } from '../utils/toast'
import { getPreferenceSnapshot, patchRuntimePreferences } from '../platform/preferenceStore'
import toggleStyles from './ThemeToggle.module.css'

// Steam's own names for the Steam Controller's built-in tunes, in script order
// (SettingController_HapticSound_0..13). Script 12 is also what Steam's
// "Identify Controller" ping plays.
const SOUNDS = [
  'Warm and Happy', 'Invader', 'Controller Confirmed', 'Victory!', 'Rise and Shine', 'Shorty',
  'Warm Boot', 'Next Level', 'Shake It Off', 'Access Denied', 'Deactivate', 'Discovery', 'Triumph', 'The Mann',
]

const DEFAULTS: Preferences = { gyroCalibrationSeconds: 5, gyroCalibrationDelay: 0, connectSound: -1, shutdownSound: -1, soundGain: 0, disableHardwareGyroCalibration: true }

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
  const index = INTENSITIES.indexOf(nearest)
  const choose = (next: number) => { onChange(next); onPreview(next) }
  const step = (delta: number) => choose(INTENSITIES[Math.min(INTENSITIES.length - 1, Math.max(0, index + delta))].gain)
  return (
    <div className="controller-sound-row" data-hints="MOVE:Choose;A:Select;B:Back">
      <div className="controller-sound-label controller-sound-intensity" title={gainHelp}>
        <span>Sound Intensity</span>
        <small>{gainHelp}</small>
        <div className="segmented" role="radiogroup" aria-label="Sound intensity"
          onKeyDown={event => {
            // Left/Right pick within the control; Up/Down leave it to the page walk.
            if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1) }
            if (event.key === 'ArrowRight') { event.preventDefault(); step(1) }
          }}>
          {INTENSITIES.map(option => (
            <button key={option.gain} type="button" role="radio" aria-checked={option === nearest} tabIndex={option === nearest ? 0 : -1}
              onClick={() => choose(option.gain)}>
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const hardwareCalibrationHelp = 'Steam Controller only. Its firmware recalibrates the gyro whenever the controller seems to be still, and a bug lets slow, deliberate movements pass as still: small aim adjustments get cancelled out and the cursor slides back. Keep this on and correct drift with Recalibrate instead.'

function HardwareCalibrationSwitch({ value, disabled, onChange }: { value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  // Animates only a change made here; the first read lands in place.
  const [touched, setTouched] = useState(false)
  return <>
    <button type="button" aria-pressed={value} aria-label="Disable hardware calibration" title={hardwareCalibrationHelp} disabled={disabled}
      className={`${toggleStyles.themeToggle} ${value ? toggleStyles.on : ''} ${touched ? '' : toggleStyles.instant}`}
      onClick={() => { setTouched(true); onChange(!value) }}>
      <span className={toggleStyles.labelGroup}><span className={toggleStyles.text}>Disable hardware calibration</span></span>
      <span className={toggleStyles.switch} aria-hidden="true"><span className={toggleStyles.thumb} /></span>
    </button>
    <p className="prefs-note">{hardwareCalibrationHelp}</p>
  </>
}

const delayHelp ='Seconds to wait before calibration starts, so a chord or binding leaves time to put the controller down. The countdown shows in the overlay.'
const timeHelp = 'Seconds the gyro is sampled for. Keep the controller still on a flat surface for the whole time.'
const soundHelp = 'Played by the controller when it connects to JSM Studio. The controller’s own power-on jingle is built into its firmware and still plays first.'
const shutdownHelp = 'Played before JSM Studio turns the controller off (Turn off controller, or a binding to it). Turning it off with its own button still plays the firmware’s jingle.'

const preview = (sound: number, gain: number) => desktopBridge.playControllerSound(sound, gain).then(result => {
  if (!result.success) showToast('No controller is connected to play the sound on.', 'error')
}).catch(error => showToast(String(error), 'error'))

function SoundPicker({ label, value, gain, hint, onChange }: { label: string; value: number; gain: number; hint: string; onChange: (value: number) => void }) {
  return (
    <div className="controller-sound-row">
      <label className="controller-sound-label" title={hint}>
        <span>{label}</span>
        <small>{hint}</small>
        <AppSelect className="app-select" value={String(value)} onChange={event => onChange(Number(event.target.value))}>
          <option value="-1">None</option>
          {SOUNDS.map((name, index) => <option key={name} value={String(index)}>{name}</option>)}
        </AppSelect>
      </label>
      <button
        type="button"
        className="icon-button controller-sound-play"
        aria-label={`Preview ${label}`}
        title="Preview"
        disabled={value < 0}
        onClick={() => void preview(value, gain)}
      >
        ▶
      </button>
    </div>
  )
}

const fromRuntime = (state: Partial<Preferences>): Preferences => ({
  gyroCalibrationSeconds: state.gyroCalibrationSeconds ?? DEFAULTS.gyroCalibrationSeconds,
  gyroCalibrationDelay: state.gyroCalibrationDelay ?? DEFAULTS.gyroCalibrationDelay,
  connectSound: state.connectSound ?? DEFAULTS.connectSound,
  shutdownSound: state.shutdownSound ?? DEFAULTS.shutdownSound,
  soundGain: state.soundGain ?? DEFAULTS.soundGain,
  disableHardwareGyroCalibration: state.disableHardwareGyroCalibration ?? DEFAULTS.disableHardwareGyroCalibration,
})

export function ControllerPreferences({ part = 'all' }: { part?: 'all' | 'calibration' | 'sounds' }) {
  // Read at startup (preferenceStore), so the page opens on the real values.
  const cached = getPreferenceSnapshot().runtime
  const [prefs, setPrefs] = useState<Preferences>(() => cached ? fromRuntime(cached) : DEFAULTS)
  const [ready, setReady] = useState(!!cached)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    desktopBridge.getRuntimeMappingState().then(state => {
      if (cancelled) return
      setPrefs(fromRuntime(state))
      setReady(true)
    }).catch(error => showToast(String(error), 'error'))
    return () => { cancelled = true }
  }, [])

  // Saved as you go: each value reaches the running mapper immediately, so
  // there is nothing to apply. Number fields fire per keystroke, hence the wait.
  const update = (patch: Partial<Preferences>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    patchRuntimePreferences(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      desktopBridge.setControllerPreferences(next).catch(error => showToast(String(error), 'error'))
    }, 400)
  }

  return (
    <section className="prefs-section">
      {part !== 'sounds' && <>
      <h3 className="prefs-eyebrow">Gyro calibration</h3>
      <HardwareCalibrationSwitch value={prefs.disableHardwareGyroCalibration} disabled={!ready}
        onChange={disableHardwareGyroCalibration => update({ disableHardwareGyroCalibration })} />
      <NumberField label="Start Delay" value={prefs.gyroCalibrationDelay} min={0} max={30} step={1} unit="s" hint={delayHelp} disabled={!ready}
        onChange={value => { if (value !== '') update({ gyroCalibrationDelay: Math.min(30, Math.max(0, Number(value))) }) }} />
      <NumberField label="Duration" value={prefs.gyroCalibrationSeconds} min={0.5} max={60} step={1} unit="s" hint={timeHelp} disabled={!ready}
        onChange={value => { if (value !== '') update({ gyroCalibrationSeconds: Math.min(60, Math.max(0.5, Number(value))) }) }} />
      <p className="prefs-note">Runs from the Recalibrate button, a reserved chord, or a binding that loads <code>RecalibrateGyro.txt</code>.</p>
      </>}
      {part !== 'calibration' && <>
      <h3 className="prefs-eyebrow">Controller sounds</h3>
      <SoundPicker label="Connect Sound" value={prefs.connectSound} gain={prefs.soundGain} hint={soundHelp} onChange={connectSound => update({ connectSound })} />
      <SoundPicker label="Shutdown Sound" value={prefs.shutdownSound} gain={prefs.soundGain} hint={shutdownHelp} onChange={shutdownSound => update({ shutdownSound })} />
      {/* Picking a level plays the connect sound at it (or the shutdown
          sound, when only that one is set), so it can be judged by feel. */}
      <SoundIntensity gain={prefs.soundGain} onChange={soundGain => update({ soundGain })}
        onPreview={gain => { const sound = prefs.connectSound >= 0 ? prefs.connectSound : prefs.shutdownSound; if (sound >= 0) void preview(sound, gain) }} />
      </>}
    </section>
  )
}

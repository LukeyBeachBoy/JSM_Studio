import { useEffect, useRef, useState } from 'react'
import { NumberField } from './NumberField'
import { AppSelect } from './ui/AppSelect'
import { desktopBridge, type ControllerPreferences as Preferences } from '../platform/desktopBridge'
import { showToast } from '../utils/toast'

// Steam's own names for the Steam Controller's built-in tunes, in script order
// (SettingController_HapticSound_0..13). Script 12 is also what Steam's
// "Identify Controller" ping plays.
const SOUNDS = [
  'Warm and Happy', 'Invader', 'Controller Confirmed', 'Victory!', 'Rise and Shine', 'Shorty',
  'Warm Boot', 'Next Level', 'Shake It Off', 'Access Denied', 'Deactivate', 'Discovery', 'Triumph', 'The Mann',
]

const DEFAULTS: Preferences = { gyroCalibrationSeconds: 5, gyroCalibrationDelay: 0, connectSound: -1, shutdownSound: -1 }

const delayHelp = 'Seconds to wait before calibration starts, so a chord or binding leaves time to put the controller down. The countdown shows in the overlay.'
const timeHelp = 'Seconds the gyro is sampled for. Keep the controller still on a flat surface for the whole time.'
const soundHelp = 'Played by the controller when it connects to JSM Studio. The controller’s own power-on jingle is built into its firmware and still plays first.'
const shutdownHelp = 'Played before JSM Studio turns the controller off (Turn off controller, or a binding to it). Turning it off with its own button still plays the firmware’s jingle.'

function SoundPicker({ label, value, hint, onChange }: { label: string; value: number; hint: string; onChange: (value: number) => void }) {
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
        onClick={() => desktopBridge.playControllerSound(value).then(result => {
          if (!result.success) showToast('No controller is connected to play the sound on.', 'error')
        }).catch(error => showToast(String(error), 'error'))}
      >
        ▶
      </button>
    </div>
  )
}

export function ControllerPreferences({ part = 'all' }: { part?: 'all' | 'calibration' | 'sounds' }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS)
  const [ready, setReady] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    desktopBridge.getRuntimeMappingState().then(state => {
      if (cancelled) return
      setPrefs({
        gyroCalibrationSeconds: state.gyroCalibrationSeconds ?? DEFAULTS.gyroCalibrationSeconds,
        gyroCalibrationDelay: state.gyroCalibrationDelay ?? DEFAULTS.gyroCalibrationDelay,
        connectSound: state.connectSound ?? DEFAULTS.connectSound,
        shutdownSound: state.shutdownSound ?? DEFAULTS.shutdownSound,
      })
      setReady(true)
    }).catch(error => showToast(String(error), 'error'))
    return () => { cancelled = true }
  }, [])

  // Saved as you go: each value reaches the running mapper immediately, so
  // there is nothing to apply. Number fields fire per keystroke, hence the wait.
  const update = (patch: Partial<Preferences>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      desktopBridge.setControllerPreferences(next).catch(error => showToast(String(error), 'error'))
    }, 400)
  }

  return (
    <section className="prefs-section">
      {part !== 'sounds' && <>
      <h3 className="prefs-eyebrow">Gyro calibration</h3>
      <NumberField label="Start Delay" value={prefs.gyroCalibrationDelay} min={0} max={30} step={1} unit="s" hint={delayHelp} disabled={!ready}
        onChange={value => { if (value !== '') update({ gyroCalibrationDelay: Math.min(30, Math.max(0, Number(value))) }) }} />
      <NumberField label="Duration" value={prefs.gyroCalibrationSeconds} min={0.5} max={60} step={1} unit="s" hint={timeHelp} disabled={!ready}
        onChange={value => { if (value !== '') update({ gyroCalibrationSeconds: Math.min(60, Math.max(0.5, Number(value))) }) }} />
      <p className="prefs-note">Runs from the Recalibrate button, a reserved chord, or a binding that loads <code>RecalibrateGyro.txt</code>.</p>
      </>}
      {part !== 'calibration' && <>
      <h3 className="prefs-eyebrow">Controller sounds</h3>
      <SoundPicker label="Connect Sound" value={prefs.connectSound} hint={soundHelp} onChange={connectSound => update({ connectSound })} />
      <SoundPicker label="Shutdown Sound" value={prefs.shutdownSound} hint={shutdownHelp} onChange={shutdownSound => update({ shutdownSound })} />
      </>}
    </section>
  )
}

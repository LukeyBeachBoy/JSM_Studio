import { useRef, useState } from 'react'
import { desktopBridge, type ControllerPreferences as Preferences, type SoundActuators } from '../platform/desktopBridge'
import { showToast } from '../utils/toast'
import { getPreferenceSnapshot, patchRuntimePreferences, usePreferences } from '../platform/preferenceStore'
import { controllerPreferencesFromRuntime } from '../utils/controllerPreferences'
import { BUILT_IN_SOUNDS } from '../utils/controllerSounds'
import { useSoundLibrary } from '../hooks/useSoundLibrary'
import { SoundLibraryDialog } from './SoundLibraryDialog'
import { LightBarPicker } from './keymap/LightBarPicker'
import { LIGHT_BAR_PRESETS } from './keymap/lightBarColor'
import { ModeCards, OpenRow, SegmentedRow, SubPage, ValueRow } from './ui/console'
import { SettingsNote, SettingsSection, SwitchRow, usePadButton } from './settings/SettingsKit'
import styles from './settings/Settings.module.css'

// The controller's own settings (console v2, Settings ▸ Controller and
// "Controller, continued"): the gyro's firmware recalibration, calibration and
// light, the controller's sounds, and the trackpads' rotation. Saved as they
// change: each value reaches the running mapper at once, so there is nothing to
// make live. Number rows fire per step, hence the short wait before writing.

export function useControllerPreferences() {
  const { runtime } = usePreferences()
  const prefs = controllerPreferencesFromRuntime(runtime)
  const ready = !!runtime
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const update = (patch: Partial<Preferences>) => {
    patchRuntimePreferences(patch)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const latest = controllerPreferencesFromRuntime(getPreferenceSnapshot().runtime)
      desktopBridge.setControllerPreferences(latest).then(state => patchRuntimePreferences(state)).catch(error => showToast(String(error), 'error'))
    }, 400)
  }
  return { prefs, ready, update }
}

const DEFAULT_LIGHT = '#ffffff'

/** "Light colour when a configuration doesn't set one": ◂ ▸ steps the colours,
 *  A opens the full picker and the brightness. */
export function DefaultLightRow() {
  const { prefs, ready, update } = useControllerPreferences()
  const [open, setOpen] = useState(false)
  const current = (prefs.ledColor ?? DEFAULT_LIGHT).toLowerCase()
  const index = LIGHT_BAR_PRESETS.findIndex(preset => preset.hex === current)
  const name = index >= 0 ? LIGHT_BAR_PRESETS[index].name : current.toUpperCase()
  const step = (direction: 1 | -1) => {
    const next = LIGHT_BAR_PRESETS[(Math.max(0, index) + direction + LIGHT_BAR_PRESETS.length) % LIGHT_BAR_PRESETS.length]
    update({ ledColor: next.hex })
  }
  return <>
    <button type="button" className={styles.switchRow} data-arrows="horizontal" disabled={!ready} aria-label={`Light colour when a configuration doesn't set one: ${name}`}
      data-hints="MOVE:Change;A:More colours;Y:Reset to default;B:Back"
      data-caption="Light colour when a configuration doesn't set one · ◂ ▸ steps through the colours; A picks any colour and the brightness"
      onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); step(event.key === 'ArrowRight' ? 1 : -1) }
        if (event.key === 'y' || event.key === 'Y') { event.preventDefault(); update({ ledColor: DEFAULT_LIGHT }) }
      }}
      onClick={() => setOpen(true)}>
      <span className={styles.rowText}>
        <span className={styles.rowLabel} data-caption-label="">Light colour when a configuration doesn’t set one</span>
        <span className={styles.rowHint}>{name} · {prefs.ledBrightness}% bright</span>
      </span>
      <span className={styles.swatches} aria-hidden="true">
        {LIGHT_BAR_PRESETS.slice(0, 5).map(preset => <span key={preset.hex} className={styles.swatch} data-current={preset.hex === current ? 'true' : undefined} style={{ background: preset.hex }} />)}
        {index < 0 || index >= 5 ? <span className={styles.swatch} data-current="true" style={{ background: current }} /> : null}
      </span>
    </button>
    <SubPage open={open} onClose={() => setOpen(false)} crumbRoot="Settings" trail={['Controller']} title="Light colour" backLabel="Back to Controller">
      <div className={styles.mainColumn} style={{ maxWidth: 860 }}>
        <SettingsSection title="Light colour" note="Used when a configuration doesn't set its own">
          <div className="prefs-light-picker"><LightBarPicker value={prefs.ledColor} allowClear={false} disabled={!ready} onChange={ledColor => { if (ledColor) update({ ledColor }) }} /></div>
        </SettingsSection>
        <ValueRow label="Brightness" hint="How bright the light is when a configuration doesn't say" value={prefs.ledBrightness} min={0} max={100} step={5} fineStep={1}
          format={value => `${value}%`} onChange={ledBrightness => update({ ledBrightness })} onReset={() => update({ ledBrightness: 100 })} disabled={ready ? undefined : 'Reading the controller settings…'} />
      </div>
    </SubPage>
  </>
}

const hardwareCalibrationHelp = 'Its firmware slowly re-centres the gyro while you play, which can feel like your aim sliding back.'

export function HardwareCalibrationRow() {
  const { prefs, ready, update } = useControllerPreferences()
  return <SwitchRow label="Stop the Steam Controller recalibrating its gyro" hint={hardwareCalibrationHelp} setting="DISABLE_HARDWARE_GYRO_CALIBRATION"
    on={ready ? prefs.disableHardwareGyroCalibration : null} onChange={disableHardwareGyroCalibration => update({ disableHardwareGyroCalibration })}
    onReset={() => update({ disableHardwareGyroCalibration: true })} />
}

/** Calibration and light: Countdown · Sample · Light, side by side. */
export function CalibrationAndLight() {
  const { prefs, ready, update } = useControllerPreferences()
  const waiting = ready ? undefined : 'Reading the controller settings…'
  return (
    <SettingsSection title="Calibration and light">
      <div className={styles.tiles}>
        <ValueRow label="Countdown" setting="GYRO_CALIBRATION_DELAY" global value={prefs.gyroCalibrationDelay} min={0} max={30} step={1} format={value => `${value} s`}
          hint="Time to set it down" onChange={gyroCalibrationDelay => update({ gyroCalibrationDelay })} onReset={() => update({ gyroCalibrationDelay: 0 })} disabled={waiting} />
        <ValueRow label="Sample" setting="GYRO_CALIBRATION_TIME" global value={prefs.gyroCalibrationSeconds} min={0.5} max={60} step={1} fineStep={0.5} format={value => `${value} s`}
          hint="Keep it still this long" onChange={gyroCalibrationSeconds => update({ gyroCalibrationSeconds })} onReset={() => update({ gyroCalibrationSeconds: 5 })} disabled={waiting} />
        <ValueRow label="Light" setting="LED_BRIGHTNESS" global value={prefs.ledBrightness} min={0} max={100} step={5} fineStep={1} format={value => `${value}%`}
          hint="When a configuration sets none" onChange={ledBrightness => update({ ledBrightness })} onReset={() => update({ ledBrightness: 100 })} disabled={waiting} />
      </div>
      <SettingsNote>Countdown to set it down, then how long the gyro samples. Runs from Recalibrate, a Calibrate gyro binding, or a binding that loads RecalibrateGyro.txt. Light: when a configuration sets none.</SettingsNote>
    </SettingsSection>
  )
}

// How loud the tunes play: the firmware's gain in dB.
const LOUDNESS = [
  { value: '-18', label: 'Quiet' },
  { value: '-12', label: 'Soft' },
  { value: '-6', label: 'Medium' },
  { value: '0', label: 'Full' },
]
const ACTUATORS: { value: SoundActuators; label: string; caption: string }[] = [
  { value: 'grips', label: 'Grip motors', caption: 'Where its own tunes play' },
  { value: 'pads', label: 'Trackpads', caption: 'Thinner, quieter' },
  { value: 'both', label: 'Both', caption: 'Grips and trackpads together' },
]

const preview = (sound: number, gain: number, soundId?: string) => desktopBridge.playControllerSound(sound, gain, soundId).then(result => {
  if (!result.success) showToast('No controller is connected to play the sound on.', 'error')
}).catch(error => showToast(String(error), 'error'))

type SoundChoice = { key: string; label: string; sound: number; file: string | null }

function SoundPickerPage({ open, title, value, file, gain, onChange, onClose }: {
  open: boolean; title: string; value: number; file: string | null; gain: number
  onChange: (sound: number, file: string | null) => void; onClose: () => void
}) {
  const { sounds } = useSoundLibrary()
  const choices: SoundChoice[] = [
    { key: '-1', label: 'None', sound: -1, file: null },
    ...BUILT_IN_SOUNDS.map((name, index) => ({ key: String(index), label: name, sound: index, file: null })),
    ...sounds.filter(sound => sound.ready).map(sound => ({ key: `file:${sound.id}`, label: sound.name, sound: value, file: sound.id })),
  ]
  const selected = file ? `file:${file}` : String(value)
  return (
    <SubPage open={open} onClose={onClose} crumbRoot="Settings" trail={['Controller', 'Controller sounds']} title={title} backLabel="Back to Controller">
      <div className={styles.mainColumn} style={{ maxWidth: 760 }} role="radiogroup" aria-label={title}>
        {choices.map(choice => (
          <button key={choice.key} type="button" role="radio" aria-checked={choice.key === selected} className={styles.switchRow}
            data-autofocus={choice.key === selected ? '' : undefined}
            data-hints={choice.key === '-1' ? 'A:Choose;B:Back' : 'A:Choose;X:Hear it;B:Back'} data-pad-keys="X"
            onKeyDown={event => { if ((event.key === 'x' || event.key === 'X') && choice.key !== '-1') { event.preventDefault(); void preview(choice.sound, gain, choice.file ?? undefined) } }}
            onClick={() => { onChange(choice.sound, choice.file); onClose() }}>
            <span className={styles.rowText}><span className={styles.rowLabel}>{choice.label}</span>{choice.file && <span className={styles.rowHint}>Your sound</span>}</span>
            {choice.key === selected && <span className={styles.tag} data-tone="accent">Chosen</span>}
          </button>
        ))}
      </div>
    </SubPage>
  )
}

const soundName = (sound: number, file: string | null, names: Map<string, string>) =>
  file ? names.get(file) ?? 'Your sound' : sound >= 0 ? BUILT_IN_SOUNDS[sound] ?? `Tune ${sound}` : 'None'

/** Controller sounds: On connect, On turn off, How loud, where your sounds
 *  play, and the controller's own jingles. Y opens Your sounds. */
export function ControllerSounds() {
  const { prefs, ready, update } = useControllerPreferences()
  const { sounds } = useSoundLibrary()
  const names = new Map(sounds.map(sound => [sound.id, sound.name]))
  const [picking, setPicking] = useState<'connect' | 'shutdown' | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  usePadButton('Y', () => { setLibraryOpen(true) }, host)
  const loudness = LOUDNESS.reduce((best, option) => Math.abs(Number(option.value) - prefs.soundGain) < Math.abs(Number(best.value) - prefs.soundGain) ? option : best)
  const waiting = ready ? undefined : 'Reading the controller settings…'
  const playChosen = (gain: number) => {
    const file = prefs.connectSoundFile ?? prefs.shutdownSoundFile
    const sound = prefs.connectSound >= 0 ? prefs.connectSound : prefs.shutdownSound
    if (file || sound >= 0) void preview(sound, gain, file ?? undefined)
  }
  return (
    <div ref={host}>
      <SettingsSection title="Controller sounds" note="Y Your sounds"
        action={<button type="button" className="button button--secondary button--sm" onClick={() => setLibraryOpen(true)} tabIndex={-1}>Your sounds…</button>}>
        <OpenRow label="On connect" setting="CONNECT_SOUND" hint="Plays when the controller connects to JSM Evolved" value={soundName(prefs.connectSound, prefs.connectSoundFile, names)}
          onOpen={() => setPicking('connect')} disabled={waiting} hints="A:Change;Y:Your sounds;B:Back" />
        <OpenRow label="On turn off" setting="SHUTDOWN_SOUND" hint="Plays before JSM Evolved turns the controller off" value={soundName(prefs.shutdownSound, prefs.shutdownSoundFile, names)}
          onOpen={() => setPicking('shutdown')} disabled={waiting} hints="A:Change;Y:Your sounds;B:Back" />
        <SegmentedRow label="How loud" setting="SOUND_GAIN" global value={loudness.value} options={LOUDNESS} disabled={waiting}
          onChange={value => { update({ soundGain: Number(value) }); playChosen(Number(value)) }} onReset={() => update({ soundGain: 0 })} />
        <SegmentedRow label="Your sounds play on" setting="SOUND_ACTUATORS" global value={prefs.soundActuators} options={ACTUATORS} disabled={waiting}
          onChange={value => {
            update({ soundActuators: value as SoundActuators })
            const file = prefs.connectSoundFile ?? prefs.shutdownSoundFile
            if (file) setTimeout(() => void preview(-1, prefs.soundGain, file), 700)
          }} onReset={() => update({ soundActuators: 'grips' })} />
        <SwitchRow label="Silence its own jingles" setting="BOOT_SOUND_LEVEL"
          hint="The Steam Controller's own power-on and power-off tunes, and its lost-connection and low-battery cues. Off brings the factory volume back."
          on={ready ? prefs.bootSoundLevel === 0 : null} onChange={silence => update({ bootSoundLevel: silence ? 0 : 2 })} onReset={() => update({ bootSoundLevel: 2 })} />
      </SettingsSection>
      <SoundPickerPage open={picking === 'connect'} title="On connect" value={prefs.connectSound} file={prefs.connectSoundFile} gain={prefs.soundGain}
        onChange={(connectSound, connectSoundFile) => update({ connectSound, connectSoundFile })} onClose={() => setPicking(null)} />
      <SoundPickerPage open={picking === 'shutdown'} title="On turn off" value={prefs.shutdownSound} file={prefs.shutdownSoundFile} gain={prefs.soundGain}
        onChange={(shutdownSound, shutdownSoundFile) => update({ shutdownSound, shutdownSoundFile })} onClose={() => setPicking(null)} />
      {libraryOpen && <SoundLibraryDialog onClose={() => setLibraryOpen(false)} />}
    </div>
  )
}

// The 2026's pads are mounted about 10.6 degrees outward (left 10.7, right
// -10.5, in the sense JoyShockMapper uses). Level turns each reading back by
// that much, so a swipe straight up the controller reads as straight up. Kept
// in step with touchpad_rotation::kLeftPadCantDegrees / kRightPadCantDegrees.
const PAD_CANT = { left: 10.7, right: -10.5 } as const
const nearDegrees = (a: number, b: number) => Math.abs(a - b) < 0.05

/** The two pads, turned the way the setting turns their readings (STYLE-FLAT). */
function PadsArt({ left, right }: { left: number; right: number }) {
  const pad = (cx: number, angle: number) => (
    <g transform={`rotate(${-angle} ${cx} 50)`}>
      <rect x={cx - 26} y={24} width={52} height={52} rx={14} fill="var(--art-well)" stroke="var(--art-line)" strokeWidth={2} />
      <path d={`M${cx} 32 v36 M${cx - 18} 50 h36`} stroke="var(--art-detail)" strokeWidth={1.5} strokeDasharray="3 4" />
      <path d={`M${cx} 30 l-5 7 h10 z`} fill="var(--accent)" />
    </g>
  )
  return <svg viewBox="0 0 200 100" role="img" aria-label="The trackpads">{pad(58, left)}{pad(142, right)}</svg>
}

export function TrackpadRotation() {
  const { prefs, ready, update } = useControllerPreferences()
  const [advanced, setAdvanced] = useState(false)
  const preset = nearDegrees(prefs.leftPadRotation, 0) && nearDegrees(prefs.rightPadRotation, 0) ? 'mounted'
    : nearDegrees(prefs.leftPadRotation, PAD_CANT.left) && nearDegrees(prefs.rightPadRotation, PAD_CANT.right) ? 'level' : 'custom'
  const clampDegrees = (value: number) => Math.min(180, Math.max(-180, value))
  const waiting = ready ? undefined : 'Reading the controller settings…'
  return (
    <SettingsSection title="Trackpad rotation" note={`Left ${prefs.leftPadRotation}° · Right ${prefs.rightPadRotation}° · every configuration`}>
      <ModeCards columns={3} value={preset} onChange={value => update(value === 'level' ? { leftPadRotation: PAD_CANT.left, rightPadRotation: PAD_CANT.right } : { leftPadRotation: 0, rightPadRotation: 0 })}
        options={[
          { value: 'mounted', label: 'As mounted', caption: 'Each pad reads along its own edges', art: <PadsArt left={0} right={0} />, unavailable: waiting },
          { value: 'level', label: 'Level', caption: 'Level turns them 10.7° and −10.5°, so a swipe up reads as up', art: <PadsArt left={PAD_CANT.left} right={PAD_CANT.right} />, unavailable: waiting },
        ]}
        more={{ label: 'Advanced', caption: preset === 'custom' ? `Your own angles` : 'Exact degrees per pad', current: preset === 'custom', onOpen: () => setAdvanced(true) }} />
      <SubPage open={advanced} onClose={() => setAdvanced(false)} crumbRoot="Settings" trail={['Controller', 'Trackpad rotation']} title="Advanced" backLabel="Back to Controller">
        <div className={styles.mainColumn} style={{ maxWidth: 860 }}>
          <ValueRow label="Left pad" setting="LEFT_TOUCHPAD_ROTATION" global hint="Degrees the left pad's reading is turned; 10.7 levels it with the controller body" value={prefs.leftPadRotation}
            min={-180} max={180} step={0.5} fineStep={0.1} format={value => `${value}°`} onChange={value => update({ leftPadRotation: clampDegrees(value) })} onReset={() => update({ leftPadRotation: 0 })} disabled={waiting} />
          <ValueRow label="Right pad" setting="RIGHT_TOUCHPAD_ROTATION" global hint="Degrees the right pad's reading is turned; −10.5 levels it with the controller body" value={prefs.rightPadRotation}
            min={-180} max={180} step={0.5} fineStep={0.1} format={value => `${value}°`} onChange={value => update({ rightPadRotation: clampDegrees(value) })} onReset={() => update({ rightPadRotation: 0 })} disabled={waiting} />
          <SettingsNote>Positive is clockwise as you look at the controller. It turns menus, the touch stick, the mouse, the on-screen keyboard's touch cursor and the live touch the app draws. A configuration can still set LEFT_TOUCHPAD_ROTATION or RIGHT_TOUCHPAD_ROTATION itself; that value holds until this changes or the configuration loads again.</SettingsNote>
        </div>
      </SubPage>
    </SettingsSection>
  )
}

/** The old entry point, by part (kept for anything still asking for one). */
export function ControllerPreferences({ part = 'all' }: { part?: 'all' | 'calibration' | 'sounds' | 'trackpads' | 'light' }) {
  return <>
    {(part === 'all' || part === 'light') && <DefaultLightRow />}
    {(part === 'all' || part === 'calibration') && <><HardwareCalibrationRow /><CalibrationAndLight /></>}
    {(part === 'all' || part === 'trackpads') && <TrackpadRotation />}
    {(part === 'all' || part === 'sounds') && <ControllerSounds />}
  </>
}

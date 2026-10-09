import { useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActionPickerProps } from '../ActionPicker'
import { PickerAside, PickerPage, PickerSection, useRefocusOn } from './PickerPage'
import { DUALSENSE, STEAM_CONTROLLER_2026, useConnectedTypes, usePickerWords } from './pickerShared'
import { CalibrateArt, ControllerArt, CycleLoopArt, FeelArt, OtherArt, PianoRoll, TileIcon, TuneArt } from './PickerArt'
import { LayerUsageContext } from '../../LayerBar'
import { useShell } from '../../../shell/ShellContext'
import { ButtonGlyph } from '../../glyphs/ButtonGlyph'
import { InputGlyph } from '../../glyphs/InputGlyph'
import { SegmentedRow, ValueRow } from '../../ui/console'
import { LightBarPicker } from '../LightBarPicker'
import { CycleStepsEditor } from '../binding/CycleStepsEditor'
import { SoundLibraryDialog } from '../../SoundLibraryDialog'
import { useSoundLibrary } from '../../../hooks/useSoundLibrary'
import { desktopBridge } from '../../../platform/desktopBridge'
import { isQueuedGyroAction, type BindingCommandPatch, type BindingOutputKind } from '../../../utils/bindingCommands'
import { BUILT_IN_SOUNDS, parsePlaySound, playSoundToken } from '../../../utils/controllerSounds'
import { cycleBinding, parseCycleBinding } from '../../../utils/cycleBinding'
import { parseRumbleBinding, rumbleBinding } from '../../../utils/bindingParameters'
import { DEFAULT_HAPTIC_BINDING, HAPTIC_EFFECT_CHOICES, HAPTIC_GAIN_MAX, HAPTIC_GAIN_MIN, formatHapticBinding, isHapticBindingValue, parseHapticBinding, type HapticSide } from '../../../utils/hapticBindings'
import { inputDisplayName } from '../../../keymap/inputNames'
import { keyDisplayName } from '../../../utils/keyNames'
import { requestModeshift } from '../../sticks/inputSide'
import styles from './Pickers.module.css'

// Controller action (console v2, ControllerActions*.dc.html): what the
// controller and the mapper can do on a button, in five groups on LT / RT --
// Gyro, Calibrate, Rumble & sound, Light, Other -- as flat tiles under section
// headers, with an aside that says what the focused one does, how it can be
// sent (set in Fine-tune), and anything in the way. Unavailable actions stay
// focusable and say why.

type GroupId = 'gyro' | 'calibrate' | 'rumble' | 'light' | 'other'
type Item = {
  id: string
  group: GroupId
  section: string
  title: string
  sub?: string
  icon?: string
  /** What the tile shows instead of an icon (Light, Other, tunes). */
  variant?: 'action' | 'feel' | 'tune' | 'light' | 'other' | 'ghost'
  picture?: ReactNode
  current: boolean
  unavailable?: string
  commit: () => void
  /** X on the tile ("Hear it"). */
  hear?: () => void
  aside: { scope?: ReactNode; text?: ReactNode; extra?: ReactNode; note?: ReactNode; noteTone?: 'warn' | 'quiet'; art?: ReactNode }
}

const SWATCHES = ['#ffffff', '#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#32ade6', '#0a84ff', '#af52de', '#ff2d55']

/** Which inputs (other than this one) already turn gyro on, or off. */
const gyroUsers = (text: string, token: 'GYRO_ON' | 'GYRO_OFF', self: string) => {
  const found = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim()
    const at = line.indexOf('=')
    if (at < 0) continue
    const key = line.slice(0, at).trim().toUpperCase()
    const value = line.slice(at + 1).trim().toUpperCase()
    // GYRO_ON = RSL: the profile's own activation; RSL = GYRO_ON: a binding.
    if (key === token) value.split(/\s+/).filter(Boolean).forEach(input => found.add(input.replace(/[\\/'_+!^-]+$/, '')))
    else if (new RegExp(`(^|\\s|[!^-])${token}([\\\\/'_+]|\\s|$)`).test(value) && /^[A-Z0-9+,!]{1,10}$/.test(key)) found.add(key)
  }
  found.delete(self.toUpperCase())
  found.delete('NONE')
  return [...found]
}

export function ControllerActionPicker(props: ActionPickerProps & { onSearch?: () => void }) {
  const { inputLabel, command, onSelect, onClose, onSearch, specialOptions, allowedOutputKinds, onAddHeldLed, onAddStickShift, defaultLedColor = '#ffffff' } = props
  const { t } = useTranslation()
  const words = usePickerWords(inputLabel, command)
  const { family } = useShell()
  const glyphFamily = family === 'generic' ? undefined : family
  const { text = '' } = useContext(LayerUsageContext)
  const { sounds } = useSoundLibrary()
  const connected = useConnectedTypes()
  const [library, setLibrary] = useState(false)
  const [light, setLight] = useState<'hold' | 'press' | null>(null)
  // The actions with a value to pick (brightness, a pulse, the motors, a
  // cycle's steps) get a page of their own, like Light while held: pick, then
  // Add (UX review 2026-10-09, L7). Nothing is written until Add.
  const [param, setParam] = useState<ParamKind | null>(null)
  const value = command.outputValue ?? ''
  const input = words.input

  const allowed = (kind: BindingOutputKind) => !allowedOutputKinds || allowedOutputKinds.includes(kind)
  const pick = (patch: BindingCommandPatch) => { onSelect({ virtualControllerLogicalOutput: undefined, ...patch }); onClose() }
  const special = (token: string) => {
    const kind: BindingOutputKind = command.source.kind !== 'special' && isQueuedGyroAction(token) ? 'gyroAction' : 'special'
    return { kind, commit: () => pick({ outputKind: kind, outputValue: token }) }
  }
  const specialDisabled = (token: string) => specialOptions.find(option => option.value === token)?.disabled
  const onlyFor = (type: number, name: string) => connected.length > 0 && !connected.includes(type) ? t('pickers.onlyFor', 'Only a {{name}} can do this; the one connected can’t', { name }) : undefined

  // ---- Gyro conflicts: who else already turns it on or off.
  const conflict = (token: 'GYRO_ON' | 'GYRO_OFF') => {
    const users = gyroUsers(text, token, command.physicalInput)
    if (!users.length) return undefined
    const names = users.map(user => inputDisplayName(user, family)).join(', ')
    return token === 'GYRO_ON'
      ? t('pickers.gyroOnConflict', '{{names}} already turns gyro on in this configuration.', { names, count: users.length })
      : t('pickers.gyroOffConflict', '{{names}} already turns gyro off in this configuration.', { names, count: users.length })
  }
  const howChips = (options: string[], on: string) => (
    <div className={styles.chipBlock}>
      <span className={styles.chipLabel}>{t('pickers.howItCanWork', 'How it can work · set in Fine-tune')}</span>
      <div className={styles.chips}>{options.map(option => <span key={option} className={styles.chip} data-on={option === on ? 'true' : undefined}>{option}</span>)}</div>
    </div>
  )
  const steps = (labels: string[]) => (
    <div className={styles.chipBlock}>
      <span className={styles.chipLabel}>{t('pickers.stepsYoullSee', 'Steps you’ll see')}</span>
      <div className={styles.chips}>{labels.map((label, at) => <span key={label} className={styles.chip} data-tone={at === labels.length - 1 ? 'ok' : undefined}>{label}</span>)}</div>
    </div>
  )
  const behaviour = command.outputBehavior === 'toggle' ? 'Toggle' : 'Normal'
  const controllerArt = (highlight: string[] = [command.physicalInput]) => <ControllerArt family={family} highlight={highlight} />
  const swatches = (selected?: string) => (
    <div className={styles.chipBlock}>
      <span className={styles.chipLabel}>{t('pickers.coloursInFineTune', 'Colours to pick from next')}</span>
      <div className={styles.swatches} aria-hidden="true">
        {SWATCHES.map(colour => <span key={colour} className={styles.swatch} style={{ background: colour }} data-on={selected?.toLowerCase() === colour ? 'true' : undefined} />)}
        <span className={`${styles.swatch} ${styles.swatchMore}`}>+</span>
      </div>
    </div>
  )

  // ---- Every tile, once.
  const items = useMemo<Item[]>(() => {
    const list: Item[] = []
    const gyro = (token: string, title: string, sub: string, icon: string, section: string, scope: string, describe: string, extra?: ReactNode, note?: ReactNode) => {
      const { kind, commit } = special(token)
      list.push({ id: token, group: 'gyro', section, title, sub, icon, current: value === token, commit, unavailable: !allowed(kind) ? t('pickers.notHere', 'Not available here') : specialDisabled(token) ? t('pickers.notOnThisInput', 'Not available on this input') : undefined,
        aside: { scope, text: describe, extra, note, noteTone: 'warn', art: controllerArt() } })
    }
    const onOff = t('pickers.sectionGyroOnOff', 'Turn gyro on or off')
    const held = t('pickers.sectionGyroHeld', 'Change it while held')
    gyro('GYRO_ON', t('pickers.gyroOn', 'Gyro on'), t('pickers.thisController', 'This controller'), 'gyroOn', onOff, t('pickers.thisControllerOnly', 'This controller only'),
      t('pickers.gyroOnText', 'Turns gyro on while you hold {{input}}, even where the Gyro tab has it off. Other controllers stay as they are.', { input }), howChips(['Normal', 'Toggle'], value === 'GYRO_ON' ? behaviour : 'Normal'), conflict('GYRO_ON'))
    gyro('GYRO_OFF', t('pickers.gyroOff', 'Gyro off'), t('pickers.thisController', 'This controller'), 'gyroOff', onOff, t('pickers.thisControllerOnly', 'This controller only'),
      t('pickers.gyroOffText', 'Turns gyro off while you hold {{input}}, even where the Gyro tab has it on. Other controllers stay as they are.', { input }), howChips(['Normal', 'Toggle'], value === 'GYRO_OFF' ? behaviour : 'Normal'), conflict('GYRO_OFF'))
    gyro('GYRO_ON_ALL', t('pickers.gyroOnAll', 'Gyro on everywhere'), t('pickers.everyController', 'Every connected controller'), 'gyroOnAll', onOff, t('pickers.everyController', 'Every connected controller'),
      t('pickers.gyroOnAllText', 'Turns gyro on for every connected controller while you hold {{input}}.', { input }), howChips(['Normal', 'Toggle'], value === 'GYRO_ON_ALL' ? behaviour : 'Normal'))
    gyro('GYRO_OFF_ALL', t('pickers.gyroOffAll', 'Gyro off everywhere'), t('pickers.everyController', 'Every connected controller'), 'gyroOffAll', onOff, t('pickers.everyController', 'Every connected controller'),
      t('pickers.gyroOffAllText', 'Turns gyro off for every connected controller while you hold {{input}}.', { input }), howChips(['Normal', 'Toggle'], value === 'GYRO_OFF_ALL' ? behaviour : 'Normal'))
    const whileHeld = t('pickers.whileHeldScope', 'While held · back to normal when you let go')
    gyro('GYRO_INVERT', t('pickers.invertBoth', 'Invert both ways'), t('pickers.invertBothSub', 'Left-right and up-down'), 'invert', held, whileHeld, t('pickers.invertBothText', 'Turning and looking both go the other way while you hold {{input}}.', { input }), howChips(['While held', 'Toggle'], value === 'GYRO_INVERT' && behaviour === 'Toggle' ? 'Toggle' : 'While held'))
    gyro('GYRO_INV_X', t('pickers.invertX', 'Invert left-right'), t('pickers.invertXSub', 'Turning goes the other way'), 'invertX', held, whileHeld, t('pickers.invertXText', 'Turning left and right goes the other way while you hold {{input}}.', { input }), howChips(['While held', 'Toggle'], value === 'GYRO_INV_X' && behaviour === 'Toggle' ? 'Toggle' : 'While held'))
    gyro('GYRO_INV_Y', t('pickers.invertY', 'Invert up-down'), t('pickers.invertYSub', 'Looking up goes down'), 'invertY', held, whileHeld, t('pickers.invertYText', 'Looking up and down goes the other way while you hold {{input}}.', { input }), howChips(['While held', 'Toggle'], value === 'GYRO_INV_Y' && behaviour === 'Toggle' ? 'Toggle' : 'While held'))
    gyro('GYRO_TRACKBALL', t('pickers.glide', 'Glide'), t('pickers.glideSub', 'Keeps moving after you stop'), 'glide', held, whileHeld, t('pickers.glideText', 'The view keeps gliding after you stop moving and slows down by itself, while you hold {{input}}.', { input }), howChips(['While held', 'Toggle'], value === 'GYRO_TRACKBALL' && behaviour === 'Toggle' ? 'Toggle' : 'While held'))
    gyro('GYRO_TRACK_X', t('pickers.glideX', 'Glide left-right'), t('pickers.glideXSub', 'Only turning keeps going'), 'glideX', held, whileHeld, t('pickers.glideXText', 'Only turning keeps gliding after you stop, while you hold {{input}}.', { input }), howChips(['While held', 'Toggle'], value === 'GYRO_TRACK_X' && behaviour === 'Toggle' ? 'Toggle' : 'While held'))
    gyro('GYRO_TRACK_Y', t('pickers.glideY', 'Glide up-down'), t('pickers.glideYSub', 'Only looking keeps going'), 'glideY', held, whileHeld, t('pickers.glideYText', 'Only looking up and down keeps gliding after you stop, while you hold {{input}}.', { input }), howChips(['While held', 'Toggle'], value === 'GYRO_TRACK_Y' && behaviour === 'Toggle' ? 'Toggle' : 'While held'))

    // ---- Calibrate
    const calibrateSection = t('pickers.sectionCalibrate', 'Calibrate the gyro')
    const neutralSection = t('pickers.sectionNeutral', 'Neutral and triggers')
    const command_ = (token: string, title: string, sub: string, icon: string, section: string, aside: Item['aside'], unavailable?: string) =>
      list.push({ id: token, group: 'calibrate', section, title, sub, icon, current: value === token, commit: () => pick({ outputKind: 'command', outputValue: token }),
        unavailable: !allowed('command') ? t('pickers.notHere', 'Not available here') : unavailable, aside })
    command_('CALIBRATE_GYRO', t('pickers.calibrateGyro', 'Calibrate gyro'), t('pickers.calibrateGyroSub', 'Put it down'), 'calibrate', calibrateSection, {
      scope: t('pickers.calibrateGyroScope', 'Same as Recalibrate on the Gyro tab'),
      text: t('pickers.calibrateGyroText', 'Put the controller down. The overlay counts down, calibrates and shows how far it has got. Picking it up cancels.'),
      extra: steps([t('pickers.stepPutDown', 'Put down'), '3 · 2 · 1', t('pickers.stepDone', 'Done')]),
      note: t('pickers.calibrateSteamNote', 'The Steam Controller also re-centres itself; that is set on the Gyro tab.'),
      art: <CalibrateArt family={family} step="down" />,
    })
    {
      const { kind } = special('CALIBRATE')
      list.push({ id: 'CALIBRATE', group: 'calibrate', section: calibrateSection, title: t('pickers.calibrateHeld', 'Calibrate while held'), sub: t('pickers.calibrateHeldSub', 'Keep still while you hold {{input}}', { input }), icon: 'calibrateHeld',
        current: value === 'CALIBRATE', commit: () => pick({ outputKind: 'special', outputValue: 'CALIBRATE' }), unavailable: !allowed(kind === 'gyroAction' ? 'special' : kind) ? t('pickers.notHere', 'Not available here') : undefined,
        aside: { scope: t('pickers.whileHeld', 'While held'), text: t('pickers.calibrateHeldText', 'Keep the controller still while you hold {{input}}. Letting go finishes and keeps the fix.', { input }),
          extra: steps([t('pickers.stepHoldStill', 'Hold still'), t('pickers.stepLetGo', 'Let go'), t('pickers.stepDone', 'Done')]), art: <CalibrateArt family={family} step="held" /> } })
    }
    command_('RESTART_GYRO_CALIBRATION', t('pickers.continuousStart', 'Start continuous calibration'), t('pickers.continuousStartSub', 'Every controller, no countdown'), 'continuousStart', calibrateSection, {
      scope: t('pickers.everyController', 'Every connected controller'),
      text: t('pickers.continuousStartText', 'Starts calibrating every connected controller at once, with no countdown. Keep them still until you finish.'),
      extra: steps([t('pickers.stepStart', 'Start'), t('pickers.stepKeepStill', 'Keep still'), t('pickers.stepFinish', 'Finish')]),
      note: t('pickers.continuousPair', 'Pair it with Finish continuous calibration on another button.'), art: <CalibrateArt family={family} step="continuous" />,
    })
    command_('FINISH_GYRO_CALIBRATION', t('pickers.continuousFinish', 'Finish continuous calibration'), t('pickers.continuousFinishSub', 'Stops and saves the fix'), 'continuousFinish', calibrateSection, {
      scope: t('pickers.everyController', 'Every connected controller'),
      text: t('pickers.continuousFinishText', 'Stops calibrating and keeps each controller’s fix. Pair it with Start continuous calibration.'),
      art: <CalibrateArt family={family} step="continuous" />,
    })
    command_('SET_MOTION_STICK_NEUTRAL', t('pickers.tiltNeutral', 'Set tilt neutral'), t('pickers.tiltNeutralSub', 'For tilt and steering'), 'tiltNeutral', neutralSection, {
      scope: t('pickers.howYouHoldIt', 'Uses how you hold it right now'),
      text: t('pickers.tiltNeutralText', 'However you hold the controller when you press {{input}} becomes level, for tilt and steering.', { input }),
      art: <CalibrateArt family={family} step="neutral" />,
    })
    command_('RECENTER_GYRO_DEFLECTION', t('pickers.recentre', 'Recentre gyro stick'), t('pickers.recentreSub', 'A fresh centre for gyro-as-stick'), 'recentre', neutralSection, {
      scope: t('pickers.everyController', 'Every connected controller'),
      text: t('pickers.recentreText', 'Takes a fresh centre for gyro-as-stick on every connected controller. Tilt’s level and the raw sensors are left as they are.'),
      art: controllerArt(),
    })
    command_('CALIBRATE_TRIGGERS', t('pickers.calibrateTriggers', 'Calibrate adaptive triggers'), t('pickers.dualSenseOnly', 'DualSense only'), 'triggers', neutralSection, {
      scope: t('pickers.dualSenseOnly', 'DualSense only'),
      text: t('pickers.calibrateTriggersText', 'Finds where a DualSense’s adaptive triggers start to resist. Pull each trigger slowly when the overlay asks.'),
      art: <CalibrateArt family={family} step="triggers" />,
    }, onlyFor(DUALSENSE, 'DualSense'))

    // ---- Rumble & sound
    const feel = t('pickers.sectionFeel', 'Feel it')
    list.push({ id: 'haptic', group: 'rumble', section: feel, title: t('pickers.haptic', 'Haptic pulse'), sub: t('pickers.hapticSub', 'Seven patterns, on either grip or both'), icon: 'haptic', variant: 'feel', picture: <FeelArt kind="haptic" />,
      current: command.outputKind === 'haptic' || isHapticBindingValue(value), commit: () => setParam('haptic'),
      unavailable: !allowed('haptic') ? t('pickers.notHere', 'Not available here') : undefined,
      aside: { scope: t('pickers.onTheGrips', 'On the grip motors'), text: t('pickers.hapticText', 'A short buzz when you press {{input}}: seven patterns, on the left grip, the right or both. The grip, pattern and strength are picked next.', { input }), art: controllerArt(['ZL', 'ZR']) } })
    const rumble = parseRumbleBinding(value)
    list.push({ id: 'rumble', group: 'rumble', section: feel, title: t('pickers.rumble', 'Rumble motors'), sub: t('pickers.rumbleSub', 'Small and big motor strength, for pads with rumble'), icon: 'rumble', variant: 'feel', picture: <FeelArt kind="rumble" />,
      current: Boolean(rumble), commit: () => setParam('rumble'),
      unavailable: !allowed('special') ? t('pickers.notHere', 'Not available here') : undefined,
      aside: { scope: t('pickers.forRumblePads', 'For pads with rumble motors'), text: t('pickers.rumbleText', 'Runs the small and big motors while {{input}} is held. How strong each one is, is picked next.', { input }), art: controllerArt() } })
    const sound = command.outputKind === 'command' ? parsePlaySound(value) : null
    const tunes = t('pickers.sectionTunes', 'Built-in tunes · {{count}}', { count: BUILT_IN_SOUNDS.length })
    BUILT_IN_SOUNDS.forEach((name, index) => list.push({ id: `tune-${index}`, group: 'rumble', section: tunes, title: name, variant: 'tune', picture: <TuneArt index={index} />,
      current: Boolean(sound && 'builtIn' in sound && sound.builtIn === index),
      commit: () => pick({ outputKind: 'command', outputValue: playSoundToken(index) }), unavailable: !allowed('command') ? t('pickers.notHere', 'Not available here') : undefined,
      hear: () => { void desktopBridge.playControllerSound(index, 0).catch(() => {}) },
      aside: { scope: t('pickers.builtInTune', 'Built-in tune, from Steam'), text: t('pickers.tuneText', 'Plays through the grip motors when you press {{input}}. Volume is set in Fine-tune and starts as recorded.', { input }),
        note: t('pickers.tuneNote', 'Notes are moved into the range the motors play clearly.'), art: <PianoRoll index={index} /> } }))
    const yours = t('pickers.sectionYourSounds', 'Your sounds')
    sounds.filter(entry => entry.ready).forEach(entry => list.push({ id: `sound-${entry.id}`, group: 'rumble', section: yours, title: entry.name, variant: 'tune', picture: <TuneArt seed={entry.id} />,
      current: Boolean(sound && 'id' in sound && sound.id === entry.id),
      commit: () => pick({ outputKind: 'command', outputValue: playSoundToken(entry.id) }), unavailable: !allowed('command') ? t('pickers.notHere', 'Not available here') : undefined,
      hear: () => { void desktopBridge.playControllerSound(0, Number((entry as { defaultGainDb?: number }).defaultGainDb ?? 0), entry.id).catch(() => {}) },
      aside: { scope: entry.sourceFormat === 'midi' ? t('pickers.yourSoundMidi', 'Your sound · from a MIDI file') : t('pickers.yourSound', 'Your sound'), text: t('pickers.tuneText', 'Plays through the grip motors when you press {{input}}. Volume is set in Fine-tune and starts as recorded.', { input }),
        note: t('pickers.tuneNote', 'Notes are moved into the range the motors play clearly.'), art: <PianoRoll seed={entry.id} /> } }))
    list.push({ id: 'make-sound', group: 'rumble', section: yours, title: t('pickers.makeSound', '+ Make one from a MIDI file'), sub: t('pickers.makeSoundSub', 'Opens the sound library · pick a track and an octave'), variant: 'ghost',
      current: false, commit: () => setLibrary(true),
      aside: { scope: t('pickers.soundLibrary', 'The sound library'), text: t('pickers.makeSoundText', 'Turn a MIDI file into a tune the grip motors can play: choose a track and an octave, trim it, and it appears here.'), art: <PianoRoll seed="new" /> } })

    // ---- Light
    const lightSection = t('pickers.sectionLight', 'The controller light')
    const colourMatch = /^"?\s*LIGHT_BAR\s*=\s*x([0-9a-f]{6})\s*"?$/i.exec(value)
    const colour = `#${(colourMatch?.[1] ?? defaultLedColor.replace(/^#/, '')).toLowerCase()}`
    const brightnessMatch = /^"?\s*LED_BRIGHTNESS\s*=\s*(\d+)/i.exec(value)
    list.push({ id: 'LIGHT_BAR', group: 'light', section: lightSection, title: t('pickers.lightColour', 'Change light colour'), sub: t('pickers.lightColourSub', 'Sets a new colour and keeps it'), variant: 'light',
      picture: <><span className={styles.picArt}><ControllerArt family={family} light={colour} viewBox="0 -20 1117 470" /></span><span className={styles.picCaption}>{t('pickers.staysColour', 'stays that colour')}</span><span className={styles.picCheck}>✓</span></>,
      current: Boolean(colourMatch), commit: () => setLight('press'), unavailable: !allowed('command') ? t('pickers.notHere', 'Not available here') : undefined,
      aside: { scope: t('pickers.lightColourSub', 'Sets a new colour and keeps it'), text: t('pickers.lightColourText', 'Changes the controller’s light when you press {{input}}. It stays that way until something changes it again.', { input }), extra: swatches(colour), art: <ControllerArt family={family} light={colour} /> } })
    list.push({ id: 'heldLed', group: 'light', section: lightSection, title: t('pickers.lightHeld', 'Light while held'), sub: t('pickers.lightHeldSub', 'Goes back when you let go'), variant: 'light',
      picture: <><span className={styles.picArt}><ControllerArt family={family} light={defaultLedColor} viewBox="0 -20 1117 470" /></span>
        <span className={styles.picBars}><InputGlyph command={command.physicalInput} family={family} size={20} /><span className={styles.picTrack}><i /></span></span></>,
      current: command.source.kind === 'heldLed', commit: () => setLight('hold'),
      unavailable: !onAddHeldLed ? t('pickers.lightHeldCannot', 'Light while held can’t be added here') : undefined,
      aside: { scope: t('pickers.lightHeldScope', 'One per button · its own colour and brightness'), text: t('pickers.lightHeldText', 'Changes the light while {{input}} is down. Let go and the light you had comes back by itself.', { input }), extra: swatches(defaultLedColor), art: <ControllerArt family={family} light={defaultLedColor} highlight={[command.physicalInput]} /> } })
    list.push({ id: 'LED_BRIGHTNESS', group: 'light', section: lightSection, title: t('pickers.lightBrightness', 'Light brightness'), sub: t('pickers.lightBrightnessSub', 'Sets how bright, when it fires'), variant: 'light',
      picture: <><span className={styles.picArt}><ControllerArt family={family} light={defaultLedColor} viewBox="0 -20 1117 470" /></span><span className={styles.picLevels}><span style={{ height: 10 }} /><span style={{ height: 16 }} /><span style={{ height: 22 }} /><span style={{ height: 28 }} /><span style={{ height: 34 }} /><em>0–100</em></span></>,
      current: Boolean(brightnessMatch), commit: () => setParam('brightness'), unavailable: !allowed('command') ? t('pickers.notHere', 'Not available here') : undefined,
      aside: { scope: t('pickers.lightBrightnessSub', 'Sets how bright, when it fires'), text: t('pickers.lightBrightnessText', 'Sets the light’s brightness, 0 to 100, when you press {{input}}. The colour stays as it is. The level is picked next.', { input }), art: <ControllerArt family={family} light={defaultLedColor} /> } })

    // ---- Other
    const cycle = parseCycleBinding(value)
    const cycleSteps = (cycle ?? ['1', '2', '3']).map(step => keyDisplayName(step))
    const other = (id: string, title: string, sub: string, pic: string, current: boolean, commit: () => void, aside: Item['aside'], unavailable?: string) =>
      list.push({ id, group: 'other', section: '', title, sub, variant: 'other', picture: <OtherArt name={pic} steps={pic === 'cycle' ? cycleSteps : undefined} />, current, commit, aside, unavailable })
    other('OPEN_KEYBOARD', t('pickers.openKeyboard', 'Open keyboard'), t('pickers.openKeyboardSub', 'Shows or hides the on-screen keyboard'), 'keyboard', value === 'OPEN_KEYBOARD', () => pick({ outputKind: 'command', outputValue: 'OPEN_KEYBOARD' }),
      { scope: t('pickers.openKeyboardSub', 'Shows or hides the on-screen keyboard'), text: t('pickers.openKeyboardText', 'Opens the controller keyboard over the game when you press {{input}}, or closes it if it is open.', { input }), art: <OtherArt name="keyboard" /> }, !allowed('command') ? t('pickers.notHere', 'Not available here') : undefined)
    other('TOGGLE_MAPPING', t('pickers.pauseMapping', 'Pause / resume mapping'), t('pickers.pauseMappingSub', 'The controller acts as itself until pressed again'), 'pause', value === 'TOGGLE_MAPPING', () => pick({ outputKind: 'command', outputValue: 'TOGGLE_MAPPING' }),
      { scope: t('pickers.everyController', 'Every connected controller'), text: t('pickers.pauseMappingText', 'Stops mapping when you press {{input}}: the controller acts as itself until you press it again.', { input }), art: <OtherArt name="pause" /> }, !allowed('command') ? t('pickers.notHere', 'Not available here') : undefined)
    other('CYCLE', t('pickers.cycle', 'Cycle through keys'), t('pickers.cycleSub', 'Next one each press'), 'cycle', Boolean(cycle), () => setParam('cycle'),
      { scope: t('pickers.cycleScope', '2 to 32 steps'), text: t('pickers.cycleText', 'Each press of {{input}} sends the next key once, then it starts over. Keys, mouse buttons or gamepad buttons.', { input }),
        extra: <div className={styles.chipBlock}>
          <span className={styles.chipLabel}>{cycle ? t('pickers.cycleNow', 'Now · the steps are picked next') : t('pickers.cycleStarts', 'Starts with · the steps are picked next')}</span>
          <div className={styles.chips}>{cycleSteps.slice(0, 6).map((step, at) => <span key={at} style={{ display: 'contents' }}>{at > 0 && <span className={styles.chipArrow}>›</span>}<span className={styles.chip}><i>{at + 1}</i>{step}</span></span>)}</div>
        </div>,
        art: <CycleLoopArt steps={cycleSteps} /> }, !allowed('command') ? t('pickers.notHere', 'Not available here') : undefined)
    other('TURN_OFF_CONTROLLER', t('pickers.turnOff', 'Turn off controller'), t('pickers.steamOnly', 'Steam Controller (2026) only'), 'power', value === 'TURN_OFF_CONTROLLER', () => pick({ outputKind: 'command', outputValue: 'TURN_OFF_CONTROLLER' }),
      { scope: t('pickers.steamOnly', 'Steam Controller (2026) only'), text: t('pickers.turnOffText', 'Turns the controller off when you press {{input}}. Its Steam button wakes it again.', { input }), art: <OtherArt name="power" /> },
      !allowed('command') ? t('pickers.notHere', 'Not available here') : onlyFor(STEAM_CONTROLLER_2026, 'Steam Controller (2026)'))
    // A stick that changes while this is held is the stick's Mode shift: these point there.
    for (const side of ['LEFT', 'RIGHT'] as const) {
      other(`stickShift${side}`, side === 'LEFT' ? t('pickers.leftStickShift', 'Left stick mode shift') : t('pickers.rightStickShift', 'Right stick mode shift'),
        t('pickers.stickShiftSub', 'Sticks ▸ Mode shift, with {{input}} held', { input }), 'stick', command.source.kind === 'stickShift' && command.source.target === side,
        () => { onClose(); requestModeshift({ page: 'joysticks', side: side === 'LEFT' ? 'left' : 'right', trigger: command.physicalInput, create: true }) },
        { scope: t('pickers.whileHeld', 'While held'), text: t('pickers.stickShiftText', 'A stick works another way while {{input}} is held: aim instead of move, flick, a scroll wheel. Set on the stick’s Mode shift page.', { input }), art: <OtherArt name="stick" /> },
        !onAddStickShift ? t('pickers.stickShiftCannot', 'A stick mode shift is set on the Sticks tab: Mode shift') : undefined)
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, command.source.kind, command.outputKind, command.outputBehavior, command.physicalInput, family, text, sounds, connected, specialOptions, allowedOutputKinds, defaultLedColor, onAddHeldLed, onAddStickShift, input, t])

  const groupOf = (): GroupId => items.find(item => item.current)?.group ?? 'gyro'
  const [group, setGroup] = useState<GroupId>(groupOf)
  const [focusedId, setFocusedId] = useState<string | null>(() => items.find(item => item.current)?.id ?? null)
  const grid = useRef<HTMLDivElement>(null)
  useRefocusOn(grid, group, ['[data-current="true"]', '[data-action]'])

  const inGroup = items.filter(item => item.group === group)
  const focused = items.find(item => item.id === focusedId && item.group === group) ?? inGroup.find(item => item.current) ?? inGroup[0]
  const count = (id: GroupId) => {
    const n = items.filter(item => item.group === id && item.variant !== 'ghost').length
    return id === 'rumble' && !sounds.some(entry => entry.ready) ? `${n}+` : n
  }
  const groups: { id: GroupId; label: string; count: string | number }[] = [
    { id: 'gyro', label: t('pickers.groupGyro', 'Gyro'), count: count('gyro') },
    { id: 'calibrate', label: t('pickers.groupCalibrate', 'Calibrate'), count: count('calibrate') },
    { id: 'rumble', label: t('pickers.groupRumble', 'Rumble & sound'), count: count('rumble') },
    { id: 'light', label: t('pickers.groupLight', 'Light'), count: count('light') },
    { id: 'other', label: t('pickers.groupOther', 'Other'), count: count('other') },
  ]
  const sectionCaption: Record<string, string> = {
    [t('pickers.sectionGyroOnOff', 'Turn gyro on or off')]: t('pickers.sectionGyroOnOffCaption', 'Wins over the Gyro tab while it’s active'),
    [t('pickers.sectionGyroHeld', 'Change it while held')]: t('pickers.sectionGyroHeldCaption', 'Back to normal when you let go'),
    [t('pickers.sectionCalibrate', 'Calibrate the gyro')]: t('pickers.sectionCalibrateCaption', 'Fixes slow drift when the controller sits still'),
    [t('pickers.sectionNeutral', 'Neutral and triggers')]: t('pickers.sectionNeutralCaption', 'Uses how you hold it right now'),
    [t('pickers.sectionFeel', 'Feel it')]: t('pickers.sectionFeelCaption', 'Pattern and strength are picked next'),
    [t('pickers.sectionTunes', 'Built-in tunes · {{count}}', { count: BUILT_IN_SOUNDS.length })]: t('pickers.sectionTunesCaption', 'Played on the grip motors'),
    [t('pickers.sectionYourSounds', 'Your sounds')]: sounds.some(entry => entry.ready) ? t('pickers.yourSoundsCount', '{{count}} ready', { count: sounds.filter(entry => entry.ready).length }) : t('pickers.noneYet', 'None yet'),
    [t('pickers.sectionLight', 'The controller light')]: t('pickers.sectionLightCaption', 'The colour or level is picked next'),
  }

  const tileHints = (item: Item) => item.unavailable ? 'B:Back' : [
    `A:${item.variant === 'ghost' ? t('pickers.open', 'Open') : t('pickers.useNamed', 'Use {{name}}', { name: item.title })}`,
    item.hear ? `X:${t('pickers.hearIt', 'Hear it')}` : '',
    onSearch ? `Y:${t('pickers.search', 'Search')}` : '',
  ].filter(Boolean).join(';')

  const tile = (item: Item) => {
    const variantClass = item.variant === 'feel' ? styles.feelTile : item.variant === 'tune' ? styles.tuneTile : item.variant === 'light' || item.variant === 'other' ? styles.picTile : item.variant === 'ghost' ? styles.ghostTile : styles.actionTile
    return (
      <button key={item.id} type="button" className={`${styles.tile} ${variantClass}`} data-action={item.id}
        data-current={item.current ? 'true' : undefined} aria-pressed={item.current}
        aria-disabled={item.unavailable ? 'true' : undefined} data-reason={item.unavailable}
        aria-label={[item.title, item.sub].filter(Boolean).join(' · ')}
        data-caption={item.unavailable ? undefined : [item.title, typeof item.aside.text === 'string' ? item.aside.text : item.sub].filter(Boolean).join(' · ')}
        data-hints={tileHints(item)}
        onFocus={() => setFocusedId(item.id)} onMouseEnter={() => { if (document.body.dataset.inputSource === 'mouse') setFocusedId(item.id) }}
        onClick={() => { if (!item.unavailable) item.commit() }}>
        {item.variant === 'feel' ? <>
          <TileIcon name={item.icon!} />
          <span className={styles.feelText}><span className={styles.tileTitle}>{item.title}</span><span className={styles.tileSub}>{item.sub}</span></span>
          {item.picture}
        </> : item.variant === 'tune' ? <>
          {item.picture}<span className={styles.tileTitle}>{item.title}</span>
        </> : item.variant === 'ghost' ? <>
          <span className={styles.ghostIcon}><TileIcon name="music" size={40} /></span>
          <span className={styles.feelText}><span className={styles.tileTitle}>{item.title}</span><span className={styles.tileSub}>{item.sub}</span></span>
        </> : item.variant === 'light' || item.variant === 'other' ? <>
          <span className={`${styles.pic} ${item.variant === 'other' ? styles.picSmall : ''}`}>{item.picture}</span>
          <span className={styles.tileTitle}>{item.title}</span>
          <span className={styles.tileSub}>{item.current ? `${item.sub} · ${t('pickers.current', 'current')}` : item.sub}</span>
        </> : <>
          <TileIcon name={item.icon!} />
          <span className={styles.tileTitle}>{item.title}</span>
          <span className={styles.tileSub}>{item.current ? `${item.sub} · ${t('pickers.current', 'current')}` : item.sub}</span>
        </>}
      </button>
    )
  }

  const sections = [...new Set(inGroup.map(item => item.section))]
  const columns = (section: string, list: Item[]) => list[0]?.variant === 'tune' ? null : list[0]?.variant === 'feel' ? 2 : list[0]?.variant === 'light' || list[0]?.variant === 'other' ? 3 : section ? 4 : 3

  if (light) {
    return <LightPage {...props} words={words} mode={light} onBack={() => setLight(null)} />
  }
  if (param) {
    return <ParamPage {...props} words={words} kind={param} onBack={() => setParam(null)} />
  }

  return (
    <>
      <PickerPage kind="controller" onClose={onClose} input={command.physicalInput} eyebrow={words.eyebrow} title={t('pickers.controllerTitle', 'Controller action')}
        where={words.where(t('pickers.controllerTitle', 'Controller action'))}
        headerAction={onSearch ? { label: t('pickers.searchEvery', 'Search every action'), hint: t('pickers.search', 'Search'), button: 'Y', onPress: onSearch,
          icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg> } : undefined}
        groups={groups} group={group} onGroup={id => setGroup(id as GroupId)} stepLabel={t('pickers.stepGroup', 'Group')}
        onPad={button => {
          if (button === 'Y' && onSearch) { onSearch(); return true }
          if (button === 'X' && focused?.hear && !focused.unavailable) { focused.hear(); return true }
          return false
        }}
        aside={focused && (
          <PickerAside art={focused.aside.art} name={focused.title} scope={focused.unavailable ?? focused.aside.scope} note={focused.aside.note} noteTone={focused.aside.noteTone}>
            {focused.aside.text && <p className={styles.asideText}>{focused.aside.text}</p>}
            {focused.aside.extra}
            {focused.hear && !focused.unavailable && (
              <button type="button" className={styles.asideButton} tabIndex={-1} onClick={focused.hear}>
                <ButtonGlyph button="X" size={26} family={glyphFamily} />{t('pickers.hearOnController', 'Hear it on the controller')}
              </button>
            )}
          </PickerAside>
        )}>
        <div ref={grid} className={styles.main} role="region" aria-label={groups.find(item => item.id === group)?.label}>
          {sections.map(section => {
            const list = inGroup.filter(item => item.section === section)
            const cols = columns(section, list)
            const ghosts = list.filter(item => item.variant === 'ghost')
            const tunes = list.filter(item => item.variant === 'tune')
            const body = tunes.length || ghosts.length
              ? <>
                  {tunes.length > 0 && <div className={styles.tuneGrid}>{tunes.map(tile)}</div>}
                  {ghosts.length > 0 && <div style={{ display: 'flex', gap: 12 }}>{ghosts.map(tile)}</div>}
                </>
              : <div className={styles.grid} style={{ ['--cols' as string]: cols }}>{list.map(tile)}</div>
            return section
              ? <PickerSection key={section} label={section} caption={sectionCaption[section]}>{body}</PickerSection>
              : <div key="other">{body}</div>
          })}
          {group === 'light' && (
            <div className={styles.restRow}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              <span className={styles.restText}><b>{t('pickers.lightRest', 'The light the rest of the time')}</b><span>{t('pickers.lightRestText', 'This configuration’s own colour and brightness are on the Layout tab')}</span></span>
              <span>{t('pickers.default', 'Default')}</span>
            </div>
          )}
        </div>
      </PickerPage>
      {library && <SoundLibraryDialog onClose={() => setLibrary(false)} />}
    </>
  )
}

type ParamKind = 'brightness' | 'haptic' | 'rumble' | 'cycle'

/** Light brightness, Haptic pulse, Rumble motors, Cycle through keys: the value
 *  is picked on a page of its own, then Add writes it (L7) -- nothing is
 *  committed by the tile alone. The same settings stay in Fine-tune afterwards. */
function ParamPage(props: ActionPickerProps & { words: ReturnType<typeof usePickerWords>; kind: ParamKind; onBack: () => void }) {
  const { command, onClose, onSelect, words, kind, onBack, family, virtualControllerType, onEnableVirtualController } = props
  const { t } = useTranslation()
  const value = command.outputValue ?? ''
  const [level, setLevel] = useState(() => { const match = /^"?\s*LED_BRIGHTNESS\s*=\s*(\d+)/i.exec(value); return match ? Math.max(0, Math.min(100, Number(match[1]))) : 100 })
  const [haptic, setHaptic] = useState(() => parseHapticBinding(value) ?? DEFAULT_HAPTIC_BINDING)
  const [rumble, setRumble] = useState(() => parseRumbleBinding(value) ?? { small: 128, big: 128 })
  const [steps, setSteps] = useState<string[]>(() => parseCycleBinding(value) ?? ['1', '2', '3'])
  const title = kind === 'brightness' ? t('pickers.lightBrightness', 'Light brightness') : kind === 'haptic' ? t('pickers.haptic', 'Haptic pulse') : kind === 'rumble' ? t('pickers.rumble', 'Rumble motors') : t('pickers.cycle', 'Cycle through keys')
  const use = () => {
    const patch: BindingCommandPatch = kind === 'brightness' ? { outputKind: 'command', outputValue: `LED_BRIGHTNESS = ${level}` }
      : kind === 'haptic' ? { outputKind: 'haptic', outputValue: formatHapticBinding(haptic) }
      : kind === 'rumble' ? { outputKind: 'special', outputValue: rumbleBinding(rumble) }
      : { outputKind: 'command', outputValue: cycleBinding(steps) || 'CYCLE 1 | 2 | 3', outputBehavior: 'tapOnce' }
    onSelect({ virtualControllerLogicalOutput: undefined, ...patch })
    onClose()
  }
  const percent = (byte: number) => Math.round(byte * 100 / 255)
  const addLabel = kind === 'brightness' ? t('pickers.brightnessUse', 'Add: light brightness') : kind === 'haptic' ? t('pickers.hapticUse', 'Add: haptic pulse') : kind === 'rumble' ? t('pickers.rumbleUse', 'Add: rumble motors') : t('pickers.cycleUse', 'Add: cycle through keys')
  return (
    <PickerPage kind={kind} onClose={onBack} input={command.physicalInput} eyebrow={words.eyebrow} title={title} where={words.where(title)}>
      <div className={styles.main} style={{ maxWidth: 1040 }}>
        {kind === 'brightness' && (
          <PickerSection label={t('pickers.brightnessLabel', 'Level')} caption={t('pickers.brightnessCaption', 'The colour stays as it is')}>
            <ValueRow label={t('pickers.lightBrightness', 'Light brightness')} value={level} min={0} max={100} step={5} fineStep={1} format={next => `${next}%`} onChange={setLevel} data={{ 'data-autofocus': '' }} />
          </PickerSection>
        )}
        {kind === 'haptic' && (
          <PickerSection label={t('pickers.hapticLabel', 'The pulse')} caption={t('pickers.onTheGrips', 'On the grip motors')}>
            <SegmentedRow label={t('pickers.hapticGrip', 'Grip')} value={haptic.side} options={[{ value: 'L', label: 'Left' }, { value: 'R', label: 'Right' }, { value: 'BOTH', label: 'Both' }]}
              onChange={side => setHaptic(current => ({ ...current, side: side as HapticSide }))} />
            <SegmentedRow label={t('pickers.hapticPattern', 'Pattern')} value={haptic.effect}
              options={HAPTIC_EFFECT_CHOICES.map(effect => ({ value: effect, label: effect.charAt(0) + effect.slice(1).toLowerCase() }))}
              onChange={effect => setHaptic(current => ({ ...current, effect: effect as typeof current.effect }))} />
            <ValueRow label={t('pickers.hapticStrength', 'Strength')} value={haptic.gain} min={HAPTIC_GAIN_MIN} max={HAPTIC_GAIN_MAX} step={8} fineStep={1}
              format={gain => gain === 0 ? 'Default' : gain > 0 ? `+${gain}` : String(gain)} onChange={gain => setHaptic(current => ({ ...current, gain }))}
              onReset={haptic.gain !== 0 ? () => setHaptic(current => ({ ...current, gain: 0 })) : undefined} />
          </PickerSection>
        )}
        {kind === 'rumble' && (
          <PickerSection label={t('pickers.rumbleLabel', 'The motors')} caption={t('pickers.rumbleCaption', 'Run while the button is held')}>
            {(['small', 'big'] as const).map(motor => (
              <ValueRow key={motor} label={motor === 'small' ? t('pickers.rumbleSmall', 'Small motor strength') : t('pickers.rumbleBig', 'Big motor strength')} value={percent(rumble[motor])} min={0} max={100} step={5} fineStep={1} format={next => `${next}%`}
                onChange={next => setRumble(current => ({ ...current, [motor]: next * 255 / 100 }))} />
            ))}
          </PickerSection>
        )}
        {kind === 'cycle' && (
          <PickerSection label={t('pickers.cycleLabel', 'The steps')} caption={t('pickers.cycleScope', '2 to 32 steps')}>
            <p className={styles.asideText}>{t('pickers.cycleStepsText', 'Each press sends the next one once, then it starts over.')}</p>
            <CycleStepsEditor input={command.physicalInput} steps={steps} onChange={setSteps} family={family ?? 'generic'} virtualControllerType={virtualControllerType} onEnableVirtualController={onEnableVirtualController} />
          </PickerSection>
        )}
        <button type="button" className="button button--primary" data-hints={`A:${t('pickers.use', 'Use')};B:${t('common.cancel', 'Cancel')}`} data-param-use="" onClick={use}>{addLabel}</button>
      </div>
    </PickerPage>
  )
}

/** The light as a command of its own: pick the colour here. "While held" goes back
 *  when you let go; "Keep" is a different command that stays until something changes it. */
function LightPage(props: ActionPickerProps & { words: ReturnType<typeof usePickerWords>; mode: 'hold' | 'press'; onBack: () => void }) {
  const { command, onClose, onSelect, onAddHeldLed, words, mode, onBack, defaultLedColor = '#ffffff' } = props
  const { t } = useTranslation()
  const held = command.source.kind === 'heldLed' ? command.source : null
  const kept = /^"?s*LIGHT_BARs*=s*x([0-9a-f]{6})/i.exec(command.outputValue ?? '')?.[1]
  const [colour, setColour] = useState<string>(mode === 'hold' ? held?.color ?? defaultLedColor : kept ? `#${kept.toLowerCase()}` : defaultLedColor)
  const [brightness, setBrightness] = useState<number | null>(mode === 'hold' ? held?.brightness ?? null : null)
  const title = mode === 'hold' ? t('pickers.lightHeld', 'Light while held') : t('pickers.lightColour', 'Change light colour')
  const use = () => {
    if (mode === 'hold') onAddHeldLed?.(colour, brightness)
    else onSelect({ virtualControllerLogicalOutput: undefined, outputKind: 'command', outputValue: `LIGHT_BAR = x${colour.slice(1).toLowerCase()}` })
    onClose()
  }
  return (
    <PickerPage kind="light" onClose={onBack} input={command.physicalInput} eyebrow={words.eyebrow} title={title} where={words.where(title)}>
      <div className={styles.main} style={{ maxWidth: 1040 }}>
        <PickerSection label={t('pickers.lightColourLabel', 'Colour')}
          caption={mode === 'hold' ? t('pickers.backWhenLetGo', 'Back to its own colour when you let go') : t('pickers.lightStays', 'Stays that colour until something changes it')}>
          <LightBarPicker value={colour} defaultColor={defaultLedColor} allowClear={false} onChange={next => next && setColour(next)} />
        </PickerSection>
        {mode === 'hold' && (
          <ValueRow label={t('keymap.heldLedBrightness', 'Brightness while held')} value={brightness ?? 100} min={0} max={100} step={5}
            format={value => brightness === null ? `Default (${value}%)` : `${value}%`} onChange={setBrightness} onReset={brightness !== null ? () => setBrightness(null) : undefined} />
        )}
        <button type="button" className="button button--primary" data-hints={`A:${t('pickers.use', 'Use')};B:${t('common.cancel', 'Cancel')}`} data-light-use="" onClick={use}>
          {mode === 'hold' ? t('pickers.lightUseHeld', 'Add: light while held') : t('pickers.lightUseKept', 'Add: change light colour')}
        </button>
      </div>
    </PickerPage>
  )
}

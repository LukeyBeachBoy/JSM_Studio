import { parseMenuCommand } from '../../utils/menuCommands'
import { useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BindingCommand, BindingCommandPatch, BindingOutputBehavior } from '../../utils/bindingCommands'
import { isFixedCommand } from '../../utils/bindingCommands'
import keymapStyles from '../Keymap.module.css'
import styles from './BindingEditor.module.css'
import { Select } from '../ui/Select'
import { Sheet } from '../ui/Sheet'
import { Icon } from '../icons/Icon'
import { SettingOrigin } from '../SettingOrigin'
import { conditionTriggers } from './triggerKinds'
import { BindingLabelField } from './BindingLabelField'
import { LightBarPicker } from './LightBarPicker'
import { NumberField } from '../NumberField'
import { ReleaseSwitch } from './ReleaseSwitch'
import { LayerUsageContext } from '../LayerBar'
import { layerHue, layerSlot, layerVerbKeys, layerVerbOrder } from '../../utils/layers'
import { isReleasedInput, withRelease } from '../../utils/released'
import { useSoundLibrary } from '../../hooks/useSoundLibrary'
import { desktopBridge } from '../../platform/desktopBridge'
import { BUILT_IN_SOUNDS, SOUND_GAIN_MIN_DB, parsePlaySound, playSoundTarget, playSoundToken } from '../../utils/controllerSounds'
import { explainHeldLed } from '../../utils/bindingDescription'
import { CycleBindingFields } from './CycleBindingFields'
import { parseCycleBinding } from '../../utils/cycleBinding'
import type { VirtualControllerType } from '../../utils/virtualController'
import { getKeymapValue } from '../../utils/keymap'
import { timingMilliseconds } from '../../utils/timing'
import { usePreferences } from '../../platform/preferenceStore'
import { HapticOutputPicker } from './HapticOutputPicker'
import { parseHapticBinding } from '../../utils/hapticBindings'
import { parseRumbleBinding, rumbleBinding } from '../../utils/bindingParameters'
import { loadConfigBindingName, loadConfigBindingValue } from '../../utils/loadConfigBinding'

type Option = { value: string; label: string; disabled?: boolean }

type CommandSettingsProps = {
  allowHeldLed?: boolean
  virtualControllerType?: VirtualControllerType
  onEnableVirtualController?: () => void
  open: boolean
  onClose: () => void
  command: BindingCommand
  /** "A button · Press", over the sheet's title. */
  eyebrow: string
  /** What the command sends, in words: the sheet's title. */
  title: string
  modifierOptions: Option[]
  onChange: (patch: BindingCommandPatch) => void
  /** The name of this individual command. */
  label?: string
  onLabelChange?: (label: string) => void
  onDuplicate: () => void
  onCopy?: () => void
  onRemove: () => void
  /** The profile's (or the app's) LED colour: what an LED row shows before
   *  it has a colour of its own. */
  defaultLedColor?: string
  /** The profile's (or the app's) brightness, the same way. */
  baseLedBrightness?: number
  /** "A", for "When A is pressed" on a layer-action row. */
  inputShortName?: string
  libraryProfiles?: string[]
  onEditOutput?: () => void
}

const BEHAVIOR_OPTIONS: Array<{ value: BindingOutputBehavior; labelKey: string }> = [
  { value: 'normal', labelKey: 'keymap.commandBehaviorNormal' },
  { value: 'tapOnce', labelKey: 'keymap.commandBehaviorTapOnce' },
  { value: 'toggle', labelKey: 'keymap.commandBehaviorToggle' },
  { value: 'releaseOnly', labelKey: 'keymap.commandBehaviorReleaseOnly' },
]

const LIGHT_BAR_COMMAND = /^"?\s*LIGHT_BAR\s*=\s*x([0-9a-f]{6})\s*"?$/i
const LED_BRIGHTNESS_COMMAND = /^"?\s*LED_BRIGHTNESS\s*=\s*(-?\d+)\s*"?$/i

const clampPercent = (value: number) => Math.min(100, Math.max(0, Math.round(value)))

/**
 * A command's settings sheet, opened from its row's cog (binding card refresh
 * 3c). What the command sends is chosen in the action picker from the row's
 * keycap, so this holds only true options -- output mode, and for a chord the
 * input it chords with -- then Rename, Duplicate, Copy and Remove.
 *
 * A command with a parameter edits it here (TODO-54, TODO-55): the colour and
 * brightness of the LED (while held, or set once), the sound and its volume,
 * and for a layer action the layer, what happens to it and whether that is
 * on press or on release.
 */
export function CommandSettingsSheet({
  allowHeldLed = true,
  virtualControllerType,
  onEnableVirtualController,
  open,
  onClose,
  command,
  eyebrow,
  title,
  modifierOptions,
  onChange,
  label,
  onLabelChange,
  onDuplicate,
  onCopy,
  onRemove,
  defaultLedColor = '#ffffff',
  baseLedBrightness = 100,
  inputShortName,
  libraryProfiles = [],
  onEditOutput,
}: CommandSettingsProps) {
  const { t } = useTranslation()
  const { text } = useContext(LayerUsageContext)
  const { runtime } = usePreferences()
  const defaultTurboInterval = timingMilliseconds(getKeymapValue(text, 'TURBO_PERIOD') ?? '') ?? runtime?.turboPeriodMs ?? 80
  const locked = command.triggerKind === 'stickShift'
  const fixed = isFixedCommand(command)
  const led = command.source.kind === 'heldLed' || LIGHT_BAR_COMMAND.test(command.outputValue)
  const cycle = parseCycleBinding(command.outputValue)
  const haptic = parseHapticBinding(command.outputValue)
  const rumble = parseRumbleBinding(command.outputValue)
  const configuration = loadConfigBindingName(command.outputValue)
  const showCondition = !fixed && conditionTriggers.has(command.triggerKind)
  const setting =
    command.source.kind === 'special' ? command.source.specialKey
    : command.source.kind === 'heldLed' ? `${command.physicalInput},LIGHT_BAR`
    : command.source.kind === 'layerAction' ? command.sourceLine
    : command.sourceLine.includes('=') ? command.sourceLine.split('=')[0].trim() : command.physicalInput
  const act = (run: () => void) => () => { onClose(); run() }

  return (
    <Sheet open={open} onClose={onClose} eyebrow={eyebrow} title={title} width={560}
      hints={[{ button: 'A', label: t('keymap.sheetSelect', 'Select') }, { button: 'B', label: t('keymap.sheetClose', 'Close') }]}>
      <div className={styles.sheet} data-capture-ignore="true">
        {command.source.kind === 'heldLed' && (
          <HeldLedFields command={command} onChange={onChange} defaultLedColor={defaultLedColor} baseLedBrightness={baseLedBrightness} />
        )}
        {command.source.kind === 'layerAction' && (
          <LayerActionFields command={command} onChange={onChange} inputShortName={inputShortName ?? command.physicalInput} />
        )}
        {!fixed && <OneShotLedFields command={command} onChange={onChange} defaultLedColor={defaultLedColor} baseLedBrightness={baseLedBrightness} />}
        {!fixed && <SoundFields command={command} onChange={onChange} />}
        {!fixed && <CycleBindingFields command={command} onChange={onChange} virtualControllerType={virtualControllerType} onEnableVirtualController={onEnableVirtualController} />}
        {!fixed && haptic && <div className={styles.field} data-parameter="haptic">
          <HapticOutputPicker value={command.outputValue} onChange={outputValue => onChange({ outputKind: 'haptic', outputValue })} />
        </div>}
        {!fixed && rumble && <div className={styles.field} data-parameter="rumble">
          {(['small', 'big'] as const).map(motor => <NumberField key={motor} label={motor === 'small' ? 'Small motor strength' : 'Big motor strength'}
            value={Number((rumble[motor] * 100 / 255).toFixed(2))} min={0} max={100} step={1} unit="%"
            hint="Runs while this action is active. Controller support and shared rumble settings still apply."
            onChange={value => { if (value !== '') onChange({ outputKind: 'special', outputValue: rumbleBinding({ ...rumble, [motor]: Number(value) * 255 / 100 }) }) }} />)}
        </div>}
        {!fixed && configuration && <label className={styles.field} data-parameter="configuration">
          <span>Configuration</span>
          <Select ariaLabel="Configuration" value={configuration}
            options={[...libraryProfiles.map(name => ({ value: name, label: name })), ...(!libraryProfiles.includes(configuration) ? [{ value: configuration, label: `${configuration} (not in library)`, disabled: true }] : [])]}
            onValueChange={name => onChange({ outputKind: 'loadConfig', outputValue: loadConfigBindingValue(name) })} />
        </label>}
        {!fixed && onEditOutput && (command.outputKind === 'raw' || (command.outputKind === 'command' && !cycle && !led && !parsePlaySound(command.outputValue) && !parseMenuCommand(command.outputValue))) &&
          <button type="button" className="console-btn" onClick={onEditOutput}>Edit action</button>}
        {command.triggerKind === 'turbo' && <div className={styles.field}>
          <NumberField label="Turbo interval" value={command.turboIntervalMs} min={1} max={Math.max(5000, command.turboIntervalMs ?? 0, defaultTurboInterval)} step={1} defaultValue={defaultTurboInterval} unit="ms"
            placeholder="Use configuration timing"
            hint="Time between repeats for this action only. Turbo starts after the configured hold time."
            onChange={value => onChange({ turboIntervalMs: value === '' ? null : Number(value) })} />
          {command.turboIntervalMs != null && <button type="button" className="console-btn" onClick={() => onChange({ turboIntervalMs: null })}>Use configuration timing</button>}
        </div>}

        {led && allowHeldLed && <div className={styles.field}>
          <span>Activation</span>
          <div className="segmented" role="radiogroup" aria-label="LED activation">
            {(['press', 'hold'] as const).map(activation => <button type="button" key={activation} role="radio"
              aria-checked={(command.source.kind === 'heldLed' ? 'hold' : 'press') === activation}
              onClick={() => onChange({ ledActivation: activation })}>{activation === 'hold' ? 'While held' : 'On press'}</button>)}
          </div>
          <p className={keymapStyles.hapticHint}>{command.source.kind === 'heldLed' ? 'Changes the light while this input is down. Releasing it restores the previous light automatically.' : 'Changes the light when pressed and keeps the new color.'}</p>
        </div>}
        {command.outputKind === 'gyroAction' && <p className={keymapStyles.hapticHint}>Overrides this controller’s gyro activation while the action is active. Normal follows the input; Toggle retains the override until the next activation. Release output clears matching gyro actions. Other controllers remain independent.</p>}
        {command.source.kind === 'special' && <p className={keymapStyles.hapticHint}>This imported row is a profile activation condition. Edit activation on the Gyro page; native gyro overrides are separate actions in the JSM picker.</p>}
        {!fixed && !led && command.source.kind !== 'special' && (
          <div className={styles.field}>
            <span>{t('keymap.commandBehavior')}</span>
            <div className="segmented" role="radiogroup" aria-label={t('keymap.commandBehavior')} data-hints="MOVE:Choose;A:Select;B:Close">
              {BEHAVIOR_OPTIONS.filter(option => (!parseMenuCommand(command.outputValue) || option.value === 'normal') && (!cycle || option.value === 'normal' || option.value === 'tapOnce')).map(option => (
                <button key={option.value} type="button" role="radio" aria-checked={command.outputBehavior === option.value} disabled={locked}
                  onClick={() => onChange({ outputBehavior: option.value })}>
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          </div>
        )}

        {showCondition && (
          <label className={styles.field}>
            <span>{t('keymap.commandCondition')}</span>
            <Select
              value={command.conditionInput ?? ''}
              onValueChange={value => onChange({ conditionInput: value })}
              options={modifierOptions.map(option => ({ value: option.value, label: option.label, disabled: option.disabled }))}
              ariaLabel={t('keymap.commandCondition')}
            />
          </label>
        )}

        {onLabelChange && (
          <label className={styles.field}>
            <span>{t('keymap.commandRename', 'Name')}</span>
            <BindingLabelField value={label} onChange={onLabelChange} className={styles.nameField} />
          </label>
        )}

        {command.outputValue === 'TURN_OFF_CONTROLLER' && (
          <p className={keymapStyles.hapticHint}>{t('keymap.turnOffControllerHint')}</p>
        )}
        <SettingOrigin setting={setting} />

        <div className={styles.actions}>
          {/* A setting or an annotation is one per input and layer: nothing to duplicate or carry to another input. */}
          <button type="button" className="console-btn" disabled={fixed} onClick={act(onDuplicate)} data-hints="A:Duplicate;B:Close">
            <Icon name="add" size={18} />{t('keymap.commandDuplicate')}
          </button>
          <button type="button" className="console-btn" disabled={!onCopy || fixed} onClick={act(() => onCopy?.())} data-hints="A:Copy;B:Close">
            <Icon name="copy" size={18} />{t('keymap.commandCopy')}
          </button>
          <button type="button" className="console-btn console-btn--danger" onClick={act(onRemove)} data-hints="A:Remove;B:Close">
            <Icon name="remove" size={18} />{t('keymap.removeBinding')}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

type FieldsProps = { command: BindingCommand; onChange: (patch: BindingCommandPatch) => void }

/** LED while held: the colour and the brightness while the input is down,
 *  each falling back to the profile's; "Use profile brightness" drops the
 *  brightness override (the colour's Default swatch does the same for it). */
function HeldLedFields({ command, onChange, defaultLedColor, baseLedBrightness }: FieldsProps & { defaultLedColor: string; baseLedBrightness: number }) {
  const { t } = useTranslation()
  if (command.source.kind !== 'heldLed') return null
  const { color, brightness } = command.source
  return (
    <>
      <p className={keymapStyles.hapticHint}>{explainHeldLed(command.source, t)}</p>
      <div className={styles.field} data-parameter="held-led-color">
        <span>{t('keymap.heldLedColor', 'Color while held')}</span>
        <LightBarPicker value={color} defaultColor={defaultLedColor} onChange={next => onChange({ heldLed: { color: next } })} />
      </div>
      <div className={styles.field} data-parameter="held-led-brightness">
        <NumberField label={t('keymap.heldLedBrightness', 'Brightness while held')} value={brightness ?? baseLedBrightness} min={0} max={100} step={5} unit="%"
          hint={brightness === null ? t('keymap.heldLedUsesProfile', 'Using the profile brightness') : t('keymap.heldLedOverridesProfile', 'Overrides the profile brightness while held')}
          onChange={value => { if (value !== '') onChange({ heldLed: { brightness: clampPercent(Number(value)) } }) }} />
        {brightness !== null && (
          <button type="button" className="console-btn" onClick={() => onChange({ heldLed: { brightness: null } })} data-hints="A:Use profile brightness;B:Close">
            {t('keymap.useProfileBrightness', 'Use profile brightness')}
          </button>
        )}
      </div>
    </>
  )
}

/** A one-shot `LIGHT_BAR = x…` or `LED_BRIGHTNESS = n` console command: the
 *  same picker and field, writing the command's value. */
function OneShotLedFields({ command, onChange, defaultLedColor, baseLedBrightness }: FieldsProps & { defaultLedColor: string; baseLedBrightness: number }) {
  const { t } = useTranslation()
  if (command.outputKind !== 'command') return null
  const color = LIGHT_BAR_COMMAND.exec(command.outputValue)
  if (color) {
    return (
      <>
      <div className={styles.field} data-parameter="led-color">
        <span>{t('keymap.ledColorAction', 'LED color')}</span>
        <LightBarPicker value={`#${color[1].toLowerCase()}`} defaultColor={defaultLedColor} allowClear={false}
          onChange={next => { if (next) onChange({ outputValue: `LIGHT_BAR = x${next.slice(1).toLowerCase()}` }) }} />
      </div>
      <NumberField label="Brightness" value={command.ledBrightness ?? baseLedBrightness} min={0} max={100} step={5} unit="%"
        hint="Set the brightness together with this color."
        onChange={value => { if (value !== '') onChange({ ledBrightness: clampPercent(Number(value)) }) }} />
      {command.ledBrightness !== undefined && <button type="button" className="console-btn" onClick={() => onChange({ ledBrightness: null })}>Keep current brightness</button>}
      </>
    )
  }
  const level = LED_BRIGHTNESS_COMMAND.exec(command.outputValue)
  if (level) {
    return (
      <div className={styles.field} data-parameter="led-brightness">
        <NumberField label={t('keymap.ledBrightnessAction', 'LED brightness')} value={clampPercent(Number(level[1]))} min={0} max={100} step={5} unit="%"
          defaultValue={baseLedBrightness} hint={t('keymap.ledBrightnessDescribe', 'Sets the controller light, 0 to 100, when this action fires')}
          onChange={value => { if (value !== '') onChange({ outputValue: `LED_BRIGHTNESS = ${clampPercent(Number(value))}` }) }} />
      </div>
    )
  }
  return null
}

/** PLAY_SOUND: which sound (the built-in tunes, then the library), a preview
 *  on the controller, and the volume in dB, written after the sound. */
function SoundFields({ command, onChange }: FieldsProps) {
  const { t } = useTranslation()
  const { sounds } = useSoundLibrary()
  const [previewing, setPreviewing] = useState(false)
  if (command.outputKind !== 'command') return null
  const sound = parsePlaySound(command.outputValue)
  if (!sound) return null
  const gain = sound.gain ?? 0
  const target = playSoundTarget(sound)
  const value = 'builtIn' in sound ? `builtin:${sound.builtIn}` : 'id' in sound ? `library:${sound.id}` : `path:${sound.path}`
  const options: Option[] = [
    ...BUILT_IN_SOUNDS.map((name, index) => ({ value: `builtin:${index}`, label: name })),
    ...sounds.filter(entry => entry.ready).map(entry => ({ value: `library:${entry.id}`, label: entry.name })),
    ...('path' in sound ? [{ value, label: sound.path, disabled: true }] : []),
  ]
  const write = (next: number | string | null, level: number) => {
    if (next === null) return
    onChange({ outputValue: playSoundToken(next, level) })
  }
  const preview = async () => {
    setPreviewing(true)
    try {
      await desktopBridge.playControllerSound('builtIn' in sound ? sound.builtIn : 0, gain, 'id' in sound ? sound.id : undefined)
    } catch { /* No controller, or not the desktop app: nothing to hear. */ }
    finally { setPreviewing(false) }
  }
  return (
    <>
      <label className={styles.field} data-parameter="sound">
        <span>{t('keymap.soundPickerLabel', 'Sound')}</span>
        <Select value={value} ariaLabel={t('keymap.soundPickerLabel', 'Sound')} options={options}
          onValueChange={next => {
            const [kind, id] = [next.slice(0, next.indexOf(':')), next.slice(next.indexOf(':') + 1)]
            write(kind === 'builtin' ? Number(id) : kind === 'library' ? id : null, gain)
          }} />
      </label>
      <div className={styles.field} data-parameter="sound-gain">
        <NumberField label={t('keymap.soundGain', 'Volume')} value={gain} min={SOUND_GAIN_MIN_DB} max={0} step={1} coarseStep={6} unit=" dB"
          hint={gain === 0 ? t('keymap.soundGainAsRecorded', 'As recorded') : t('keymap.soundGainQuieter', '{{value}} dB quieter than recorded', { value: -gain })}
          onChange={next => { if (next !== '') write(target, Math.min(0, Math.max(SOUND_GAIN_MIN_DB, Math.round(Number(next))))) }} />
        <button type="button" className="console-btn" disabled={previewing || target === null} onClick={() => { void preview() }} data-hints="A:Preview;B:Close">
          <Icon name="haptic" size={18} />{t('keymap.soundPreview', 'Preview on controller')}
        </button>
      </div>
    </>
  )
}

/** A layer action: which layer, what happens to it (Hold / Toggle / Turn on
 *  / Turn off), and whether on press or on release ("!X" in the file). */
function LayerActionFields({ command, onChange, inputShortName }: FieldsProps & { inputShortName: string }) {
  const { t } = useTranslation()
  const { layers } = useContext(LayerUsageContext)
  if (command.source.kind !== 'layerAction') return null
  const { action } = command.source
  const released = isReleasedInput(action.input)
  const hue = layerHue(layerSlot(layers, action.layerId))
  const whenLabel = t('keymap.layerActionWhenPressed', 'When {{input}} is pressed', { input: inputShortName })
  return (
    <>
      <label className={styles.field} data-parameter="layer">
        <span>{t('keymap.layerActionLayer', 'Layer')}</span>
        <Select value={action.layerId} ariaLabel={t('keymap.layerActionLayer', 'Layer')}
          options={layers.map(layer => ({ value: layer.id, label: layer.name }))}
          onValueChange={layerId => onChange({ layerAction: { layerId } })} />
      </label>
      <div className={styles.field} data-parameter="layer-verb">
        <span>{whenLabel}</span>
        <div className="segmented" role="radiogroup" aria-label={whenLabel} style={{ ['--verb-hue' as string]: hue }} data-hints="MOVE:Choose;A:Select;B:Close">
          {layerVerbOrder.map(verb => (
            <button key={verb} type="button" role="radio" aria-checked={action.verb === verb} onClick={() => onChange({ layerAction: { verb } })}>
              {t(layerVerbKeys[verb])}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.field} data-parameter="layer-when">
        <span>{t('keymap.layerActionOn', 'Happens on')}</span>
        <ReleaseSwitch released={released} ariaLabel={t('keymap.layerActionOn', 'Happens on')}
          labels={[t('keymap.layerActionPress', 'Press'), t('keymap.layerActionRelease', 'Release')]}
          onChange={next => onChange({ layerAction: { input: withRelease(action.input, next) } })} />
      </div>
    </>
  )
}

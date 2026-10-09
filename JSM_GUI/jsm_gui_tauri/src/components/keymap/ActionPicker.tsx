import { useContext, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { isQueuedGyroAction, type BindingCommand, type BindingCommandPatch, type BindingOutputKind } from '../../utils/bindingCommands'
import { getVirtualControllerOptions, toVirtualControllerToken, type VirtualControllerType } from '../../utils/virtualController'
import { keyDisplayName } from '../../utils/keyNames'
import { loadConfigBindingValue } from '../../utils/loadConfigBinding'
import { LayerUsageContext } from '../LayerBar'
import { layerHue, layerSlot, visibleOverrideKeys, type LayerVerb } from '../../utils/layers'
import { MAIN_ROWS, NAV_ROWS, NUMPAD_ROWS, EXTENDED_FUNCTION_ROWS } from './KeyboardBindingModal'
import { mouseOptions, wheelOptions, systemKeyChoices } from './actionCatalog'
import { BindingIconArt } from './IconPicker'
import './ActionPicker.css'
import { DEFAULT_HAPTIC_BINDING, formatHapticBinding } from '../../utils/hapticBindings'
import { rumbleBinding } from '../../utils/bindingParameters'
import { InputGlyph } from '../glyphs/InputGlyph'
import { ButtonGlyph } from '../glyphs/ButtonGlyph'
import { Icon } from '../icons/Icon'
import { requestModeshift } from '../sticks/inputSide'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import { useSoundLibrary } from '../../hooks/useSoundLibrary'
import { BUILT_IN_SOUNDS, parsePlaySound, playSoundToken } from '../../utils/controllerSounds'
import { readVirtualMenus } from '../../utils/virtualMenus'
import { parseMenuCommand } from '../../utils/menuCommands'
import { jsmActionGroupFor, jsmActionIcon, CONTROLLER_ACTION_GROUPS, type ControllerActionGroup } from './jsmActionGroups'
import { inputDisplayName } from '../../keymap/inputNames'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'
import { activationLabel, usedTokens } from './pickers/pickerShared'
import { COMMON_KEYS } from './pickers/keyCatalog'

// Search every action (console v2): the whole catalogue in one place, families
// on LB / RB in the binding sheet's order of "sends" kinds, groups on LT / RT,
// and search on Y. The binding sheet's kinds each have a picker of their own
// (pickers/KindPicker); this one is Y from any of them, and the picker nested
// editors use where only some kinds make sense (allowedOutputKinds: a cycle's
// steps, a menu's actions).

const COMMON_TOKENS = new Set(COMMON_KEYS.map(key => key.token))

// The eight kinds, in the sheet's order. Keyboard keeps its four groups (a
// real keyboard layout lives here); Controller action has the five groups of
// its own picker.
const FAMILIES: { id: string; groups: Category[] }[] = [
  { id: 'keyboard', groups: ['Common', 'Keyboard', 'Numpad', 'System'] },
  { id: 'mouse', groups: ['Mouse'] },
  { id: 'gamepad', groups: ['Gamepad'] },
  { id: 'menus', groups: ['Virtual menus'] },
  { id: 'modes', groups: ['Layers'] },
  { id: 'controller', groups: ['Gyro', 'Calibrate', 'Rumble', 'Light', 'Other'] },
  { id: 'configurations', groups: ['Configurations'] },
  { id: 'custom', groups: ['Custom'] },
]

export type Category = 'Common' | 'Gamepad' | 'Mouse' | 'Keyboard' | 'Numpad' | 'Layers' | 'System' | ControllerActionGroup | 'Configurations' | 'Virtual menus' | 'Custom'
  /** Older names for the Controller action groups, still accepted. */
  | 'JSM' | 'Sounds'

type Props = {
  inputLabel: string
  command: BindingCommand
  virtualControllerType: VirtualControllerType
  specialOptions: { value: string; label: string; disabled?: boolean }[]
  libraryProfiles?: string[]
  /** The configuration being edited, marked in the Configurations list. */
  currentProfileName?: string | null
  onSelect: (patch: BindingCommandPatch) => void
  onClose: () => void
  /** Turn on the virtual gamepad: the scheme the Gamepad button picker shows
   *  (Xbox when not said), when the configuration has none or another. */
  onEnableVirtualController?: (type?: 'XBOX' | 'DS4') => void
  /** Capture a key or mouse button instead of choosing one ("Listen for a key"). */
  onCapture?: () => void
  /** Adding a command: a stick takes another mode while this input is held.
   *  The Controller action picker asks which stick and which mode; a caller
   *  that takes no arguments keeps its own choice. */
  onAddStickShift?: (stick?: 'LEFT' | 'RIGHT', mode?: string) => void
  /** Adding a command: "Light while held" with its own colour and brightness,
   *  chosen in the picker (it is a setting on the input rather than a token,
   *  so the card writes it). A caller that takes no arguments keeps the default. */
  onAddHeldLed?: (color?: string, brightness?: number | null) => void
  /** Adding a command: switch to a mode. The Switch mode picker passes the verb
   *  (hold · toggle · apply · remove) and whether it happens on let go. */
  onAddLayerAction?: (layerId: string, verb?: LayerVerb, onRelease?: boolean) => void
  /** A key combo (Ctrl + C): every key on the same event. Without it the
   *  combo is handed back as one raw binding through onSelect. */
  onSelectCombo?: (keys: string[]) => void
  /** The profile's (or the app's) LED colour: what "Change light colour" starts from. */
  defaultLedColor?: string
  /** The pad's family, for "B button uses it". */
  family?: ControllerVisualFamily
  /** A nested action editor can restrict choices to engine-supported outputs. */
  allowedOutputKinds?: BindingOutputKind[]
  /** Open on this category instead of the one the current action is in. */
  initialCategory?: Category
  /** Search every action (Y from a kind's picker): open with the search box focused. */
  startWithSearch?: boolean
}

/** One choosable action, for the detail panel and for search. */
type Choice = { key: string; label: string; cap?: string; token: string; kind: BindingOutputKind; describe: string; commit: () => void; unavailable?: string; icon?: string }

export type ActionPickerProps = Props

export function ActionPicker({ inputLabel, command, virtualControllerType, specialOptions, libraryProfiles = [], currentProfileName, onSelect, onClose, onEnableVirtualController, onCapture, onAddStickShift, onAddHeldLed, onAddLayerAction, defaultLedColor = '#ffffff', allowedOutputKinds, family = 'generic', initialCategory, startWithSearch }: Props) {
  const { t } = useTranslation()
  const { sounds } = useSoundLibrary()
  const title = useId()
  const { layers, text: configText = '' } = useContext(LayerUsageContext)
  const glyphFamily = family === 'generic' ? undefined : family
  const custom = command.outputKind === 'raw' || (command.outputKind === 'command' && !jsmActionGroupFor(command.outputValue) && !parsePlaySound(command.outputValue) && !parseMenuCommand(command.outputValue))
  const systemTokens = new Set(systemKeyChoices.map(key => key.token))
  const legacy = (category?: Category): Category | undefined => category === 'JSM' ? 'Gyro' : category === 'Sounds' ? 'Rumble' : category
  // Open on the category the current action is in.
  const [category, setCategory] = useState<Category>(legacy(initialCategory) ?? (
    parseMenuCommand(command.outputValue) ? 'Virtual menus'
    : command.outputKind === 'virtualController' ? 'Gamepad'
    : command.outputKind === 'mouse' || command.outputKind === 'wheel' ? 'Mouse'
    : command.outputKind === 'loadConfig' ? 'Configurations'
    : command.source.kind === 'layerAction' ? 'Layers'
    : jsmActionGroupFor(command.outputValue) || command.outputKind === 'haptic' || command.outputKind === 'special' || command.outputKind === 'gyroAction' || command.source.kind === 'heldLed' || command.source.kind === 'stickShift'
      ? (jsmActionGroupFor(command.outputValue)?.group ?? (command.outputKind === 'haptic' ? 'Rumble' : command.source.kind === 'heldLed' ? 'Light' : command.source.kind === 'stickShift' ? 'Other' : 'Gyro'))
    : custom ? 'Custom'
    : systemTokens.has(command.outputValue) ? 'System'
    : !command.outputValue || COMMON_TOKENS.has(command.outputValue) ? 'Common'
    : 'Keyboard'))
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState<Choice | null>(null)
  const rootRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const categories: Category[] = allowedOutputKinds
    ? [...(allowedOutputKinds.includes('keyboard') ? ['Common' as const] : []), 'Keyboard', 'Numpad', 'System', 'Mouse', 'Gamepad']
    : ['Common', 'Keyboard', 'Numpad', 'System', 'Mouse', 'Gamepad', 'Virtual menus', 'Layers', ...CONTROLLER_ACTION_GROUPS, 'Configurations', 'Custom']
  const families = FAMILIES.map(item => ({ ...item, groups: item.groups.filter(group => categories.includes(group)) })).filter(item => item.groups.length)
  const openFamily = families.find(item => item.groups.includes(category)) ?? families[0]
  // The families as the binding sheet names its "sends" kinds.
  const familyName = (id: string) => ({
    keyboard: t('pickers.pickerKeyboard', 'Keyboard key'), mouse: t('keymap.pickerMouse', 'Mouse'), gamepad: t('pickers.pickerGamepad', 'Gamepad button'),
    menus: t('pickers.pickerMenus', 'Open a menu'), modes: t('pickers.pickerLayers', 'Switch layer'),
    controller: t('pickers.pickerController', 'Controller action'), configurations: t('pickers.pickerConfigurations', 'Load a config'), custom: t('pickers.pickerCustom', 'Command'),
  })[id] ?? id
  const categoryName = (item: Category) => ({
    Common: t('keymap.pickerCommon', 'Common in games'), Keyboard: t('keymap.pickerFullKeyboard', 'Full keyboard'), Numpad: t('keymap.pickerNumpad', 'Numpad'), System: t('keymap.pickerSystemMedia', 'System & media'),
    Gamepad: t('pickers.pickerGamepad', 'Gamepad button'), Mouse: t('keymap.pickerMouse', 'Mouse'),
    'Virtual menus': t('pickers.pickerMenus', 'Open a menu'), Layers: t('pickers.pickerLayers', 'Switch layer'),
    Gyro: t('pickers.groupGyro', 'Gyro'), Calibrate: t('pickers.groupCalibrate', 'Calibrate'), Rumble: t('pickers.groupRumble', 'Rumble & sound'), Light: t('pickers.groupLight', 'Light'), Other: t('pickers.groupOther', 'Other'),
    JSM: t('pickers.groupGyro', 'Gyro'), Sounds: t('pickers.groupRumble', 'Rumble & sound'),
    Configurations: t('pickers.pickerConfigurations', 'Load a config'), Custom: t('pickers.pickerCustom', 'Command'),
  })[item]
  const glyphs: Record<string, string> = { faceSouth: 'S', faceNorth: 'N', faceWest: 'W', faceEast: 'E', leftBumper: 'L', rightBumper: 'R', leftStickClick: 'L3', rightStickClick: 'R3', back: '-', start: '+', home: 'HOME', dpadUp: 'UP', dpadDown: 'DOWN', dpadLeft: 'LEFT', dpadRight: 'RIGHT', leftTriggerDigital: 'ZL', rightTriggerDigital: 'ZR', padClick: 'CAPTURE' }
  const outputType = virtualControllerType === 'NONE' ? 'XBOX' : virtualControllerType
  const used = useMemo(() => usedTokens(configText), [configText])
  const current = command.outputValue ? keyDisplayName(command.outputValue) : ''
  // Light colour and brightness are console commands with a value; picking one
  // adds it with the value it has, or the configuration's, and Fine-tune sets it.
  const colorMatch = /^"?\s*LIGHT_BAR\s*=\s*x([0-9a-f]{6})\s*"?$/i.exec(command.outputValue ?? '')
  const colorToken = `LIGHT_BAR = x${(colorMatch?.[1] ?? defaultLedColor.replace(/^#/, '')).toLowerCase()}`
  const brightness = /^"?\s*LED_BRIGHTNESS\s*=\s*(\d+)/i.exec(command.outputValue ?? '')?.[1] ?? '100'

  const pick = (outputKind: BindingOutputKind, outputValue: string, extra?: BindingCommandPatch) => {
    if (allowedOutputKinds && !allowedOutputKinds.includes(outputKind)) return
    onSelect({ outputKind, outputValue, virtualControllerLogicalOutput: undefined, ...extra })
    onClose()
  }

  // Every choice, once, so search and the detail panel read from one list.
  const choices = useMemo<Record<Category, Choice[]>>(() => {
    const keyChoice = (key: { token: string; label?: string }): Choice => ({
      key: `key:${key.token}`, label: key.label ?? key.token, token: key.token, kind: 'keyboard',
      describe: `${keyDisplayName(key.token)} key`, commit: () => pick('keyboard', key.token),
    })
    const keys = (rows: { token: string; label?: string }[][]) => rows.flat().filter(key => key.token !== 'SPACER').map(keyChoice)
    const specialKind = (token: string): BindingOutputKind => command.source.kind !== 'special' && isQueuedGyroAction(token) ? 'gyroAction' : 'special'
    const action = (group: ControllerActionGroup, token: string, label: string, describe: string, kind: BindingOutputKind, commit: () => void, unavailable?: string): Choice =>
      ({ key: `${group}:${token}`, label, token, kind, describe, commit, unavailable, icon: jsmActionIcon(token) })
    const special = (group: ControllerActionGroup, token: string, label: string, describe: string) => {
      const kind = specialKind(token)
      const option = specialOptions.find(item => item.value === token)
      return action(group, token, label, describe, kind, () => pick(kind, token), option?.disabled ? t('pickers.notOnThisInput', 'Not available on this input') : undefined)
    }
    const cmd = (group: ControllerActionGroup, token: string, label: string, describe: string) => action(group, token, label, describe, 'command', () => pick('command', token))
    const groups: Record<Category, Choice[]> = {
      Gamepad: getVirtualControllerOptions(outputType, t).map(option => ({
        key: `pad:${option.value}`, label: option.label, token: toVirtualControllerToken(option.value, outputType) ?? '', kind: 'virtualController' as const,
        describe: `${outputType === 'DS4' ? 'DualShock 4' : 'Xbox'} ${option.label}`,
        commit: () => {
          if (virtualControllerType === 'NONE') onEnableVirtualController?.(outputType)
          onSelect({ outputKind: 'virtualController', outputValue: toVirtualControllerToken(option.value, outputType) ?? '', virtualControllerLogicalOutput: option.value })
          onClose()
        },
      })),
      // Left, Right, Middle, Back, Forward, then the wheel (PickerFamily: Mouse).
      Mouse: [...['LMOUSE', 'RMOUSE', 'MMOUSE', 'BMOUSE', 'FMOUSE'].filter(token => mouseOptions.includes(token)), ...wheelOptions].map(token => ({
        key: `mouse:${token}`, label: ({ LMOUSE: 'Left click', RMOUSE: 'Right click', MMOUSE: 'Middle', BMOUSE: 'Back', FMOUSE: 'Forward', SCROLLUP: 'Wheel up', SCROLLDOWN: 'Wheel down' } as Record<string, string>)[token] ?? keyDisplayName(token),
        token, kind: (wheelOptions.includes(token) ? 'wheel' : 'mouse') as BindingOutputKind, describe: keyDisplayName(token), commit: () => pick(wheelOptions.includes(token) ? 'wheel' : 'mouse', token),
      })),
      Common: COMMON_KEYS.map(key => ({ ...keyChoice({ token: key.token }), key: `common:${key.token}`, label: keyDisplayName(key.token), describe: key.use ?? '', cap: key.cap })),
      Keyboard: keys([...MAIN_ROWS, ...NAV_ROWS.filter(row => row.length), ...EXTENDED_FUNCTION_ROWS]),
      Numpad: keys(NUMPAD_ROWS),
      // Each mode, as a Hold on this input; the Switch mode picker sets the rest.
      Layers: onAddLayerAction ? layers.map(layer => ({
        key: `layer:${layer.id}`, label: layer.name, token: `# @layer-action = hold ${layer.id}`, kind: 'layerAction' as const,
        describe: t('pickers.layerPickDescribe', 'Holds {{layer}} while this input is down; Switch layer changes how', { layer: layer.name }),
        commit: () => { onAddLayerAction(layer.id, 'hold', false); onClose() },
      })) : [],
      'Virtual menus': readVirtualMenus(configText).menus.flatMap(menu => (['HOLD', 'OPEN', 'CLOSE', 'TOGGLE'] as const).map(verb => ({
        key: `menu:${menu.id}:${verb}`, label: `${({ HOLD: 'Hold', OPEN: 'Open', CLOSE: 'Close', TOGGLE: 'Toggle' })[verb]} ${menu.name}`, token: `MENU_${verb} ${menu.id}`, kind: 'command' as const,
        describe: ({ HOLD: 'Open while held, let go to pick.', OPEN: 'Opens it until you pick, close or toggle it.', CLOSE: 'Closes it without picking.', TOGGLE: 'Opens it, or closes it if it is open.' })[verb],
        commit: () => { onSelect({ outputKind: 'command', outputValue: `MENU_${verb} ${menu.id}`, outputBehavior: 'normal', ...(verb === 'HOLD' && ['release', 'turbo'].includes(command.triggerKind) ? { triggerKind: 'regular' as const } : {}) }); onClose() },
      }))),
      System: systemKeyChoices.map(key => ({ ...keyChoice({ token: key.token, label: t(key.labelKey, key.label) }), describe: t(key.labelKey, key.label), icon: key.icon })),
      Gyro: [
        special('Gyro', 'GYRO_ON', t('pickers.gyroOn', 'Gyro on'), t('pickers.gyroOnShort', 'This controller, while held or toggled')),
        special('Gyro', 'GYRO_OFF', t('pickers.gyroOff', 'Gyro off'), t('pickers.gyroOffShort', 'This controller, while held or toggled')),
        special('Gyro', 'GYRO_ON_ALL', t('pickers.gyroOnAll', 'Gyro on everywhere'), t('pickers.everyController', 'Every connected controller')),
        special('Gyro', 'GYRO_OFF_ALL', t('pickers.gyroOffAll', 'Gyro off everywhere'), t('pickers.everyController', 'Every connected controller')),
        special('Gyro', 'GYRO_INVERT', t('pickers.invertBoth', 'Invert both ways'), t('pickers.invertBothSub', 'Left-right and up-down')),
        special('Gyro', 'GYRO_INV_X', t('pickers.invertX', 'Invert left-right'), t('pickers.invertXSub', 'Turning goes the other way')),
        special('Gyro', 'GYRO_INV_Y', t('pickers.invertY', 'Invert up-down'), t('pickers.invertYSub', 'Looking up goes down')),
        special('Gyro', 'GYRO_TRACKBALL', t('pickers.glide', 'Glide'), t('pickers.glideSub', 'Keeps moving after you stop')),
        special('Gyro', 'GYRO_TRACK_X', t('pickers.glideX', 'Glide left-right'), t('pickers.glideXSub', 'Only turning keeps going')),
        special('Gyro', 'GYRO_TRACK_Y', t('pickers.glideY', 'Glide up-down'), t('pickers.glideYSub', 'Only looking keeps going')),
      ],
      Calibrate: [
        cmd('Calibrate', 'CALIBRATE_GYRO', t('pickers.calibrateGyro', 'Calibrate gyro'), t('pickers.calibrateGyroText', 'Put the controller down. The overlay counts down, calibrates and shows how far it has got. Picking it up cancels.')),
        action('Calibrate', 'CALIBRATE', t('pickers.calibrateHeld', 'Calibrate while held'), t('pickers.calibrateHeldShort', 'Keep still while you hold it; letting go keeps the fix'), 'special', () => pick('special', 'CALIBRATE')),
        cmd('Calibrate', 'RESTART_GYRO_CALIBRATION', t('pickers.continuousStart', 'Start continuous calibration'), t('pickers.continuousStartSub', 'Every controller, no countdown')),
        cmd('Calibrate', 'FINISH_GYRO_CALIBRATION', t('pickers.continuousFinish', 'Finish continuous calibration'), t('pickers.continuousFinishSub', 'Stops and saves the fix')),
        cmd('Calibrate', 'SET_MOTION_STICK_NEUTRAL', t('pickers.tiltNeutral', 'Set tilt neutral'), t('pickers.tiltNeutralSub', 'For tilt and steering')),
        cmd('Calibrate', 'RECENTER_GYRO_DEFLECTION', t('pickers.recentre', 'Recentre gyro stick'), t('pickers.recentreSub', 'A fresh centre for gyro-as-stick')),
        cmd('Calibrate', 'CALIBRATE_TRIGGERS', t('pickers.calibrateTriggers', 'Calibrate adaptive triggers'), t('pickers.dualSenseOnly', 'DualSense only')),
      ],
      Rumble: [
        action('Rumble', formatHapticBinding(DEFAULT_HAPTIC_BINDING), t('pickers.haptic', 'Haptic pulse'), t('pickers.hapticSub', 'Seven patterns, on either grip or both'), 'haptic', () => pick('haptic', formatHapticBinding(DEFAULT_HAPTIC_BINDING))),
        action('Rumble', rumbleBinding({ small: 128, big: 128 }), t('pickers.rumble', 'Rumble motors'), t('pickers.rumbleSub', 'Small and big motor strength, for pads with rumble'), 'special', () => pick('special', rumbleBinding({ small: 128, big: 128 }))),
        ...BUILT_IN_SOUNDS.map((name, index) => action('Rumble', playSoundToken(index), name, t('pickers.builtInTune', 'Built-in tune, from Steam'), 'command', () => pick('command', playSoundToken(index)))),
        ...sounds.filter(sound => sound.ready).map(sound => action('Rumble', playSoundToken(sound.id), sound.name, t('pickers.yourSound', 'Your sound'), 'command', () => pick('command', playSoundToken(sound.id)))),
      ],
      Light: [
        action('Light', colorToken, t('pickers.lightColour', 'Change light colour'), t('pickers.lightColourSub', 'Sets a new colour and keeps it'), 'command', () => pick('command', colorToken)),
        action('Light', 'HELD_LED', t('pickers.lightHeld', 'Light while held'), t('pickers.lightHeldSub', 'Goes back when you let go'), 'heldLed', () => { onAddHeldLed?.(); onClose() },
          onAddHeldLed ? undefined : t('pickers.lightHeldCannot', 'Light while held is a setting on the button: add it from the binding sheet’s Fine-tune')),
        action('Light', `LED_BRIGHTNESS = ${brightness}`, t('pickers.lightBrightness', 'Light brightness'), t('pickers.lightBrightnessSub', 'Sets how bright, when it fires'), 'command', () => pick('command', `LED_BRIGHTNESS = ${brightness}`)),
      ],
      Other: [
        cmd('Other', 'OPEN_KEYBOARD', t('pickers.openKeyboard', 'Open keyboard'), t('pickers.openKeyboardSub', 'Shows or hides the on-screen keyboard')),
        cmd('Other', 'TOGGLE_MAPPING', t('pickers.pauseMapping', 'Pause / resume mapping'), t('pickers.pauseMappingSub', 'The controller acts as itself until pressed again')),
        action('Other', 'CYCLE 1 | 2 | 3', t('pickers.cycle', 'Cycle through keys'), t('pickers.cycleSub', 'Next one each press'), 'command', () => pick('command', 'CYCLE 1 | 2 | 3', { outputBehavior: 'tapOnce' })),
        cmd('Other', 'TURN_OFF_CONTROLLER', t('pickers.turnOff', 'Turn off controller'), t('pickers.steamOnly', 'Steam Controller (2026) only')),
        action('Other', 'STICK_SHIFT', t('pickers.rightStickShift', 'Right stick mode shift'), t('pickers.stickShiftSearchSub', 'Opens the stick’s Mode shift with this button held'), 'special',
          () => { onClose(); requestModeshift({ page: 'joysticks', side: 'right', trigger: command.physicalInput, create: true }) }, onAddStickShift ? undefined : t('pickers.stickShiftCannot', 'A stick mode shift is set on the Sticks tab: Mode shift')),
      ],
      JSM: [], Sounds: [],
      Custom: [],
      // The one being edited is marked: loading the configuration you are in does nothing.
      Configurations: libraryProfiles.map(name => ({ key: `config:${name}`, label: name === currentProfileName ? t('keymap.commandLoadConfigCurrent', { name }) : name, token: loadConfigBindingValue(name), kind: 'loadConfig' as const, describe: `Loads ${name}`,
        unavailable: name === currentProfileName ? t('pickers.configYoureIn', 'You’re in {{name}}: loading it again changes nothing', { name }) : undefined, commit: () => pick('loadConfig', loadConfigBindingValue(name)) })),
    }
    return Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, allowedOutputKinds ? values.filter(choice => allowedOutputKinds.includes(choice.kind)) : values])) as Record<Category, Choice[]>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputType, specialOptions, libraryProfiles, currentProfileName, virtualControllerType, t, colorToken, brightness, onAddStickShift, onAddHeldLed, onAddLayerAction, layers, sounds, allowedOutputKinds, configText])

  const results = query.trim()
    // Common in games repeats keyboard keys: each token once, with its use.
    ? Object.values(choices).flat().filter((choice, index, all) => all.findIndex(other => other.token === choice.token && other.kind === choice.kind) === index)
        .filter(choice => `${choice.label} ${choice.token} ${choice.describe}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 60)
    : null

  // The first thing the pad can pick: the current action, else the first one
  // in the open category.
  const focusContent = () => {
    const content = rootRef.current?.querySelector<HTMLElement>('.action-picker__content')
    const action = content?.querySelector<HTMLElement>('button[aria-pressed="true"]:not(:disabled)') ?? content?.querySelector<HTMLElement>('button:not(:disabled)')
    // Empty categories and searches have no action to focus. Keep the pad on
    // the category tab so its next event still bubbles through this dialog.
    const target = action ?? rootRef.current?.querySelector<HTMLElement>(`.action-group-tab[data-category="${category}"]`) ?? rootRef.current?.querySelector<HTMLElement>(`.action-tab[data-family="${openFamily.id}"]`)
    if (!action) setFocused(null)
    target?.focus()
    return Boolean(target)
  }

  // Focus starts on an action, not in the search box (unless this is Search
  // every action): in the search box the D-pad does nothing and B would close
  // the whole picker. A category change unmounts the old content, so focus is
  // put back on the new one rather than dropping to the page behind.
  const refocus = useRef(false)
  const opening = useRef(true)
  useEffect(() => {
    if (opening.current) {
      // A microtask later, so useKeyboardNav's dialog observer -- queued by
      // the mount itself -- has first recorded where focus returns on close.
      // StrictMode runs this effect twice on mount; the flag keeps the second
      // run out of the way.
      queueMicrotask(() => { opening.current = false; if (startWithSearch) searchRef.current?.focus(); else focusContent() })
      return
    }
    const active = document.activeElement
    const wanted = refocus.current
    refocus.current = false
    if (!wanted && active && active !== document.body && rootRef.current?.contains(active)) return
    focusContent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, results === null])

  // Leaving the search field: Down moves to the first result, Escape clears
  // the search and goes back to the actions rather than closing the picker.
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || (event.key === 'Enter' && results?.length)) {
      event.preventDefault()
      focusContent()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      if (query) { refocus.current = true; setQuery('') } else focusContent()
    }
  }

  // LB / RB change family, LT / RT the group in it, X listens for a key, Y
  // searches (the pad reaches an open picker as `jsm:pad` events).
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onPad = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      if (button === 'LB' || button === 'RB') {
        event.preventDefault()
        refocus.current = true
        setQuery('')
        const at = families.indexOf(openFamily)
        setCategory(families[(at + (button === 'RB' ? 1 : families.length - 1)) % families.length].groups[0])
      } else if (button === 'LT' || button === 'RT') {
        // Claimed even in a one-group family, so [ and ] never fall back to
        // stepping the families (useControllerNavigation's keyboard bridge).
        event.preventDefault()
        const groups = openFamily.groups
        if (groups.length < 2) return
        refocus.current = true
        setQuery('')
        setCategory(previous => groups[(groups.indexOf(previous) + (button === 'RT' ? 1 : groups.length - 1)) % groups.length])
      } else if (button === 'X' && onCapture) {
        event.preventDefault()
        onClose(); onCapture()
      } else if (button === 'Y') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    root.addEventListener(PAD_EVENT, onPad)
    return () => root.removeEventListener(PAD_EVENT, onPad)
  })

  const choiceButton = (choice: Choice, extra?: { style?: CSSProperties; className?: string; content?: ReactNode }) => (
    <button key={choice.key} type="button" className={extra?.className ?? 'action-choice'} style={extra?.style}
      aria-disabled={choice.unavailable ? 'true' : undefined} data-reason={choice.unavailable}
      aria-pressed={command.outputValue === choice.token} data-caption={choice.unavailable ? undefined : [choice.label, choice.describe].filter(Boolean).join(' · ')}
      data-token={choice.token}
      onFocus={() => setFocused(choice)} onMouseEnter={() => { if (document.body.dataset.inputSource === 'mouse') setFocused(choice) }} onClick={() => { if (!choice.unavailable) choice.commit() }}>
      {extra?.content ?? <>{choice.icon && <BindingIconArt value={choice.icon} size={22} />}<span>{choice.label}</span></>}
      {used.has(choice.token.toUpperCase()) && command.outputValue !== choice.token && <span className="action-used" aria-label={t('pickers.alreadyInConfig', 'Already used in this configuration')} />}
    </button>
  )
  const keyButton = (key: { token: string; label?: string; width?: number }, index: number) => key.token === 'SPACER'
    ? <span key={`space-${index}`} className="key-space" style={{ flexGrow: key.width ?? 1 }} />
    : choiceButton(choices.Keyboard.find(choice => choice.token === key.token) ?? choices.Numpad.find(choice => choice.token === key.token)!, { className: 'key-cap', style: { flexGrow: key.width ?? 1 } })

  const detail = focused ?? Object.values(choices).flat().find(choice => choice.token === command.outputValue) ?? null
  const isControllerGroup = (item: Category): item is ControllerActionGroup => (CONTROLLER_ACTION_GROUPS as readonly string[]).includes(item)
  const heading = startWithSearch ? t('pickers.searchEvery', 'Search every action') : t('keymap.pickerTitle', 'Choose an action')

  return createPortal(<div className="modal-overlay action-picker-overlay" data-capture-ignore="true">
    <section ref={rootRef} className="action-picker" role="dialog" aria-modal="true" aria-labelledby={title}
      data-hints={`A:Choose;${onCapture ? 'X:Listen for a key;' : ''}Y:Search;B:Back;LB/RB:Kind${openFamily.groups.length > 1 ? ';LT/RT:Group' : ''}`}
      // The keyboard's Y, as the capsule says; the pad's Y arrives as a pad event.
      onKeyDown={event => {
        if ((event.key === 'y' || event.key === 'Y') && !event.defaultPrevented && !(event.target as HTMLElement).matches('input, textarea')) {
          event.preventDefault()
          searchRef.current?.focus()
        }
      }}>
      <header className="action-picker__header">
        <div className="action-picker__title">
          {command.physicalInput && <InputGlyph command={command.physicalInput} family={family} size={36} />}
          <div>
            <span className="action-picker__eyebrow">{inputLabel.includes(' · ') ? inputLabel : `${inputLabel} · ${activationLabel(t, command.triggerKind)}`} {t('pickers.sends', 'sends')}</span>
            <h2 id={title}>{heading}</h2>
          </div>
        </div>
        {current && <span className="action-picker__current">{t('keymap.pickerCurrent', 'Current')} <kbd className="action-pill">{current}</kbd></span>}
        <label className="action-picker__search">
          <Icon name="search" size={16} />
          {/* Out of the focus walk (Y, the keyboard's Y or a click reach it). */}
          <input ref={searchRef} type="search" tabIndex={-1} value={query} placeholder={t('pickers.pickerSearch', 'Search every action')} aria-label={t('pickers.pickerSearch', 'Search every action')}
            onChange={event => setQuery(event.target.value)} onKeyDown={onSearchKeyDown} />
        </label>
        <button type="button" className="ghost-btn" data-modal-close onClick={onClose}>{t('common.cancel', 'Cancel')}</button>
      </header>

      <nav className="action-picker__tabs" aria-label={t('pickers.kinds', 'Kinds of action')}>
        <span className="action-picker__step" aria-hidden="true"><ButtonGlyph button="LB" size={22} family={glyphFamily} /></span>
        {families.map(item => <button key={item.id} type="button" className="action-tab" data-family={item.id} aria-pressed={!results && openFamily.id === item.id} onClick={() => { setQuery(''); setCategory(item.groups.includes(category) ? category : item.groups[0]) }}>{familyName(item.id)}</button>)}
        <span className="action-picker__step" aria-hidden="true"><ButtonGlyph button="RB" size={22} family={glyphFamily} /></span>
        <span className="action-picker__spacer" />
        {onCapture && <button type="button" className="action-tab" onClick={() => { onClose(); onCapture() }}><ButtonGlyph button="X" size={20} family={glyphFamily} />{t('pickers.listen', 'Listen for a key')}</button>}
      </nav>

      {!results && openFamily.groups.length > 1 && (
        <nav className="action-picker__groups" aria-label={t('keymap.pickerGroups', '{{family}} groups', { family: familyName(openFamily.id) })}>
          <span className="action-picker__step" aria-hidden="true"><ButtonGlyph button="LT" size={20} family={glyphFamily} /></span>
          {openFamily.groups.map(item => <button key={item} type="button" className="action-group-tab" data-category={item} aria-pressed={category === item}
            onClick={() => { setQuery(''); setCategory(item) }}>{categoryName(item)}<span className="action-group-tab__count">{choices[item].length}</span></button>)}
          <span className="action-picker__step" aria-hidden="true"><ButtonGlyph button="RT" size={20} family={glyphFamily} /></span>
        </nav>
      )}

      <div className="action-picker__body">
        <div className="action-picker__content" role="region" aria-label={results ? t('keymap.pickerSearchResults', 'Search results') : t('keymap.pickerCategoryActions', '{{category}} actions', { category: categoryName(category) })}>
          {results && (results.length
            ? <div className="action-grid">{results.map(choice => choiceButton(choice))}</div>
            : <p className="action-picker-note">{t('pickers.noMatch', 'No action matches “{{query}}”. Command takes any JoyShockMapper command.', { query })}</p>)}
          {!results && category === 'Gamepad' && <>
            <p className="action-picker-note">{outputType === 'DS4' ? 'DualShock 4' : 'Xbox'}{virtualControllerType === 'NONE' ? ` · ${t('pickers.padTurnsOn', 'Turns on the virtual gamepad')}` : ''} · {t('pickers.sticksOnSticks', 'Whole sticks are on the Sticks tab')}</p>
            <div className="action-grid gamepad-actions">{getVirtualControllerOptions(outputType, t).map((option, index) => choices.Gamepad[index] && choiceButton(choices.Gamepad[index], { content: <><InputGlyph command={glyphs[option.value]} family={outputType === 'DS4' ? 'playstation' : 'xbox'} size={26} />{option.label}</> }))}</div>
          </>}
          {!results && category === 'Common' && <div className="action-grid action-grid--common">{choices.Common.map(choice => {
            const by = used.get(choice.token.toUpperCase())
            const usedBy = by && command.outputValue !== choice.token ? inputDisplayName(by, family) : ''
            return choiceButton(choice, { className: 'action-choice action-common key-cap', content: <>
              <kbd className="action-common__key">{choice.cap ?? choice.label}</kbd>
              <span className="action-common__text">
                <span className="action-common__use">{choice.describe}</span>
                {usedBy && <span className="action-common__by">{t('keymap.pickerUsedBy', '{{input}} uses it', { input: usedBy })}</span>}
              </span>
            </> })
          })}</div>}
          {!results && category === 'Mouse' && <div className="action-grid">{choices.Mouse.map(choice => choiceButton(choice))}</div>}
          {!results && category === 'Keyboard' && <div className="action-keyboard">{[...MAIN_ROWS, ...NAV_ROWS.filter(row => row.length)].map((row, i) => <div className="action-key-row" key={i}>{row.map(keyButton)}</div>)}<details><summary>{t('pickers.extraFKeys', 'Extra F-keys')}</summary><p className="action-picker-note">{t('pickers.extraFKeysNote', 'F13–F24 are free for shortcuts no game uses.')}</p>{EXTENDED_FUNCTION_ROWS.map((row, i) => <div className="action-key-row" key={i}>{row.map(keyButton)}</div>)}</details></div>}
          {!results && category === 'Numpad' && <div className="action-numpad">{NUMPAD_ROWS.map((row, i) => <div className="action-key-row" key={i}>{row.map(keyButton)}</div>)}</div>}
          {/* Volume, media and Print Screen are outputs like any other (1f). */}
          {!results && category === 'System' && <div className="action-grid action-grid--tiles">{choices.System.map(choice => choiceButton(choice, { className: 'action-choice action-tile', content: <><BindingIconArt value={choice.icon} size={20} /><span>{choice.label}</span></> }))}</div>}
          {!results && category === 'Virtual menus' && (choices['Virtual menus'].length
            ? <div className="action-grid">{choices['Virtual menus'].map(choice => choiceButton(choice))}</div>
            : <div className="action-picker-empty">
                <p className="action-picker-note">{t('pickers.menuNoneShort', 'No menus yet. Make one on the Menus tab, then choose Hold, Open, Close or Toggle here.')}</p>
                <button type="button" className="console-btn" data-hints="A:Go to Menus;B:Back"
                  onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('jsm:open-page', { detail: 'virtualMenus' })) }}>
                  <Icon name="add" size={16} />{t('pickers.makeMenu', '+ Make a menu on the Menus tab')}
                </button>
              </div>)}
          {!results && category === 'Layers' && (choices.Layers.length
            ? <>
                <p className="action-picker-note">{t('pickers.pickerLayersNote', 'Choosing a layer holds it while this input is down. The Switch layer picker makes it Toggle, Turn on or Turn off.')}</p>
                <div className="action-grid action-grid--layers">{choices.Layers.map((choice, index) => choiceButton(choice, {
                  className: 'action-choice action-layer', style: { ['--layer-hue' as string]: layerHue(layerSlot(layers, layers[index].id)) },
                  content: <><span className="action-layer__swatch" aria-hidden="true" /><span className="action-layer__name">{choice.label}</span>
                    <span className="action-layer__count">{t('keymap.layerBindingCount', { count: visibleOverrideKeys(layers[index].overrides).length, defaultValue: '{{count}} bindings' })}</span></>,
                }))}</div>
              </>
            // No layers yet (or a row whose own picker cannot add one): say so
            // where a pad user can read it, with the way to the Layers tab.
            : <div className="action-picker-empty">
                <p className="action-picker-note">{onAddLayerAction ? t('pickers.layerActionNoLayers', 'Make a layer on the Layers tab first.') : t('pickers.modeFromSheet', 'A layer switch is added from the binding sheet’s Switch layer.')}</p>
                <button type="button" className="console-btn" data-hints="A:Go to Layers;B:Back"
                  onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('jsm:open-page', { detail: 'layers' })) }}>
                  <Icon name="layer" size={16} />{t('pickers.goToLayers', 'Go to Layers')}
                </button>
              </div>)}
          {!results && isControllerGroup(category) && <div className="action-grid action-grid--jsm">{choices[category].map(choice => choiceButton(choice))}</div>}
          {!results && category === 'Configurations' && (choices.Configurations.some(choice => !choice.unavailable)
            ? <div className="action-grid">{choices.Configurations.map(choice => choiceButton(choice))}</div>
            : <>
                <p className="action-picker-note">{t('pickers.configNoneShort', 'Nothing else in your library to switch to yet. Make or import another configuration in the Library.')}</p>
                <div className="action-grid">{choices.Configurations.map(choice => choiceButton(choice))}</div>
              </>)}
          {!results && category === 'Custom' && <CustomAction command={command} onPick={pick} />}
        </div>
        <aside className="picker-detail" aria-live="polite">
          <span className="picker-detail__eyebrow">{focused ? t('pickers.selected', 'Selected') : t('keymap.pickerCurrent', 'Current')}</span>
          {detail ? <>
            <div className="picker-detail__name" data-kind={detail.kind}><strong>{detail.icon && <BindingIconArt value={detail.icon} size={22} />}{detail.label}</strong><p>{detail.unavailable ?? detail.describe}</p></div>
            <span className="picker-detail__note">{used.has(detail.token.toUpperCase()) && detail.token !== command.outputValue
              ? t('pickers.boundElsewhere', 'Already bound elsewhere in this configuration; choosing it keeps both.')
              : t('pickers.dotNote', 'A key another button sends says so; choosing it keeps both.')}</span>
            {category === 'Custom' && <span className="picker-detail__raw">{t('pickers.rawToken', 'Raw token')} <code>{detail.token}</code></span>}
          </> : <span className="picker-detail__note">{t('pickers.moveToSee', 'Move to an action to see what it sends.')}</span>}
        </aside>
      </div>
    </section>
  </div>, document.body)
}

type CustomKind = 'raw' | 'command'

/**
 * The Command family: a console command or a raw JoyShockMapper binding,
 * typed. (The full-screen Command picker has its own keyboard; this is the
 * compact form Search every action keeps. Haptic pulse moved to Controller
 * action ▸ Rumble & sound.)
 */
function CustomAction({ command, onPick }: { command: BindingCommand; onPick: (kind: BindingOutputKind, value: string) => void }) {
  const { t } = useTranslation()
  const initial: CustomKind = command.outputKind === 'command' ? 'command' : 'raw'
  const [kind, setKind] = useState<CustomKind>(initial)
  const [text, setText] = useState(command.outputKind === 'raw' || command.outputKind === 'command' ? command.outputValue : '')
  const kinds: Array<[CustomKind, string]> = [['command', t('pickers.customCommand', 'Command')], ['raw', t('pickers.customRaw', 'Raw binding')]]
  return (
    <div className="action-custom">
      <div className="segmented" role="radiogroup" aria-label={t('pickers.customKind', 'Send it as')} data-hints="MOVE:Choose;A:Select;B:Back">
        {kinds.map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={kind === value} onClick={() => setKind(value)}>{label}</button>)}
      </div>
      <input className="text-field action-custom__field" type="text" value={text} spellCheck={false} data-capture-ignore="true"
        aria-label={kind === 'raw' ? t('pickers.customRaw', 'Raw binding') : t('pickers.customCommand', 'Command')}
        placeholder={kind === 'raw' ? t('pickers.customRawPlaceholder', 'Any JoyShockMapper binding, e.g. LCONTROL\\ C\\') : t('keymap.advancedCommandPlaceholder')}
        onChange={event => setText(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && text.trim()) { event.preventDefault(); onPick(kind, text.trim()) } }} />
      <button type="button" className="console-btn console-btn--primary" aria-disabled={!text.trim() ? 'true' : undefined} data-reason={!text.trim() ? t('pickers.typeFirst', 'Type a command first') : undefined}
        onClick={() => { if (text.trim()) onPick(kind, text.trim()) }} data-hints="A:Use;B:Back">
        {t('keymap.customUse', 'Use')}
      </button>
    </div>
  )
}

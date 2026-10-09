import type { TFunction } from 'i18next'
import type { ReactNode } from 'react'
import type { IconName } from '../../icons/Icon'
import type { BindingCommand, BindingCommandPatch, BindingCommandPreset, BindingTriggerKind } from '../../../utils/bindingCommands'
import type { ActionPickerProps } from '../ActionPicker'
import type { SendKind } from '../pickers/KindPicker'
import type { ControllerVisualFamily } from '../../../utils/controllerStatus'
import type { InputModeshiftsProps } from '../InputModeshifts'
import type { ButtonDefinition } from '../../../keymap/schema'
import { parseMenuCommand } from '../../../utils/menuCommands'
import { parseCycleBinding } from '../../../utils/cycleBinding'
import { parsePlaySound } from '../../../utils/controllerSounds'
import { parseHapticBinding } from '../../../utils/hapticBindings'
import { parseRumbleBinding } from '../../../utils/bindingParameters'

// The binding sheet's model (console v2, BindingSheet / BindingMore): what each
// way of pressing an input ("When you…") sends, and which of the eight "sends"
// kinds that is. The card (ButtonBindingsCard) owns every write; the sheet,
// More, While holding, Fine-tune and Details only read this and call it.

/** The five tiles of "When you…"; the rare four sit behind More. */
export type CommonActivation = 'regular' | 'tap' | 'hold' | 'double'
export type RareActivation = 'release' | 'turbo' | 'simultaneous' | 'diagonal'
export type Activation = CommonActivation | RareActivation

export const COMMON_ACTIVATIONS: CommonActivation[] = ['regular', 'tap', 'hold', 'double']
export const RARE_ACTIVATIONS: RareActivation[] = ['release', 'turbo', 'simultaneous', 'diagonal']
export const isRare = (kind: string): kind is RareActivation => (RARE_ACTIVATIONS as string[]).includes(kind)

/** The selected activation: a kind, and for a pair (Press together with…,
 *  Stick diagonal) the other input, since one input can have several. */
export type ActivationRef = { kind: Activation; with?: string }
export const sameActivation = (a: ActivationRef, b: ActivationRef) => a.kind === b.kind && (a.with ?? '') === (b.with ?? '')

/** Console v2 names (D21): Double-tap, Let go, Press together with…, Stick diagonal. */
export const ACTIVATION_LABELS: Record<Activation | 'chord' | 'stickShift', [key: string, fallback: string]> = {
  regular: ['keymap.commandTriggerRegular', 'Press'],
  tap: ['keymap.commandTriggerTap', 'Tap'],
  hold: ['keymap.commandTriggerHold', 'Hold'],
  double: ['keymap.commandTriggerDouble', 'Double-tap'],
  release: ['keymap.commandTriggerRelease', 'Let go'],
  turbo: ['keymap.commandTriggerTurbo', 'Turbo'],
  simultaneous: ['keymap.commandTriggerSimultaneous', 'Press together with…'],
  diagonal: ['keymap.commandTriggerDiagonal', 'Stick diagonal'],
  chord: ['keymap.commandTriggerChord', 'Chord'],
  stickShift: ['keymap.stickModeShifts', 'Stick mode shift'],
}
export const activationLabel = (kind: keyof typeof ACTIVATION_LABELS, t: TFunction) => t(ACTIVATION_LABELS[kind][0], ACTIVATION_LABELS[kind][1])

/**
 * Which activation a command answers. A stick change while held and a light
 * while held (a command of its own, next to what the button sends) act for as
 * long as the input is down, so they read as part of Press; a profile activation (GYRO_OFF = A) does too. Chords are While
 * holding's, not an activation here.
 */
export function activationOf(command: BindingCommand): ActivationRef | null {
  if (command.triggerKind === 'chord') return null
  if (command.triggerKind === 'stickShift' || command.source.kind === 'special' || command.source.kind === 'heldLed') return { kind: 'regular' }
  // A mode switch happens on press (or on let go, "!X"), whatever it does to the mode.
  if (command.source.kind === 'layerAction') return { kind: command.source.action.input.startsWith('!') ? 'release' : 'regular' }
  if (command.triggerKind === 'simultaneous' || command.triggerKind === 'diagonal') return { kind: command.triggerKind, with: command.conditionInput ?? '' }
  return { kind: command.triggerKind as Activation }
}

export const commandsFor = (commands: BindingCommand[], activation: ActivationRef) =>
  commands.filter(command => { const of = activationOf(command); return of !== null && sameActivation(of, activation) })

/** The eight "sends" kinds a command belongs to (pickers/KindPicker SEND_KINDS). */
export function sendKindOf(command: BindingCommand): SendKind {
  const value = command.outputValue
  if (command.source.kind === 'layerAction') return 'mode'
  if (command.source.kind === 'heldLed' || command.source.kind === 'special' || command.triggerKind === 'stickShift') return 'controller'
  if (parseMenuCommand(value)) return 'menu'
  switch (command.outputKind) {
    case 'keyboard': return 'key'
    case 'mouse': case 'wheel': return 'mouse'
    case 'virtualController': return 'gamepad'
    case 'loadConfig': return 'config'
    case 'special': case 'gyroAction': case 'haptic': return 'controller'
    case 'raw': return 'command'
    case 'command':
      return parseCycleBinding(value) || parsePlaySound(value) || /^"?\s*(LIGHT_BAR|LED_BRIGHTNESS)\s*=/i.test(value) || /^(CALIBRATE|GYRO_|SET_MOTION|RESET_|RECONNECT|TURN_OFF)/i.test(value.trim()) ? 'controller' : 'command'
    default: return 'command'
  }
}

/** "Choose key", "Choose mouse"…: what A on a kind (or a filled tile) does. */
export const CHOOSE_LABEL: Record<SendKind, [string, string]> = {
  key: ['bind.chooseKey', 'Choose key'],
  mouse: ['bind.chooseMouse', 'Choose click'],
  gamepad: ['bind.chooseGamepad', 'Choose button'],
  menu: ['bind.chooseMenu', 'Choose menu'],
  mode: ['bind.chooseMode', 'Choose layer'],
  controller: ['bind.chooseAction', 'Choose action'],
  config: ['bind.chooseConfig', 'Choose configuration'],
  command: ['bind.chooseCommand', 'Type command'],
}

/** Behaviour options a command can take (Fine-tune "How Space is sent"). */
export function behaviourLimits(command: BindingCommand | undefined): { allowed: Set<BindingCommand['outputBehavior']>; reason?: string } {
  const all = new Set<BindingCommand['outputBehavior']>(['normal', 'tapOnce', 'toggle', 'releaseOnly'])
  if (!command) return { allowed: new Set(), reason: 'Choose what it sends first' }
  if (command.source.kind !== 'row' || command.triggerKind === 'stickShift') return { allowed: new Set(), reason: 'This one is a setting, not a key: it has no other way of being sent' }
  if (/^"?\s*(LIGHT_BAR|LED_BRIGHTNESS)\s*=/i.test(command.outputValue)) return { allowed: new Set(['normal']), reason: 'A light change is sent once' }
  if (parseMenuCommand(command.outputValue)) return { allowed: new Set(['normal']), reason: 'A menu opens the way its own How says' }
  if (parseCycleBinding(command.outputValue)) return { allowed: new Set(['normal', 'tapOnce']), reason: 'A cycle sends each step once' }
  return { allowed: all }
}

/** What "Only for some actions" can show for a command (BindingFineTune). */
export const commandParameters = (command: BindingCommand | undefined) => ({
  cycle: command ? parseCycleBinding(command.outputValue) : null,
  haptic: command ? parseHapticBinding(command.outputValue) : null,
  rumble: command ? parseRumbleBinding(command.outputValue) : null,
  sound: command && command.outputKind === 'command' ? parsePlaySound(command.outputValue) : null,
})

/** Everything the sheet and its pages need from the card. */
export type BindingApi = {
  button: ButtonDefinition
  /** The input's command, or a shifted card's `TRIGGER,INPUT`. */
  command: string
  shortName: string
  longName: string
  family: ControllerVisualFamily
  glyph: ReactNode
  /** Every command the input has, the fixed rows included. */
  commands: BindingCommand[]
  /** The input-level name ("Jump"), shown as the sheet's title. */
  label?: string
  onRename?: (value: string) => void
  /** A menu item (a pad region or wheel segment): its icon and the label on the menu. */
  menuItem?: { icon: ReactNode; identity: ReactNode }
  /** The base props every picker gets (KindPicker / ActionPicker). */
  pickerProps: Omit<ActionPickerProps, 'command' | 'onSelect' | 'onClose' | 'inputLabel'>
  /** A new command on an activation. */
  /** `replace`: a command on the same line the new one takes the place of (a key combo replacing a key). */
  add: (activation: ActivationRef, patch: BindingCommandPatch, extra?: Partial<BindingCommandPreset>, replace?: BindingCommand | null) => void
  update: (command: BindingCommand, patch: BindingCommandPatch) => void
  remove: (command: BindingCommand) => void
  /** Several at once, written as one change per config line. */
  clear: (commands: BindingCommand[]) => void
  duplicate: (command: BindingCommand) => void
  /** Copy to the shared clipboard (utils/bindingClipboard). */
  copy?: (commands: BindingCommand[]) => void
  paste?: () => void
  canPaste: boolean
  pasteLabel: string
  /** A command's own name (Fine-tune ▸ Y Rename). */
  nameOf: (command: BindingCommand) => string | undefined
  setName?: (command: BindingCommand, value: string) => void
  /** Listen for a key: the KeyPicker's X (captures into a command, or a new one). */
  capture: (command: BindingCommand | null, activation: ActivationRef) => void
  isCapturing: boolean
  /** The light while held: a command of its own in the sends list (set in the Controller action picker). */
  heldLed?: {
    color: string | null
    brightness: number | null
    defaultColor: string
    baseBrightness: number
    setColor: (color: string | null) => void
    setBrightness: (brightness: number | null) => void
  }
  /** A stick's mode while this input is held (Controller action ▸ Change a stick while held). */
  setStickShift?: (target: 'LEFT' | 'RIGHT', mode?: string) => void
  /** Inputs a pair activation can be made with. */
  modifierOptions: { value: string; label: string; disabled?: boolean }[]
  /** Chords are this input's While holding (InputModeshiftPanel). */
  modeshifts?: Omit<InputModeshiftsProps, 'target' | 'initiallyOpen' | 'livePad'>
  /** Trackball decay, when an output uses the trackball. */
  trackball?: { value: string; onChange: (value: string) => void }
  /** A shifted card edits `TRIGGER,INPUT`: no While holding of its own. */
  shifted: boolean
  /** X on the row instead of Hold & double-tap ("Test segment"). */
  xAction?: { label: string; run: () => void }
  /** What an unbound row says ("Analog passthrough · Xbox LT"). */
  emptyLabel?: string
}

export const KIND_ICONS: Record<SendKind, IconName> = {
  key: 'catKeyboard', mouse: 'catMouse', gamepad: 'catGamepad', menu: 'menuLayout', mode: 'layers', controller: 'catJsm', config: 'catConfig', command: 'command',
}

/** Rename's suggestions, from what the input sends ("Space" → "Jump"). */
const WORDS: Record<string, string[]> = {
  space: ['Jump'], 'left ctrl': ['Crouch'], c: ['Crouch'], r: ['Reload'], f: ['Use', 'Interact'], e: ['Use', 'Interact'], q: ['Ability'],
  'left shift': ['Sprint'], tab: ['Inventory', 'Scoreboard'], escape: ['Pause'], m: ['Map'], g: ['Grenade'], v: ['Melee'],
  'left click': ['Fire', 'Shoot'], 'right click': ['Aim'], 'middle click': ['Ping'], 'scroll up': ['Next weapon'], 'scroll down': ['Previous weapon'],
}
export function nameSuggestions(outputs: string[]) {
  const words = outputs.flatMap(output => WORDS[output.toLowerCase()] ?? [])
  return [...new Set([...words, ...outputs.filter(Boolean)])].slice(0, 6)
}

export type { BindingTriggerKind }

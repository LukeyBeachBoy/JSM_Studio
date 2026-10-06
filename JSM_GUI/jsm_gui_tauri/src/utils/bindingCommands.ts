import { parseMenuCommand } from './menuCommands'
import { isLoadConfigBindingValue } from './loadConfigBinding'
import {
  explicitBindingTokens,
  BindingActionModifier,
  BindingEventModifier,
  BindingExpression,
  BindingSlot,
  BindingToken,
  BindingTokenKind,
  ButtonBindingRow,
  StickModeShiftAssignment,
  createBindingExpression,
  createBindingToken,
  parseBindingExpression,
  serializeBindingExpression,
  serializeBindingToken,
  updateBindingExpressionToken,
} from './keymap'
import {
  getVirtualControllerLogicalOutput,
  isVirtualControllerToken,
  type VirtualControllerLogicalOutput,
} from './virtualController'
import { isHapticBindingValue } from './hapticBindings'
import type { LayerAction } from './layers'
import { isReleasedInput } from './released'

export type BindingTriggerKind =
  | 'regular'
  | 'tap'
  | 'hold'
  | 'double'
  | 'release'
  | 'turbo'
  | 'chord'
  | 'simultaneous'
  | 'diagonal'
  | 'stickShift'

export type BindingOutputKind =
  | 'keyboard'
  | 'mouse'
  | 'wheel'
  | 'special'
  /** A queued native gyro override, distinct from a profile activation condition. */
  | 'gyroAction'
  | 'command'
  /** A console command that loads another configuration; see loadConfigBinding. */
  | 'loadConfig'
  | 'raw'
  | 'virtualController'
  | 'haptic'
  /** The LED while this input is held: the chorded LIGHT_BAR / LED_BRIGHTNESS settings (TODO-54). */
  | 'heldLed'
  /** A layer action annotation on this input (TODO-55). */
  | 'layerAction'
export type BindingOutputBehavior = 'normal' | 'tapOnce' | 'toggle' | 'releaseOnly'

/** What the light does while the input is down; null leaves the profile's value. */
export type HeldLed = { color: string | null; brightness: number | null }

export type BindingCommandSource =
  | {
      kind: 'row'
      slot: BindingSlot
      rowId: string
      writeMode: 'slot' | 'line'
      modifierCommand?: string
      expression: BindingExpression | null
      tokenIndex: number
      ledBrightnessTokenIndex?: number
      lineValue: string
      isManual: boolean
    }
  | {
      kind: 'special'
      specialKey: string
    }
  | {
      kind: 'stickShift'
      target: 'LEFT' | 'RIGHT'
      mode: string
    }
  // Two rows that are not tokens of a binding line: the settings and the
  // annotation stay in the file exactly as they were, so older configurations
  // and the layer runtime read them unchanged; only the card shows them as
  // commands. Neither can move to another line or be paired with a tap/hold.
  | {
      kind: 'heldLed'
      color: string | null
      brightness: number | null
    }
  | {
      kind: 'layerAction'
      action: LayerAction
    }

export type BindingCommand = {
  id: string
  physicalInput: string
  triggerKind: BindingTriggerKind
  outputKind: BindingOutputKind
  outputValue: string
  virtualControllerLogicalOutput?: VirtualControllerLogicalOutput
  outputBehavior: BindingOutputBehavior
  turboIntervalMs?: number | null
  ledBrightness?: number | null
  conditionInput?: string
  tokens: BindingToken[]
  sourceLine: string
  isRoundTripSafe: boolean
  source: BindingCommandSource
}

export type BindingCommandPatch = Partial<
  Pick<
    BindingCommand,
    'triggerKind' | 'outputKind' | 'outputValue' | 'virtualControllerLogicalOutput' | 'outputBehavior' | 'conditionInput' | 'turboIntervalMs'
  >
> & {
  ledBrightness?: number | null
  /** Switch the controller light between a lasting press and a temporary hold. */
  ledActivation?: 'press' | 'hold'
  /** For an LED-while-held row: the colour or the brightness; null clears one. */
  heldLed?: Partial<HeldLed>
  /** For a layer-action row: the layer, the verb, or the input ("!X" = on release). */
  layerAction?: Partial<LayerAction>
}

/** Names belong to outputs, not their physical input. The ordinal distinguishes
 * repeated outputs; changing activation does not change a command's identity. */
export function commandNameKey(command: BindingCommand, siblings: BindingCommand[] = [], input = command.physicalInput) {
  const identity = command.source.kind === 'heldLed'
    ? 'LED' : command.source.kind === 'layerAction' ? `LAYER:${command.source.action.layerId}` : `${command.sourceLine}:${command.outputValue}`
  const ordinal = siblings.slice(0, siblings.indexOf(command)).filter(other => other.sourceLine === command.sourceLine && other.outputValue === command.outputValue).length
  return `${input}::${encodeURIComponent(identity)}::${ordinal}`.toUpperCase()
}

/** A row that is a setting or an annotation rather than a token: it cannot be
 *  retargeted, duplicated, copied or captured into. */
export const isFixedCommand = (command: BindingCommand) =>
  command.source.kind === 'heldLed' || command.source.kind === 'layerAction'

/** How a layer action's row reads on its chip: a hold is a Hold, the rest a
 *  Press, and "!X" (utils/released.ts) happens on Release. */
export const layerActionTrigger = (action: LayerAction): BindingTriggerKind =>
  isReleasedInput(action.input) ? 'release' : action.verb === 'hold' ? 'hold' : 'regular'

export const HELD_LED_COMMAND_SUFFIX = 'held-led'
export const heldLedCommandId = (physicalInput: string) => `${physicalInput}-${HELD_LED_COMMAND_SUFFIX}`
/** Stable across the verb and the layer: what the sheet keeps open while both
 *  change. A press and a release action on the same layer are told apart. */
export const layerActionCommandId = (physicalInput: string, action: LayerAction, siblings: LayerAction[] = []) => {
  const released = isReleasedInput(action.input)
  const twin = released && siblings.some(other => other !== action && other.layerId === action.layerId && !isReleasedInput(other.input))
  return `${physicalInput}-layer-${action.layerId}${twin ? '-release' : ''}`
}

export type BindingCommandPreset = Pick<
  BindingCommand,
  'triggerKind' | 'outputKind' | 'outputValue' | 'outputBehavior' | 'conditionInput' | 'ledBrightness' | 'turboIntervalMs'
>

const TRIGGER_KINDS = new Set<BindingTriggerKind>([
  'regular',
  'tap',
  'hold',
  'double',
  'release',
  'turbo',
  'chord',
  'simultaneous',
  'diagonal',
  'stickShift',
])

const OUTPUT_KINDS = new Set<BindingOutputKind>([
  'keyboard',
  'mouse',
  'wheel',
  'special',
  'gyroAction',
  'command',
  'loadConfig',
  'raw',
  'virtualController',
  'haptic',
  'heldLed',
  'layerAction',
])
const OUTPUT_BEHAVIORS = new Set<BindingOutputBehavior>(['normal', 'tapOnce', 'toggle', 'releaseOnly'])
const MOUSE_OUTPUT_VALUES = new Set(['LMOUSE', 'MMOUSE', 'RMOUSE', 'BMOUSE', 'FMOUSE'])
const WHEEL_OUTPUT_VALUES = new Set(['SCROLLUP', 'SCROLLDOWN'])

export const isQueuedGyroAction = (value: string) => /^(GYRO_ON|GYRO_OFF)$/.test(value.trim().toUpperCase())

export const inferOutputKindFromBindingValue = (value: string): BindingOutputKind => {
  const normalized = value.trim().toUpperCase()
  if (isQueuedGyroAction(normalized)) return 'gyroAction'
  if (MOUSE_OUTPUT_VALUES.has(normalized)) return 'mouse'
  if (WHEEL_OUTPUT_VALUES.has(normalized)) return 'wheel'
  if (isVirtualControllerToken(normalized)) return 'virtualController'
  if (isHapticBindingValue(normalized)) return 'haptic'
  return 'keyboard'
}

const EVENT_TO_TRIGGER: Record<BindingEventModifier, BindingTriggerKind | undefined> = {
  '': undefined,
  '\\': 'regular',
  '/': 'release',
  "'": 'tap',
  _: 'hold',
  '+': 'turbo',
}

const TRIGGER_TO_EVENT: Partial<Record<BindingTriggerKind, BindingEventModifier>> = {
  regular: '',
  tap: "'",
  hold: '_',
  release: '/',
  turbo: '+',
}

const ACTION_TO_BEHAVIOR: Record<BindingActionModifier, BindingOutputBehavior> = {
  '': 'normal',
  '!': 'tapOnce',
  '^': 'toggle',
  '-': 'releaseOnly',
}

const BEHAVIOR_TO_ACTION: Record<BindingOutputBehavior, BindingActionModifier> = {
  normal: '',
  tapOnce: '!',
  toggle: '^',
  releaseOnly: '-',
}

const COMBO_SEPARATOR_BY_TRIGGER: Partial<Record<BindingTriggerKind, string>> = {
  chord: ',',
  simultaneous: '+',
  diagonal: '*',
}

const triggerFromSlot = (slot: BindingSlot): BindingTriggerKind => {
  switch (slot) {
    case 'hold':
      return 'hold'
    case 'double':
      return 'double'
    case 'chord':
    case 'simultaneous':
    case 'diagonal':
      return slot
    case 'tap':
    default:
      return 'regular'
  }
}

const outputKindFromToken = (token: BindingToken): BindingOutputKind => {
  switch (token.kind) {
    case 'mouse':
      return 'mouse'
    case 'wheel':
      return 'wheel'
    case 'special':
      return isQueuedGyroAction(token.value) ? 'gyroAction' : 'special'
    case 'console_command':
      // Loading a configuration is a console command like any other; it is
      // only told apart so the editor can offer the configurations by name.
      return isLoadConfigBindingValue(token.value) ? 'loadConfig' : 'command'
    case 'raw_literal':
      return 'raw'
    case 'input':
    default:
      if (isVirtualControllerToken(token.value)) return 'virtualController'
      return isHapticBindingValue(token.value) ? 'haptic' : 'keyboard'
  }
}

const tokenKindFromOutput = (kind: BindingOutputKind): BindingTokenKind => {
  switch (kind) {
    case 'mouse':
      return 'mouse'
    case 'wheel':
      return 'wheel'
    case 'special':
    case 'gyroAction':
      return 'special'
    case 'command':
    case 'loadConfig':
      return 'console_command'
    case 'raw':
      return 'raw_literal'
    case 'virtualController':
    case 'haptic':
    case 'keyboard':
    default:
      return 'input'
  }
}

const defaultFallbackTrigger = (row: ButtonBindingRow, tokenIndex: number, tokenCount: number): BindingTriggerKind => {
  if (row.slot !== 'tap') return triggerFromSlot(row.slot)
  if (tokenCount === 2) return tokenIndex === 0 ? 'tap' : 'hold'
  return 'regular'
}

const tokenToCommandTrigger = (token: BindingToken, row: ButtonBindingRow, tokenIndex: number, tokenCount: number) =>
  EVENT_TO_TRIGGER[token.eventModifier] ?? defaultFallbackTrigger(row, tokenIndex, tokenCount)

const sourceLineForRow = (button: string, row: ButtonBindingRow) => {
  if (row.slot === 'double') return `${button},${button}`
  if ((row.slot === 'chord' || row.slot === 'simultaneous' || row.slot === 'diagonal') && row.modifierCommand) {
    return `${row.modifierCommand}${COMBO_SEPARATOR_BY_TRIGGER[row.slot]}${button}`
  }
  return button
}

const rowExpressionForCommands = (row: ButtonBindingRow) => {
  if (row.writeMode === 'line' && row.expression) return row.expression
  if (row.editorMode === 'advanced' && row.expression) return row.expression
  if (row.binding) return parseBindingExpression(row.binding)
  return null
}

const rowTokensForCommands = (row: ButtonBindingRow) => {
  const expression = rowExpressionForCommands(row)
  if (!expression) return []
  if (expression === row.expression && row.writeMode === 'line') return expression.tokens
  return expression.tokens.slice(0, 1)
}

const manualTriggerKind = (row: ButtonBindingRow): BindingTriggerKind => {
  const candidate = row.manualTriggerKind
  return candidate && TRIGGER_KINDS.has(candidate as BindingTriggerKind)
    ? (candidate as BindingTriggerKind)
    : triggerFromSlot(row.slot)
}

const manualOutputKind = (row: ButtonBindingRow): BindingOutputKind => {
  const candidate = row.manualOutputKind
  return candidate && OUTPUT_KINDS.has(candidate as BindingOutputKind) ? (candidate as BindingOutputKind) : 'keyboard'
}

const manualOutputBehavior = (row: ButtonBindingRow): BindingOutputBehavior => {
  const candidate = row.manualOutputBehavior
  return candidate && OUTPUT_BEHAVIORS.has(candidate as BindingOutputBehavior)
    ? (candidate as BindingOutputBehavior)
    : 'normal'
}

function manualRowToCommand(row: ButtonBindingRow, physicalInput: string): BindingCommand {
  const outputKind = manualOutputKind(row)
  return {
    // Same shape as the first token's id for this row (a row is either drafted
    // or parsed into tokens, never both), so clearing a written binding back to
    // a draft keeps the card mounted and the caret in the field.
    id: `${physicalInput}-${row.id}-0`,
    physicalInput,
    triggerKind: manualTriggerKind(row),
    outputKind,
    outputValue: row.manualOutputValue ?? '',
    virtualControllerLogicalOutput:
      outputKind === 'virtualController' ? getVirtualControllerLogicalOutput(row.manualOutputValue ?? '') ?? undefined : undefined,
    outputBehavior: manualOutputBehavior(row),
    conditionInput: row.modifierCommand,
    tokens: [],
    sourceLine: sourceLineForRow(physicalInput, row),
    isRoundTripSafe: outputKind !== 'raw',
    source: {
      kind: 'row',
      slot: row.slot,
      rowId: row.id,
      writeMode: row.writeMode,
      modifierCommand: row.modifierCommand,
      expression: null,
      tokenIndex: 0,
      lineValue: '',
      isManual: true,
    },
  }
}

export function bindingTokenToCommand(
  token: BindingToken,
  context: {
    physicalInput: string
    row: ButtonBindingRow
    expression: BindingExpression | null
    tokenIndex: number
    tokenCount: number
  }
): BindingCommand {
  const sourceLine = sourceLineForRow(context.physicalInput, context.row)
  const triggerKind = tokenToCommandTrigger(token, context.row, context.tokenIndex, context.tokenCount)
  const outputKind = outputKindFromToken(token)
  const lineValue = context.expression ? serializeBindingExpression(context.expression) : serializeBindingToken(token)
  return {
    id: `${context.physicalInput}-${context.row.id}-${context.tokenIndex}`,
    physicalInput: context.physicalInput,
    triggerKind,
    outputKind,
    outputValue: token.value,
    virtualControllerLogicalOutput:
      outputKind === 'virtualController' ? getVirtualControllerLogicalOutput(token.value) ?? undefined : undefined,
    outputBehavior: ACTION_TO_BEHAVIOR[token.actionModifier],
    turboIntervalMs: token.turboIntervalMs,
    conditionInput: context.row.modifierCommand,
    tokens: [token],
    sourceLine,
    isRoundTripSafe: outputKind !== 'raw',
    source: {
      kind: 'row',
      slot: context.row.slot,
      rowId: context.row.id,
      writeMode: context.row.writeMode,
      modifierCommand: context.row.modifierCommand,
      expression: context.expression,
      tokenIndex: context.tokenIndex,
      lineValue,
      isManual: context.row.isManual,
    },
  }
}

export function bindingCommandToToken(command: BindingCommandPreset, fallback?: BindingToken): BindingToken {
  const kind = tokenKindFromOutput(command.outputKind)
  const eventModifier = TRIGGER_TO_EVENT[command.triggerKind] ?? fallback?.eventModifier ?? ''
  return {
    kind,
    value: command.outputValue || createBindingToken(kind).value,
    raw: '',
    actionModifier: parseMenuCommand(command.outputValue) ? '' : BEHAVIOR_TO_ACTION[command.outputBehavior],
    eventModifier,
    turboIntervalMs: command.triggerKind === 'turbo' ? command.turboIntervalMs : undefined,
  }
}

export function commandTokenPreview(command: BindingCommand | BindingCommandPreset) {
  return serializeBindingToken(bindingCommandToToken(command, 'tokens' in command ? command.tokens[0] : undefined))
}

export function commandLinePreview(command: BindingCommand) {
  if (command.source.kind === 'special') return `${command.source.specialKey} = ${command.physicalInput}`
  if (command.source.kind === 'stickShift') return `${command.physicalInput},${command.source.target}_STICK_MODE = ${command.source.mode}`
  if (command.source.kind === 'heldLed') {
    const { color, brightness } = command.source
    return [
      color ? `${command.physicalInput},LIGHT_BAR = x${color.replace(/^#/, '')}` : null,
      brightness !== null ? `${command.physicalInput},LED_BRIGHTNESS = ${brightness}` : null,
    ].filter(Boolean).join('\n')
  }
  if (command.source.kind === 'layerAction') {
    const { input, verb, layerId } = command.source.action
    return `# @layer-action ${input} = ${verb} ${layerId}`
  }
  if (command.source.writeMode === 'line') return `${command.sourceLine} = ${command.source.lineValue}`
  return `${command.sourceLine} = ${commandTokenPreview(command)}`
}

export function updateCommandExpression(command: BindingCommand, patch: BindingCommandPatch) {
  if (command.source.kind !== 'row') return null
  const nextCommand = { ...command, ...patch }
  const nextToken = bindingCommandToToken(nextCommand, command.tokens[0])
  // A change to the output or its behaviour keeps how the token fires. The
  // second Press of `SPACE\ J\` carries an explicit `\`; rebuilt from its kind
  // alone it would lose it and read as the hold of a tap-and-hold pair.
  if (command.tokens[0] && (!patch.triggerKind || patch.triggerKind === command.triggerKind)) {
    nextToken.eventModifier = command.tokens[0].eventModifier
  }
  const expression =
    command.source.writeMode === 'line'
      ? command.source.expression ?? createBindingExpression(command.tokens)
      : createBindingExpression([command.tokens[0] ?? createBindingToken()])
  const index = command.source.writeMode === 'line' ? command.source.tokenIndex : 0
  const updated = updateBindingExpressionToken(expression, index, nextToken)
  if ('ledBrightness' in patch) {
    const tokens = explicitBindingTokens(updated.tokens)
    const brightnessIndex = command.source.ledBrightnessTokenIndex
    if (brightnessIndex !== undefined) tokens.splice(brightnessIndex, 1)
    if (patch.ledBrightness !== null && patch.ledBrightness !== undefined) {
      tokens.splice(index + 1, 0, { ...tokens[index], value: `LED_BRIGHTNESS = ${patch.ledBrightness}`, raw: '' })
    }
    return createBindingExpression(tokens)
  }
  return updated
}

export function parseRowsToCommands(
  rows: ButtonBindingRow[],
  physicalInput: string,
  options: {
    specialKey?: string
    stickShiftAssignments?: StickModeShiftAssignment[]
    /** The chorded LIGHT_BAR / LED_BRIGHTNESS of this input: one row when either is set. */
    heldLed?: HeldLed | null
    /** This input's layer-action annotations, pressed ("X") and released ("!X"): one row each. */
    layerActions?: LayerAction[]
  } = {}
) {
  const commands: BindingCommand[] = []
  rows.forEach(row => {
    const expression = rowExpressionForCommands(row)
    const tokens = rowTokensForCommands(row)
    if (tokens.length === 0 && row.isManual) {
      commands.push(manualRowToCommand(row, physicalInput))
      return
    }
    tokens.forEach((token, index) => {
      const previous = tokens[index - 1]
      const paired = row.writeMode === 'line' && previous && /^LIGHT_BAR\s*=/i.test(previous.value) && /^LED_BRIGHTNESS\s*=\s*\d+$/i.test(token.value)
        && previous.eventModifier === token.eventModifier && previous.actionModifier === token.actionModifier
      if (paired) return
      const next = tokens[index + 1]
      const brightness = row.writeMode === 'line' && /^LIGHT_BAR\s*=/i.test(token.value) && next
        && next.eventModifier === token.eventModifier && next.actionModifier === token.actionModifier
        ? /^LED_BRIGHTNESS\s*=\s*(\d+)$/i.exec(next.value) : null
      commands.push(
        bindingTokenToCommand(token, {
          physicalInput,
          row,
          expression,
          tokenIndex: index,
          // The tap row of a tap-and-hold pair (`R E`) holds its own token
          // only, but its meaning comes from the whole line: the first of
          // two is a tap, not a press.
          tokenCount: row.writeMode === 'slot' && row.slot === 'tap' && row.expression ? row.expression.tokens.length : expression?.tokens.length ?? tokens.length,
        })
      )
      if (brightness) {
        const command = commands[commands.length - 1]
        command.ledBrightness = Number(brightness[1])
        if (command.source.kind === 'row') command.source.ledBrightnessTokenIndex = index + 1
      }
    })
  })

  if (options.specialKey) {
    commands.push({
      id: `${physicalInput}-special-${options.specialKey}`,
      physicalInput,
      triggerKind: 'regular',
      outputKind: 'special',
      outputValue: options.specialKey,
      outputBehavior: 'normal',
      tokens: [],
      sourceLine: options.specialKey,
      isRoundTripSafe: true,
      source: { kind: 'special', specialKey: options.specialKey },
    })
  }

  options.stickShiftAssignments?.forEach(assignment => {
    commands.push({
      id: `${physicalInput}-stick-shift-${assignment.target}-${assignment.mode}`,
      physicalInput,
      triggerKind: 'stickShift',
      outputKind: 'special',
      outputValue: `STICK_SHIFT:${assignment.target}:${assignment.mode}`,
      outputBehavior: 'normal',
      conditionInput: assignment.target,
      tokens: [],
      sourceLine: `${physicalInput},${assignment.target}_STICK_MODE`,
      isRoundTripSafe: true,
      source: { kind: 'stickShift', target: assignment.target, mode: assignment.mode },
    })
  })

  const heldLed = options.heldLed
  if (heldLed && (heldLed.color || heldLed.brightness !== null)) {
    commands.push({
      id: heldLedCommandId(physicalInput),
      physicalInput,
      triggerKind: 'hold',
      outputKind: 'heldLed',
      outputValue: [heldLed.color, heldLed.brightness !== null ? `${heldLed.brightness}%` : null].filter(Boolean).join(' '),
      outputBehavior: 'normal',
      tokens: [],
      sourceLine: `${physicalInput},LIGHT_BAR`,
      isRoundTripSafe: true,
      source: { kind: 'heldLed', color: heldLed.color, brightness: heldLed.brightness },
    })
  }

  options.layerActions?.forEach(action => {
    commands.push({
      id: layerActionCommandId(physicalInput, action, options.layerActions),
      physicalInput,
      triggerKind: layerActionTrigger(action),
      outputKind: 'layerAction',
      outputValue: `${action.verb} ${action.layerId}`,
      outputBehavior: 'normal',
      tokens: [],
      sourceLine: `# @layer-action ${action.input}`,
      isRoundTripSafe: true,
      source: { kind: 'layerAction', action },
    })
  })

  return commands
}

export function createBindingCommandPreset(
  triggerKind: BindingTriggerKind,
  overrides: Partial<BindingCommandPreset> = {}
): BindingCommandPreset {
  return {
    triggerKind,
    outputKind: triggerKind === 'stickShift' ? 'special' : 'keyboard',
    outputValue: triggerKind === 'stickShift' ? 'STICK_SHIFT:RIGHT:NO_MOUSE' : '',
    outputBehavior: 'normal',
    ...overrides,
  }
}

/**
 * A value read as its first command, standing alone: what the action picker
 * needs to open on a binding that has no card row of its own, such as a
 * modeshift's output or a command about to be added.
 */
export function commandForValue(physicalInput: string, value: string, triggerKind: BindingTriggerKind = 'regular'): BindingCommand {
  const token = parseBindingExpression(value)?.tokens[0]
  const outputKind = token ? outputKindFromToken(token) : 'keyboard'
  return {
    id: `${physicalInput}-value`,
    physicalInput,
    triggerKind,
    outputKind,
    outputValue: token?.value ?? '',
    outputBehavior: token ? ACTION_TO_BEHAVIOR[token.actionModifier] : 'normal',
    turboIntervalMs: token?.turboIntervalMs,
    tokens: token ? [token] : [],
    sourceLine: physicalInput,
    isRoundTripSafe: outputKind !== 'raw',
    source: { kind: 'row', slot: 'tap', rowId: `${physicalInput}-value`, writeMode: 'line', expression: null, tokenIndex: 0, lineValue: value, isManual: false },
  }
}

/** The value with its first output swapped for another, keeping how it fires
 *  (event and action modifiers) and every output after it. */
export function replaceFirstOutput(value: string, outputKind: BindingOutputKind, outputValue: string): string {
  const expression = parseBindingExpression(value)
  const kind = tokenKindFromOutput(outputKind)
  const first = expression?.tokens[0] ?? createBindingToken(kind)
  const token: BindingToken = { ...first, kind, value: outputValue, raw: '' }
  return serializeBindingExpression(createBindingExpression([token, ...(expression?.tokens.slice(1) ?? [])]))
}

import type { TFunction } from 'i18next'
import { keyName } from '../constants/configKeys'
import { getKeymapValue } from './keymap'
import { loadConfigBindingName } from './loadConfigBinding'
import { keyDisplayName } from './keyNames'

export type VirtualControllerType = 'NONE' | 'XBOX' | 'DS4'

export type VirtualControllerLogicalOutput =
  | 'faceSouth'
  | 'faceEast'
  | 'faceWest'
  | 'faceNorth'
  | 'leftBumper'
  | 'rightBumper'
  | 'leftStickClick'
  | 'rightStickClick'
  | 'back'
  | 'start'
  | 'home'
  | 'dpadUp'
  | 'dpadDown'
  | 'dpadLeft'
  | 'dpadRight'
  | 'leftTriggerDigital'
  | 'rightTriggerDigital'
  | 'padClick'

export type VirtualControllerWarning =
  | { kind: 'modeRequired' }
  | { kind: 'schemeMismatch'; detectedType: Exclude<VirtualControllerType, 'NONE'> }

type VirtualBindingDefinition = {
  logical: VirtualControllerLogicalOutput
  /** Positional name -- "North face button" -- for choosing an output. */
  labelKey: string
  xbox?: string
  ds4?: string
  /**
   * What the game will call it. A binding reads as the thing it produces, so
   * a written output shows this rather than the raw token: `X_Y` is a Y
   * button to everyone except the configuration file.
   */
  xboxName?: string
  ds4Name?: string
}

const VIRTUAL_BINDINGS: VirtualBindingDefinition[] = [
  { logical: 'faceSouth', labelKey: 'keymap.virtualOutputFaceSouth', xbox: 'X_A', ds4: 'PS_CROSS', xboxName: 'A Button', ds4Name: 'Cross' },
  { logical: 'faceEast', labelKey: 'keymap.virtualOutputFaceEast', xbox: 'X_B', ds4: 'PS_CIRCLE', xboxName: 'B Button', ds4Name: 'Circle' },
  { logical: 'faceWest', labelKey: 'keymap.virtualOutputFaceWest', xbox: 'X_X', ds4: 'PS_SQUARE', xboxName: 'X Button', ds4Name: 'Square' },
  { logical: 'faceNorth', labelKey: 'keymap.virtualOutputFaceNorth', xbox: 'X_Y', ds4: 'PS_TRIANGLE', xboxName: 'Y Button', ds4Name: 'Triangle' },
  { logical: 'leftBumper', labelKey: 'keymap.virtualOutputLeftBumper', xbox: 'X_LB', ds4: 'PS_L1', xboxName: 'Left Bumper', ds4Name: 'L1' },
  { logical: 'rightBumper', labelKey: 'keymap.virtualOutputRightBumper', xbox: 'X_RB', ds4: 'PS_R1', xboxName: 'Right Bumper', ds4Name: 'R1' },
  { logical: 'leftStickClick', labelKey: 'keymap.virtualOutputLeftStickClick', xbox: 'X_LS', ds4: 'PS_L3', xboxName: 'Left Stick Click', ds4Name: 'L3' },
  { logical: 'rightStickClick', labelKey: 'keymap.virtualOutputRightStickClick', xbox: 'X_RS', ds4: 'PS_R3', xboxName: 'Right Stick Click', ds4Name: 'R3' },
  { logical: 'back', labelKey: 'keymap.virtualOutputBack', xbox: 'X_BACK', ds4: 'PS_SHARE', xboxName: 'View Button', ds4Name: 'Share' },
  { logical: 'start', labelKey: 'keymap.virtualOutputStart', xbox: 'X_START', ds4: 'PS_OPTIONS', xboxName: 'Menu Button', ds4Name: 'Options' },
  { logical: 'home', labelKey: 'keymap.virtualOutputHome', xbox: 'X_GUIDE', ds4: 'PS_HOME', xboxName: 'Guide Button', ds4Name: 'PS Button' },
  { logical: 'dpadUp', labelKey: 'keymap.virtualOutputDpadUp', xbox: 'X_UP', ds4: 'PS_UP', xboxName: 'D-Pad Up', ds4Name: 'D-Pad Up' },
  { logical: 'dpadDown', labelKey: 'keymap.virtualOutputDpadDown', xbox: 'X_DOWN', ds4: 'PS_DOWN', xboxName: 'D-Pad Down', ds4Name: 'D-Pad Down' },
  { logical: 'dpadLeft', labelKey: 'keymap.virtualOutputDpadLeft', xbox: 'X_LEFT', ds4: 'PS_LEFT', xboxName: 'D-Pad Left', ds4Name: 'D-Pad Left' },
  { logical: 'dpadRight', labelKey: 'keymap.virtualOutputDpadRight', xbox: 'X_RIGHT', ds4: 'PS_RIGHT', xboxName: 'D-Pad Right', ds4Name: 'D-Pad Right' },
  {
    logical: 'leftTriggerDigital',
    labelKey: 'keymap.virtualOutputLeftTriggerDigital',
    xbox: 'X_LT',
    ds4: 'PS_L2', xboxName: 'Left Trigger', ds4Name: 'L2' },
  {
    logical: 'rightTriggerDigital',
    labelKey: 'keymap.virtualOutputRightTriggerDigital',
    xbox: 'X_RT',
    ds4: 'PS_R2', xboxName: 'Right Trigger', ds4Name: 'R2' },
  { logical: 'padClick', labelKey: 'keymap.virtualOutputPadClick', ds4: 'PS_PAD_CLICK', ds4Name: 'Touchpad Click' },
]

const isString = (value: string | undefined): value is string => typeof value === 'string' && value.length > 0

const XBOX_TOKEN_SET = new Set(VIRTUAL_BINDINGS.map(binding => binding.xbox).filter(isString))
const DS4_TOKEN_SET = new Set(VIRTUAL_BINDINGS.map(binding => binding.ds4).filter(isString))

const stripInlineComment = (value: string) => {
  let quoted = false
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === '#' && !quoted) {
      return value.slice(0, index).trim()
    }
  }
  return value.trim()
}

export const normalizeVirtualControllerType = (value?: string | null): VirtualControllerType => {
  const upper = value?.trim().toUpperCase()
  if (upper === 'XBOX' || upper === 'DS4') return upper
  return 'NONE'
}

export const getVirtualControllerType = (text: string): VirtualControllerType =>
  normalizeVirtualControllerType(getKeymapValue(text, keyName.VIRTUAL_CONTROLLER))

export const getVirtualControllerTokenType = (
  token: string
): Exclude<VirtualControllerType, 'NONE'> | null => {
  const normalized = token.trim().toUpperCase()
  if (!normalized) return null
  if (XBOX_TOKEN_SET.has(normalized)) return 'XBOX'
  if (DS4_TOKEN_SET.has(normalized)) return 'DS4'
  return null
}

export const isVirtualControllerToken = (token: string) => getVirtualControllerTokenType(token) !== null

export const getVirtualControllerLogicalOutput = (token: string): VirtualControllerLogicalOutput | null => {
  const normalized = token.trim().toUpperCase()
  if (!normalized) return null
  const match = VIRTUAL_BINDINGS.find(binding => binding.xbox === normalized || binding.ds4 === normalized)
  return match?.logical ?? null
}

export const toVirtualControllerToken = (
  logical: VirtualControllerLogicalOutput,
  type: VirtualControllerType
): string | null => {
  if (type === 'NONE') return null
  const binding = VIRTUAL_BINDINGS.find(item => item.logical === logical)
  if (!binding) return null
  return type === 'XBOX' ? binding.xbox ?? null : binding.ds4 ?? null
}

export const supportsVirtualControllerLogicalOutput = (
  logical: VirtualControllerLogicalOutput,
  type: Exclude<VirtualControllerType, 'NONE'>
) => Boolean(toVirtualControllerToken(logical, type))

export const getPreferredVirtualControllerDisplayType = (
  type: VirtualControllerType,
  token?: string | null
): Exclude<VirtualControllerType, 'NONE'> | null => {
  const tokenType = token ? getVirtualControllerTokenType(token) : null
  if (type === 'NONE') return tokenType
  const logical = token ? getVirtualControllerLogicalOutput(token) : null
  if (logical && !supportsVirtualControllerLogicalOutput(logical, type) && tokenType) {
    return tokenType
  }
  return type
}

export const getDefaultVirtualControllerLogicalOutput = (
  type: VirtualControllerType
): VirtualControllerLogicalOutput | null => {
  const displayType = getPreferredVirtualControllerDisplayType(type)
  if (!displayType) return null
  const fallback = VIRTUAL_BINDINGS.find(binding => (displayType === 'XBOX' ? binding.xbox : binding.ds4))
  return fallback?.logical ?? null
}

export const getDefaultVirtualControllerToken = (type: VirtualControllerType) => {
  const logical = getDefaultVirtualControllerLogicalOutput(type)
  return logical ? toVirtualControllerToken(logical, type) ?? '' : ''
}

export const getVirtualControllerOutputLabel = (
  logical: VirtualControllerLogicalOutput,
  type: Exclude<VirtualControllerType, 'NONE'>,
  t: TFunction
) => {
  const binding = VIRTUAL_BINDINGS.find(item => item.logical === logical)
  if (!binding) return logical
  // The name the game uses, where there is one. The positional name and the
  // raw token are what this used to read as -- "North face button (X_Y)" --
  // which describes where the button is rather than which button it is.
  return (type === 'XBOX' ? binding.xboxName : binding.ds4Name) ?? t(binding.labelKey)
}

export const getVirtualControllerOptions = (
  type: Exclude<VirtualControllerType, 'NONE'>,
  t: TFunction
) =>
  VIRTUAL_BINDINGS.filter(binding => (type === 'XBOX' ? binding.xbox : binding.ds4)).map(binding => ({
    value: binding.logical,
    label: getVirtualControllerOutputLabel(binding.logical, type, t),
    token: type === 'XBOX' ? binding.xbox! : binding.ds4!,
  }))

const extractVirtualControllerTypes = (text: string) => {
  const found = new Set<Exclude<VirtualControllerType, 'NONE'>>()
  text.split(/\r?\n/).forEach(line => {
    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) return
    const value = stripInlineComment(line.slice(separatorIndex + 1))
    if (!value) return
    value.split(/\s+/).forEach(token => {
      const tokenType = getVirtualControllerTokenType(token)
      if (tokenType) {
        found.add(tokenType)
      }
    })
  })
  return [...found]
}

export const analyzeVirtualControllerConfig = (text: string) => {
  const type = getVirtualControllerType(text)
  const detectedTypes = extractVirtualControllerTypes(text)
  const warnings: VirtualControllerWarning[] = []
  if (type === 'NONE' && detectedTypes.length > 0) {
    warnings.push({ kind: 'modeRequired' })
  } else if (type !== 'NONE') {
    detectedTypes.forEach(detectedType => {
      if (detectedType !== type) {
        warnings.push({ kind: 'schemeMismatch', detectedType })
      }
    })
  }
  return {
    type,
    detectedTypes,
    warnings,
    hasVirtualOutputs: detectedTypes.length > 0,
  }
}

/** Translate output tokens only: preserve commands, quoted text and comments. */
export function migrateVirtualBindings(text: string, type: VirtualControllerType): string {
  if (type === 'NONE') return text
  return text.split('\n').map(line => {
    const eq = line.indexOf('=')
    if (eq < 0 || line.trimStart().startsWith('#')) return line
    const key = line.slice(0, eq).trim().split(',').pop()?.trim()
    // Trigger passthrough modes are backend enum names, always X_LT / X_RT.
    if (key === 'ZL_MODE' || key === 'ZR_MODE') return line
    return line.slice(0, eq + 1) + line.slice(eq + 1).replace(/"[^"\n]*"|#.*|\b(?:X_[A-Z0-9_]+|PS_[A-Z0-9_]+)\b/g, token => {
      const logical = getVirtualControllerLogicalOutput(token)
      return logical ? toVirtualControllerToken(logical, type) ?? token : token
    })
  }).join('\n')
}

/**
 * What a written output is called, rather than what it is spelled.
 *
 * `X_Y` is a Y button and `PS_TRIANGLE` is a triangle; the token is the
 * configuration file's business. The type comes from the token itself rather
 * than from the profile's setting, so a binding always reads as the thing the
 * game will actually receive -- including in a profile whose tokens have not
 * been migrated to its current output type.
 */
export const describeVirtualControllerToken = (token: string): string | null => {
  const type = getVirtualControllerTokenType(token)
  if (!type) return null
  const upper = token.trim().toUpperCase()
  const binding = VIRTUAL_BINDINGS.find(item => (type === 'XBOX' ? item.xbox : item.ds4) === upper)
  return (type === 'XBOX' ? binding?.xboxName : binding?.ds4Name) ?? null
}

/** The same, falling through to the raw value for everything that is not one. */
/** The same, plus the one other output that is a path rather than a name. */
export const describeOutputValue = (value: string) => {
  const virtual = describeVirtualControllerToken(value)
  if (virtual) return virtual
  const config = loadConfigBindingName(value)
  if (config) return `Load ${config}`
  // A key is called what the legend on it says, not what the parser calls it.
  return keyDisplayName(value)
}

import type { TFunction } from 'i18next'
import { keyName } from '../constants/configKeys'
import { getKeymapValue } from './keymap'

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
  labelKey: string
  xbox?: string
  ds4?: string
}

const VIRTUAL_BINDINGS: VirtualBindingDefinition[] = [
  { logical: 'faceSouth', labelKey: 'keymap.virtualOutputFaceSouth', xbox: 'X_A', ds4: 'PS_CROSS' },
  { logical: 'faceEast', labelKey: 'keymap.virtualOutputFaceEast', xbox: 'X_B', ds4: 'PS_CIRCLE' },
  { logical: 'faceWest', labelKey: 'keymap.virtualOutputFaceWest', xbox: 'X_X', ds4: 'PS_SQUARE' },
  { logical: 'faceNorth', labelKey: 'keymap.virtualOutputFaceNorth', xbox: 'X_Y', ds4: 'PS_TRIANGLE' },
  { logical: 'leftBumper', labelKey: 'keymap.virtualOutputLeftBumper', xbox: 'X_LB', ds4: 'PS_L1' },
  { logical: 'rightBumper', labelKey: 'keymap.virtualOutputRightBumper', xbox: 'X_RB', ds4: 'PS_R1' },
  { logical: 'leftStickClick', labelKey: 'keymap.virtualOutputLeftStickClick', xbox: 'X_LS', ds4: 'PS_L3' },
  { logical: 'rightStickClick', labelKey: 'keymap.virtualOutputRightStickClick', xbox: 'X_RS', ds4: 'PS_R3' },
  { logical: 'back', labelKey: 'keymap.virtualOutputBack', xbox: 'X_BACK', ds4: 'PS_SHARE' },
  { logical: 'start', labelKey: 'keymap.virtualOutputStart', xbox: 'X_START', ds4: 'PS_OPTIONS' },
  { logical: 'home', labelKey: 'keymap.virtualOutputHome', xbox: 'X_GUIDE', ds4: 'PS_HOME' },
  { logical: 'dpadUp', labelKey: 'keymap.virtualOutputDpadUp', xbox: 'X_UP', ds4: 'PS_UP' },
  { logical: 'dpadDown', labelKey: 'keymap.virtualOutputDpadDown', xbox: 'X_DOWN', ds4: 'PS_DOWN' },
  { logical: 'dpadLeft', labelKey: 'keymap.virtualOutputDpadLeft', xbox: 'X_LEFT', ds4: 'PS_LEFT' },
  { logical: 'dpadRight', labelKey: 'keymap.virtualOutputDpadRight', xbox: 'X_RIGHT', ds4: 'PS_RIGHT' },
  {
    logical: 'leftTriggerDigital',
    labelKey: 'keymap.virtualOutputLeftTriggerDigital',
    xbox: 'X_LT',
    ds4: 'PS_L2',
  },
  {
    logical: 'rightTriggerDigital',
    labelKey: 'keymap.virtualOutputRightTriggerDigital',
    xbox: 'X_RT',
    ds4: 'PS_R2',
  },
  { logical: 'padClick', labelKey: 'keymap.virtualOutputPadClick', ds4: 'PS_PAD_CLICK' },
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
  const token = type === 'XBOX' ? binding.xbox : binding.ds4
  const base = t(binding.labelKey)
  return token ? `${base} (${token})` : base
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

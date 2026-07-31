import { keyName } from '../constants/configKeys'
import { getKeymapValue } from './keymap'

export type TouchpadMode = '' | 'GRID_AND_STICK' | 'MOUSE' | 'PS_TOUCHPAD'
export type TouchStickAxisMode = 'STANDARD' | 'INVERTED' | 'X_INVERTED' | 'Y_INVERTED' | string
export type TouchpadWarningCode = 'psTouchpadNeedsDs4' | 'touchStickRequiresGrid' | 'gridSizeInvalid'

export type TouchpadWarning = {
  code: TouchpadWarningCode
  rawValue?: string
}

export const TOUCHPAD_DUAL_STAGE_MODE_VALUES = [
  'NO_FULL',
  'NO_SKIP',
  'NO_SKIP_EXCLUSIVE',
  'MUST_SKIP',
  'MAY_SKIP',
  'MUST_SKIP_R',
  'MAY_SKIP_R',
] as const

export const TOUCH_STICK_AXIS_VALUES = ['STANDARD', 'INVERTED', 'X_INVERTED', 'Y_INVERTED'] as const
export const TOUCH_STICK_DIRECTION_COMMANDS = ['TUP', 'TDOWN', 'TLEFT', 'TRIGHT', 'TRING'] as const

const TOUCHPAD_MODE_VALUES = new Set<TouchpadMode>(['', 'GRID_AND_STICK', 'MOUSE', 'PS_TOUCHPAD'])
const TOUCH_STICK_SETTING_KEYS = [
  keyName.TOUCH_STICK_MODE,
  keyName.TOUCH_DEADZONE_INNER,
  keyName.TOUCH_RING_MODE,
  keyName.TOUCH_STICK_RADIUS,
  keyName.TOUCH_STICK_AXIS,
] as const

export const normalizeTouchpadMode = (value: string | null | undefined): TouchpadMode => {
  const normalized = value?.trim().toUpperCase() ?? ''
  return TOUCHPAD_MODE_VALUES.has(normalized as TouchpadMode) ? (normalized as TouchpadMode) : ''
}

const hasTouchStickBinding = (text: string) => {
  return text
    .split(/\r?\n/)
    .some(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return false
      const leftSide = line.split('=')[0] ?? ''
      return TOUCH_STICK_DIRECTION_COMMANDS.some(command => new RegExp(`\\b${command}\\b`, 'i').test(leftSide))
    })
}

const isInvalidGridSize = (raw: string | null | undefined) => {
  if (!raw?.trim()) return false
  const tokens = raw
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(token => Number(token))
  const columns = tokens[0]
  const rows = tokens[1] ?? 1
  if (!Number.isInteger(columns) || !Number.isInteger(rows)) return true
  if (columns < 1 || rows < 1) return true
  if (columns > 5 || rows > 5) return true
  return columns * rows > 25
}

export const analyzeTouchpadConfig = (text: string) => {
  const mode = normalizeTouchpadMode(getKeymapValue(text, keyName.TOUCHPAD_MODE))
  const warnings: TouchpadWarning[] = []
  const virtualControllerType = (getKeymapValue(text, keyName.VIRTUAL_CONTROLLER) ?? '').trim().toUpperCase()
  const gridSizeRaw = getKeymapValue(text, keyName.GRID_SIZE)
  const hasTouchStickSettings = TOUCH_STICK_SETTING_KEYS.some(settingKey => Boolean(getKeymapValue(text, settingKey)))

  if (mode === 'PS_TOUCHPAD' && virtualControllerType !== 'DS4') {
    warnings.push({ code: 'psTouchpadNeedsDs4' })
  }

  if (mode !== 'GRID_AND_STICK' && (hasTouchStickSettings || hasTouchStickBinding(text))) {
    warnings.push({ code: 'touchStickRequiresGrid' })
  }

  if (isInvalidGridSize(gridSizeRaw)) {
    warnings.push({ code: 'gridSizeInvalid', rawValue: gridSizeRaw ?? undefined })
  }

  return { mode, warnings }
}

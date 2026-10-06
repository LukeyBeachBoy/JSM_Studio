import { keyName } from '../constants/configKeys'
import { removeKeymapEntry, updateKeymapEntry } from './keymap'

export type GyroActivationMode = 'always_on' | 'hold_on' | 'hold_off' | 'always_off'

export type GyroActivationConfig = {
  mode: GyroActivationMode
  button: string
}

const GYRO_ACTIVATION_KEYS = [keyName.GYRO_ON, keyName.GYRO_OFF] as const

const escapeKey = (key: string) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const stripInlineComment = (value?: string) => {
  if (!value) return ''
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

const removeAllKeymapEntries = (text: string, key: string) => {
  let current = text
  let next = removeKeymapEntry(current, key)
  while (next !== current) {
    current = next
    next = removeKeymapEntry(current, key)
  }
  return current
}

export const parseGyroActivation = (text: string, prefix = '', keys: readonly string[] = GYRO_ACTIVATION_KEYS): GyroActivationConfig => {
  let latest: { key: string; value: string } | null = null
  const pattern = new RegExp(`^\\s*${escapeKey(prefix)}(${keys.map(escapeKey).join('|')})\\s*=\\s*(.+)$`, 'i')

  for (const line of text.split(/\r?\n/)) {
    if (keys === GYRO_ACTIVATION_KEYS && !prefix && /^\s*NO_GYRO_BUTTON\b/i.test(line)) { latest = null; continue }
    const match = line.match(pattern)
    if (!match) continue
    latest = {
      key: match[1].toUpperCase(),
      value: stripInlineComment(match[2]),
    }
  }

  if (!latest) return prefix ? parseGyroActivation(text, '', keys) : { mode: 'always_on', button: '' }

  const button = /^(ANY|ALL)\s/i.test(latest.value) ? latest.value.toUpperCase() : latest.value.split(/\s+/).filter(Boolean)[0]?.toUpperCase() ?? ''
  if (latest.key === keys[0]) {
    if (button === 'NONE') return { mode: 'always_off', button: '' }
    return { mode: 'hold_on', button }
  }

  if (button === 'NONE') return { mode: 'always_on', button: '' }
  return { mode: 'hold_off', button }
}

export const writeGyroActivation = (text: string, mode: GyroActivationMode, button: string, prefix = '', keys: readonly string[] = GYRO_ACTIVATION_KEYS) => {
  let next = text
  keys.forEach(key => {
    next = removeAllKeymapEntries(next, prefix + key)
  })

  const normalizedButton = button.trim().toUpperCase()
  switch (mode) {
    case 'hold_on':
      return updateKeymapEntry(next, prefix + keys[0], [normalizedButton || 'R3'])
    case 'hold_off':
      return updateKeymapEntry(next, prefix + keys[1], [normalizedButton || 'R3'])
    case 'always_off':
      return updateKeymapEntry(next, prefix + keys[0], ['NONE'])
    case 'always_on':
    default:
      // Explicitly override activation inherited from imported configurations.
      // Removing local lines alone lets the imported condition remain active.
      return updateKeymapEntry(next, prefix + keys[1], ['NONE'])
  }
}

export type GyroCondition = { input: string; released: boolean }
export function gyroConditions(button: string): { match: 'ANY' | 'ALL'; conditions: GyroCondition[] } | null {
  const [match, ...tokens] = button.split(/\s+/)
  if (match !== 'ANY' && match !== 'ALL') return null
  if (!tokens.length || tokens.length > 16 || tokens.some(token => !/^!?[A-Z0-9_+-]+$/.test(token))) return null
  return { match, conditions: tokens.map(token => ({ input: token.replace(/^!/, ''), released: token.startsWith('!') })) }
}
export function gyroConditionValue(match: 'ANY' | 'ALL', conditions: GyroCondition[]) {
  if (!conditions.length || conditions.length > 16) return null
  const value = [match, ...conditions.map(condition => (condition.released ? '!' : '') + condition.input)].join(' ')
  return gyroConditions(value) ? value : null
}

const TILT_ACTIVATION_KEYS = ['TILT_ON', 'TILT_OFF'] as const
export const parseTiltActivation = (text: string, prefix = '') => parseGyroActivation(text, prefix, TILT_ACTIVATION_KEYS)
export const writeTiltActivation = (text: string, mode: GyroActivationMode, button: string, prefix = '') => writeGyroActivation(text, mode, button, prefix, TILT_ACTIVATION_KEYS)

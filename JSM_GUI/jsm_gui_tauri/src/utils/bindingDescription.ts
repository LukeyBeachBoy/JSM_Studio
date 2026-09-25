import type { TFunction } from 'i18next'
import { parseBindingExpression, type BindingToken } from './keymap'
import { loadConfigBindingName } from './loadConfigBinding'
import { describeOutputValue } from './virtualController'

/**
 * A binding as a sentence, rather than as JoyShockMapper spells it.
 *
 * An output is not just a key name: it carries an action modifier before it and
 * an event modifier after it, and a binding can hold several of them at once.
 * `LALT\ !TAB\` is two of them -- hold Left Alt, tap Tab, both the moment the
 * button goes down -- and shown raw it reads as line noise. The symbols are:
 *
 *   action (prefix)   ^ toggle   ! instant (tap)   - release only
 *   event  (suffix)   \ press    / release   ' tap   _ hold   + turbo
 *
 * Display only. `parseBindingExpression` does the reading, the tokens keep
 * their raw spelling, and nothing here is ever written back to a profile.
 */

/** Outputs that are an action rather than a key, so the key names miss them. */
const SPECIAL_OUTPUT_LABEL_KEYS: Record<string, string> = {
  GYRO_ON: 'bindingText.output.gyroOn',
  GYRO_OFF: 'bindingText.output.gyroOff',
  GYRO_ON_ALL: 'bindingText.output.gyroOnAll',
  GYRO_OFF_ALL: 'bindingText.output.gyroOffAll',
  GYRO_INVERT: 'bindingText.output.gyroInvert',
  GYRO_INV_X: 'bindingText.output.gyroInvertX',
  GYRO_INV_Y: 'bindingText.output.gyroInvertY',
  GYRO_TRACKBALL: 'bindingText.output.gyroTrackball',
  GYRO_TRACK_X: 'bindingText.output.gyroTrackballX',
  GYRO_TRACK_Y: 'bindingText.output.gyroTrackballY',
  CALIBRATE: 'bindingText.output.calibrate',
  NONE: 'bindingText.output.none',
}

/** What one output token is called, before any modifier is applied to it. */
const outputName = (value: string, t: TFunction): string => {
  const special = SPECIAL_OUTPUT_LABEL_KEYS[value.trim().toUpperCase()]
  // describeOutputValue already covers virtual-controller buttons, the
  // load-a-configuration binding, and every key whose legend differs from the
  // token; only the gyro actions above are outside its vocabulary.
  return special ? t(special) : describeOutputValue(value)
}

/**
 * The phrase for one token, short enough for the compact row.
 *
 * The press event is left unsaid: it is what a binding does by default, and
 * repeating "on press" after every term is what made these unreadable in the
 * first place. The long form below says it in full.
 */
const describeToken = (token: BindingToken, t: TFunction): string => {
  const key = outputName(token.value, t)
  const { actionModifier: action, eventModifier: event } = token

  const base =
    action === '^'
      ? t('bindingText.short.toggle', { key })
      : action === '!'
        ? t('bindingText.short.tap', { key })
        : action === '-'
          ? t('bindingText.short.release', { key })
          // No action modifier: a start-press binding is held for as long as
          // the button is, which is the one case worth naming on its own.
          : event === '\\'
            ? t('bindingText.short.hold', { key })
            : key

  if (event === '+') return t('bindingText.short.turbo', { phrase: base })
  if (event === '/') return t('bindingText.short.onRelease', { phrase: base })
  if (event === '_') return t('bindingText.short.onHold', { phrase: base })
  if (event === "'") return t('bindingText.short.onTap', { phrase: base })
  return base
}

/** The same token spelled out, one clause per token, for the tooltip. */
const explainToken = (token: BindingToken, t: TFunction): string => {
  const key = outputName(token.value, t)
  const { actionModifier: action, eventModifier: event } = token

  const what =
    action === '^'
      ? t('bindingText.long.toggle', { key })
      : action === '!'
        ? t('bindingText.long.tap', { key })
        : action === '-'
          ? t('bindingText.long.release', { key })
          : t('bindingText.long.press', { key })

  const when =
    event === '/'
      ? t('bindingText.long.whenReleased')
      : event === "'"
        ? t('bindingText.long.whenTapped')
        : event === '_'
          ? t('bindingText.long.whenHeld')
          : event === '+'
            ? t('bindingText.long.whileHeldRepeatedly')
            : event === '\\'
              ? t('bindingText.long.whenPressed')
              : ''

  return when ? `${what} ${when}` : what
}

/**
 * The one output whose value legitimately contains spaces.
 *
 * A configuration is loaded by binding the quoted path to it, and a
 * configuration may well be called "Wardogs Menu". Splitting that on
 * whitespace shreds it into two tokens and then rejoins them with the " + "
 * that separates real terms -- so this is recognised before any parsing.
 */
const loadConfigPhrase = (value: string, t: TFunction): string | null => {
  const name = loadConfigBindingName(value.trim().replace(/^"|"$/g, ''))
  return name ? t('bindingText.short.loadConfig', { name }) : null
}

/**
 * A console command that sets a setting, like `"LED_BRIGHTNESS = 40"`. The
 * command is stored without its quotes, and `NAME = value` is never a key
 * sequence, so it is read as one assignment rather than three keys.
 */
const settingPhrase = (value: string): string | null => {
  const match = /^"?\s*([A-Z][A-Z0-9_]*)\s*=\s*([^"]+?)\s*"?$/i.exec(value.trim())
  if (!match) return null
  const [, name, setting] = match
  if (name.toUpperCase() === 'LED_BRIGHTNESS') return Number(setting) < 0 ? 'LED as the controller has it' : `LED ${setting}%`
  return `${name.toUpperCase()} = ${setting}`
}

const parseTokens = (value: string): BindingToken[] => {
  const trimmed = value.trim()
  if (!trimmed) return []
  return parseBindingExpression(trimmed)?.tokens ?? []
}

/**
 * The compact reading of a binding, for a row or a chip.
 *
 * Falls back to the raw text whenever there is nothing to translate, so a
 * token this does not model is still shown rather than swallowed.
 */
export const describeBinding = (value: string, t: TFunction): string => {
  const loadConfig = loadConfigPhrase(value, t)
  if (loadConfig) return loadConfig
  const setting = settingPhrase(value)
  if (setting) return setting
  const tokens = parseTokens(value)
  if (tokens.length === 0) return value.trim()
  const parts = tokens.map(token => describeToken(token, t)).filter(Boolean)
  if (parts.length === 0) return value.trim()
  return parts.join(t('bindingText.short.join'))
}

/**
 * The full reading, for a tooltip: one clause per token, then the spelling the
 * configuration file uses. The raw form is kept because it is what you search
 * for, what the docs use, and what you type into the raw editor -- hiding it
 * everywhere would make the translated text impossible to act on.
 */
export const explainBinding = (value: string, t: TFunction): string => {
  const raw = value.trim()
  const loadConfig = loadConfigPhrase(value, t)
  if (loadConfig) return [loadConfig, t('bindingText.long.syntax', { raw })].join('\n')
  const tokens = parseTokens(value)
  if (tokens.length === 0) return raw
  const clauses = tokens.map(token => explainToken(token, t)).filter(Boolean)
  if (clauses.length === 0) return raw
  return [...clauses, t('bindingText.long.syntax', { raw })].join('\n')
}

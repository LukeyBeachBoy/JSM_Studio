import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActionPickerProps } from '../ActionPicker'
import { PickerPage, focusFirst } from './PickerPage'
import { usePickerWords } from './pickerShared'
import { SegmentedRow } from '../../ui/console'
import { ButtonGlyph } from '../../glyphs/ButtonGlyph'
import { useShell } from '../../../shell/ShellContext'
import * as configKeys from '../../../constants/configKeys'
import { builtInCommandOptions } from '../actionCatalog'
import styles from './Pickers.module.css'

// Command · any JoyShockMapper command, typed on the on-screen keyboard
// (console v2, PickerFamily). Command | Raw binding, a monospace field, the
// config keys that match what is being typed as chips, and a keyboard of its
// own laid out for commands: capitals, digits, = _ . and ". Menu is Done; a
// real keyboard types here too.

type Kind = 'command' | 'raw'

// Everything a command line can start with: the config keys, the commands
// with tiles of their own, and the ones only typed.
const WORDS = [...new Set([
  ...Object.values(configKeys).flatMap(value => (Array.isArray(value) ? (value as readonly string[]) : [])),
  ...builtInCommandOptions,
  'PLAY_SOUND', 'LIGHT_BAR', 'LED_BRIGHTNESS', 'RESET_MAPPINGS', 'GYRO_SENS', 'GYRO_SPACE', 'GYRO_OFF', 'GYRO_ON', 'CALIBRATE', 'SLEEP', 'RECONNECT_CONTROLLERS',
  'VIRTUAL_CONTROLLER', 'MENU_OPEN', 'MENU_CLOSE', 'MENU_TOGGLE', 'MENU_HOLD', 'CYCLE', 'NONE', 'DEFAULT', 'RUMBLE', 'SMALL_RUMBLE', 'BIG_RUMBLE',
])].sort()

const LETTERS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL=', 'ZXCVBNM_."']
const SYMBOLS = ['!@#$%^&*()', '-+/\\:;,\'|~', '<>[]{}?`x ', '0123456789']
const KEY_NAMES: Record<string, string> = { '.': 'Period', '_': 'Underscore', '=': 'Equals', '"': 'Quote', ' ': 'Space', '-': 'Hyphen', '/': 'Slash', '\\': 'Backslash', ':': 'Colon', ';': 'Semicolon', ',': 'Comma', '\'': 'Apostrophe' }

export function CommandPicker(props: ActionPickerProps & { onSearch?: () => void }) {
  const { inputLabel, command, onSelect, onClose } = props
  const { t } = useTranslation()
  const { family } = useShell()
  const glyphFamily = family === 'generic' ? undefined : family
  const words = usePickerWords(inputLabel, command)
  const startKind: Kind = command.outputKind === 'raw' ? 'raw' : 'command'
  const [kind, setKind] = useState<Kind>(startKind)
  const [text, setText] = useState(command.outputKind === 'raw' || (command.outputKind === 'command' && command.outputValue) ? command.outputValue : '')
  const [lower, setLower] = useState(false)
  const [symbols, setSymbols] = useState(false)
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const keys = useRef<HTMLDivElement>(null)
  useEffect(() => { focusFirst(keys.current, '[data-vk="."]', '[data-vk]') }, [])

  // The word being typed: the last run of letters, digits and underscores.
  const word = /([A-Z_][A-Z0-9_]*)$/i.exec(text)?.[1] ?? ''
  const suggestions = useMemo(() => {
    const needle = word.toUpperCase()
    const pool = needle ? WORDS.filter(item => item.startsWith(needle) && item !== needle) : ['GYRO_SENS', 'GYRO_SPACE', 'GYRO_OFF', 'LIGHT_BAR', 'PLAY_SOUND', 'CALIBRATE_GYRO']
    return pool.slice(0, 6)
  }, [word])

  const type = (key: string) => setText(current => current + (lower ? key.toLowerCase() : key))
  const backspace = () => setText(current => current.slice(0, -1))
  const space = () => setText(current => current + ' ')
  const complete = (value: string) => setText(current => current.slice(0, current.length - word.length) + value + (/^(GYRO_ON|GYRO_OFF|NONE|DEFAULT|CALIBRATE|RESET_MAPPINGS|SLEEP|RECONNECT_CONTROLLERS)$/.test(value) || builtInCommandOptions.includes(value) ? '' : ' = '))
  const done = () => {
    const value = text.trim()
    if (!value) { onClose(); return }
    if (props.allowedOutputKinds && !props.allowedOutputKinds.includes(kind)) return
    onSelect({ outputKind: kind, outputValue: value, virtualControllerLogicalOutput: undefined })
    onClose()
  }

  // A real keyboard types here too: printable keys, Backspace, Enter for Done.
  // Only real key presses -- the pad's A arrives as a synthetic Enter on a key.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!event.isTrusted || event.ctrlKey || event.altKey || event.metaKey) return
    if (event.key === 'Backspace') { event.preventDefault(); backspace(); return }
    if (event.key === 'Enter') { event.preventDefault(); done(); return }
    if (event.key.length === 1) { event.preventDefault(); event.stopPropagation(); setText(current => current + event.key); return }
  }

  const rows = symbols ? SYMBOLS : LETTERS
  const keyName = (key: string) => KEY_NAMES[key] ?? (lower ? key.toLowerCase() : key)
  const hintFor = (label: string) => `A:${label};X:${t('pickers.backspace', 'Backspace')};Y:${t('pickers.space', 'Space')};MENU:${t('pickers.done', 'Done')};B:${t('common.cancel', 'Cancel')}`

  return (
    <PickerPage kind="command" onClose={onClose} backLabel={t('common.cancel', 'Cancel')} input={command.physicalInput} eyebrow={words.eyebrow}
      title={t('pickers.commandTitle', 'Command')} where={words.where(t('pickers.commandTitle', 'Command'))}
      hints={[{ button: 'LT/RT', label: `${t('pickers.shift', 'Shift')} · ${t('pickers.symbols', 'Symbols')}` }, { button: 'MENU', label: t('pickers.done', 'Done') }]}
      onPad={button => {
        if (button === 'X') { backspace(); return true }
        if (button === 'Y') { space(); return true }
        if (button === 'MENU') { done(); return true }
        return false
      }}>
      <div onKeyDownCapture={onKeyDown} className={styles.commandLayout}
        // LT shift and RT symbols: the triggers reach a sub-page as LT / RT, which
        // SubPage hands to onStep; here they are the keyboard's own.
        data-command-picker="">
        <div className={styles.commandSide}>
          <SegmentedRow label={t('pickers.commandKind', 'Send it as')} value={kind} onChange={value => setKind(value as Kind)}
            options={[
              { value: 'command', label: t('pickers.commandCommand', 'Command'), caption: t('pickers.commandCommandCaption', 'Run at the mapper’s console, like GYRO_SENS = 3') },
              { value: 'raw', label: t('pickers.commandRaw', 'Raw binding'), caption: t('pickers.commandRawCaption', 'Written after = as it is, like LCONTROL\\ C\\') },
            ]} />
          <div className={styles.field} role="textbox" aria-label={kind === 'raw' ? t('pickers.commandRaw', 'Raw binding') : t('pickers.commandCommand', 'Command')} aria-live="polite" data-command-field>
            {text}<span className={styles.caret} aria-hidden="true" />
          </div>
          <div className={styles.suggest} role="group" aria-label={t('pickers.commandSuggestions', 'Config keys')}>
            {suggestions.map(item => (
              <button key={item} type="button" className={styles.suggestChip} data-suggest={item}
                data-hints={hintFor(t('pickers.useThis', 'Use this'))} data-caption={t('pickers.suggestCaption', '{{key}} · A puts it in', { key: item })}
                onClick={() => complete(item)}>{item}</button>
            ))}
          </div>
          <span className={styles.commandHint} aria-live="polite">{focusedKey
            ? t('pickers.commandKeyHint', '{{key}} · A types it, Menu when done', { key: keyName(focusedKey) })
            : t('pickers.commandHint', 'A types the key · Menu when done · a real keyboard types here too')}</span>
          <span className={styles.triggerNote}>
            <span><ButtonGlyph button="LT" size={20} family={glyphFamily} />{lower ? t('pickers.capitals', 'Capitals') : t('pickers.shift', 'Shift')}</span>
            <span><ButtonGlyph button="RT" size={20} family={glyphFamily} />{symbols ? t('pickers.letters', 'Letters') : t('pickers.symbols', 'Symbols')}</span>
          </span>
        </div>
        <CommandKeys rows={rows} lower={lower} keyName={keyName} hintFor={hintFor} keysRef={keys} onType={type}
          onFocusKey={setFocusedKey} onShift={() => setLower(value => !value)} onSymbols={() => setSymbols(value => !value)} />
      </div>
      <TriggerBridge onLT={() => setLower(value => !value)} onRT={() => setSymbols(value => !value)} />
    </PickerPage>
  )
}

function CommandKeys({ rows, lower, keyName, hintFor, keysRef, onType, onFocusKey, onShift, onSymbols }: {
  rows: string[]; lower: boolean; keyName: (key: string) => string; hintFor: (label: string) => string; keysRef: React.RefObject<HTMLDivElement>
  onType: (key: string) => void; onFocusKey: (key: string | null) => void; onShift: () => void; onSymbols: () => void
}) {
  const { t } = useTranslation()
  return (
    <div ref={keysRef} className={styles.vkRows} role="group" aria-label={t('pickers.commandKeys', 'Keys')}>
      {rows.map((row, at) => (
        <div key={at} className={styles.vkRow}>
          {[...row].map((key, index) => (
            <button key={`${key}-${index}`} type="button" className={styles.vk} data-vk={key} aria-label={keyName(key)}
              data-hints={hintFor(t('pickers.type', 'Type'))}
              onFocus={() => onFocusKey(key)} onBlur={() => onFocusKey(null)} onClick={() => onType(key)}>
              {key === ' ' ? '␣' : lower ? key.toLowerCase() : key}
            </button>
          ))}
        </div>
      ))}
      <div className={styles.vkRow}>
        <button type="button" className={`${styles.vk} ${styles.vkWide}`} aria-pressed={lower} data-vk-shift onClick={onShift} data-hints={hintFor(t('pickers.shift', 'Shift'))}>{t('pickers.shift', 'Shift')}</button>
        <button type="button" className={`${styles.vk} ${styles.vkWide}`} data-vk-symbols onClick={onSymbols} data-hints={hintFor(t('pickers.symbols', 'Symbols'))}>&amp;123</button>
      </div>
    </div>
  )
}

/** LT / RT inside the Command picker: Shift and Symbols rather than a group. */
function TriggerBridge({ onLT, onRT }: { onLT: () => void; onRT: () => void }) {
  const latest = useRef({ onLT, onRT })
  latest.current = { onLT, onRT }
  useEffect(() => {
    const layer = document.querySelector<HTMLElement>('[data-picker="command"]')?.closest<HTMLElement>('[data-subpage]')
    if (!layer) return
    const handle = (event: Event) => {
      const { button } = (event as CustomEvent<{ button: string }>).detail
      if (button === 'LT') latest.current.onLT()
      if (button === 'RT') latest.current.onRT()
    }
    // Capture, so it runs before SubPage's own LT / RT listener claims them.
    layer.addEventListener('jsm:pad', handle, true)
    return () => layer.removeEventListener('jsm:pad', handle, true)
  }, [])
  return null
}

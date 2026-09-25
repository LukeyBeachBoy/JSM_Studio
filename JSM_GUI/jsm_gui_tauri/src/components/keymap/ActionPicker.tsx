import { useContext, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { BindingCommand, BindingCommandPatch, BindingOutputKind } from '../../utils/bindingCommands'
import { getVirtualControllerOptions, toVirtualControllerToken, type VirtualControllerType } from '../../utils/virtualController'
import { keyDisplayName } from '../../utils/keyNames'
import { loadConfigBindingValue } from '../../utils/loadConfigBinding'
import { InputLayerActions, LayerUsageContext } from '../LayerBar'
import { MAIN_ROWS, NAV_ROWS, NUMPAD_ROWS, MEDIA_KEYS } from './KeyboardBindingModal'
import { mouseOptions, wheelOptions, builtInCommandOptions } from './actionCatalog'
import './ActionPicker.css'
import { TRIGGER_LABEL_KEYS } from './triggerKinds'
import { InputGlyph } from '../glyphs/InputGlyph'
import { Icon } from '../icons/Icon'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'

type Category = 'Gamepad' | 'Mouse' | 'Keyboard' | 'Numpad' | 'Layers' | 'System' | 'JSM' | 'Configurations'
type Props = {
  inputLabel: string
  layerInput?: string
  command: BindingCommand
  virtualControllerType: VirtualControllerType
  specialOptions: { value: string; label: string; disabled?: boolean }[]
  libraryProfiles?: string[]
  onSelect: (patch: BindingCommandPatch) => void
  onClose: () => void
  onAdvanced: () => void
  onEnableVirtualController?: () => void
  /** Capture a key or mouse button instead of choosing one. */
  onCapture?: () => void
}

/** One choosable action, for the detail panel and for search. */
type Choice = { key: string; label: string; token: string; kind: BindingOutputKind; describe: string; commit: () => void; disabled?: boolean }

// Every output token a configuration line already sends, so the keyboard can
// dot the keys that are taken (choosing one keeps both).
const usedTokens = (text: string) => {
  const used = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf('=')
    if (at < 0) continue
    for (const token of trimmed.slice(at + 1).split('#')[0].toUpperCase().match(/[A-Z0-9_]+/g) ?? []) used.add(token)
  }
  return used
}

/** Browsing is read-only. A command is committed through the same patch path as
 * the advanced editor, keeping its activation and output behavior intact.
 * The full-screen picker (Binding Editor 7b): categories stepped by LB / RB,
 * a real keyboard with dots on keys already in use, a detail panel naming the
 * focused choice and its raw token, search across every category on Y. */
export function ActionPicker({ inputLabel, layerInput, command, virtualControllerType, specialOptions, libraryProfiles = [], onSelect, onClose, onAdvanced, onEnableVirtualController, onCapture }: Props) {
  const { t } = useTranslation()
  const title = useId()
  const { onSetActions, text: configText = '' } = useContext(LayerUsageContext)
  const [category, setCategory] = useState<Category>(command.outputKind === 'virtualController' ? 'Gamepad' : command.outputKind === 'mouse' || command.outputKind === 'wheel' ? 'Mouse' : 'Keyboard')
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState<Choice | null>(null)
  const rootRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const categories: Category[] = ['Gamepad', 'Mouse', 'Keyboard', 'Numpad', ...(onSetActions && layerInput ? ['Layers' as const] : []), 'System', 'JSM', ...(libraryProfiles.length ? ['Configurations' as const] : [])]
  const glyphs: Record<string, string> = { faceSouth: 'S', faceNorth: 'N', faceWest: 'W', faceEast: 'E', leftBumper: 'L', rightBumper: 'R', leftStickClick: 'L3', rightStickClick: 'R3', back: '-', start: '+', home: 'HOME', dpadUp: 'UP', dpadDown: 'DOWN', dpadLeft: 'LEFT', dpadRight: 'RIGHT', leftTriggerDigital: 'ZL', rightTriggerDigital: 'ZR', padClick: 'CAPTURE' }
  const outputType = virtualControllerType === 'NONE' ? 'XBOX' : virtualControllerType
  const used = useMemo(() => usedTokens(configText), [configText])
  const current = command.outputValue ? keyDisplayName(command.outputValue) : ''
  // LED brightness is a console command with a value: `"LED_BRIGHTNESS = 40"`.
  const ledMatch = /^LED_BRIGHTNESS\s*=\s*(-?\d+)\s*$/i.exec(command.outputValue ?? '')
  const [led, setLed] = useState(() => (ledMatch ? Math.max(0, Math.min(100, Number(ledMatch[1]))) : 50))
  const ledToken = `LED_BRIGHTNESS = ${led}`

  const pick = (outputKind: BindingOutputKind, outputValue: string) => {
    onSelect({ outputKind, outputValue, virtualControllerLogicalOutput: undefined })
    onClose()
  }

  // Every choice, once, so search and the detail panel read from one list.
  const choices = useMemo<Record<Category, Choice[]>>(() => {
    const keyChoice = (key: { token: string; label?: string }): Choice => ({
      key: `key:${key.token}`, label: key.label ?? key.token, token: key.token, kind: 'keyboard',
      describe: `${keyDisplayName(key.token)} key`, commit: () => pick('keyboard', key.token),
    })
    const keys = (rows: { token: string; label?: string }[][]) => rows.flat().filter(key => key.token !== 'SPACER').map(keyChoice)
    return {
      Gamepad: getVirtualControllerOptions(outputType, t).map(option => ({
        key: `pad:${option.value}`, label: option.label, token: toVirtualControllerToken(option.value, outputType) ?? '', kind: 'virtualController' as const,
        describe: `${outputType === 'DS4' ? 'DualShock 4' : 'Xbox'} ${option.label}`,
        commit: () => {
          if (virtualControllerType === 'NONE') onEnableVirtualController?.()
          onSelect({ outputKind: 'virtualController', outputValue: toVirtualControllerToken(option.value, outputType) ?? '', virtualControllerLogicalOutput: option.value })
          onClose()
        },
      })),
      Mouse: [...mouseOptions, ...wheelOptions].map(token => ({ key: `mouse:${token}`, label: keyDisplayName(token), token, kind: (wheelOptions.includes(token) ? 'wheel' : 'mouse') as BindingOutputKind, describe: keyDisplayName(token), commit: () => pick(wheelOptions.includes(token) ? 'wheel' : 'mouse', token) })),
      Keyboard: keys([...MAIN_ROWS, ...NAV_ROWS.filter(row => row.length)]),
      Numpad: keys(NUMPAD_ROWS),
      Layers: [],
      System: [...MEDIA_KEYS, { token: 'SCREENSHOT', label: 'Screenshot' }].filter(key => key.token !== 'SPACER').map(keyChoice),
      JSM: [
        ...specialOptions.map(option => ({ key: `special:${option.value}`, label: option.label, token: option.value, kind: 'special' as const, describe: option.label, disabled: option.disabled, commit: () => pick('special', option.value) })),
        ...builtInCommandOptions.map(token => ({ key: `command:${token}`, label: token.toLowerCase().replace(/_/g, ' '), token, kind: 'command' as const, describe: 'JoyShockMapper command', commit: () => pick('command', token) })),
        { key: 'led', label: `LED brightness ${led}%`, token: ledToken, kind: 'command' as const, describe: 'Sets the Steam Controller light while this input fires', commit: () => pick('command', ledToken) },
      ],
      Configurations: libraryProfiles.map(name => ({ key: `config:${name}`, label: name, token: loadConfigBindingValue(name), kind: 'loadConfig' as const, describe: `Loads ${name}`, commit: () => pick('loadConfig', loadConfigBindingValue(name)) })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputType, specialOptions, libraryProfiles, virtualControllerType, t, led])

  const results = query.trim()
    ? Object.values(choices).flat().filter(choice => `${choice.label} ${choice.token} ${choice.describe}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 60)
    : null

  // LB / RB change category, X captures, Y searches (the pad reaches an open
  // picker as `jsm:pad` events, since a dialog owns the pad while it is open).
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onPad = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      if (button === 'LB' || button === 'RB') {
        event.preventDefault()
        setQuery('')
        setCategory(previous => categories[(categories.indexOf(previous) + (button === 'RB' ? 1 : categories.length - 1)) % categories.length])
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
    <button key={choice.key} type="button" className={extra?.className ?? 'action-choice'} style={extra?.style} disabled={choice.disabled}
      aria-pressed={command.outputValue === choice.token} title={choice.token}
      onFocus={() => setFocused(choice)} onMouseEnter={() => setFocused(choice)} onClick={choice.commit}>
      {extra?.content ?? choice.label}
      {used.has(choice.token.toUpperCase()) && command.outputValue !== choice.token && <span className="action-used" title="Already used in this configuration" />}
    </button>
  )
  const keyButton = (key: { token: string; label?: string; width?: number }, index: number) => key.token === 'SPACER'
    ? <span key={`space-${index}`} className="key-space" style={{ flexGrow: key.width ?? 1 }} />
    : choiceButton(choices.Keyboard.find(choice => choice.token === key.token) ?? choices.Numpad.find(choice => choice.token === key.token)!, { className: 'key-cap', style: { flexGrow: key.width ?? 1 } })

  const detail = focused ?? Object.values(choices).flat().find(choice => choice.token === command.outputValue) ?? null

  return createPortal(<div className="modal-overlay action-picker-overlay" data-capture-ignore="true">
    <section ref={rootRef} className="action-picker" role="dialog" aria-modal="true" aria-labelledby={title}
      data-hints={`A:Choose;${onCapture ? 'X:Capture;' : ''}Y:Search;B:Back;LB/RB:Category`}>
      <header className="action-picker__header">
        <div className="action-picker__title">
          {command.physicalInput && <InputGlyph command={command.physicalInput} size={36} />}
          <div>
            <span className="action-picker__eyebrow">{inputLabel} · {t(TRIGGER_LABEL_KEYS[command.triggerKind])}</span>
            <h2 id={title}>Choose an action</h2>
          </div>
        </div>
        {current && <span className="action-picker__current">Current <kbd className="action-pill">{current}</kbd></span>}
        <label className="action-picker__search">
          <Icon name="search" size={16} />
          <input ref={searchRef} type="search" value={query} placeholder="Search all actions" aria-label="Search all actions"
            onChange={event => setQuery(event.target.value)} />
        </label>
        <button type="button" className="ghost-btn" data-modal-close onClick={onClose}>{category === 'Layers' ? 'Done' : 'Cancel'}</button>
      </header>

      <nav className="action-picker__tabs" aria-label="Action categories">
        <b className="trigger-mark action-picker__step" aria-hidden="true">LB</b>
        {categories.map(item => <button key={item} type="button" className="action-tab" aria-pressed={!results && category === item} onClick={() => { setQuery(''); setCategory(item) }}>{item}</button>)}
        <b className="trigger-mark action-picker__step" aria-hidden="true">RB</b>
        <span className="action-picker__spacer" />
        {onCapture && <button type="button" className="action-tab" onClick={() => { onClose(); onCapture() }}><b className="hint-face" aria-hidden="true">X</b>Capture</button>}
        <button type="button" className="action-tab" onClick={() => { onClose(); onAdvanced() }}>Custom / raw</button>
      </nav>

      <div className="action-picker__body">
        <div className="action-picker__content" role="region" aria-label={results ? 'Search results' : `${category} actions`}>
          {results && (results.length
            ? <div className="action-grid">{results.map(choice => choiceButton(choice))}</div>
            : <p className="action-picker-note">No action matches “{query}”. Custom / raw takes any JoyShockMapper token.</p>)}
          {!results && category === 'Gamepad' && <>
            <p className="action-picker-note">{outputType === 'DS4' ? 'DualShock 4' : 'Xbox'} output{virtualControllerType === 'NONE' ? ' · Choosing a button enables virtual gamepad output.' : ''}</p>
            <div className="action-grid gamepad-actions">{getVirtualControllerOptions(outputType, t).map((option, index) => choiceButton(choices.Gamepad[index], { content: <><InputGlyph command={glyphs[option.value]} family={outputType === 'DS4' ? 'playstation' : 'xbox'} size={26} />{option.label}</> }))}</div>
          </>}
          {!results && category === 'Mouse' && <div className="action-grid">{choices.Mouse.map(choice => choiceButton(choice))}</div>}
          {!results && category === 'Keyboard' && <div className="action-keyboard">{[...MAIN_ROWS, ...NAV_ROWS.filter(row => row.length)].map((row, i) => <div className="action-key-row" key={i}>{row.map(keyButton)}</div>)}</div>}
          {!results && category === 'Numpad' && <div className="action-numpad">{NUMPAD_ROWS.map((row, i) => <div className="action-key-row" key={i}>{row.map(keyButton)}</div>)}</div>}
          {!results && category === 'System' && <div className="action-grid">{choices.System.map(choice => choiceButton(choice))}</div>}
          {!results && category === 'Layers' && <><p className="action-picker-note">Layer actions belong to this physical input and can run alongside its commands.</p><InputLayerActions command={layerInput} /></>}
          {!results && category === 'JSM' && <><div className="action-grid">{choices.JSM.filter(choice => choice.key !== 'led').map(choice => choiceButton(choice))}</div>
            <div className="action-led" aria-label="LED brightness" role="group">
              <span className="action-led__label"><b>LED brightness</b><small>Steam Controller light, 0 to 100</small></span>
              <button type="button" className="icon-button" aria-label="Dimmer" disabled={led <= 0} onClick={() => setLed(value => Math.max(0, value - 10))}>−</button>
              <input type="number" min={0} max={100} step={5} value={led} aria-label="Brightness percent"
                onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) setLed(Math.max(0, Math.min(100, Math.round(value)))) }} />
              <button type="button" className="icon-button" aria-label="Brighter" disabled={led >= 100} onClick={() => setLed(value => Math.min(100, value + 10))}>+</button>
              {choiceButton(choices.JSM.find(choice => choice.key === 'led')!, { className: 'action-choice action-led__set', content: 'Use' })}
            </div>
            <p className="action-picker-note">Haptics, console commands and raw expressions are available in Advanced command settings.</p></>}
          {!results && category === 'Configurations' && <div className="action-grid">{choices.Configurations.map(choice => choiceButton(choice))}</div>}
        </div>
        <aside className="picker-detail" aria-live="polite">
          <span className="picker-detail__eyebrow">{focused ? 'Selected' : 'Current'}</span>
          {detail ? <>
            <div className="picker-detail__name"><kbd className="action-pill">{detail.label}</kbd><span>{detail.describe}</span></div>
            <span className="picker-detail__note">{used.has(detail.token.toUpperCase()) && detail.token !== command.outputValue
              ? 'Already bound elsewhere in this configuration; choosing it keeps both.'
              : 'Keys with a dot are already bound; choosing one keeps both.'}</span>
            <span className="picker-detail__raw">Raw token <code>{detail.token}</code></span>
          </> : <span className="picker-detail__note">Move to an action to see what it sends.</span>}
          <button type="button" className="secondary-btn" onClick={() => { onClose(); onAdvanced() }}>Advanced command settings</button>
        </aside>
      </div>
    </section>
  </div>, document.body)
}

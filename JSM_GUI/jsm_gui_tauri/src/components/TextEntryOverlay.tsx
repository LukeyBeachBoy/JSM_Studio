import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ButtonGlyph, type PadButtonName } from './glyphs/ButtonGlyph'
import { InputGlyph } from './glyphs/InputGlyph'
import { PAD_EVENT, type PadEventDetail } from '../nav/useControllerNavigation'
import { PAD_HELD_EVENT, TEXT_ENTRY_EVENT, type PadHeldDetail, type TextEntryRequest } from '../nav/textEntry'
import { useShell } from '../shell/ShellContext'
import { useShowsKeys } from '../nav/inputSource'
import styles from './TextEntryOverlay.module.css'

// The on-screen keyboard (console v2, TextEntry.dc.html) for the app's own
// text: a name for an action, a search, a command, a configuration's name, a
// number. A on a text field asks for it (`jsm:text-entry`, sent by
// useControllerNavigation); a control with no field asks with requestValueEntry,
// and says what it is for (title, eyebrow, hint, suggestions).
//
// The pad: the D-pad moves between keys and A types the focused one. X is
// Backspace, Y Space, LT Shift (hold it for a capital), RT Enter, LB the
// symbols, L3 Caps lock, Menu Done, B cancels. Hold R3 and move to move the
// window, hold RB and move to resize it, LB + RB together put it back. A real
// keyboard types here too. Done writes the text back into the field the way
// typing would (an input event, then Enter for fields that commit on it), or
// hands it to the request's onDone.

// The design's layout: the digit row ends with -, the q row with ', the a row
// with , and . (Shift starts the z row, &123 ends it).
const LETTERS = ['1234567890-', "qwertyuiop'", 'asdfghjkl,.', 'zxcvbnm']
const SYMBOLS = ['!@#$%^&*()_', '+=/\\|~`<>[]', '{};:"?€£…·•', '°×÷±§']
const DIGITS = ['789', '456', '123', '-0.']

type Frame = { x: number; y: number; w: number; h: number }
const FRAME_KEY = 'jsm.textEntry.frame'
const readFrame = (): Frame => {
  try { const saved = JSON.parse(localStorage.getItem(FRAME_KEY) ?? 'null'); if (saved && typeof saved.x === 'number') return saved } catch { /* none saved */ }
  return { x: 0, y: 0, w: 0, h: 0 }
}
const saveFrame = (frame: Frame) => { try { localStorage.setItem(FRAME_KEY, JSON.stringify(frame)) } catch { /* private window */ } }

/** Set a field's value the way typing does, so React's onChange sees it. */
const writeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

const KEYBOARD_ICON = <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></svg>

export function TextEntryOverlay() {
  const shell = useShell()
  const showsKeys = useShowsKeys()
  const glyphFamily = shell.family === 'generic' ? undefined : shell.family
  const [request, setRequest] = useState<TextEntryRequest | null>(null)
  const [text, setText] = useState('')
  const [shiftOnce, setShiftOnce] = useState(false)
  const [caps, setCaps] = useState(false)
  const [symbols, setSymbols] = useState(false)
  const [held, setHeld] = useState<string[]>([])
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [frame, setFrame] = useState<Frame>(readFrame)
  const layer = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const typedWhileHeld = useRef(false)

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<TextEntryRequest>).detail
      const element = detail.element
      if (element && (element.readOnly || element.disabled)) return
      if (!element && !detail.onDone) return
      event.preventDefault()
      returnFocus.current = element ?? (document.activeElement as HTMLElement | null)
      setRequest(detail)
      setText(element ? element.value : detail.value ?? '')
      setShiftOnce(false)
      setCaps(false)
      setSymbols(false)
    }
    window.addEventListener(TEXT_ENTRY_EVENT, open)
    return () => window.removeEventListener(TEXT_ENTRY_EVENT, open)
  }, [])

  // The first key takes focus, so the pad starts on the keyboard.
  useEffect(() => {
    if (!request) return
    // q on letters, 5 in the middle of the digits.
    requestAnimationFrame(() => (request.numeric ? ['5', 'q'] : ['q', '5']).map(key => layer.current?.querySelector<HTMLButtonElement>(`[data-key="${key}"]`)).find(Boolean)?.focus())
  }, [request])

  const shiftHeld = held.includes('LT')
  const upper = caps !== (shiftOnce || shiftHeld)
  const type = (key: string) => {
    setText(current => current + (upper ? key.toUpperCase() : key))
    if (shiftHeld) typedWhileHeld.current = true
    if (shiftOnce) setShiftOnce(false)
  }
  const backspace = () => setText(current => current.slice(0, -1))
  const space = () => setText(current => current + ' ')
  const close = (commit: boolean) => {
    const current = request
    setRequest(null)
    setHeld([])
    if (!current) return
    const element = current.element
    returnFocus.current?.focus({ preventScroll: true })
    if (!commit) return
    if (!element) { current.onDone?.(text); return }
    writeValue(element, text)
    // Fields that commit on Enter (or on blur) get the same as typing would give.
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
  }
  // Enter: a new line in a text area, else the same as Done.
  const enter = () => { if (request?.element instanceof HTMLTextAreaElement) setText(current => current + '\n'); else close(true) }
  const resetFrame = () => { const next = { x: 0, y: 0, w: 0, h: 0 }; setFrame(next); saveFrame(next) }

  // The pad's buttons while the keyboard is open.
  useEffect(() => {
    if (!request) return
    const onPad = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      if (button === 'X') { event.preventDefault(); backspace() }
      else if (button === 'Y') { event.preventDefault(); space() }
      else if (button === 'LT') { event.preventDefault(); setShiftOnce(value => !value) }
      else if (button === 'RT') { event.preventDefault(); enter() }
      else if (button === 'LB') { event.preventDefault(); if (!held.includes('RB')) setSymbols(value => !value) }
      // RB is "hold to resize": a press alone does nothing.
      else if (button === 'RB') { event.preventDefault() }
      else if (button === 'MENU') { event.preventDefault(); close(true) }
    }
    document.addEventListener(PAD_EVENT, onPad)
    return () => document.removeEventListener(PAD_EVENT, onPad)
  })

  // Holds: LT for a capital, L3 locks caps, R3 / RB with the D-pad move and
  // resize the window, LB + RB put it back.
  useEffect(() => {
    if (!request) return
    let previous: string[] = []
    const onHeld = (event: Event) => {
      const next = (event as CustomEvent<PadHeldDetail>).detail.held
      if (next.includes('L3') && !previous.includes('L3')) setCaps(value => !value)
      if (next.includes('LB') && next.includes('RB') && !(previous.includes('LB') && previous.includes('RB'))) resetFrame()
      // LT pressed and let go with nothing typed is a one-shot Shift (the
      // press already set it); a capital typed while held uses it up.
      if (previous.includes('LT') && !next.includes('LT') && typedWhileHeld.current) { setShiftOnce(false); typedWhileHeld.current = false }
      previous = next
      setHeld(next)
    }
    window.addEventListener(PAD_HELD_EVENT, onHeld)
    return () => window.removeEventListener(PAD_HELD_EVENT, onHeld)
  }, [request])

  // While R3 or RB is held, the D-pad moves or resizes rather than moving focus.
  useEffect(() => {
    if (!request) return
    const moving = held.includes('R3')
    const resizing = held.includes('RB') && !held.includes('LB')
    if (!moving && !resizing) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
      if (!step) return
      event.preventDefault(); event.stopImmediatePropagation()
      setFrame(current => {
        const next = moving
          ? { ...current, x: current.x + step[0] * 32, y: current.y + step[1] * 32 }
          : { ...current, w: Math.max(-480, Math.min(0, current.w + step[0] * 40)), h: Math.max(-240, Math.min(0, current.h + step[1] * 30)) }
        saveFrame(next)
        return next
      })
    }
    window.addEventListener('keydown', onKey, true)
    // The pad's moves reach the focused element as synthetic arrows; the
    // shell's own spatial focus listens on window too, so this listens first.
    return () => window.removeEventListener('keydown', onKey, true)
  }, [request, held])

  // A real keyboard types here too. Only real key presses: the pad's A
  // arrives as a synthetic Enter on the focused key.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(false); return }
    if (!event.nativeEvent.isTrusted || event.ctrlKey || event.altKey || event.metaKey) return
    if (event.key === 'CapsLock') { event.preventDefault(); setCaps(value => !value); return }
    if (event.key === 'Backspace') { event.preventDefault(); event.stopPropagation(); backspace(); return }
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); enter(); return }
    if (event.key.length === 1) { event.preventDefault(); event.stopPropagation(); setText(current => current + event.key) }
  }

  if (!request) return null
  const rows = request.numeric && !symbols ? DIGITS : symbols ? SYMBOLS : LETTERS
  const element = request.element
  const label = request.title ?? (element?.getAttribute('aria-label') || element?.getAttribute('placeholder') || 'Text')
  const keyHints = 'A:Type;X:Backspace;Y:Space;MENU:Done;B:Cancel'
  const shown = (key: string) => upper ? key.toUpperCase() : key
  const footer: [PadButtonName, string][] = [['A', 'Type'], ['X', 'Backspace'], ['Y', 'Space'], ['LT', 'Shift'], ['RT', 'Enter'], ['LB', 'Symbols']]
  const panelStyle = { transform: `translate(${frame.x}px, ${frame.y}px)`, left: 120 - frame.w / 2, right: 120 - frame.w / 2, top: 36 - frame.h / 2, bottom: 92 - frame.h / 2 }
  const live = showsKeys ? `Shift for a capital · Caps Lock ${caps ? 'on' : 'off'}` : focusedKey
    ? `A types ${focusedKey === ' ' ? 'a space' : shown(focusedKey)} · hold LT for a capital · L3 ${caps ? 'unlocks' : 'locks'} caps`
    : `Hold LT for a capital · L3 ${caps ? 'unlocks' : 'locks'} caps`
  return createPortal(
    <div ref={layer} className={styles.layer} data-focus-trap="true" data-text-entry="" onKeyDown={onKeyDown}>
      <section className={styles.panel} role="dialog" aria-modal="true" aria-label={`Type: ${label}`} style={panelStyle}
        data-moving={held.includes('R3') ? 'true' : undefined} data-resizing={held.includes('RB') && !held.includes('LB') ? 'true' : undefined}>
        <header className={styles.header}>
          {request.input && <InputGlyph command={request.input} family={shell.family} size={36} />}
          <span className={styles.title}>{label}</span>
          {request.eyebrow && <span className={styles.eyebrow}>{request.eyebrow}</span>}
          <span className={styles.realKeyboard}>{KEYBOARD_ICON}A real keyboard types here too</span>
        </header>
        <div className={styles.field} aria-live="polite" data-text-field>
          <span className={styles.value}>{text}</span><span className={styles.caret} aria-hidden="true" />
          {request.hint && <span className={styles.hint}>{request.hint}</span>}
        </div>
        {request.suggestions && request.suggestions.length > 0 && (
          <div className={styles.suggestions} role="group" aria-label="Suggestions">
            <span className={styles.suggestLabel}>Suggestions</span>
            {request.suggestions.map(word => (
              <button key={word} type="button" className={styles.suggestion} data-on={text === word ? 'true' : undefined}
                onClick={() => setText(word)} data-hints="A:Use this;B:Cancel" data-caption={`${word} · A puts it in the field`}>{word}</button>
            ))}
            <span className={styles.suggestNote}>Move up to choose one</span>
          </div>
        )}
        <div className={styles.keys}>
          {rows.map((row, index) => (
            <div key={index} className={styles.row}>
              {index === 3 && !request.numeric && (
                <button type="button" className={`${styles.key} ${styles.fn}`} aria-pressed={upper} data-key-shift onClick={() => setShiftOnce(value => !value)} data-hints="A:Shift;B:Cancel" style={{ flexGrow: 2 }}>
                  <ButtonGlyph button="LT" size={22} family={glyphFamily} />⇧ Shift
                </button>
              )}
              {[...row].map(key => (
                <button key={key} type="button" className={styles.key} data-key={key} onClick={() => type(key)} data-hints={keyHints}
                  onFocus={() => setFocusedKey(key)} onBlur={() => setFocusedKey(null)}>
                  {shown(key)}
                </button>
              ))}
              {(index === 3 || (request.numeric && index === rows.length - 1)) && (
                <button type="button" className={`${styles.key} ${styles.fn}`} aria-pressed={symbols} data-key-symbols onClick={() => setSymbols(value => !value)} data-hints="A:Symbols;B:Cancel" style={{ flexGrow: 2 }}>
                  <ButtonGlyph button="LB" size={22} family={glyphFamily} />{symbols ? (request.numeric ? '123' : 'abc') : request.numeric ? '&?' : '&123'}
                </button>
              )}
            </div>
          ))}
          <div className={styles.row}>
            <button type="button" className={`${styles.key} ${styles.fn}`} aria-pressed={caps} data-key-caps onClick={() => setCaps(value => !value)} data-hints="A:Caps lock;B:Cancel" style={{ flexGrow: 1.6 }}>
               <span className={styles.chip}>{showsKeys ? 'Caps Lock' : 'L3'}</span>⇪ Caps
            </button>
            <button type="button" className={`${styles.key} ${styles.fn}`} data-key-backspace onClick={backspace} data-hints="A:Backspace;B:Cancel" style={{ flexGrow: 2.4 }}>
              <ButtonGlyph button="X" size={22} family={glyphFamily} />⌫ Backspace
            </button>
            <button type="button" className={`${styles.key} ${styles.fn}`} data-key-space onClick={space} data-hints="A:Space;B:Cancel" style={{ flexGrow: 3.4 }}>
              <ButtonGlyph button="Y" size={22} family={glyphFamily} />Space
            </button>
            <button type="button" className={`${styles.key} ${styles.fn}`} data-key-enter onClick={enter} data-hints="A:Enter;B:Cancel" style={{ flexGrow: 2 }}>
              <ButtonGlyph button="RT" size={22} family={glyphFamily} />↵ Enter
            </button>
            <button type="button" className={`${styles.key} ${styles.fn} ${styles.done}`} data-key-done onClick={() => close(true)} data-hints="A:Done;B:Cancel" style={{ flexGrow: 1.6 }}>
              <ButtonGlyph button="MENU" size={22} family={glyphFamily} />Done
            </button>
          </div>
        </div>
        <div className={styles.liveHint}>
          <span className={styles.liveText} aria-live="polite">{live}</span>
          <span className={styles.windowHint}><span className={styles.chip}>R3</span>Hold to move</span>
          <span className={styles.windowHint}><ButtonGlyph button="RB" size={20} family={glyphFamily} />Hold to resize</span>
          <span className={styles.windowHint}><ButtonGlyph button="LB" size={20} family={glyphFamily} /><i>+</i><ButtonGlyph button="RB" size={20} family={glyphFamily} />Reset size and place</span>
        </div>
      </section>
      <footer className={styles.footer} aria-label="Controls">
        <span className={styles.where}>{request.where ?? [shell.configName, request.eyebrow?.split(' · ')[0], label].filter(Boolean).join(' · ')}</span>
        <span className={styles.footerHints}>
          {footer.map(([button, word]) => <span key={button}><ButtonGlyph button={button} size={24} family={glyphFamily} />{word}</span>)}
          <span><span className={styles.chip}>{showsKeys ? 'Caps Lock' : 'L3'}</span>Caps</span>
          <span><ButtonGlyph button="MENU" size={24} family={glyphFamily} />Done</span>
          <span><ButtonGlyph button="B" size={24} family={glyphFamily} />Cancel</span>
        </span>
      </footer>
    </div>,
    document.body,
  )
}

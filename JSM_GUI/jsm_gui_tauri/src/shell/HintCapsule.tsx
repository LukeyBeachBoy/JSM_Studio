import { useEffect, useState, type ReactNode } from 'react'
import type { ControllerVisualFamily } from '../utils/controllerStatus'
import { ButtonGlyph, type PadButtonName } from '../components/glyphs/ButtonGlyph'
import type { ShellWidth } from './useShellWidth'

// The floating hint capsule (HANDOFF.md, "Shell decisions"): 44px, inset 16px
// from the bottom of the content column, glyphs 22px. It says what each
// button does for whatever has focus right now, and changes with every
// context: a row, a menu, a dialog, capture, an idle Save button.
//
// Anything focusable can declare its own hints with data-hints="A:Edit;X:Capture;Y:Details;B:Back".

export type HintButton = 'A' | 'B' | 'X' | 'Y' | 'LB/RB' | 'LT/RT' | 'MOVE' | 'VIEW+MENU' | 'VIEW' | 'MENU'
type Hint = { button: HintButton; label: string }
type CapsuleContent = { hints: Hint[]; message?: string }

const KEYBOARD: Record<HintButton, string> = {
  A: 'Enter', B: 'Esc', X: 'X', Y: 'Y', 'LB/RB': 'Tab', 'LT/RT': 'PgUp PgDn', MOVE: '↑↓←→', 'VIEW+MENU': 'Esc', VIEW: '', MENU: '',
}
// View and Menu have no key of their own; without a pad they are not offered.
const PAD_ONLY: HintButton[] = ['VIEW', 'MENU']

/** Which page strip is on screen, from the shell's own marker. */
const pageGroup = () => document.querySelector<HTMLElement>('.app-shell')?.dataset.pageGroup ?? 'controls'

const parseHints = (value: string): Hint[] => {
  const hints = value.split(';').map(part => part.split(':')).filter(pair => pair.length === 2)
    .map(([button, label]) => ({ button: button.trim() as HintButton, label: label.trim() }))
  // X doing what A does is still true, but saying "A Toggle · X Toggle"
  // reads as a mistake; the capsule names each action once.
  const aLabel = hints.find(hint => hint.button === 'A')?.label
  return hints.filter(hint => hint.button !== 'X' || hint.label !== aLabel)
}

const overlayOpen = () => Boolean(document.querySelector('.modal-overlay, [data-focus-trap="true"], [data-radix-popper-content-wrapper]'))

// LB/RB and LT/RT work from every row of a page (HANDOFF.md, "Focus model"),
// so a row that declares only its own buttons still shows them. Not inside a
// menu, dialog or picker, where they step categories or do nothing. The
// configuration pages draw LT/RT beside their tabs, so the capsule names the
// Configuration menu there instead (2b); Studio names the page step (2f).
const withStepping = (hints: Hint[]): Hint[] => {
  if (overlayOpen()) return hints
  const has = (button: HintButton) => hints.some(hint => hint.button === button)
  const group = pageGroup()
  if (group === 'home') return hints
  return [
    ...hints,
    ...(!has('LB/RB') && document.querySelector('.section-list') ? [{ button: 'LB/RB' as const, label: 'Section' }] : []),
    ...(group === 'studio' && !has('LT/RT') ? [{ button: 'LT/RT' as const, label: 'Page' }] : []),
    ...(group === 'controls' && !has('MENU') ? [{ button: 'MENU' as const, label: 'Configuration' }] : []),
  ]
}

/**
 * View is Home from anywhere (D10). Home says so ("Home from anywhere");
 * configuration pages offer it beside the Configuration menu; on a Studio
 * page B already goes Home, so it says that instead.
 */
const withHome = (hints: Hint[]): Hint[] => {
  if (overlayOpen()) return hints
  const group = pageGroup()
  if (group === 'studio') return hints.map(hint => hint.button === 'B' && hint.label === 'Back' ? { ...hint, label: 'Home' } : hint)
  return [...hints, { button: 'VIEW', label: group === 'home' ? 'Home from anywhere' : 'Home' }]
}

const DEFAULT_HINTS: Hint[] = [
  { button: 'A', label: 'Select' },
  { button: 'B', label: 'Back' },
]

function readContext(): CapsuleContent {
  if (document.body.dataset.bindingCapture === 'true') return { hints: [], message: 'Press a key… Esc to cancel' }
  const active = document.activeElement as HTMLElement | null
  const menu = active?.closest('[role="menu"]')
  if (menu) {
    return { hints: [
      { button: 'MOVE', label: 'Move' },
      { button: 'A', label: 'Choose' },
      ...(menu.querySelector('input[type="search"]') ? [{ button: 'Y' as const, label: 'Search' }] : []),
      { button: 'B', label: 'Close' },
    ] }
  }
  if (active?.closest('[data-adjusting="true"]')) {
    return { hints: [{ button: 'MOVE', label: 'Adjust' }, { button: 'X', label: 'Fine' }, { button: 'A', label: 'Keep' }, { button: 'B', label: 'Revert' }] }
  }
  const reason = active?.getAttribute('aria-disabled') === 'true' ? active.dataset.reason : undefined
  if (reason) return { hints: [{ button: 'B', label: 'Back' }], message: reason }
  // A text field takes the keyboard; the pad can only leave it (16e, 16i).
  if (active && (active.tagName === 'TEXTAREA' || (active instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'file', 'color', 'button', 'submit', 'reset'].includes(active.type)))) {
    return { hints: [{ button: 'B', label: 'Leave field' }], message: 'Type with the keyboard' }
  }
  const declared = active?.closest<HTMLElement>('[data-hints]')?.dataset.hints
  if (declared) return { hints: withHome(withStepping(parseHints(declared))) }
  const dialog = document.querySelector('.modal-overlay, [data-focus-trap="true"]')
  if (dialog) return { hints: [{ button: 'MOVE', label: 'Move' }, { button: 'A', label: 'Select' }, { button: 'B', label: 'Close' }] }
  // Home before anything is focused: A opens what the pad lands on, B goes
  // back to editing (2a).
  if (pageGroup() === 'home') return { hints: withHome([{ button: 'A', label: 'Open' }, { button: 'B', label: 'Resume editing' }]) }
  return { hints: withHome(withStepping(DEFAULT_HINTS)) }
}

// Every button is drawn as the controller's own art, in its family (D11);
// without a pad the keyboard's keys stand in.
const PAIRS: Partial<Record<HintButton, [PadButtonName, PadButtonName]>> = { 'LB/RB': ['LB', 'RB'], 'LT/RT': ['LT', 'RT'], 'VIEW+MENU': ['VIEW', 'MENU'] }

function Badge({ button, family, controller }: { button: HintButton; family: ControllerVisualFamily; controller: boolean }) {
  if (!controller) return <kbd className="hint-key">{KEYBOARD[button]}</kbd>
  const pair = PAIRS[button]
  if (pair) return <>{pair.map(item => <ButtonGlyph key={item} button={item} family={family} size={24} className="hint-glyph" />)}</>
  if (button === 'MOVE') return <ButtonGlyph button="DPAD" family={family} size={24} className="hint-glyph" />
  return <ButtonGlyph button={button as PadButtonName} family={family} size={24} className="hint-glyph" />
}

type HintCapsuleProps = {
  width: ShellWidth
  family: ControllerVisualFamily
  /** A controller is connected: show its glyphs rather than keyboard keys. */
  controller: boolean
  /** Extra context from the shell, e.g. while testing. */
  override?: CapsuleContent
}

export function HintCapsule({ width, family, controller, override }: HintCapsuleProps) {
  const [content, setContent] = useState<CapsuleContent>({ hints: DEFAULT_HINTS })
  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      // After the focus change settles: Radix moves focus into a menu a frame late.
      frame = requestAnimationFrame(() => setContent(readContext()))
    }
    update()
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    document.addEventListener('keyup', update)
    window.addEventListener('jsm:interaction-hint', update)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
      document.removeEventListener('keyup', update)
      window.removeEventListener('jsm:interaction-hint', update)
    }
  }, [])

  const base = override ?? content
  const shown = controller ? base : { ...base, hints: base.hints.filter(hint => !PAD_ONLY.includes(hint.button)) }
  // At 1024 the stepping hints keep their glyphs but drop their labels.
  const quiet = (button: HintButton) => width !== 'wide' && (button === 'LB/RB' || button === 'LT/RT')
  const stepping = (button: HintButton) => button === 'LB/RB' || button === 'LT/RT' || button === 'VIEW' || button === 'MENU'
  const faces = shown.hints.filter(hint => !stepping(hint.button))
  const steps = shown.hints.filter(hint => stepping(hint.button))
  const render = (hint: Hint): ReactNode => (
    <span key={hint.button + hint.label} className="hint-capsule__item">
      <Badge button={hint.button} family={family} controller={controller} />
      {!quiet(hint.button) && <span>{hint.label}</span>}
    </span>
  )

  return (
    <div className="hint-capsule" role="status" aria-live="off" aria-label="Controls">
      {shown.message && <span className="hint-capsule__message">{shown.message}</span>}
      {faces.map(render)}
      {steps.length > 0 && faces.length > 0 && <span className="hint-capsule__rule" aria-hidden="true" />}
      {steps.map(render)}
    </div>
  )
}

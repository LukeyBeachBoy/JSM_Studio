import { useEffect, useState, type ReactNode } from 'react'
import type { ControllerVisualFamily } from '../utils/controllerStatus'
import { InputGlyph } from '../components/glyphs/InputGlyph'
import type { ShellWidth } from './useShellWidth'

// The floating hint capsule (HANDOFF.md, "Shell decisions"): 44px, inset 16px
// from the bottom of the content column, glyphs 22px. It says what each
// button does for whatever has focus right now, and changes with every
// context: a row, a menu, a dialog, capture, an idle Save button.
//
// Anything focusable can declare its own hints with data-hints="A:Edit;X:Capture;Y:Details;B:Back".

export type HintButton = 'A' | 'B' | 'X' | 'Y' | 'LB/RB' | 'LT/RT' | 'MOVE' | 'VIEW+MENU'
type Hint = { button: HintButton; label: string }
type CapsuleContent = { hints: Hint[]; message?: string }

const FACE: Record<'A' | 'B' | 'X' | 'Y', string> = { A: 'S', B: 'E', X: 'W', Y: 'N' }
const KEYBOARD: Record<HintButton, string> = {
  A: 'Enter', B: 'Esc', X: 'X', Y: 'Y', 'LB/RB': 'Tab', 'LT/RT': 'PgUp PgDn', MOVE: '↑↓←→', 'VIEW+MENU': 'Esc',
}

const parseHints = (value: string): Hint[] =>
  value.split(';').map(part => part.split(':')).filter(pair => pair.length === 2)
    .map(([button, label]) => ({ button: button.trim() as HintButton, label: label.trim() }))

const DEFAULT_HINTS: Hint[] = [
  { button: 'A', label: 'Select' },
  { button: 'B', label: 'Back' },
  { button: 'LB/RB', label: 'Section' },
  { button: 'LT/RT', label: 'Page' },
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
  const declared = active?.closest<HTMLElement>('[data-hints]')?.dataset.hints
  if (declared) return { hints: parseHints(declared) }
  const dialog = document.querySelector('.modal-overlay, [data-focus-trap="true"]')
  if (dialog) return { hints: [{ button: 'MOVE', label: 'Move' }, { button: 'A', label: 'Select' }, { button: 'B', label: 'Close' }] }
  return { hints: DEFAULT_HINTS }
}

function Badge({ button, family, controller }: { button: HintButton; family: ControllerVisualFamily; controller: boolean }) {
  if (!controller) return <kbd className="hint-key">{KEYBOARD[button]}</kbd>
  if (button === 'A' || button === 'B' || button === 'X' || button === 'Y') {
    // PlayStation prints shapes, so its face glyphs come from the glyph set;
    // everything with letters uses the capsule's own lettered disc.
    if (family === 'playstation') return <InputGlyph command={FACE[button]} family={family} size={22} className="hint-glyph" />
    return <b className="hint-face" aria-hidden="true">{family === 'nintendo' ? { A: 'B', B: 'A', X: 'Y', Y: 'X' }[button] : button}</b>
  }
  if (button === 'LB/RB') return <><b className="hint-shoulder">LB</b><b className="hint-shoulder">RB</b></>
  if (button === 'LT/RT') return <><b className="hint-trigger">LT</b><b className="hint-trigger">RT</b></>
  if (button === 'VIEW+MENU') return <><b className="hint-pill">View</b><span>+</span><b className="hint-pill">Menu</b></>
  return <InputGlyph command="DPAD" size={18} className="hint-glyph" />
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

  const shown = override ?? content
  // At 1024 the stepping hints keep their glyphs but drop their labels.
  const quiet = (button: HintButton) => width !== 'wide' && (button === 'LB/RB' || button === 'LT/RT')
  const faces = shown.hints.filter(hint => hint.button !== 'LB/RB' && hint.button !== 'LT/RT')
  const steps = shown.hints.filter(hint => hint.button === 'LB/RB' || hint.button === 'LT/RT')
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

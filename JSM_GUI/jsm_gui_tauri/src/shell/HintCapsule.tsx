import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ControllerVisualFamily } from '../utils/controllerStatus'
import { ButtonGlyph, type PadButtonName } from '../components/glyphs/ButtonGlyph'
import type { ShellWidth } from './useShellWidth'
import { KEY_FOR_BUTTON, useShowsKeys } from '../nav/inputSource'
import { onePerButton, parseHints, translateHintLabel, type Hint, type HintButton } from './hintLabels'

// The floating hint capsule (HANDOFF.md, "Shell decisions"): 44px, inset 16px
// from the bottom of the content column, glyphs 22px. It says what each
// button does for whatever has focus right now, and changes with every
// context: a row, a menu, a dialog, capture, an idle Save button.
//
// Anything focusable can declare its own hints with data-hints="A:Edit;X:Capture;Y:Details;B:Back".

export type { Hint, HintButton } from './hintLabels'
/** What the fixed status slot says: the held input, and what it does to how many. */
/** `only`: the one input it changes, named instead of counted. */
export type HeldShiftStatus = { kind: 'shift' | 'chord'; name: string; count: number; only?: string }
type CapsuleContent = { hints: Hint[]; message?: string }

// The key that does what each button does; every one of them works
// (useControllerNavigation's keyboard bridge).
const KEYBOARD: Record<HintButton, string> = {
  A: KEY_FOR_BUTTON.A, B: KEY_FOR_BUTTON.B, X: KEY_FOR_BUTTON.X, Y: KEY_FOR_BUTTON.Y,
  'LB/RB': `${KEY_FOR_BUTTON.LB} ${KEY_FOR_BUTTON.RB}`, 'LT/RT': `${KEY_FOR_BUTTON.LT} ${KEY_FOR_BUTTON.RT}`,
  MOVE: KEY_FOR_BUTTON.DPAD, 'VIEW+MENU': 'Esc', VIEW: KEY_FOR_BUTTON.VIEW, MENU: KEY_FOR_BUTTON.MENU,
}

/** Which page strip is on screen, from the shell's own marker. */
const pageGroup = () => document.querySelector<HTMLElement>('.app-shell')?.dataset.pageGroup ?? 'controls'

/** What the focused element declares (it or its nearest ancestor), one hint per button. */
export const declaredHints = (element: Element | null): Hint[] => {
  const declared = element?.closest<HTMLElement>('[data-hints]')?.dataset.hints
  return declared ? parseHints(declared) : []
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
  if (hints.some(hint => hint.button === 'VIEW')) return hints
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
  const adjusting = active?.closest<HTMLElement>('[data-adjusting="true"]')
  // A row being adjusted names its own buttons (SummaryRow); X is Fine only
  // on a slider, the one control that has a fine step.
  if (adjusting && !adjusting.matches('[data-hints]')) {
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
  /** A controller is connected. Its glyphs are shown only while it is the
   *  input in use; the keyboard or mouse brings the keys back. */
  controller: boolean
  /** Extra context from the shell, e.g. while testing. */
  override?: CapsuleContent
  /** A modeshift or chord button held now: "L4 held · 6 shifted", in a fixed slot (2g). */
  status?: HeldShiftStatus | null
  /** Keep the slot, empty, while the configuration has any modeshift, so
   *  holding one never makes the capsule grow. */
  reserveStatus?: boolean
}

export function HintCapsule({ width, family, controller: connected, override, status, reserveStatus }: HintCapsuleProps) {
  const { t } = useTranslation()
  const showsKeys = useShowsKeys()
  const controller = connected && !showsKeys
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
  // Declared hints arrive de-duplicated; the shell's own and an override may not.
  const shown = { ...base, hints: onePerButton(base.hints) }
  // At 1024 the stepping hints keep their glyphs but drop their labels.
  const quiet = (button: HintButton) => width !== 'wide' && (button === 'LB/RB' || button === 'LT/RT')
  const stepping = (button: HintButton) => button === 'LB/RB' || button === 'LT/RT' || button === 'VIEW' || button === 'MENU'
  const faces = shown.hints.filter(hint => !stepping(hint.button))
  const steps = shown.hints.filter(hint => stepping(hint.button))
  const render = (hint: Hint): ReactNode => (
    <span key={hint.button} className="hint-capsule__item">
      <Badge button={hint.button} family={family} controller={controller} />
      {!quiet(hint.button) && <span>{translateHintLabel(t, hint.label)}</span>}
    </span>
  )

  return (
    <div className="hint-capsule" role="status" aria-live="off" aria-label={t('hints.Controls', 'Controls')}>
      {shown.message && <span className="hint-capsule__message" title={shown.message}>{translateHintLabel(t, shown.message)}</span>}
      {faces.map(render)}
      {steps.length > 0 && faces.length > 0 && <span className="hint-capsule__rule" aria-hidden="true" />}
      {steps.map(render)}
      {(reserveStatus || status) && (
        <span className="hint-capsule__status" data-held={status ? 'true' : undefined}>
          {status && (
            <span key={status.name} className="shift-status__fill">
              <span className="shift-status__held"><span className="shift-status__text">{t('keymap.shiftHeld', '{{name}} held', { name: status.name })}</span></span>
              <span className="shift-status__count">{status.kind === 'chord'
                ? status.only ? t('keymap.chordedNamed', 'with {{name}}', { name: status.only }) : t('keymap.chordedShort', '{{count}} chorded', { count: status.count })
                : status.only ? t('keymap.shiftedNamed', '→ {{name}}', { name: status.only }) : t('keymap.shiftedShort', '{{count}} shifted', { count: status.count })}</span>
            </span>
          )}
        </span>
      )}
    </div>
  )
}

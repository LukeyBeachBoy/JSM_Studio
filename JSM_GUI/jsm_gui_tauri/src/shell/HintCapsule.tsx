import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ControllerVisualFamily } from '../utils/controllerStatus'
import { ButtonGlyph, type PadButtonName } from '../components/glyphs/ButtonGlyph'
import type { ShellWidth } from './useShellWidth'
import { KEY_FOR_BUTTON, useShowsKeys } from '../nav/inputSource'
import { HINT_ORDER, onePerButton, parseHints, translateHintLabel, type Hint, type HintButton } from './hintLabels'
import { pressPadButton } from '../nav/useControllerNavigation'
import type { PadButton } from '../nav/padNavigator'

// The hint bar (console v2, V2): a full-width footer docked under the content,
// never over it. The right side says what each button does for whatever has
// focus right now, and changes with every context: a row, a menu, a dialog,
// capture, an idle Save button. The left side says where you are, or, while
// something is focused that carries a caption (data-caption, or a title that
// a pad could otherwise never read), that caption (V9: nothing hover-only).
//
// Anything focusable can declare its own hints with data-hints="A:Edit;X:Capture;Y:Details;B:Back".

export type { Hint, HintButton } from './hintLabels'
/** A focus caption (console v2, V9): the focused row's full label on the first
 *  line, and one line of help under it. */
export type FocusCaption = { label?: string; help: string }
type CapsuleContent = { hints: Hint[]; message?: string; caption?: FocusCaption }

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()

/** The focused control's full label: what it is called, untruncated. A row
 *  marks its label with data-caption-label or a *label class; otherwise its
 *  accessible name or its first line of text. */
const fullLabel = (active: HTMLElement, holder: HTMLElement): string => {
  const marked = holder.dataset.captionLabel ?? active.dataset.captionLabel
  if (marked) return squash(marked)
  // A class that is exactly a label (CSS modules: "_label_x1y2"; BEM: "row__label"), not "labelBlock".
  const isLabel = (element: Element) => element.hasAttribute('data-caption-label') || Array.from(element.classList).some(token => /(^|_|-)label(_[a-z0-9]+)*$/i.test(token))
  const named = Array.from(active.querySelectorAll<HTMLElement>('*')).slice(0, 60).find(isLabel)
  const ownText = named ? squash(Array.from(named.childNodes).filter(node => !(node instanceof HTMLElement && node.classList.contains('config-name'))).map(node => node.textContent).join(' ')) : ''
  return ownText || squash(active.getAttribute('aria-label'))
}

/** The focused element's caption: its own data-caption ("Label · help" or just
 *  the help), or a title tooltip a pad could otherwise never read. */
const focusCaption = (active: HTMLElement | null): FocusCaption | undefined => {
  if (!active || active === document.body) return undefined
  const holder = active.closest<HTMLElement>('[data-caption]')
  let text = squash(holder?.dataset.caption)
  if (!text) {
    // A title is shown only when it says more than the element already does.
    const title = (active.getAttribute('title') ?? '').split(/\s*\n\s*/).filter(Boolean).join(' · ').trim()
    if (!title || title.length < 4) return undefined
    const visible = squash(active.textContent)
    if (visible && visible.includes(title)) return undefined
    text = title
  }
  // "Full label · help": the caption names itself; otherwise the row's label leads.
  const split = text.indexOf(' · ')
  if (split > 0) return { label: text.slice(0, split), help: text.slice(split + 3) }
  const label = fullLabel(active, holder ?? active)
  if (label && label.length < 120 && !text.toLowerCase().startsWith(label.toLowerCase())) return { label, help: text }
  return { help: text }
}

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

// LT/RT and LB/RB work from every row of a page (HANDOFF.md, "Focus model"),
// so a row that declares only its own buttons still shows them. Not inside a
// menu, dialog or picker, where they step categories or do nothing. Console
// v2 (V1): LT/RT step the sections, LB/RB the page tabs.
const withStepping = (hints: Hint[]): Hint[] => {
  if (overlayOpen()) return hints
  const has = (button: HintButton) => hints.some(hint => hint.button === button)
  const shell = document.querySelector<HTMLElement>('.app-shell')
  const group = pageGroup()
  if (group === 'home') return hints
  // What LT/RT step here (the shell names it on .app-shell: Section, Mode,
  // Category, Topic); on the Settings rail itself they step categories.
  const inRail = Boolean(document.activeElement?.closest('.section-list'))
  const stepping = inRail && shell?.dataset.hub === 'settings' ? 'Category' : shell?.dataset.stepLabel ?? 'Section'
  const steps = Boolean(document.querySelector('.section-list')) || shell?.dataset.steps === 'true'
  // Settings has no tabs: its categories are the rail (V6), so LB/RB do nothing.
  const tabs = shell?.dataset.hub !== 'settings'
  return [
    ...hints,
    ...(!has('LT/RT') && steps ? [{ button: 'LT/RT' as const, label: stepping }] : []),
    ...(!has('LB/RB') && tabs ? [{ button: 'LB/RB' as const, label: 'Tabs' }] : []),
  ]
}

/**
 * View is Home from anywhere (D10), and Menu opens the configuration's
 * options; the footers name neither except on Home, which offers "☰ Options"
 * (console v2, Home). On a Library or Settings page B goes Home, so it says so.
 */
const withHome = (hints: Hint[]): Hint[] => {
  if (overlayOpen()) return hints
  const group = pageGroup()
  if (group === 'studio') return hints.map(hint => hint.button === 'B' && hint.label === 'Back' ? { ...hint, label: 'Home' } : hint)
  if (group === 'home' && !hints.some(hint => hint.button === 'MENU')) return [...hints, { button: 'MENU', label: 'Options' }]
  return hints
}

const DEFAULT_HINTS: Hint[] = [
  { button: 'A', label: 'Select' },
  { button: 'B', label: 'Back' },
]

function readContext(): CapsuleContent {
  const content = readHints()
  return { ...content, caption: focusCaption(document.activeElement as HTMLElement | null) }
}

function readHints(): CapsuleContent {
  if (document.body.dataset.bindingCapture === 'true') return { hints: [], message: 'Press a key… Esc to cancel' }
  if (document.body.dataset.padListening === 'true') return { hints: [], message: document.body.dataset.padListeningMessage ?? 'Press any button to jump to its row · Esc cancels' }
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
    return { hints: [{ button: 'A', label: 'Type' }, { button: 'B', label: 'Leave field' }], message: 'A opens the on-screen keyboard' }
  }
  const declared = active?.closest<HTMLElement>('[data-hints]')?.dataset.hints
  if (declared) return { hints: withHome(withStepping(parseHints(declared))) }
  const dialog = document.querySelector('.modal-overlay, [data-focus-trap="true"]')
  if (dialog) return { hints: [{ button: 'MOVE', label: 'Move' }, { button: 'A', label: 'Select' }, { button: 'B', label: 'Close' }] }
  // Home before anything is focused: A opens what the pad lands on, B goes
  // back to editing (2a).
  if (pageGroup() === 'home') return { hints: withHome([{ button: 'A', label: 'Edit layout' }, { button: 'X', label: 'Test' }, { button: 'Y', label: 'Switch game' }]) }
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

/** One half of a two-button hint (LB or RB, LT or RT): its glyph, or its key. */
function HalfBadge({ button, family, controller }: { button: PadButtonName; family: ControllerVisualFamily; controller: boolean }) {
  if (!controller) return <kbd className="hint-key">{KEY_FOR_BUTTON[button as keyof typeof KEY_FOR_BUTTON]}</kbd>
  return <ButtonGlyph button={button} family={family} size={24} className="hint-glyph" />
}

// Every hint a mouse can press too (the footer's shortcuts are buttons): a
// click does exactly what that button does on the pad, to whatever has focus.
// The halves of LB/RB and LT/RT are previous / next. Move is only said: the
// arrows have nothing single to press. Pressing never takes focus from the
// row it acts on.
const SINGLE: Partial<Record<HintButton, PadButton>> = { A: 'A', B: 'B', X: 'X', Y: 'Y', VIEW: 'VIEW', MENU: 'MENU' }
const HALVES: Partial<Record<HintButton, [PadButton, PadButton]>> = { 'LB/RB': ['LB', 'RB'], 'LT/RT': ['LT', 'RT'] }
const keepFocus = (event: MouseEvent) => event.preventDefault()
const HALF_NAMES: Record<string, string> = { LB: 'Previous', RB: 'Next', LT: 'Previous', RT: 'Next' }

type HintCapsuleProps = {
  width: ShellWidth
  family: ControllerVisualFamily
  /** A controller is connected. Its glyphs are shown only while it is the
   *  input in use; the keyboard or mouse brings the keys back. */
  controller: boolean
  /** Extra context from the shell, e.g. while testing. */
  override?: CapsuleContent
  /** Where you are ("Wardogs · Buttons · Face buttons"), shown on the left. */
  where?: string
  /** The mode being edited (console v2, P6): kept beside the caption, so a row's caption never hides which mode you are in. */
  mode?: { name: string; color?: string } | null
  /** Hints a full-screen sub-page adds for every row (ui/SubPage: LT/RT Group,
   *  B Back), used where the focused row does not name that button itself. */
  extraHints?: Hint[]
}

export function HintCapsule({ width, family, controller: connected, override, where, mode, extraHints }: HintCapsuleProps) {
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
  const shown = { ...base, hints: onePerButton([...base.hints, ...(extraHints ?? []).filter(extra => !base.hints.some(hint => hint.button === extra.button))]) }
  // At 1024 the stepping hints keep their glyphs but drop their labels.
  const quiet = (button: HintButton) => width !== 'wide' && (button === 'LB/RB' || button === 'LT/RT')
  // Console v2 Kit: "Order never changes: A, X, Y, triggers, bumpers, B" -- with
  // ◂ ▸ first where a row takes it, and View / Menu before B.
  const ordered = [...shown.hints].sort((a, b) => HINT_ORDER.indexOf(a.button) - HINT_ORDER.indexOf(b.button))
  const render = (hint: Hint): ReactNode => {
    const label = translateHintLabel(t, hint.label)
    const single = SINGLE[hint.button]
    const halves = HALVES[hint.button]
    if (halves) {
      return (
        <span key={hint.button} className="hint-capsule__item hint-capsule__item--pair" data-hint-button={hint.button}>
          {halves.map(half => (
            <button key={half} type="button" tabIndex={-1} className="hint-capsule__press hint-capsule__half" data-hint-press={half}
              aria-label={`${label}: ${HALF_NAMES[half]}`} onMouseDown={keepFocus} onClick={() => pressPadButton({ button: half })}>
              <HalfBadge button={half} family={family} controller={controller} />
            </button>
          ))}
          {!quiet(hint.button) && <span>{label}</span>}
        </span>
      )
    }
    if (single || hint.button === 'VIEW+MENU') {
      return (
        <button key={hint.button} type="button" tabIndex={-1} className="hint-capsule__item hint-capsule__press" data-hint-press={hint.button}
          onMouseDown={keepFocus} onClick={() => pressPadButton(single ? { button: single } : { exitTest: true })}>
          <Badge button={hint.button} family={family} controller={controller} />
          {!quiet(hint.button) && <span>{label}</span>}
        </button>
      )
    }
    return (
      <span key={hint.button} className="hint-capsule__item">
        <Badge button={hint.button} family={family} controller={controller} />
        {!quiet(hint.button) && <span>{label}</span>}
      </span>
    )
  }

  // The left side: a message beats a caption, a caption beats the location.
  const caption = shown.message ? undefined : base.caption
  return (
    <div className="hint-capsule" data-focusable="false" role="status" aria-live="off" aria-label={t('hints.Controls', 'Controls')}>
      {caption
        ? <span className="hint-capsule__where hint-capsule__where--caption" data-focus-caption="">
            {caption.label && <b className="hint-capsule__caption-label">{caption.label}</b>}
            <span className="hint-capsule__caption-help">{caption.help}</span>
          </span>
        : <span className="hint-capsule__where">{where}</span>}
      {mode && <span className="hint-capsule__mode" data-mode=""><span className="hint-capsule__mode-dot" style={{ background: mode.color }} aria-hidden="true" />{mode.name} layer</span>}
      {shown.message && <span className="hint-capsule__message">{translateHintLabel(t, shown.message)}</span>}
      {ordered.map(render)}
    </div>
  )
}

import type { TFunction } from 'i18next'

// The hint capsule's vocabulary (HANDOFF.md, "Shell decisions"; binding card
// refresh 1h): what a `data-hints="A:Edit;X:Capture;B:Back"` attribute
// declares, read into one hint per button in a fixed order, and said in the
// app's language. Pure, so the shell, the sheets and the tests share it.

export type HintButton = 'A' | 'B' | 'X' | 'Y' | 'LB/RB' | 'LT/RT' | 'MOVE' | 'VIEW+MENU' | 'VIEW' | 'MENU'
export type Hint = { button: HintButton; label: string }

// The order the capsule reads in, whatever order the hints were declared in
// (console v2 Kit: "Order never changes: A, X, Y, triggers, bumpers, B"),
// with ◂ ▸ first where a row takes it and Menu / View just before B.
export const HINT_ORDER: HintButton[] = ['MOVE', 'A', 'X', 'Y', 'LT/RT', 'LB/RB', 'MENU', 'VIEW', 'VIEW+MENU', 'B']

/** One hint per button, the last one declared, in HINT_ORDER. A row that
 *  names its own B and a component that adds "B:Back" after it must not draw
 *  two; the list is also keyed by button, and a repeated key let React leave
 *  stale copies behind until the capsule read "B Back · B Back · A Select". */
export const onePerButton = (hints: Hint[]): Hint[] => {
  const last = new Map<HintButton, Hint>()
  hints.forEach(hint => last.set(hint.button, hint))
  return [...last.values()].sort((a, b) => HINT_ORDER.indexOf(a.button) - HINT_ORDER.indexOf(b.button))
}

export const parseHints = (value: string): Hint[] => {
  const hints = onePerButton(value.split(';').map(part => part.split(':')).filter(pair => pair.length === 2)
    .map(([button, label]) => ({ button: button.trim() as HintButton, label: label.trim() })))
  // X doing what A does is still true, but saying "A Toggle · X Toggle"
  // reads as a mistake; the capsule names each action once.
  const aLabel = hints.find(hint => hint.button === 'A')?.label
  return hints.filter(hint => hint.button !== 'X' || hint.label !== aLabel)
}

/**
 * A hint's label in the app's language. Labels are declared in English in
 * `data-hints` attributes all over the app; the `hints` translation block
 * keys them by that English text, and a label with a name in it ("Close RB")
 * goes through its pattern. An unknown label is shown as declared.
 */
export const translateHintLabel = (t: TFunction, label: string): string => {
  const direct = t(`hints.${label}`, { defaultValue: '' })
  if (direct) return direct
  const closes = /^Close (.+)$/.exec(label)
  if (closes) return t('hints.closeNamed', { name: closes[1], defaultValue: label })
  return label
}

import type { BindingTriggerKind } from '../../utils/bindingCommands'
import type { SelectGroup } from '../ui/Select'

// Steam Input resolves a choice with one dropdown showing the current value and
// the alternatives inside it. These two lists follow that: the everyday choices
// first, the rare ones after a separator, all reachable but only one on screen.
export const COMMON_TRIGGERS: BindingTriggerKind[] = ['regular', 'tap', 'hold', 'double', 'chord']
export const RARE_TRIGGERS: BindingTriggerKind[] = ['release', 'turbo', 'simultaneous', 'diagonal']

export const TRIGGER_LABEL_KEYS: Record<BindingTriggerKind, string> = {
  regular: 'keymap.commandTriggerRegular',
  tap: 'keymap.commandTriggerTap',
  hold: 'keymap.commandTriggerHold',
  double: 'keymap.commandTriggerDouble',
  release: 'keymap.commandTriggerRelease',
  turbo: 'keymap.commandTriggerTurbo',
  chord: 'keymap.commandTriggerChord',
  simultaneous: 'keymap.commandTriggerSimultaneous',
  diagonal: 'keymap.commandTriggerDiagonal',
  stickShift: 'keymap.stickModeShifts',
}

// The kinds an already-written binding can be switched between in place: they
// all live in the same `BUTTON = OUTPUT` config line, so retargeting one is an
// edit of that line rather than a move to a different one.
export const RETARGETABLE_TRIGGER_KINDS: BindingTriggerKind[] = ['regular', 'tap', 'hold', 'double']

// These three are meaningless on their own: each needs a second input chosen to
// chord, press or aim with.
export const conditionTriggers = new Set<BindingTriggerKind>(['chord', 'simultaneous', 'diagonal'])

// One trigger picker, in the card header, built here so the card and the editor
// body cannot drift into offering different sets of the same choices.
export const buildTriggerGroups = (t: (key: string) => string): SelectGroup[] => [
  { options: COMMON_TRIGGERS.map(value => ({ value, label: t(TRIGGER_LABEL_KEYS[value]) })) },
  { label: t('keymap.advancedOptions'), options: RARE_TRIGGERS.map(value => ({ value, label: t(TRIGGER_LABEL_KEYS[value]) })) },
]

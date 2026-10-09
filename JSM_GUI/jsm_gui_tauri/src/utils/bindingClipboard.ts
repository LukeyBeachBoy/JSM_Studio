import { useSyncExternalStore } from 'react'
import { isFixedCommand, parseRowsToCommands, type BindingCommand, type BindingCommandPreset } from './bindingCommands'
import { getButtonBindingRows } from './keymap'

// The binding clipboard, shared by every page (console v2, QuickMenu): copied
// on a binding sheet's cog or from Layout's quick menu, pasted on either. It
// survives pasting, so one binding can go to several inputs.
//
// Pasting is the binding card's own job (ButtonBindingsCard.pasteBindings):
// Layout asks for it with requestPaste(input) and opens that input's sheet,
// whose card takes the request when it mounts.

type State = { presets: BindingCommandPreset[]; from: string | null; pasteInto: string | null }
let state: State = { presets: [], from: null, pasteInto: null }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(listener => listener())
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) }

export const setBindingClipboard = (presets: BindingCommandPreset[], from: string | null = null) => {
  state = { ...state, presets, from: presets.length ? from : null }
  emit()
}

/** Layout's "Paste onto this input": the card for `input` pastes when it mounts. */
export const requestPaste = (input: string) => { state = { ...state, pasteInto: input }; emit() }

/** The card for `input` takes its paste request (once). */
export const takePasteRequest = (input: string) => {
  if (state.pasteInto !== input || !state.presets.length) return false
  state = { ...state, pasteInto: null }
  emit()
  return true
}

export function useBindingClipboard() {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

export const commandToPreset = (command: BindingCommand): BindingCommandPreset => ({
  triggerKind: command.triggerKind,
  outputKind: command.outputKind,
  outputValue: command.outputValue,
  outputBehavior: command.outputBehavior,
  turboIntervalMs: command.turboIntervalMs,
  ledBrightness: command.ledBrightness,
  conditionInput: command.conditionInput,
})

/** What an input does, as presets, read straight from the configuration text. */
export const presetsForInput = (text: string, input: string): BindingCommandPreset[] =>
  parseRowsToCommands(getButtonBindingRows(text, input), input, {}).filter(command => !isFixedCommand(command) && command.outputValue).map(commandToPreset)

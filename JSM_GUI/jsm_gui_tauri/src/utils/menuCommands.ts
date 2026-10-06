export const MENU_COMMANDS = [
  { verb: 'OPEN', label: 'Open', description: 'Activates the menu until Close, Toggle or Cancel deactivates it. Show overlay separately controls whether it is visible.' },
  { verb: 'CLOSE', label: 'Close', description: 'Closes the menu without selecting an action.' },
  { verb: 'TOGGLE', label: 'Toggle', description: 'Opens a closed menu; closes an open menu without selecting.' },
  { verb: 'HOLD', label: 'Hold', description: 'Activates the menu for the duration of this binding. The last Hold release runs the highlighted action when release selection is enabled, unless Open or Toggle keeps it active. Show overlay controls visibility separately.' },
] as const
export function parseMenuCommand(value: string) {
  const match = /^"?MENU_(OPEN|CLOSE|TOGGLE|HOLD) ([A-Za-z][A-Za-z0-9_-]{0,63})"?$/.exec(value.trim())
  return match ? { verb: match[1], id: match[2] } : null
}
export function menuCommandLabel(value: string, name?: string) {
  const command = parseMenuCommand(value)
  return command ? `${MENU_COMMANDS.find(item => item.verb === command.verb)?.label} menu · ${name ?? command.id}` : null
}

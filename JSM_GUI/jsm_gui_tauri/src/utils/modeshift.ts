import { getKeymapValue } from './keymap'

export type ModeshiftTarget = {
  id: string
  title: string
  buttons: { command: string; label: string }[]
  settings?: string[]
  mode?: { key: string; options: { value: string; label: string }[]; defaultValue: string }
  grid?: { sizeKey: string; clickKey: string; stickKey: string; clickButton: string; prefix: string }
}

// Chord assignments are the persisted representation. Keep all edits scoped to
// both the input group and its trigger; other groups may use the same trigger.
const assignment = (line: string) => line.match(/^\s*([^#,=]+),\s*([^=]+?)\s*=\s*(.*)$/)
const owns = (target: ModeshiftTarget, key: string) =>
  target.buttons.some(button => button.command === key) || target.settings?.includes(key) || target.mode?.key === key

export function modeshiftTriggers(text: string, target: ModeshiftTarget): string[] {
  return [...new Set(text.split(/\r?\n/).flatMap(line => {
    const match = assignment(line)
    return match && owns(target, match[2].trim().toUpperCase()) ? [match[1].trim().toUpperCase()] : []
  }))]
}

export function readModeshift(text: string, trigger: string, key: string) {
  const lines = text.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = assignment(lines[i])
    if (match?.[1].trim().toUpperCase() === trigger.toUpperCase() && match[2].trim().toUpperCase() === key.toUpperCase()) {
      return getKeymapValue(`${key} = ${match[3]}`, key)
    }
  }
  return undefined
}

export function writeModeshift(text: string, trigger: string, key: string, value: string): string {
  if (!trigger.trim()) throw new Error('A modeshift trigger is required')
  const lines = text.split(/\r?\n/)
  const retained = lines.filter(line => {
    const match = assignment(line)
    return !(match?.[1].trim().toUpperCase() === trigger.toUpperCase() && match[2].trim().toUpperCase() === key.toUpperCase())
  })
  retained.push(`${trigger},${key} = ${value.trim() || 'NONE'}`)
  return retained.join('\n')
}

export function removeModeshift(text: string, target: ModeshiftTarget, trigger: string): string {
  return text.split(/\r?\n/).filter(line => {
    const match = assignment(line)
    return !(match?.[1].trim().toUpperCase() === trigger && owns(target, match[2].trim().toUpperCase()))
  }).join('\n')
}

export function renameModeshift(text: string, target: ModeshiftTarget, from: string, to: string): string {
  if (!to || modeshiftTriggers(text, target).includes(to)) return text
  return text.split(/\r?\n/).map(line => {
    const match = assignment(line)
    return match?.[1].trim().toUpperCase() === from && owns(target, match[2].trim().toUpperCase())
      ? `${to},${match[2].trim()} = ${match[3]}` : line
  }).join('\n')
}

export function addModeshift(text: string, target: ModeshiftTarget, trigger: string): string {
  if (!trigger || modeshiftTriggers(text, target).includes(trigger)) return text
  let next = text
  if (target.mode) next = writeModeshift(next, trigger, target.mode.key, target.grid ? 'GRID_AND_STICK' : getKeymapValue(text, target.mode.key) ?? target.mode.defaultValue)
  if (target.grid) {
    next = writeModeshift(next, trigger, target.grid.sizeKey, getKeymapValue(text, target.grid.sizeKey) ?? '2 2')
    next = writeModeshift(next, trigger, target.grid.clickKey, 'OFF')
    next = writeModeshift(next, trigger, target.grid.stickKey, 'NO_MOUSE')
  }
  for (const button of target.buttons) {
    next = writeModeshift(next, trigger, button.command, getKeymapValue(text, button.command) ?? 'NONE')
  }
  return next
}

// An icon for what a binding does, shown above its label in the trackpad
// overlay. Stored the same way `# @label` is -- a comment line JoyShockMapper
// ignores -- so an illustrated profile still loads anywhere:
//
//   # @icon RT1 = game-icons:reload-gun-barrel
//   # @icon LT3 = lucide:map
//
// The value is an Iconify name, `set:icon`. It is resolved through a lookup
// (see utils/iconLibrary) rather than being an Iconify-only identifier, so
// letting people import their own icons later is a matter of adding a source to
// that lookup rather than changing this format or every config that uses it.

const ICON_LINE = /^\s*#\s*@icon\s+([^=\s]+)\s*=\s*(.*)$/i

/** `set:icon`, the only shape Iconify names take. */
const VALID_NAME = /^[a-z0-9-]+:[a-z0-9-]+$/i

export type BindingIcons = Record<string, string>

export function parseBindingIcons(text: string): BindingIcons {
  const icons: BindingIcons = {}
  text.split(/\r?\n/).forEach(line => {
    const match = ICON_LINE.exec(line)
    if (!match) return
    const command = match[1].trim().toUpperCase()
    const icon = match[2].trim()
    if (command && VALID_NAME.test(icon)) icons[command] = icon.toLowerCase()
  })
  return icons
}

export function getBindingIcon(text: string, command: string) {
  return parseBindingIcons(text)[command.trim().toUpperCase()]
}

/** Writes, replaces or (with an empty name) removes one input's icon. */
export function setBindingIcon(text: string, command: string, icon: string): string {
  const key = command.trim().toUpperCase()
  if (!key) return text
  const clean = icon.trim().toLowerCase()
  const lines = text.split(/\r?\n/)
  const index = lines.findIndex(line => {
    const match = ICON_LINE.exec(line)
    return Boolean(match && match[1].trim().toUpperCase() === key)
  })

  if (!clean || !VALID_NAME.test(clean)) {
    if (index >= 0) lines.splice(index, 1)
    return lines.join('\n')
  }

  const next = `# @icon ${key} = ${clean}`
  if (index >= 0) {
    lines[index] = next
    return lines.join('\n')
  }

  // Keep the icon beside the binding it describes, the way a label is, so a
  // hand-edited config still reads top to bottom.
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const bindingIndex = lines.findIndex(line =>
    new RegExp(`^\\s*${escaped}\\s*(,|\\+|\\*|=)`, 'i').test(line)
  )
  if (bindingIndex >= 0) {
    lines.splice(bindingIndex + 1, 0, next)
    return lines.join('\n')
  }
  lines.push(next)
  return lines.join('\n')
}

/** Every distinct Iconify set a config references, so only those are loaded. */
export function referencedIconSets(icons: BindingIcons): string[] {
  return [...new Set(Object.values(icons).map(name => name.split(':')[0]))]
}

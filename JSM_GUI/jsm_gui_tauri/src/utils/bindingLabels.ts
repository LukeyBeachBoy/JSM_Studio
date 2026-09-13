// Human names for what a binding *does* ("Jump", "Push to talk"), the way Steam
// Input lets you title an action. JoyShockMapper has no field for this, so the
// label rides along as its own comment line:
//
//   # @label S = Jump
//
// A separate line rather than a trailing comment on the binding itself: every
// writer in the app rebuilds binding lines with updateKeymapEntry, which would
// drop a trailing comment the moment you edited the binding it belonged to.
// JoyShockMapper ignores the line entirely, so a labelled config still loads
// anywhere.

const LABEL_LINE = /^\s*#\s*@label\s+([^=\s]+)\s*=\s*(.*)$/i

export type BindingLabels = Record<string, string>

export function parseBindingLabels(text: string): BindingLabels {
  const labels: BindingLabels = {}
  text.split(/\r?\n/).forEach(line => {
    const match = LABEL_LINE.exec(line)
    if (!match) return
    const command = match[1].trim().toUpperCase()
    const label = match[2].trim()
    // An empty label line is kept rather than skipped: a shifted binding writes
    // one to say "no label here" and stop the unshifted label showing through.
    // Everywhere else an empty string reads the same as no line at all.
    if (command) labels[command] = label
  })
  return labels
}

export function getBindingLabel(text: string, command: string) {
  return parseBindingLabels(text)[command.trim().toUpperCase()]
}

/**
 * Writes, replaces or (with an empty label) removes one input's label.
 *
 * `keepEmpty` writes the empty label as its own line instead of deleting it,
 * which is how a shifted binding says "deliberately unnamed": deleting the
 * line would let the unshifted label be inherited straight back.
 */
export function setBindingLabel(text: string, command: string, label: string, options: { keepEmpty?: boolean } = {}) {
  const key = command.trim().toUpperCase()
  if (!key) return text
  // A label is one line of plain text; anything that would end the line or
  // start another comment is stripped rather than corrupting the file.
  const clean = label.replace(/[\r\n#]/g, '').trim()
  const lines = text.split(/\r?\n/)
  const index = lines.findIndex(line => {
    const match = LABEL_LINE.exec(line)
    return Boolean(match && match[1].trim().toUpperCase() === key)
  })

  if (!clean && !options.keepEmpty) {
    if (index >= 0) lines.splice(index, 1)
    return lines.join('\n')
  }

  const nextLine = `# @label ${key} =${clean ? ` ${clean}` : ''}`
  if (index >= 0) {
    lines[index] = nextLine
    return lines.join('\n')
  }

  // Keep labels next to the binding they describe when that line exists, so a
  // hand-edited config still reads top to bottom.
  const bindingIndex = lines.findIndex(line => new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*(,|\\+|\\*|=)`, 'i').test(line))
  if (bindingIndex >= 0) {
    lines.splice(bindingIndex, 0, nextLine)
    return lines.join('\n')
  }
  lines.push(nextLine)
  return lines.join('\n')
}

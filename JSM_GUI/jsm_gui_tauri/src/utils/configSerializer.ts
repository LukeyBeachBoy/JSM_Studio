import {
  BUMPER_BUTTONS,
  CENTER_BUTTONS,
  DPAD_BUTTONS,
  FACE_BUTTONS,
  LEFT_STICK_BUTTONS,
  MINI_BUTTONS,
  MISC_BUTTONS,
  PADDLE_BUTTONS,
  RIGHT_STICK_BUTTONS,
  TOUCH_STICK_BUTTONS,
  TOUCH_BUTTONS,
  TRIGGER_BUTTONS,
} from '../keymap/schema'
import {
  bindingSpecialKeys,
  gripKeys,
  gyroBehaviorKeys,
  keyName,
  noiseKeys,
  sensitivityKeys,
  timingKeys,
  stickKeys,
  touchpadKeys,
} from '../constants/configKeys'
import { includeTarget } from './configIncludes'

type SectionKey =
  | 'gyro_behavior'
  | 'noise'
  | 'sensitivity'
  | 'keymap'
  | 'touchpad'
  | 'sticks'
  | 'custom'

type KeymapSubsection =
  | 'global'
  | 'face'
  | 'dpad'
  | 'bumpers'
  | 'triggers'
  | 'center'
  | 'paddles'
  | 'touch'
  | 'stick_buttons'
  | 'extra'
  | 'misc'

type ParsedLine = {
  line: string
  subsection?: KeymapSubsection
  /** Hand-written comments immediately above this line in the source file. */
  comments?: string[]
}

export type ParsedConfig = {
  sections: Record<SectionKey, ParsedLine[]>
  directives: ParsedLine[]
  // Files this profile imports. Held separately because where an import sits is
  // not cosmetic: the mapper applies lines in order and the last assignment
  // wins, so an import is a baseline only while it stays above the profile's
  // own settings. Sorting one into a settings section would drop it below the
  // overrides and silently invert which file wins.
  imports: ParsedLine[]
  // Annotation comments the app itself writes and reads back: `# @label`,
  // `# @icon`, `# @overlay`. JoyShockMapper ignores them, but they are app data
  // rather than prose, so saving must not drop them the way it drops a
  // hand-written comment (see TODO-3). Held separately because they are keyed
  // by input rather than belonging to a settings section.
  annotations: ParsedLine[]
}

/** `# @label RT1 = Reload`, `# @icon RT1 = lucide:refresh-cw`, `# @overlay ...` */
const ANNOTATION = /^\s*#\s*@(label|icon|overlay|layer)\b/i

const SECTION_HEADERS: Record<SectionKey, string> = {
  gyro_behavior: '# Gyro Behavior',
  noise: '# Noise & Steadying',
  sensitivity: '# Sensitivity',
  keymap: '# Keymap',
  touchpad: '# Touchpad',
  sticks: '# Sticks',
  custom: '# Custom',
}

const KEYMAP_SUB_HEADERS: Record<KeymapSubsection, string> = {
  global: '# Global',
  face: '# Face Buttons',
  dpad: '# D-pad',
  bumpers: '# Bumpers',
  triggers: '# Triggers',
  center: '# Center buttons',
  paddles: '# Paddles',
  touch: '# Touchpad',
  stick_buttons: '# Stick bindings',
  extra: '# Extra buttons',
  misc: '# Misc keymap',
}

const SECTION_ORDER: SectionKey[] = [
  'gyro_behavior',
  'noise',
  'sensitivity',
  'keymap',
  'touchpad',
  'sticks',
  'custom',
]

const KEYMAP_SUB_ORDER: KeymapSubsection[] = [
  'global',
  'face',
  'dpad',
  'bumpers',
  'triggers',
  'center',
  'paddles',
  'touch',
  'stick_buttons',
  'extra',
  'misc',
]

const STRUCTURAL_COMMENTS = new Set([
  '# Required Settings',
  '# Imports',
  '# Labels, icons and overlay layout (read by JSM Evolved, ignored by JoyShockMapper)',
  ...Object.values(SECTION_HEADERS),
  ...Object.values(KEYMAP_SUB_HEADERS),
])

const BUTTON_TO_SUBSECTION: Array<{ commands: string[]; subsection: KeymapSubsection }> = [
  { commands: FACE_BUTTONS.map(b => b.command.toUpperCase()), subsection: 'face' },
  { commands: DPAD_BUTTONS.map(b => b.command.toUpperCase()), subsection: 'dpad' },
  { commands: [...BUMPER_BUTTONS, ...MINI_BUTTONS].map(b => b.command.toUpperCase()), subsection: 'bumpers' },
  { commands: TRIGGER_BUTTONS.map(b => b.command.toUpperCase()), subsection: 'triggers' },
  { commands: CENTER_BUTTONS.map(b => b.command.toUpperCase()), subsection: 'center' },
  { commands: PADDLE_BUTTONS.map(b => b.command.toUpperCase()), subsection: 'paddles' },
  { commands: [...TOUCH_BUTTONS, ...TOUCH_STICK_BUTTONS].map(b => b.command.toUpperCase()), subsection: 'touch' },
  { commands: LEFT_STICK_BUTTONS.map(b => b.command.toUpperCase()).concat(RIGHT_STICK_BUTTONS.map(b => b.command.toUpperCase())), subsection: 'stick_buttons' },
  { commands: MISC_BUTTONS.map(b => b.command.toUpperCase()), subsection: 'extra' },
]

const SPECIAL_BIND_COMMANDS = new Set(bindingSpecialKeys.map(key => key.toUpperCase()))

const normalizeLine = (line: string) => {
  const trimmed = line.trim()
  const parts = trimmed.split('=')
  if (parts.length < 2) return trimmed
  const left = parts.shift()!.trim()
  const right = parts.join('=').trim()
  return `${left} = ${right}`
}

const isDirectiveKey = (key: string) => {
  const upper = key.toUpperCase()
  if (upper === 'RESET_MAPPINGS') return true
  if (upper === 'TELEMETRY' || upper === 'TELEMETRY_ENABLE' || upper === 'TELEMETRY_ENABLED') return true
  if (upper.startsWith('TELEMETRY_')) return true
  return false
}

const classifyButton = (command: string | undefined | null): KeymapSubsection => {
  if (!command) return 'misc'
  const upper = command.toUpperCase()
  for (const entry of BUTTON_TO_SUBSECTION) {
    if (entry.commands.includes(upper)) {
      return entry.subsection
    }
  }
  if (/^T\d+$/.test(upper)) return 'touch'
  return 'misc'
}

const isKnownKey = (key: string, candidates: readonly string[]) => {
  const upper = key.toUpperCase()
  return candidates.some(c => c.toUpperCase() === upper)
}

const GYRO_BEHAVIOR_EXTRA_KEYS = new Set<string>([keyName.IN_GAME_SENS, keyName.REAL_WORLD_CALIBRATION])

const classify = (rawKey: string, value: string): { section: SectionKey; subsection?: KeymapSubsection } => {
  const key = rawKey.trim().toUpperCase()
  // Gyro behavior
  if (isKnownKey(key, gyroBehaviorKeys) || GYRO_BEHAVIOR_EXTRA_KEYS.has(key)) {
    return { section: 'gyro_behavior' }
  }
  // Trigger threshold lives under Triggers in UI
  if (key === keyName.TRIGGER_THRESHOLD) {
    return { section: 'keymap', subsection: 'triggers' }
  }
  if (key === keyName.VIRTUAL_CONTROLLER) {
    return { section: 'keymap', subsection: 'global' }
  }
  if (key === keyName.ADAPTIVE_TRIGGER || key === keyName.ZL_MODE || key === keyName.ZR_MODE) {
    return { section: 'keymap', subsection: 'triggers' }
  }
  // Global timing controls shown under keymap "Global controls"
  if (isKnownKey(key, timingKeys)) {
    return { section: 'keymap', subsection: 'global' }
  }
  // Noise
  if (isKnownKey(key, noiseKeys)) {
    return { section: 'noise' }
  }
  // Sensitivity (including mode-shift prefixes like W,GYRO_SENS or combinations)
  if (isKnownKey(key, sensitivityKeys)) {
    return { section: 'sensitivity' }
  }
  const keyTokens = key.split(',').map(part => part.trim())
  if (keyTokens.length > 1) {
    const lastToken = keyTokens[keyTokens.length - 1]
    const lastBase = lastToken.includes('+') ? lastToken.split('+').pop() ?? lastToken : lastToken
    if (isKnownKey(lastBase, sensitivityKeys)) {
      return { section: 'sensitivity' }
    }
  }
  const plusSplit = key.includes('+') ? key.split('+').map(part => part.trim()) : []
  if (plusSplit.length > 1) {
    const lastPlusToken = plusSplit[plusSplit.length - 1]
    if (isKnownKey(lastPlusToken, sensitivityKeys)) {
      return { section: 'sensitivity' }
    }
  }
  // Touchpad settings (grouped with touch bindings)
  if (isKnownKey(key, touchpadKeys)) {
    return { section: 'keymap', subsection: 'touch' }
  }
  // Grip sensor settings (grouped with MISC5/MISC6, the commands they gate)
  if (isKnownKey(key, gripKeys)) {
    return { section: 'keymap', subsection: 'extra' }
  }
  // Stick settings
  if (isKnownKey(key, stickKeys)) {
    return { section: 'sticks' }
  }

  // Special binds keyed by command: treat as keymap and try to group by the first button token in the value
  if (SPECIAL_BIND_COMMANDS.has(key)) {
    const firstToken = value.trim().split(/\s+/)[0]
    if (firstToken) {
      return { section: 'keymap', subsection: classifyButton(firstToken) }
    }
    return { section: 'keymap', subsection: 'misc' }
  }

  // Direct button assignment
  const subsection = classifyButton(key)
  if (subsection !== 'misc') {
    return { section: 'keymap', subsection }
  }

  // Keymap bindings: detect by button key or combo (e.g., L3,S or SHIFT+S or UP*RIGHT)
  if (key.includes(',') || key.includes('*') || (key.includes('+') && key.length > 1)) {
    const parts = key.split(/[,+*]/).map(p => p.trim()).filter(Boolean)
    const button = parts[parts.length - 1]
    return { section: 'keymap', subsection: classifyButton(button) }
  }

  return { section: 'custom' }
}

export function parseConfigText(text: string): ParsedConfig {
  const directives: ParsedLine[] = []
  const sections: ParsedConfig['sections'] = {
    gyro_behavior: [],
    noise: [],
    sensitivity: [],
    keymap: [],
    touchpad: [],
    sticks: [],
    custom: [],
  }

  const seenDirectives = new Set<string>()
  const trailingCustom: ParsedLine[] = []
  const imports: ParsedLine[] = []
  const annotations: ParsedLine[] = []
  const seenAnnotations = new Set<string>()
  const seenImports = new Set<string>()
  let pendingComments: string[] = []

  const takeComments = () => {
    const comments = pendingComments
    pendingComments = []
    return comments.length ? comments : undefined
  }

  const addLine = (target: ParsedLine[], line: string, subsection?: KeymapSubsection) => {
    target.push({ line, subsection, comments: takeComments() })
  }

  text
    .split(/\r?\n/)
    .forEach(rawLine => {
      const line = rawLine.trim()
      if (line.length === 0) return
      const normalized = normalizeLine(line)
      const [rawKey, ...rest] = normalized.split('=')
      const keyOnly = rawKey?.trim()

      if (!keyOnly) return
      if (keyOnly.startsWith('#')) {
        // These headings are generated by serializeConfig. Treat them as
        // structure rather than user prose so a second save is idempotent.
        if (STRUCTURAL_COMMENTS.has(line)) return
        // Labels, icons and overlay placements are the app's own data wearing a
        // comment so the mapper ignores them. Dropping them here is what made a
        // label and icon vanish the moment you pressed Save.
        if (ANNOTATION.test(line) && !seenAnnotations.has(line)) {
          seenAnnotations.add(line)
          annotations.push({ line })
        } else if (!ANNOTATION.test(line)) {
          // Keep prose with the next assignment. Canonical section ordering may
          // move the assignment, but its explanation travels with it.
          pendingComments.push(line)
        }
        return
      }
      // Checked before the no-'=' branch below, which would otherwise file an
      // import under "custom" and emit it last, after the overrides.
      const imported = includeTarget(line)
      if (imported) {
        if (!seenImports.has(imported)) {
          seenImports.add(imported)
          addLine(imports, imported)
        }
        return
      }
      if (isDirectiveKey(keyOnly)) {
        const upper = keyOnly.toUpperCase()
        if (!seenDirectives.has(upper)) {
          seenDirectives.add(upper)
          addLine(directives, normalized)
        }
        return
      }
      if (rest.length === 0) {
        const upper = keyOnly.toUpperCase()
        if (upper === 'CLEAR') {
          addLine(trailingCustom, normalized)
        } else if (isKnownKey(upper, gyroBehaviorKeys)) {
          addLine(sections.gyro_behavior, normalized)
        } else if (isKnownKey(upper, noiseKeys)) {
          addLine(sections.noise, normalized)
        } else {
          addLine(sections.custom, normalized)
        }
        return
      }
      const value = rest.join('=').trim()
      const { section, subsection } = classify(rawKey, value)
      addLine(sections[section], normalized, subsection)
    })

  // A trailing banner has no following assignment to anchor to. Keep it in
  // the custom block so Save still preserves it.
  if (pendingComments.length) {
    sections.custom.push({ line: '', comments: pendingComments })
    pendingComments = []
  }

  if (trailingCustom.length) {
    sections.custom.push(...trailingCustom)
  }
  return { sections, directives, imports, annotations }
}

const serializeBlock = (header: string, lines: string[]) => {
  return [header, ...lines, '']
}

const serializeEntry = (entry: ParsedLine) => [
  ...(entry.comments ?? []),
  ...(entry.line ? [entry.line] : []),
]

export function serializeConfig(parsed: ParsedConfig): string {
  const output: string[] = []
  const miscKeymapLines: string[] = []

  if (parsed.directives.length) {
    output.push('# Required Settings')
    parsed.directives.forEach(d => output.push(...serializeEntry(d)))
    output.push('')
  }

  // Straight after the required lines and above every setting. An import is a
  // baseline the rest of the profile overrides, and only this position says so:
  // emitted any lower, the imported file would win instead.
  if (parsed.imports?.length) {
    output.push('# Imports')
    parsed.imports.forEach(entry => output.push(...serializeEntry(entry)))
    output.push('')
  }

  SECTION_ORDER.forEach(sectionKey => {
    const entries = parsed.sections[sectionKey]
    if (!entries || entries.length === 0) return

    if (sectionKey === 'keymap') {
      // No top-level keymap header; emit subsections directly
      const stickOrder: Record<string, number> = {}
      LEFT_STICK_BUTTONS.concat(RIGHT_STICK_BUTTONS).forEach((btn, idx) => {
        stickOrder[btn.command.toUpperCase()] = idx
      })
      const resolveStickRank = (line: string) => {
        const left = line.split('=')[0]?.trim() ?? ''
        const keyPart = left.includes(',') || left.includes('+') || left.includes('*')
          ? left.split(/[,+*]/).filter(Boolean).pop() ?? left
          : left
        return stickOrder[keyPart.toUpperCase()] ?? Number.MAX_SAFE_INTEGER
      }
      const touchPriority: Record<string, number> = {
        TOUCHPAD_MODE: 0,
        GRID_SIZE: 1,
        TOUCHPAD_SENS: 2,
        TOUCHPAD_DUAL_STAGE_MODE: 3,
        TOUCH_STICK_MODE: 4,
        TOUCH_DEADZONE_INNER: 5,
        TOUCH_RING_MODE: 6,
        TOUCH_STICK_RADIUS: 7,
        TOUCH_STICK_AXIS: 8,
        TOUCH: 9,
        CAPTURE: 10,
      }
      const touchRank = (line: string) => {
        const [lhsRaw, rhsRaw = ''] = line.split('=')
        const lhsTokens = (lhsRaw ?? '').split(/[,+*]/).map(t => t.trim()).filter(Boolean)
        const rhsTokens = (rhsRaw ?? '').split(/\s+/).map(t => t.trim()).filter(Boolean)
        const firstTouchToken = [...lhsTokens, ...rhsTokens].find(tok => /^T\d+$/i.test(tok)) ?? ''

        // Use the first touch token (T1, T2, …) if present
        if (firstTouchToken) {
          const match = /^T(\d+)$/i.exec(firstTouchToken)
          if (match) return 100 + Number(match[1])
        }

        // Otherwise use the explicit priority map (mode/grid/sens/touch/capture)
        const keyPart = lhsTokens[lhsTokens.length - 1] ?? (lhsRaw ?? '').trim()
        const upper = keyPart.toUpperCase()
        if (upper in touchPriority) return touchPriority[upper]

        return Number.MAX_SAFE_INTEGER
      }

      KEYMAP_SUB_ORDER.forEach(sub => {
        const subEntries = entries
          .filter(entry => (entry.subsection ?? 'misc') === sub)
          .sort((a, b) => {
            const lineA = a.line
            const lineB = b.line
            if (sub === 'stick_buttons') {
              return resolveStickRank(lineA) - resolveStickRank(lineB)
            }
            if (sub === 'touch') {
              const keyA = (lineA.split('=')[0] ?? '').trim().toUpperCase()
              const keyB = (lineB.split('=')[0] ?? '').trim().toUpperCase()
              const specialA = SPECIAL_BIND_COMMANDS.has(keyA) ? 0 : 1
              const specialB = SPECIAL_BIND_COMMANDS.has(keyB) ? 0 : 1
              if (specialA !== specialB) return specialA - specialB
              return touchRank(lineA) - touchRank(lineB)
            }
            return 0
          })
        const subLines = subEntries
          .flatMap(entry => serializeEntry(entry))
        if (subLines.length === 0) return
        if (sub === 'misc') {
          miscKeymapLines.push(...subLines)
        } else {
          output.push(KEYMAP_SUB_HEADERS[sub])
          output.push(...subLines)
          output.push('')
        }
      })
      return
    }

    let orderedEntries = [...entries]
    if (sectionKey === 'sticks') {
      const defaultsOrder = [
        keyName.STICK_DEADZONE_INNER,
        keyName.STICK_DEADZONE_OUTER,
        keyName.STICK_SENS,
        keyName.STICK_POWER,
        keyName.STICK_ACCELERATION_RATE,
        keyName.STICK_ACCELERATION_CAP,
        keyName.MOUSE_RING_RADIUS,
        keyName.SCROLL_SENS,
        keyName.FLICK_TIME,
        keyName.FLICK_TIME_EXPONENT,
        keyName.FLICK_SNAP_MODE,
        keyName.FLICK_SNAP_STRENGTH,
        keyName.FLICK_DEADZONE_ANGLE,
      ]
      const leftOrder = [
        keyName.LEFT_STICK_DEADZONE_INNER,
        keyName.LEFT_STICK_DEADZONE_OUTER,
        keyName.LEFT_STICK_MODE,
        keyName.LEFT_RING_MODE,
      ]
      const rightOrder = [
        keyName.RIGHT_STICK_DEADZONE_INNER,
        keyName.RIGHT_STICK_DEADZONE_OUTER,
        keyName.RIGHT_STICK_MODE,
        keyName.RIGHT_RING_MODE,
      ]
      const rank = (line: string) => {
        const keyPart = line.split('=')[0]?.trim().toUpperCase()
        const d = (defaultsOrder as string[]).indexOf(keyPart ?? '')
        if (d >= 0) return d
        const l = (leftOrder as string[]).indexOf(keyPart ?? '')
        if (l >= 0) return 100 + l
        const r = (rightOrder as string[]).indexOf(keyPart ?? '')
        if (r >= 0) return 200 + r
        return 1000
      }
      orderedEntries = [...orderedEntries].sort((a, b) => rank(a.line) - rank(b.line))
    }
    const lines = orderedEntries.flatMap(serializeEntry)
    output.push(...serializeBlock(SECTION_HEADERS[sectionKey], lines))
  })

  if (miscKeymapLines.length) {
    output.push(KEYMAP_SUB_HEADERS.misc)
    output.push(...miscKeymapLines)
    output.push('')
  }

  // Last, where they cannot disturb the assignment order the mapper depends on.
  // They are comments, so position is cosmetic to JoyShockMapper -- but not to
  // the reader, so they get their own block rather than being scattered.
  if (parsed.annotations?.length) {
    output.push('# Labels, icons and overlay layout (read by JSM Evolved, ignored by JoyShockMapper)')
    parsed.annotations.forEach(entry => output.push(entry.line))
    output.push('')
  }

  // Remove trailing blank lines
  while (output.length && output[output.length - 1].trim() === '') {
    output.pop()
  }
  return output.join('\n')
}

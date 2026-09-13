/**
 * What a key is called, rather than what JoyShockMapper calls it.
 *
 * Its key parser has its own vocabulary -- `SCREENSHOT` for Print Screen,
 * `CONTEXT` for the Menu key, `SUBTRACT` for the numpad minus, `N7` for numpad
 * 7, and bare punctuation for the rest -- and a binding shown as `-` is not
 * recognisable as the key beside `0`. It reads like a modifier, which is
 * exactly what it is in other positions.
 *
 * Display only. The token is what gets written to the profile and what the
 * backend reads; nothing here changes a configuration.
 */

/** Tokens whose JoyShockMapper name is not what the key is called. */
const NAMED: Record<string, string> = {
  // Punctuation. JSM takes the bare character; nobody reads `` ` `` as a key.
  // 'Hyphen', not 'Minus': on the input side of a line `-` is the View/Share
  // button, and echoing that name for a key that sends VK_OEM_MINUS invites
  // exactly the confusion this layer exists to remove.
  '-': 'Hyphen',
  '=': 'Equals',
  '[': 'Left Bracket',
  ']': 'Right Bracket',
  '\\': 'Backslash',
  ';': 'Semicolon',
  "'": 'Apostrophe',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  '`': 'Backtick',
  '+': 'Plus',

  // Keys JSM names differently from the legend printed on them.
  SCREENSHOT: 'Print Screen',
  CONTEXT: 'Menu',
  CAPS_LOCK: 'Caps Lock',
  SCROLL_LOCK: 'Scroll Lock',
  NUM_LOCK: 'Num Lock',
  PAGEUP: 'Page Up',
  PAGEDOWN: 'Page Down',
  ESC: 'Esc',
  ENTER: 'Enter',
  SPACE: 'Space',
  TAB: 'Tab',
  BACKSPACE: 'Backspace',
  DELETE: 'Delete',
  INSERT: 'Insert',
  HOME: 'Home',
  END: 'End',
  UP: 'Up Arrow',
  DOWN: 'Down Arrow',
  LEFT: 'Left Arrow',
  RIGHT: 'Right Arrow',

  // Modifiers. JSM's unsided names press the left one.
  CONTROL: 'Ctrl',
  LCONTROL: 'Left Ctrl',
  RCONTROL: 'Right Ctrl',
  SHIFT: 'Shift',
  LSHIFT: 'Left Shift',
  RSHIFT: 'Right Shift',
  ALT: 'Alt',
  LALT: 'Left Alt',
  RALT: 'Right Alt',
  LWINDOWS: 'Left Windows',
  RWINDOWS: 'Right Windows',

  // Numpad. The operators share their legend with the main-row punctuation, so
  // they have to say which keyboard they are on.
  ADD: 'Numpad Plus',
  SUBTRACT: 'Numpad Minus',
  // JoyShockMapper accepts this misspelling too, and profiles in the wild
  // contain it, so it has to read as the same key.
  SUBSTRACT: 'Numpad Minus',
  MULTIPLY: 'Numpad Multiply',
  DIVIDE: 'Numpad Divide',
  DECIMAL: 'Numpad Decimal',

  // Media and volume.
  MUTE: 'Mute',
  VOLUME_UP: 'Volume Up',
  VOLUME_DOWN: 'Volume Down',
  NEXT_TRACK: 'Next Track',
  PREV_TRACK: 'Previous Track',
  STOP_TRACK: 'Stop',
  PLAY_PAUSE: 'Play / Pause',

  // Mouse, for the values that reach a keyboard-shaped field.
  LMOUSE: 'Left Mouse',
  RMOUSE: 'Right Mouse',
  MMOUSE: 'Middle Mouse',
  BMOUSE: 'Mouse Back',
  FMOUSE: 'Mouse Forward',
  SCROLLUP: 'Scroll Up',
  SCROLLDOWN: 'Scroll Down',

  NONE: 'Unbound',
}

/** `N0`..`N9` are the numpad digits; `F1`..`F24` already read as themselves. */
const numpadDigit = (token: string) => {
  const match = /^N([0-9])$/.exec(token)
  return match ? `Numpad ${match[1]}` : null
}

/** What to show for a key token. Unknown tokens are shown as they are. */
export const keyDisplayName = (token: string): string => {
  const trimmed = token.trim()
  if (!trimmed) return trimmed
  const upper = trimmed.toUpperCase()
  return NAMED[trimmed] ?? NAMED[upper] ?? numpadDigit(upper) ?? trimmed
}

/** Whether this token is called something other than itself. */
export const hasKeyAlias = (token: string) => keyDisplayName(token) !== token.trim()

// Built once: several tokens share a display name (SUBTRACT and its
// misspelling), and the first one listed is the one typing it produces.
const BY_NAME = new Map<string, string>()
for (const [token, name] of Object.entries(NAMED)) {
  const key = name.toLowerCase()
  if (!BY_NAME.has(key)) BY_NAME.set(key, token)
}
for (let digit = 0; digit <= 9; digit += 1) BY_NAME.set(`numpad ${digit}`, `N${digit}`)

// Other names for the same keys, accepted when typed but never shown. People
// reasonably call these more than one thing, and a field that rejects the
// other name is worse than one that quietly understands it.
for (const [alias, token] of Object.entries({ minus: '-', hyphen: '-', dash: '-', grave: '`', backquote: '`', tilde: '`', 'print scr': 'SCREENSHOT', prtsc: 'SCREENSHOT', escape: 'ESC', 'return': 'ENTER', control: 'CONTROL', windows: 'LWINDOWS', spacebar: 'SPACE' })) {
  if (!BY_NAME.has(alias)) BY_NAME.set(alias, token)
}

/**
 * The token for something a person typed.
 *
 * Accepts the display name, the token itself, and a bare letter or digit, so
 * the field stays typeable by anyone who knows JoyShockMapper's own names.
 * Anything unrecognised is passed through untouched rather than rejected --
 * the same field has always accepted tokens this editor does not model.
 */
export const keyTokenFromDisplay = (text: string): string => {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  return BY_NAME.get(trimmed.toLowerCase()) ?? trimmed
}

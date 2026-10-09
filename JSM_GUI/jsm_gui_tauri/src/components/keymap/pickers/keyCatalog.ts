// Every key a binding can send, grouped the way the console picker shows them
// (console v2, KeyPicker): Common in games · Letters · Numbers · F-keys &
// system · Arrows & numpad · Media. Each key is a JoyShockMapper token with the
// legend on its cap and, where games agree on one, what it is usually for.
// Every token the old full-keyboard layout offered is in exactly one group
// (D5: every setting keeps a home).

export type KeyTile = { token: string; cap: string; use?: string }
export type KeySection = { label?: string; caption?: string; keys: KeyTile[] }
export type KeyGroupId = 'common' | 'letters' | 'numbers' | 'system' | 'arrows' | 'media'
export type KeyGroup = { id: KeyGroupId; label: string; labelKey: string; sections: KeySection[] }

/** Common in games: the keys PC games put their verbs on. */
export const COMMON_KEYS: KeyTile[] = [
  { token: 'SPACE', cap: 'Space', use: 'Jump' }, { token: 'LSHIFT', cap: 'Shift', use: 'Sprint' }, { token: 'LCONTROL', cap: 'Ctrl', use: 'Crouch, slide' },
  { token: 'E', cap: 'E', use: 'Interact' }, { token: 'F', cap: 'F', use: 'Use' }, { token: 'R', cap: 'R', use: 'Reload' },
  { token: 'Q', cap: 'Q', use: 'Ability, lean' }, { token: 'G', cap: 'G', use: 'Grenade' }, { token: 'C', cap: 'C', use: 'Crouch' },
  { token: 'V', cap: 'V', use: 'Melee' }, { token: 'TAB', cap: 'Tab', use: 'Inventory, scoreboard' }, { token: 'ESC', cap: 'Esc', use: 'Pause' },
  { token: '1', cap: '1', use: 'Weapon 1' }, { token: '2', cap: '2', use: 'Weapon 2' }, { token: '3', cap: '3', use: 'Weapon 3' },
  { token: 'M', cap: 'M', use: 'Map' }, { token: 'LALT', cap: 'Alt', use: 'Free look' }, { token: 'ENTER', cap: 'Enter', use: 'Chat, confirm' },
  { token: 'Z', cap: 'Z', use: 'Prone, sights' }, { token: 'X', cap: 'X', use: 'Holster' }, { token: 'B', cap: 'B', use: 'Buy, fire mode' },
  { token: 'T', cap: 'T', use: 'Push to talk' }, { token: 'I', cap: 'I', use: 'Inventory' },
]

const LETTER_USES: Record<string, string> = {
  W: 'Forward', A: 'Left', S: 'Back', D: 'Right', E: 'Interact', F: 'Use', R: 'Reload', Q: 'Ability, lean', G: 'Grenade', C: 'Crouch',
  V: 'Melee', M: 'Map', Z: 'Prone, sights', X: 'Holster', B: 'Buy, fire mode', T: 'Push to talk', I: 'Inventory', J: 'Journal', K: 'Skills',
  L: 'Light', P: 'Pause', H: 'Heal', N: 'Night vision', O: 'Options', Y: 'Chat', U: 'Use item',
}
const letters = 'QWERTYUIOPASDFGHJKLZXCVBNM'.split('').map(letter => ({ token: letter, cap: letter, use: LETTER_USES[letter] }))
const digits = '1234567890'.split('').map(digit => ({ token: digit, cap: digit, use: digit === '0' ? 'Weapon 10' : `Weapon ${digit}` }))
const symbols: KeyTile[] = [
  { token: '`', cap: '`', use: 'Console' }, { token: '-', cap: '-', use: 'Zoom out' }, { token: '=', cap: '=', use: 'Zoom in' },
  { token: '[', cap: '[', use: 'Previous' }, { token: ']', cap: ']', use: 'Next' }, { token: '\\', cap: '\\' },
  { token: ';', cap: ';' }, { token: "'", cap: "'" }, { token: ',', cap: ',' }, { token: '.', cap: '.' }, { token: '/', cap: '/', use: 'Chat command' },
]
const fKeys = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, at) => ({ token: `F${from + at}`, cap: `F${from + at}` }))
const F_USES: Record<string, string> = { F1: 'Help', F5: 'Quick save', F9: 'Quick load', F12: 'Screenshot' }

export const KEY_GROUPS: KeyGroup[] = [
  { id: 'common', label: 'Common in games', labelKey: 'pickers.keyGroupCommon', sections: [{ keys: COMMON_KEYS }] },
  { id: 'letters', label: 'Letters', labelKey: 'pickers.keyGroupLetters', sections: [{ keys: letters }] },
  { id: 'numbers', label: 'Numbers', labelKey: 'pickers.keyGroupNumbers', sections: [
    { label: 'Number row', keys: digits },
    { label: 'Symbols', keys: symbols },
  ] },
  { id: 'system', label: 'F-keys & system', labelKey: 'pickers.keyGroupSystem', sections: [
    { label: 'F-keys', keys: fKeys(1, 12).map(key => ({ ...key, use: F_USES[key.token] })) },
    { label: 'Extra F-keys', caption: 'F13–F24 are free for shortcuts no game uses', keys: fKeys(13, 24) },
    { label: 'System', keys: [
      { token: 'ESC', cap: 'Esc', use: 'Pause' }, { token: 'TAB', cap: 'Tab', use: 'Scoreboard' }, { token: 'ENTER', cap: 'Enter', use: 'Chat, confirm' },
      { token: 'BACKSPACE', cap: 'Backspace' }, { token: 'SPACE', cap: 'Space', use: 'Jump' }, { token: 'CAPS_LOCK', cap: 'Caps Lock' },
      { token: 'LSHIFT', cap: 'Left Shift', use: 'Sprint' }, { token: 'RSHIFT', cap: 'Right Shift' },
      { token: 'LCONTROL', cap: 'Left Ctrl', use: 'Crouch' }, { token: 'RCONTROL', cap: 'Right Ctrl' },
      { token: 'LALT', cap: 'Left Alt', use: 'Free look' }, { token: 'RALT', cap: 'Right Alt' },
      { token: 'LWINDOWS', cap: 'Left Win' }, { token: 'RWINDOWS', cap: 'Right Win' }, { token: 'CONTEXT', cap: 'Menu' },
      { token: 'SCREENSHOT', cap: 'Print Screen', use: 'Screenshot' }, { token: 'SCROLL_LOCK', cap: 'Scroll Lock' },
    ] },
  ] },
  { id: 'arrows', label: 'Arrows & numpad', labelKey: 'pickers.keyGroupArrows', sections: [
    { label: 'Arrows', keys: [{ token: 'UP', cap: '↑', use: 'Up' }, { token: 'DOWN', cap: '↓', use: 'Down' }, { token: 'LEFT', cap: '←', use: 'Left' }, { token: 'RIGHT', cap: '→', use: 'Right' }] },
    { label: 'Navigation', keys: [
      { token: 'INSERT', cap: 'Insert' }, { token: 'DELETE', cap: 'Delete' }, { token: 'HOME', cap: 'Home' },
      { token: 'END', cap: 'End' }, { token: 'PAGEUP', cap: 'Page Up' }, { token: 'PAGEDOWN', cap: 'Page Down' },
    ] },
    { label: 'Numpad', keys: [
      ...'7894561230'.split('').map(digit => ({ token: `N${digit}`, cap: `Num ${digit}` })),
      { token: 'DECIMAL', cap: 'Num .' }, { token: 'ADD', cap: 'Num +' }, { token: 'SUBTRACT', cap: 'Num -' },
      { token: 'MULTIPLY', cap: 'Num *' }, { token: 'DIVIDE', cap: 'Num /' }, { token: 'NUM_LOCK', cap: 'Num Lock' },
    ] },
  ] },
  { id: 'media', label: 'Media', labelKey: 'pickers.keyGroupMedia', sections: [{ keys: [
    { token: 'PLAY_PAUSE', cap: 'Play / Pause', use: 'Music, video' }, { token: 'NEXT_TRACK', cap: 'Next', use: 'Next track' },
    { token: 'PREV_TRACK', cap: 'Previous', use: 'Previous track' }, { token: 'STOP_TRACK', cap: 'Stop', use: 'Stop playing' },
    { token: 'VOLUME_UP', cap: 'Volume +', use: 'Louder' }, { token: 'VOLUME_DOWN', cap: 'Volume −', use: 'Quieter' },
    { token: 'MUTE', cap: 'Mute', use: 'Sound off' },
  ] }] },
]

/** Every token in the catalogue, once. */
export const ALL_KEY_TOKENS = new Set(KEY_GROUPS.flatMap(group => group.sections.flatMap(section => section.keys.map(key => key.token))))

/** The group a key opens on: Common for nothing set or a common key. */
export const keyGroupFor = (token: string): KeyGroupId => {
  if (!token || COMMON_KEYS.some(key => key.token === token)) return 'common'
  return KEY_GROUPS.find(group => group.id !== 'common' && group.sections.some(section => section.keys.some(key => key.token === token)))?.id ?? 'common'
}

/** A key's cap wherever it is listed ("Left Ctrl", "Num 7"). */
export const keyCap = (token: string) => {
  for (const group of KEY_GROUPS) for (const section of group.sections) {
    const found = section.keys.find(key => key.token === token)
    if (found && group.id !== 'common') return found.cap
  }
  return COMMON_KEYS.find(key => key.token === token)?.cap ?? token
}

// Modifiers for a key combo (PickerFamily: Key + modifier combo).
export type Modifier = 'ctrl' | 'shift' | 'alt' | 'win'
export const MODIFIERS: { id: Modifier; label: string; left: string; right: string }[] = [
  { id: 'ctrl', label: 'Ctrl', left: 'LCONTROL', right: 'RCONTROL' },
  { id: 'shift', label: 'Shift', left: 'LSHIFT', right: 'RSHIFT' },
  { id: 'alt', label: 'Alt', left: 'LALT', right: 'RALT' },
  { id: 'win', label: 'Win', left: 'LWINDOWS', right: 'RWINDOWS' },
]
export const MODIFIER_TOKENS = new Set(MODIFIERS.flatMap(modifier => [modifier.left, modifier.right, modifier.id === 'ctrl' ? 'CONTROL' : modifier.id === 'shift' ? 'SHIFT' : modifier.id === 'alt' ? 'ALT' : 'WINDOWS']))

/**
 * A combo as JoyShockMapper spells it: several keys on the same event, each
 * with that event's modifier ("LCONTROL\ C\" on press). Used when the picker
 * hands the combo back as one raw binding.
 */
export const comboExpression = (keys: string[], trigger: string) => {
  const event = trigger === 'tap' ? "'" : trigger === 'hold' ? '_' : trigger === 'release' ? '/' : trigger === 'turbo' ? '+' : '\\'
  // The token's own event modifier is added after the last key when the row
  // writes it, except on a plain press, where it is left implied.
  return keys.map((key, at) => at < keys.length - 1 || event === '\\' ? `${trigger === 'release' ? '!' : ''}${key}${event}` : `${trigger === 'release' ? '!' : ''}${key}`).join(' ')
}

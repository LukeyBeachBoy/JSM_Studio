import { invoke } from '@tauri-apps/api/core'
export type KeyboardLayout = 'standard' | 'split' | 'daisywheel'
export const shortcutLabels = { backspace: 'Backspace', space: 'Space', shift: 'Hold Shift', caps: 'Caps Lock', enter: 'Enter', symbols: 'Symbols', close: 'Close keyboard', move: 'Hold to move', scale: 'Hold to resize', reset: 'Reset size and position' }
export type ShortcutAction = keyof typeof shortcutLabels
export type KeyboardPreferences = { layout: KeyboardLayout; daisywheelVariant: 'classic' | 'inputlabs'; rightStickDpad: boolean; guideShortcut: boolean; appearance: 'theme' | 'dark' | 'light'; padPressThreshold: number; touchSmoothing: number; verticalSteadying: number; hapticType: 'automatic' | 'off' | 'tick' | 'click' | 'tone' | 'rumble' | 'sweep' | 'pulse' | 'tap'; hapticIntensity: number; shortcuts: Record<KeyboardLayout, Record<ShortcutAction, string>> }
export const defaultPreferences: KeyboardPreferences = { layout: 'split', daisywheelVariant: 'classic', rightStickDpad: false, guideShortcut: true, appearance: 'theme', padPressThreshold: 0.08, touchSmoothing: 0.5, verticalSteadying: 0.7, hapticType: 'automatic', hapticIntensity: 35, shortcuts: Object.fromEntries(['standard', 'split', 'daisywheel'].map(layout => [layout, { backspace: layout === 'daisywheel' ? 'LEFT' : 'W', space: layout === 'daisywheel' ? 'RIGHT' : 'N', shift: 'ZL', caps: layout === 'daisywheel' ? 'UP' : 'L3', enter: layout === 'daisywheel' ? 'DOWN' : 'ZR', symbols: layout === 'daisywheel' ? 'ZR' : 'L', close: '+', move: layout === 'daisywheel' ? 'R' : 'R3', scale: layout === 'daisywheel' ? 'L' : 'R', reset: 'L+R' }])) as KeyboardPreferences['shortcuts'] }
export type KeyboardFrame = {
  open: boolean; ready: boolean; layout: KeyboardLayout; shift: boolean; symbols: boolean; caps: boolean
  left: number | null; right: number | null; selected: number; petal: number | null
  rows: string[][]; petals: string[][]; preferences: KeyboardPreferences; controllerType: number
  stick: [number, number]; secondary: boolean; leftTouch: [number, number] | null; rightTouch: [number, number] | null
  daisyPresses?: number[][]
}
// Mirrors CLASSIC_PETALS / INPUTLABS_PETALS in services/virtual_keyboard.rs.
export function previewFrame(preferences: KeyboardPreferences): KeyboardFrame {
  return { open: true, ready: true, layout: preferences.layout, preferences, controllerType: 0, shift: false, caps: false, symbols: false, left: preferences.layout === 'split' ? 13 : 15, right: preferences.layout === 'split' ? 20 : 16, selected: 15, petal: null, stick: [0, 0], secondary: false, leftTouch: [-0.4, -0.4], rightTouch: [-0.3, -0.4],
    rows: ['1 2 3 4 5 6 7 8 9 0 - ⌫', 'q w e r t y u i o p [ ]', "a s d f g h j k l ; ' ↵", '⇧ z x c v b n m , . / ⇧', 'Caps ← → Space Space Space Space Space Space ← → Done'].map(row => row.split(' ')), petals: (preferences.daisywheelVariant === 'inputlabs' ? ['cdba', 'ghfe', "n'mo", 'xyzw', 'v-tu', 'rspq', 'klji', '@?.,'] : ['abcd', 'efgh', 'ijkl', 'mnop', 'qrst', 'uvwx', 'yz,.', "?!'-"]).map(p => [...p]) }
}
const native = () => '__TAURI_INTERNALS__' in window
let preview = defaultPreferences
export const keyboard = {
  getPreferences: () => native() ? invoke<KeyboardPreferences>('keyboard_preferences') : Promise.resolve(preview),
  savePreferences: (preferences: KeyboardPreferences) => {
    if (native()) return invoke<KeyboardPreferences>('keyboard_save_preferences', { preferences })
    preview = preferences; return Promise.resolve(preferences)
  },
  setOpen: (open: boolean) => native() ? invoke<void>('keyboard_set_open', { open }) : Promise.resolve(),
}

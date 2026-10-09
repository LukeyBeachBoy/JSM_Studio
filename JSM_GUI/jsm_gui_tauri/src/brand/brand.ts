// The JSM Evolved brand (design/handoff/designs/Brand JSM Evolved.dc.html):
// one mark, drawn in four colours. The Appearance page lets the person pick
// one; the pick is the app's accent, its window and tray icon, and the hue
// its neutrals lean toward (styles/accents.css).
import cyan from '../assets/brand/jsm-evolved-cyan.svg'
import cyan16 from '../assets/brand/jsm-evolved-cyan-16.svg'
import teal from '../assets/brand/jsm-evolved-teal.svg'
import teal16 from '../assets/brand/jsm-evolved-teal-16.svg'
import amber from '../assets/brand/jsm-evolved-amber.svg'
import amber16 from '../assets/brand/jsm-evolved-amber-16.svg'
import violet from '../assets/brand/jsm-evolved-violet.svg'
import violet16 from '../assets/brand/jsm-evolved-violet-16.svg'

export type Accent = 'cyan' | 'teal' | 'amber' | 'violet'

export const APP_NAME = 'JSM Evolved'
export const ACCENTS: Accent[] = ['cyan', 'teal', 'amber', 'violet']
export const DEFAULT_ACCENT: Accent = 'cyan'

export type AccentMeta = {
  id: Accent
  name: string
  /** The mark's base colour: the accent on dark. */
  hex: string
  /** The mark's deep colour: the accent on light. */
  ink: string
  note: string
  /** The mark at 24px and up. */
  mark: string
  /** The 16px cut: no dots, stick ring or satellite, so it stays a disc with an orbit. */
  mark16: string
}

export const ACCENT_META: Record<Accent, AccentMeta> = {
  cyan: {
    id: 'cyan', name: 'Deep cyan', hex: '#3E9FD8', ink: '#175C93', mark: cyan, mark16: cyan16,
    note: 'Cool blue.',
  },
  teal: {
    id: 'teal', name: 'Volt teal', hex: '#2FD8BB', ink: '#0C7F6F', mark: teal, mark16: teal16,
    note: 'Bright blue-green.',
  },
  amber: {
    id: 'amber', name: 'Solar amber', hex: '#F5A623', ink: '#9A5C00', mark: amber, mark16: amber16,
    note: 'Warm gold.',
  },
  violet: {
    id: 'violet', name: 'Ultraviolet', hex: '#8B6FF5', ink: '#4A2FC0', mark: violet, mark16: violet16,
    note: 'Soft purple.',
  },
}

export const isAccent = (value: unknown): value is Accent => typeof value === 'string' && (ACCENTS as string[]).includes(value)

/** The mark for an accent at a given rendered size: the 16px cut below 24. */
export const markFor = (accent: Accent, size: number) => (size < 24 ? ACCENT_META[accent].mark16 : ACCENT_META[accent].mark)

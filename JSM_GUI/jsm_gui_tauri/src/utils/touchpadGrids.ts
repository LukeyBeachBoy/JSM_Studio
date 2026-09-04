import type { TouchpadGridPrefix } from '../keymap/schema'

// Which pads have a grid right now, and how big. A controller with two pads
// configures them separately (LEFT_TOUCHPAD_MODE / LEFT_GRID_SIZE and the right
// pad's pair); a single-pad controller, and a two-pad controller set up through
// the shared TOUCHPAD_MODE alone, use the one shared grid.
//
// Everything that needs to know about grid cells reads this, so the Trackpads
// page and the gyro activation list can never disagree about which cells exist.
export type TouchpadGridPad = {
  side: 'left' | 'right' | 'shared'
  prefix: TouchpadGridPrefix
  columns: number
  rows: number
  cells: number
}

export type TouchpadGridInput = {
  touchpadMode?: string
  leftMode?: string
  rightMode?: string
  columns?: number
  rows?: number
  leftColumns?: number
  leftRows?: number
  rightColumns?: number
  rightRows?: number
}

const GRID_MODE = 'GRID_AND_STICK'
const clampSide = (value?: number) => Math.max(1, Math.min(5, value || 1))

const normalizeMode = (mode?: string) => (mode ?? '').trim().toUpperCase()

const pad = (
  side: TouchpadGridPad['side'],
  prefix: TouchpadGridPrefix,
  columns?: number,
  rows?: number
): TouchpadGridPad => {
  const cols = clampSide(columns)
  const rowCount = clampSide(rows)
  // The backend caps a grid at 25 cells, so offering a 26th would bind nothing.
  return { side, prefix, columns: cols, rows: rowCount, cells: Math.min(25, cols * rowCount) }
}

export function resolveTouchpadGrids(input: TouchpadGridInput): TouchpadGridPad[] {
  const perPad: TouchpadGridPad[] = []
  if (normalizeMode(input.leftMode) === GRID_MODE) {
    perPad.push(pad('left', 'LT', input.leftColumns ?? input.columns, input.leftRows ?? input.rows))
  }
  if (normalizeMode(input.rightMode) === GRID_MODE) {
    perPad.push(pad('right', 'RT', input.rightColumns ?? input.columns, input.rightRows ?? input.rows))
  }
  if (perPad.length > 0) return perPad
  if (normalizeMode(input.touchpadMode) !== GRID_MODE) return []
  return [pad('shared', 'T', input.columns, input.rows)]
}

export const touchpadGridCommands = (pads: TouchpadGridPad[]) =>
  pads.flatMap(entry => Array.from({ length: entry.cells }, (_, index) => `${entry.prefix}${index + 1}`))

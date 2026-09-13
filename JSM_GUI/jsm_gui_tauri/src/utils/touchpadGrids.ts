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
  /** RECTANGLE (rows x columns) or FOUR_WAY (cardinal wedges about the centre). */
  shape: 'RECTANGLE' | 'FOUR_WAY'
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
  shape?: string
  leftShape?: string
  rightShape?: string
}

const GRID_MODE = 'GRID_AND_STICK'
const clampSide = (value?: number) => Math.max(1, Math.min(5, value || 1))

const normalizeMode = (mode?: string) => (mode ?? '').trim().toUpperCase()
const normalizeShape = (shape?: string): TouchpadGridPad['shape'] =>
  normalizeMode(shape) === 'FOUR_WAY' ? 'FOUR_WAY' : 'RECTANGLE'

const pad = (
  side: TouchpadGridPad['side'],
  prefix: TouchpadGridPrefix,
  columns?: number,
  rows?: number,
  shape?: string
): TouchpadGridPad => {
  const cols = clampSide(columns)
  const rowCount = clampSide(rows)
  const gridShape = normalizeShape(shape)
  // A wedge layout has four regions by definition and ignores rows and columns,
  // which is what keeps the region NAMES right: sizing the button list from
  // GRID_SIZE instead left the third and fourth wedges without a definition, so
  // they fell back to the single-pad T3/T4 names on a two-pad controller.
  // The backend caps a rectangle at 25 cells, so offering a 26th would bind nothing.
  const cells = gridShape === 'FOUR_WAY' ? 4 : Math.min(25, cols * rowCount)
  return { side, prefix, columns: cols, rows: rowCount, cells, shape: gridShape }
}

export function resolveTouchpadGrids(input: TouchpadGridInput): TouchpadGridPad[] {
  const perPad: TouchpadGridPad[] = []
  if (normalizeMode(input.leftMode) === GRID_MODE) {
    perPad.push(pad('left', 'LT', input.leftColumns ?? input.columns, input.leftRows ?? input.rows, input.leftShape ?? input.shape))
  }
  if (normalizeMode(input.rightMode) === GRID_MODE) {
    perPad.push(pad('right', 'RT', input.rightColumns ?? input.columns, input.rightRows ?? input.rows, input.rightShape ?? input.shape))
  }
  if (perPad.length > 0) return perPad
  if (normalizeMode(input.touchpadMode) !== GRID_MODE) return []
  return [pad('shared', 'T', input.columns, input.rows, input.shape)]
}

export const touchpadGridCommands = (pads: TouchpadGridPad[]) =>
  pads.flatMap(entry => Array.from({ length: entry.cells }, (_, index) => `${entry.prefix}${index + 1}`))

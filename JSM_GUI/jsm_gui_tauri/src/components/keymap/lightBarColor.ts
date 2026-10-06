// Colour maths shared by the light bar swatch row and its popover (TODO-47).

export type Hsv = { h: number; s: number; v: number }

// A row of presets the pad can walk with Left/Right and pick with A. The
// native colour picker was mouse-only.
export const LIGHT_BAR_PRESETS: { name: string; hex: string }[] = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Red', hex: '#ff3b30' },
  { name: 'Orange', hex: '#ff9500' },
  { name: 'Yellow', hex: '#ffd60a' },
  { name: 'Green', hex: '#34c759' },
  { name: 'Cyan', hex: '#32ade6' },
  { name: 'Blue', hex: '#0a84ff' },
  { name: 'Purple', hex: '#af52de' },
  { name: 'Pink', hex: '#ff2d55' },
]

/** "#rrggbb" for any 3- or 6-digit hex, with or without the hash; null otherwise. */
export const normalizeHex = (text: string) => {
  const hex = text.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`
  if (/^[0-9a-f]{3}$/.test(hex)) return `#${hex.split('').map(c => c + c).join('')}`
  return null
}

export const hsvFromHex = (hex: string): Hsv => {
  const [r, g, b] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
  const hue = !delta ? 0 : max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return { h: (hue * 60 + 360) % 360, s: max ? delta / max * 100 : 0, v: max * 100 }
}

export const hexFromHsv = ({ h, s, v }: Hsv) => {
  const chroma = v / 100 * s / 100, x = chroma * (1 - Math.abs(h / 60 % 2 - 1)), m = v / 100 - chroma
  const rgb = h < 60 ? [chroma, x, 0] : h < 120 ? [x, chroma, 0] : h < 180 ? [0, chroma, x] : h < 240 ? [0, x, chroma] : h < 300 ? [x, 0, chroma] : [chroma, 0, x]
  return `#${rgb.map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`
}

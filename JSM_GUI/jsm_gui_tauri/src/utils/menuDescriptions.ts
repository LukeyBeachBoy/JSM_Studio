import type { OverlayMenu } from './overlayLayout'
import { keyDisplayName } from './keyNames'

// How the Trackpads and Joysticks rows describe an on-screen menu and a
// binding in one line (console refinement 2b).

export type PadRegionInfo = { label?: string; binding: string; extra: number; icon?: string }

/** "Bottom left", "Centre", "Top right": where a menu sits on screen. */
export const describeScreenPosition = (x: number, y: number) => {
  const vertical = y < 0.34 ? 'top' : y > 0.66 ? 'bottom' : ''
  const horizontal = x < 0.34 ? 'left' : x > 0.66 ? 'right' : ''
  const words = [vertical, horizontal].filter(Boolean).join(' ')
  return words ? words[0].toUpperCase() + words.slice(1) : 'Centre'
}

/** The On-screen menu row's line: "Shown on touch · bottom left · 320 px". */
export const describeMenuPlacement = (menu: OverlayMenu) => {
  const { placement } = menu
  return [
    placement.reveal === 'touch' ? 'Shown on touch' : 'Shown once a region is selected',
    describeScreenPosition(placement.x, placement.y).toLowerCase(),
    `${Math.round(placement.size)} px`,
  ].join(' · ')
}

/** A binding as the row reads it: "G · Grenade", "Left Mouse". */
export const bindingSummary = (info: PadRegionInfo) => {
  const first = info.binding.trim().split(/\s+/)[0] ?? ''
  const key = first ? keyDisplayName(first) : ''
  const named = [key, info.label].filter(Boolean).join(' · ')
  return (named || 'Unbound') + (info.extra > 0 ? ` +${info.extra}` : '')
}

import { useEffect, useRef, useState } from 'react'
import { MenuDrawing } from '../../overlay/MenuDrawing'
import { toUnit, type OverlayMenu } from '../../utils/overlayLayout'
import { resolveIcons, type IconData } from '../../utils/iconLibrary'

type Props = {
  menu: OverlayMenu
  aspect?: number
  selectedCommand?: string | null
  onSelect?: (command: string) => void
  /**
   * Where the thumb (or the stick) is right now, in the pad's own -1..1
   * space with +y downward, as the overlay reads it. The dot is only drawn
   * while there is a point: the editor preview has no thumb of its own.
   */
  livePoint?: { x: number; y: number } | null
  /**
   * A region to light as the overlay would while it is hot -- "Test segment"
   * on the pad (15b). Takes precedence over the selected region for as long
   * as it is set.
   */
  hotCommand?: string | null
  /** Fill the host's width rather than capping at the overlay's own size. */
  fill?: boolean
  /** Fit the complete menu inside a pinned appearance preview. */
  maxHeight?: number
  managedFocus?: boolean
}

/** The smallest name that still reads once the preview is scaled down. */
const MIN_LABEL_PX = 9

/**
 * The names as the preview can afford them. The drawing is the overlay's at
 * full size, scaled by CSS, so a 360 px wheel in a 150 px template tile drew
 * eight 18 px names over each other and a hotbar's "Slot 1" as "We…". Names
 * shrink with the room each slice has and go (keys stay) when they could not
 * be read; the in-game overlay draws the menu untouched.
 */
function fitLabels(menu: OverlayMenu, scale: number): OverlayMenu {
  if (!menu.placement.showLabels) return menu
  const placement = menu.placement
  const font = placement.labelFontSize ?? placement.fontSize
  const count = Math.max(1, menu.regions.length)
  // The room a name has, in the drawing's own pixels: a slice's width along the ring, a cell's width.
  let room = placement.size / Math.max(1, menu.columns)
  if (menu.shape === 'RADIAL' || menu.shape === 'EIGHT_WAY') {
    const inner = Math.min(0.95, Math.max(0, menu.deadzone))
    const radius = (placement.size / 2) * (inner + (1 - inner) * 0.5)
    room = count < 2 ? placement.size : 2 * radius * Math.sin(Math.PI / count)
  }
  // About eight characters of a bold name ("Weapon 8") across the room, never larger than asked.
  const fitted = Math.min(font, room / 5)
  const hotbar = !!menu.displayAspect && menu.displayAspect > 1
  if (hotbar || fitted * scale < MIN_LABEL_PX) return { ...menu, placement: { ...placement, showLabels: false, showKeys: true } }
  return fitted >= font ? menu : { ...menu, placement: { ...placement, labelFontSize: Math.floor(fitted) } }
}

/**
 * The overlay's own renderer, scaled into the editor (15b/15c), so the
 * preview is a picture of the menu the player will see rather than a
 * different drawing of the same settings.
 */
export function MenuPreview({ menu, aspect = 1, selectedCommand, onSelect, livePoint, hotCommand, fill, maxHeight, managedFocus }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(360)
  const [icons, setIcons] = useState<Record<string, IconData>>({})
  const names = [...menu.regions, ...(menu.centerRegion ? [menu.centerRegion] : [])].map(region => region.icon).filter((name): name is string => !!name).join(',')
  useEffect(() => { let cancelled = false; resolveIcons(names ? names.split(',') : []).then(value => { if (!cancelled) setIcons(value) }).catch(() => {}); return () => { cancelled = true } }, [names])
  useEffect(() => { const node = host.current; if (!node) return; const observer = new ResizeObserver(() => setWidth(node.clientWidth)); observer.observe(node); setWidth(node.clientWidth); return () => observer.disconnect() }, [])
  // The dot is moved by transform alone, the same way the overlay moves it,
  // so a telemetry frame costs no layout.
  useEffect(() => {
    if (!dot.current || !livePoint) return
    const transform = `translate(${toUnit(livePoint.x) * 100}cqw, ${toUnit(livePoint.y) * 100}cqh) translate(-50%, -50%)`
    dot.current.style.transform = transform
    dot.current.parentElement?.querySelectorAll<HTMLElement>('[data-trail]').forEach(trail => { trail.style.transform = transform })
  })
  const height = menu.placement.size / (menu.shape === 'RADIAL' || menu.shape === 'EIGHT_WAY' ? 1 : aspect)
  const scale = Math.min(fill ? width / menu.placement.size : Math.min(1, width / menu.placement.size), maxHeight === undefined ? Infinity : Math.max(1, maxHeight) / height)
  const drawn = fitLabels(menu, scale)
  return <div ref={host} style={{ width: '100%', maxWidth: fill || maxHeight !== undefined ? undefined : 520, margin: fill ? 0 : '16px auto', height: height * scale, position: 'relative' }}>
    <div style={{ position: 'absolute', width: menu.placement.size, height, left: '50%', marginLeft: -menu.placement.size / 2, transform: `scale(${scale})`, transformOrigin: 'top center' }}>
      <MenuDrawing menu={drawn} icons={icons} managedFocus={managedFocus} selectedCommand={hotCommand ?? selectedCommand} onSelect={onSelect} onDotRef={livePoint ? element => { dot.current = element } : undefined} />
    </div>
  </div>
}

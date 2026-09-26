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
}

/**
 * The overlay's own renderer, scaled into the editor (15b/15c), so the
 * preview is a picture of the menu the player will see rather than a
 * different drawing of the same settings.
 */
export function MenuPreview({ menu, aspect = 1, selectedCommand, onSelect, livePoint, hotCommand, fill }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(360)
  const [icons, setIcons] = useState<Record<string, IconData>>({})
  const names = menu.regions.map(region => region.icon).filter((name): name is string => !!name).join(',')
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
  const scale = fill ? width / menu.placement.size : Math.min(1, width / menu.placement.size)
  const height = menu.placement.size / (menu.shape === 'RADIAL' || menu.shape === 'EIGHT_WAY' ? 1 : aspect)
  return <div ref={host} style={{ width: '100%', maxWidth: fill ? undefined : 520, margin: fill ? 0 : '16px auto', height: height * scale, position: 'relative' }}>
    <div style={{ position: 'absolute', width: menu.placement.size, height, left: '50%', marginLeft: -menu.placement.size / 2, transform: `scale(${scale})`, transformOrigin: 'top center' }}>
      <MenuDrawing menu={menu} icons={icons} selectedCommand={hotCommand ?? selectedCommand} onSelect={onSelect} onDotRef={livePoint ? element => { dot.current = element } : undefined} />
    </div>
  </div>
}

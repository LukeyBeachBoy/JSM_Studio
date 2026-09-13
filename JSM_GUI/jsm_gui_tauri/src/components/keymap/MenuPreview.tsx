import { useEffect, useRef, useState } from 'react'
import { MenuDrawing } from '../../overlay/MenuDrawing'
import type { OverlayMenu } from '../../utils/overlayLayout'
import { resolveIcons, type IconData } from '../../utils/iconLibrary'
export function MenuPreview({ menu, aspect = 1, selectedCommand, onSelect }: { menu: OverlayMenu; aspect?: number; selectedCommand?: string | null; onSelect?: (command: string) => void }) {
 const host = useRef<HTMLDivElement>(null)
 const [width, setWidth] = useState(360)
 const [icons, setIcons] = useState<Record<string, IconData>>({})
 const names = menu.regions.map(region => region.icon).filter((name): name is string => !!name).join(',')
 useEffect(() => { let cancelled = false; resolveIcons(names ? names.split(',') : []).then(value => { if (!cancelled) setIcons(value) }).catch(() => {}); return () => { cancelled = true } }, [names])
 useEffect(() => { const node = host.current; if (!node) return; const observer = new ResizeObserver(() => setWidth(node.clientWidth)); observer.observe(node); setWidth(node.clientWidth); return () => observer.disconnect() }, [])
 const scale = Math.min(1, width / menu.placement.size)
 const height = menu.placement.size / (menu.shape === 'RADIAL' ? 1 : aspect)
 return <div ref={host} style={{ width: '100%', maxWidth: 520, margin: '16px auto', height: height * scale, position: 'relative' }}>
   <div style={{ position: 'absolute', width: menu.placement.size, height, left: '50%', marginLeft: -menu.placement.size / 2, transform: `scale(${scale})`, transformOrigin: 'top center' }}>
     <MenuDrawing menu={menu} icons={icons} selectedCommand={selectedCommand} onSelect={onSelect} />
   </div>
 </div>
}

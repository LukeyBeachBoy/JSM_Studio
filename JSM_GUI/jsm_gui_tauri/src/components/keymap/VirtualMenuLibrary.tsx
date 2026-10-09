import { useId, useState } from 'react'
import { Select, type SelectOption } from '../ui/Select'
import './VirtualMenuLibrary.css'
import { ValueRow } from '../ui/console'
import { MenuPreview } from './MenuPreview'
import { placeMenu } from '../../utils/padGeometry'
import { namedMenuOverlay } from '../../utils/namedMenuOverlay'
import type { VirtualMenu } from '../../utils/virtualMenus'

// Where virtual menus sit on the screen: the screen preview a menu is dragged
// on, its across / down values, and "Position all menus" (every menu to scale,
// overlaps, Match position with). The Menus tab itself is
// components/menus/MenusPage.tsx (console v2, MenuEditor); these are its
// Position on screen page.

const OPTION_DESCRIPTIONS: Record<string, string> = {}

export function MenuChoice({ label, hint, help, adjust }: { label: string; hint?: string; help?: string; adjust: { kind: 'choice'; value: string; options: SelectOption[]; onChange: (value: string) => void } }) {
  const id = useId()
  return <div className="virtual-menus__field">
    <label htmlFor={id}>{label}</label>
    {(hint || help) && <p id={`${id}-help`}>{hint} {help}</p>}
    <Select id={id} ariaLabel={label} ariaDescribedBy={hint || help ? `${id}-help` : undefined} value={adjust.value} onValueChange={adjust.onChange}
      options={adjust.options.map(option => ({ ...option, description: option.description ?? OPTION_DESCRIPTIONS[option.value] ?? (option.value === 'NONE' ? label === 'Cancel input' ? 'No separate cancel button. Bind Close menu to any regular input to cancel.' : 'Use the navigation input’s default confirm button: pad click, stick click, D-pad Up or north face button.' : `Use ${option.label} while this menu is open.`) }))} />
  </div>
}
/** Across and down, as value rows ◂ ▸ step (console v2: like the Look rows). */
export function MenuPositionFields({ menu, onChange }: { menu: VirtualMenu; onChange: (patch: Partial<VirtualMenu['placement']>) => void }) {
  return <div className="virtual-menus__position-values">{(['x', 'y'] as const).map(axis => <ValueRow key={axis} label={axis === 'x' ? 'Horizontal position' : 'Vertical position'} hint={axis === 'x' ? 'From the left edge' : 'From the top edge'}
    value={Math.round(menu.placement[axis] * 100)} min={0} max={100} step={1} format={value => `${value}%`} onChange={value => onChange({ [axis]: value / 100 })} />)}</div>
}
export function MenuPositionScreen({ menu, menus = [menu], onChange, compare = false }: { menu: VirtualMenu; menus?: VirtualMenu[]; onChange: (patch: Partial<VirtualMenu['placement']>) => void; compare?: boolean }) {
  const screenWidth = window.screen.availWidth || window.screen.width || 1920
  const screenHeight = window.screen.availHeight || window.screen.height || 1080
  return <>
    <div className="virtual-menus__screen" style={{ aspectRatio: `${screenWidth} / ${screenHeight}` }} role="slider" tabIndex={0} aria-label="Overlay position" aria-valuetext={`${Math.round(menu.placement.x * 100)}% across, ${Math.round(menu.placement.y * 100)}% down`} aria-valuenow={Math.round(menu.placement.x * 100)} aria-valuemin={0} aria-valuemax={100}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); const box = event.currentTarget.getBoundingClientRect(); onChange({ x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)) }) }}
      onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const box = event.currentTarget.getBoundingClientRect(); onChange({ x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)) }) }}
      onKeyDown={event => { const delta = event.shiftKey ? .05 : .01; const axis = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 'x' : 'y'; if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); onChange({ [axis]: Math.min(1, Math.max(0, menu.placement[axis] + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -delta : delta))) }) }}>
      {menus.map((item, index) => {
        const box = placeMenu(item.placement, item.type === 'HOTBAR' ? 5 : 1, { x: 0, y: 0, width: screenWidth, height: screenHeight })
        return <div key={item.id} className="virtual-menus__screen-menu" data-menu-id={item.id} data-current={item.id === menu.id} data-compare={compare} style={{ left: `${box.x / screenWidth * 100}%`, top: `${box.y / screenHeight * 100}%`, width: `${box.width / screenWidth * 100}%`, height: `${box.height / screenHeight * 100}%`, zIndex: item.id === menu.id ? menus.length + 1 : index + 1, ...(compare ? { color: positionColor(index) } : {}) }}>
          <MenuPreview menu={namedMenuOverlay(item)} aspect={item.type === 'HOTBAR' ? 5 : 1} fill />
          {compare && <span className="virtual-menus__screen-label">{index + 1} · {item.name}</span>}
        </div>
      })}
    </div>
    <p className="virtual-menus__screen-caption">{screenWidth} × {screenHeight} · {menu.placement.size} px wide · {Math.round(menu.placement.x * 100)}% across / {Math.round(menu.placement.y * 100)}% down</p>
  </>
}
export const positionColor = (index: number) => `hsl(${(index * 137.5 + 35) % 360} 80% 70%)`
const revealLabels: Record<VirtualMenu['placement']['reveal'], string> = { touch: 'When activated', navigate: 'While navigating', ring: 'With an action highlighted', never: 'Overlay hidden' }
export function MenuPositionWorkspace({ menus, selectedId, onSelect, onChange }: { menus: VirtualMenu[]; selectedId: string; onSelect: (id: string) => void; onChange: (id: string, patch: Partial<VirtualMenu['placement']>) => void }) {
  const menu = menus.find(item => item.id === selectedId) ?? menus[0]
  const [matchId, setMatchId] = useState('')
  if (!menu) return null
  const otherMenus = menus.filter(item => item.id !== menu.id)
  const match = otherMenus.find(item => item.id === matchId) ?? otherMenus[0]
  const area = { x: 0, y: 0, width: window.screen.availWidth || window.screen.width || 1920, height: window.screen.availHeight || window.screen.height || 1080 }
  const box = placeMenu(menu.placement, menu.type === 'HOTBAR' ? 5 : 1, area)
  const overlaps = otherMenus.filter(item => {
    const other = placeMenu(item.placement, item.type === 'HOTBAR' ? 5 : 1, area)
    return box.x < other.x + other.width && box.x + box.width > other.x && box.y < other.y + other.height && box.y + box.height > other.y
  })
  return <div className="virtual-menu-position-workspace">
    <section className="virtual-menu-position-workspace__canvas" aria-label="All menu positions">
      <p>Moving <strong>{menu.name}</strong> · Click or drag on the screen. Arrow keys move by 1%; Shift + arrow moves by 5%.</p>
      <MenuPositionScreen menu={menu} menus={menus} compare onChange={patch => onChange(menu.id, patch)} />
    </section>
    <div className="virtual-menu-position-workspace__settings">
      <section className="virtual-menu-position-workspace__list" aria-label="Choose menu to position">
        {menus.map((item, index) => <button type="button" key={item.id} aria-pressed={item.id === menu.id} onClick={() => onSelect(item.id)}><span className="virtual-menu-position-workspace__marker" style={{ color: positionColor(index) }}>{index + 1}</span><span><strong>{item.name}</strong><small>{revealLabels[item.placement.reveal]}</small></span></button>)}
      </section>
      <MenuPositionFields menu={menu} onChange={patch => onChange(menu.id, patch)} />
      {match && <section className="virtual-menu-position-workspace__match">
        <MenuChoice label="Match position with" adjust={{ kind: 'choice', value: match.id, options: otherMenus.map(item => ({ value: item.id, label: item.name, description: `Use the same horizontal and vertical position as ${item.name}.` })), onChange: setMatchId }} />
        <button type="button" className="button button--secondary" onClick={() => onChange(menu.id, { x: match.placement.x, y: match.placement.y })}>Use this position</button>
      </section>}
      <p role="status">{overlaps.length ? `Overlapping footprints: ${overlaps.map(item => item.name).join(', ')}.` : 'No overlapping footprints.'} Footprints include the corners around radial wheels. Menus with different activation bindings may still appear together.</p>
    </div>
  </div>
}

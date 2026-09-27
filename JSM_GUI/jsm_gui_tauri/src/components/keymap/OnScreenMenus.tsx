import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { MenuDrawing } from '../../overlay/MenuDrawing'
import { SummaryRow, ExpandRow } from '../ui/SummaryRow'
import { ButtonGlyph } from '../glyphs/ButtonGlyph'
import { Icon } from '../icons/Icon'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import { defaultPosition, resolveOverlayMenus, setOverlayPlacement, type OverlayMenu, type OverlayPad, type OverlayPlacement } from '../../utils/overlayLayout'
import { resolveIcons, type IconData } from '../../utils/iconLibrary'
import { menuBox } from '../../utils/padGeometry'
import { describeScreenPosition } from '../../utils/menuDescriptions'
import { inputDisplayName } from '../../keymap/inputNames'
import { layerHue, layerSlotOf } from '../../utils/layers'

// On-screen menus (console refinement 2d, D6): a full-window view, opened from
// the On-screen menu row of any pad or stick wheel, that draws every menu the
// configuration has -- every layer's included -- where it sits on screen, so
// overlaps show. The menu it was opened from is selected; LB/RB step through
// the rest. Look and position are edited together in the panel on the right.
// A picks the selected menu up: the left stick (or arrows) moves it, the
// right stick resizes it, A drops it and B puts it back. B otherwise closes
// the view and returns to the row that opened it.

export type MenuSurface = {
  /** '' for Default, else the Studio layer's id. */
  layerId: string
  layerName: string
  /** Position in the layer list, for --layer-n. */
  colorIndex?: number
  /** The configuration as this layer reads it, imports resolved. */
  text: string
}

type Props = {
  open: boolean
  onClose: () => void
  configName: string
  /** The menu that opened the view, as resolveOverlayMenus keys it (RIGHT, RIGHT:MISC2, RSTICK). */
  origin?: string
  /** The layer being edited when it opened, so its own menu is the one selected. */
  originLayerId?: string
  surfaces: MenuSurface[]
  onChange: (layerId: string, update: (previous: string) => string) => void
  padAspect: number
}

type Entry = { id: string; key: string; surface: MenuSurface; menu: OverlayMenu }

const SURFACE_NAMES: Record<OverlayPad, string> = { LEFT: 'Left pad', RIGHT: 'Right pad', LSTICK: 'Left stick wheel', RSTICK: 'Right stick wheel' }
const splitKey = (key: string) => { const [pad, chord = ''] = key.split(':'); return { pad: pad as OverlayPad, chord } }
const chordName = (chord: string) => chord.split(/[,+]/).map(part => inputDisplayName(part, 'generic')).join(' + ')
const layerVar = (index: number | undefined, soft = false) => index === undefined ? undefined : layerHue(layerSlotOf(index), soft ? '-soft' : '')

export function OnScreenMenus({ open, onClose, configName, origin, originLayerId = '', surfaces, onChange, padAspect }: Props) {
  // Every surface's menus. A layer's menu is listed only where it differs
  // from Default's: a layer that changes nothing about a menu shows it once.
  const entries = useMemo<Entry[]>(() => {
    const base = surfaces.find(surface => surface.layerId === '')
    const baseMenus = base ? resolveOverlayMenus(base.text) : {}
    const list: Entry[] = []
    for (const surface of surfaces) {
      const menus = surface.layerId === '' ? baseMenus : resolveOverlayMenus(surface.text)
      for (const key of Object.keys(menus).sort()) {
        if (surface.layerId !== '' && baseMenus[key] && JSON.stringify(baseMenus[key]) === JSON.stringify(menus[key])) continue
        list.push({ id: `${surface.layerId}|${key}`, key, surface, menu: menus[key] })
      }
    }
    return list
  }, [surfaces])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    const wanted = `${originLayerId}|${origin ?? ''}`
    setSelectedId(entries.some(entry => entry.id === wanted) ? wanted : entries.find(entry => entry.key === origin)?.id ?? entries[0]?.id ?? null)
    // Only on opening: entries change with every edit made here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, origin, originLayerId])
  const selected = entries.find(entry => entry.id === selectedId) ?? entries[0] ?? null

  const write = (entry: Entry, next: Partial<OverlayPlacement>) => {
    const { pad, chord } = splitKey(entry.key)
    onChange(entry.surface.layerId, previous => setOverlayPlacement(previous, pad, chord, { ...entry.menu.placement, ...next }))
  }

  // LB / RB step menus (D10) -- the pad sends them to an open view as events.
  const view = useRef<HTMLDivElement>(null)
  const latest = useRef({ entries, selected })
  latest.current = { entries, selected }
  useEffect(() => {
    const node = view.current
    if (!open || !node) return
    const onPad = (event: Event) => {
      const button = (event as CustomEvent<PadEventDetail>).detail.button
      if (button !== 'LB' && button !== 'RB') return
      const { entries: list, selected: current } = latest.current
      if (!list.length) return
      const index = Math.max(0, list.findIndex(entry => entry.id === current?.id))
      const next = list[Math.min(list.length - 1, Math.max(0, index + (button === 'LB' ? -1 : 1)))]
      setSelectedId(next.id)
      event.preventDefault()
    }
    document.addEventListener(PAD_EVENT, onPad)
    return () => document.removeEventListener(PAD_EVENT, onPad)
  }, [open])

  // The monitor's own proportions and resolution ("Your screen · 2560 × 1440").
  const screenW = typeof window !== 'undefined' && window.screen?.width ? window.screen.width : 1920
  const screenH = typeof window !== 'undefined' && window.screen?.height ? window.screen.height : 1080
  const ratio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const screenAspect = screenW / screenH

  // ---- Pointer: drag a menu to move it, its handle to resize (as before).
  const screenRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; mode: 'move' | 'resize' } | null>(null)
  const onPointerDown = (entry: Entry, mode: 'move' | 'resize') => (event: ReactPointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedId(entry.id)
    drag.current = { id: entry.id, mode }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent) => {
    const current = drag.current
    const box = screenRef.current?.getBoundingClientRect()
    const entry = current && entries.find(candidate => candidate.id === current.id)
    if (!current || !box || !entry || box.width === 0) return
    const fx = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
    const fy = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height))
    if (current.mode === 'move') { write(entry, { x: fx, y: fy }); return }
    // Resize from the centre, in the stored logical width.
    const halfWidth = Math.abs(fx - entry.menu.placement.x) * box.width
    write(entry, { size: Math.round((halfWidth * 2 * screenW) / box.width) })
  }

  // ---- Pick up (A on Position): the sticks move and resize; B puts it back.
  const pickedFrom = useRef<OverlayPlacement | null>(null)
  const [carrying, setCarrying] = useState(false)

  // Icons for every drawn menu, resolved once per set of names.
  const iconNames = entries.flatMap(entry => entry.menu.regions.map(region => region.icon)).filter((name): name is string => Boolean(name))
  const iconKey = [...new Set(iconNames)].sort().join(',')
  const [icons, setIcons] = useState<Record<string, IconData>>({})
  useEffect(() => { let cancelled = false; resolveIcons(iconKey ? iconKey.split(',') : []).then(value => { if (!cancelled) setIcons(value) }).catch(() => {}); return () => { cancelled = true } }, [iconKey])

  if (!open) return null
  const placement = selected?.menu.placement
  const shows = placement ? [placement.showLabels ? 'Names' : '', placement.showKeys ? 'keys' : '', selected!.menu.regions.some(region => region.icon) && placement.showIcons !== false ? 'icons' : ''].filter(Boolean) : []
  const showsText = shows.length ? shows.join(', ').replace(/^./, c => c.toUpperCase()) : 'Shape only'
  const describe = (entry: Entry) => {
    const { chord } = splitKey(entry.key)
    const regions = entry.menu.regions.length
    return `${entry.surface.layerId ? `${entry.surface.layerName} layer` : 'Default layer'}${chord ? ` · while ${chordName(chord)} is held` : ''} · ${regions} ${regions === 1 ? 'region' : 'regions'}`
  }

  return (
    <div className="modal-overlay menus-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={view} className="menus-view" role="dialog" aria-modal="true" aria-labelledby="menus-title">
        <button type="button" className="sheet__close" tabIndex={-1} data-nav-skip data-modal-close aria-label="Done" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
        <header className="menus-view__header">
          <div className="menus-view__title">
            <span className="eyebrow">{configName}</span>
            <b id="menus-title">On-screen menus</b>
          </div>
          {entries.length > 0 && (
            <div className="menus-view__chips" role="tablist" aria-label="Menus">
              <ButtonGlyph button="LB" size={22} />
              {entries.map(entry => {
                const { pad, chord } = splitKey(entry.key)
                const current = entry.id === selected?.id
                return (
                  <button key={entry.id} type="button" role="tab" aria-selected={current} className="menus-chip" data-state={current ? 'selected' : undefined}
                    data-nav-entry-skip="" tabIndex={current ? 0 : -1} onClick={() => setSelectedId(entry.id)} data-hints="A:Select;B:Done">
                    <b>{SURFACE_NAMES[pad]}{chord ? ` · ${chordName(chord)}` : ''}</b>
                    <span style={{ color: layerVar(entry.surface.colorIndex) ?? (current ? 'var(--text-2)' : 'var(--text-3)') }}>{entry.surface.layerName}</span>
                  </button>
                )
              })}
              <ButtonGlyph button="RB" size={22} />
            </div>
          )}
        </header>

        {entries.length === 0 ? (
          <p className="menus-view__empty">No on-screen menus yet. Set a pad to Menu, or a stick to a radial menu, and bind a region; its menu appears here.</p>
        ) : (
          <div className="menus-view__body">
            <div className="menus-view__screen-col">
              <div ref={screenRef} className="menus-screen" style={{ aspectRatio: String(screenAspect) } as CSSProperties}
                onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null }} onPointerLeave={() => { drag.current = null }}>
                <span className="menus-screen__label">Your screen · {Math.round(screenW * ratio)} × {Math.round(screenH * ratio)}</span>
                {entries.map(entry => {
                  const aspect = entry.menu.shape === 'RADIAL' || entry.menu.shape === 'EIGHT_WAY' ? 1 : padAspect
                  const box = menuBox(entry.menu.placement.size, aspect)
                  const current = entry.id === selected?.id
                  const widthPct = (box.width / screenW) * 100
                  const heightPct = (box.height / screenH) * 100
                  return (
                    <div key={entry.id} className="menus-screen__menu" data-state={current ? 'selected' : undefined} data-carrying={current && carrying ? 'true' : undefined}
                      style={{
                        left: `${entry.menu.placement.x * 100}%`, top: `${entry.menu.placement.y * 100}%`, width: `${widthPct}%`, height: `${heightPct}%`,
                        ['--menu-ring' as string]: current ? 'var(--focus-controller)' : layerVar(entry.surface.colorIndex) ?? 'var(--line-2)',
                      } as CSSProperties}
                      onPointerDown={onPointerDown(entry, 'move')} aria-hidden="true">
                      <ScaledMenu menu={entry.menu} icons={icons} aspect={aspect} />
                      {current && <span className="menus-screen__handle" onPointerDown={onPointerDown(entry, 'resize')} />}
                    </div>
                  )
                })}
              </div>
              <p className="menus-view__note">A picks up the selected menu. Move it with the left stick and resize it with the right stick, then A to drop or B to put it back.</p>
            </div>

            {selected && placement && (
              <div className="menus-view__panel" data-nav-region="menu-rows">
                <div className="menus-view__menu-name">
                  <b>{SURFACE_NAMES[splitKey(selected.key).pad]}</b>
                  <span>{describe(selected)}</span>
                </div>
                <SummaryRow size="sheet" label="Position" value={describeScreenPosition(placement.x, placement.y)} hints="A:Pick up;Y:Reset position;B:Done"
                  data={{ 'data-autofocus': '' }}
                  onUseDefault={() => write(selected, defaultPosition(splitKey(selected.key).pad))}
                  adjust={{
                    kind: 'custom',
                    onBegin: () => { pickedFrom.current = { ...placement }; setCarrying(true) },
                    onEnd: revert => { if (revert && pickedFrom.current) write(selected, pickedFrom.current); pickedFrom.current = null; setCarrying(false) },
                    onArrow: key => {
                      const step = 0.01
                      const [dx, dy] = key === 'ArrowLeft' ? [-step, 0] : key === 'ArrowRight' ? [step, 0] : key === 'ArrowUp' ? [0, -step] : [0, step]
                      write(selected, { x: Math.min(1, Math.max(0, placement.x + dx)), y: Math.min(1, Math.max(0, placement.y + dy)) })
                    },
                    onStick: (_dx, dy) => write(selected, { size: Math.round(Math.min(900, Math.max(120, placement.size - dy * 0.4))) }),
                  }} />
                <SummaryRow size="sheet" label="Width" mono value={`${Math.round(placement.size)} px`}
                  adjust={{ kind: 'number', value: Math.round(placement.size), min: 120, max: 900, step: 10, onChange: value => write(selected, { size: value }) }} />
                <SummaryRow size="sheet" label="Text size" mono value={`${Math.round(placement.fontSize)} px`}
                  adjust={{ kind: 'number', value: Math.round(placement.fontSize), min: 8, max: 48, step: 1, onChange: value => write(selected, { fontSize: value }) }} />
                <ExpandRow size="sheet" label="Shows" value={showsText}>
                  <SummaryRow size="sheet" label="Action names" toggle={{ on: placement.showLabels, onChange: on => write(selected, { showLabels: on }) }} />
                  <SummaryRow size="sheet" label="Keys" hint="The key or button each region sends" toggle={{ on: placement.showKeys, onChange: on => write(selected, { showKeys: on }) }} />
                  <SummaryRow size="sheet" label="Icons" hint="The icons regions were given" toggle={{ on: placement.showIcons !== false, onChange: on => write(selected, { showIcons: on }) }} />
                </ExpandRow>
                <SummaryRow size="sheet" label="Appears"
                  help="As soon as it's touched: the menu is up before anything is selected, so you can aim first. Use it when a region fires the moment it is touched. Once a region is selected: hidden until your thumb or the stick reaches the ring; quieter, and the default for stick wheels."
                  adjust={{ kind: 'choice', value: placement.reveal, options: [{ value: 'touch', label: 'As soon as it’s touched' }, { value: 'ring', label: 'Once a region is selected' }], onChange: value => write(selected, { reveal: value as 'ring' | 'touch' }) }} />
                <div className="menus-view__spacer" />
                <footer className="sheet__footer" aria-label="Controls">
                  <span className="sheet__hint"><ButtonGlyph button="A" size={24} />Pick up</span>
                  <span className="sheet__hint"><ButtonGlyph button="Y" size={24} />Reset position</span>
                  <span className="sheet__hint"><ButtonGlyph button="B" size={24} />Done</span>
                </footer>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** The overlay's own drawing, scaled to the box the menu takes on the preview screen. */
function ScaledMenu({ menu, icons, aspect }: { menu: OverlayMenu; icons: Record<string, IconData>; aspect: number }) {
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const node = host.current
    if (!node) return
    const observer = new ResizeObserver(() => setWidth(node.clientWidth))
    observer.observe(node)
    setWidth(node.clientWidth)
    return () => observer.disconnect()
  }, [])
  const size = menu.placement.size
  const factor = width > 0 ? width / size : 0
  return (
    <div ref={host} className="menus-screen__drawing">
      {factor > 0 && (
        <div style={{ position: 'absolute', left: 0, top: 0, width: size, height: size / aspect, transform: `scale(${factor})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
          <MenuDrawing menu={menu} icons={icons} selectedCommand={null} />
        </div>
      )}
    </div>
  )
}

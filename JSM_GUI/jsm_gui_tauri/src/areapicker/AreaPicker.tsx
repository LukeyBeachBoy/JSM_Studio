import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  describeMouseArea,
  mouseAreaPixels,
  normalizeMouseAreaFit,
  padFootprint,
  sanitizeMouseArea,
  type MouseArea,
} from '../utils/mouseArea'
import styles from './AreaPicker.module.css'

// The mouse-area picker (services/area_picker.rs): one monitor's worth of
// glass, dimmed, on which the rectangle a MOUSE_AREA pad drives the cursor
// inside is drawn with the mouse. Drag on empty glass draws a new rectangle;
// drag inside the rectangle moves it; drag a handle resizes it. Enter keeps,
// Esc cancels, Tab moves the picker to the next monitor.
//
// Everything is kept as FRACTIONS of the monitor, because that is what the
// mapper stores: the window covers the monitor exactly, so a fraction of the
// window is a fraction of the screen.

type PickerMonitor = { x: number; y: number; width: number; height: number; scale: number; index: number; count: number }
type PickerState = {
  request: { pad: string; area: MouseArea | null; fit: string; padAspect: number }
  monitor: PickerMonitor
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

type Drag =
  | { kind: 'draw'; startX: number; startY: number }
  | { kind: 'move'; startX: number; startY: number; origin: MouseArea }
  | { kind: 'resize'; handle: Handle; origin: MouseArea }

/** A drag smaller than this (in fractions) is a click, not a rectangle. */
const CLICK_SLOP = 0.004

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function padName(pad: string) {
  if (pad === 'LEFT') return 'Left pad'
  if (pad === 'RIGHT') return 'Right pad'
  return 'Touchpad'
}

/** The rectangle between two points, normalised so width and height are positive. */
function between(ax: number, ay: number, bx: number, by: number): MouseArea {
  const x = Math.min(ax, bx)
  const y = Math.min(ay, by)
  return { x, y, w: Math.abs(bx - ax), h: Math.abs(by - ay) }
}

function resized(origin: MouseArea, handle: Handle, px: number, py: number): MouseArea {
  let left = origin.x
  let top = origin.y
  let right = origin.x + origin.w
  let bottom = origin.y + origin.h
  if (handle.includes('w')) left = px
  if (handle.includes('e')) right = px
  if (handle.includes('n')) top = py
  if (handle.includes('s')) bottom = py
  return between(left, top, right, bottom)
}

export function AreaPicker() {
  const [state, setState] = useState<PickerState | null>(null)
  const [rect, setRect] = useState<MouseArea | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<Drag | null>(null)
  const rectRef = useRef<MouseArea | null>(null)
  rectRef.current = rect

  // --- What to draw: pulled on load, then pushed on every re-open ----------
  useEffect(() => {
    let disposed = false
    const apply = (next: PickerState | null) => {
      if (disposed || !next) return
      setState(next)
      setRect(next.request.area ? sanitizeMouseArea(next.request.area) : null)
      dragRef.current = null
      setDragging(false)
    }
    invoke<PickerState | null>('area_picker_state').then(apply).catch(() => {})
    let unlisten: (() => void) | undefined
    listen<PickerState>('area-picker-open', event => apply(event.payload))
      .then(fn => { if (disposed) fn(); else unlisten = fn })
      .catch(() => {})
    return () => { disposed = true; unlisten?.() }
  }, [])

  const finish = useCallback((keep: boolean) => {
    const area = keep ? rectRef.current : null
    if (keep && !area) return
    invoke('area_picker_close', { area: area ? sanitizeMouseArea(area) : null }).catch(() => {})
  }, [])

  const nextMonitor = useCallback(() => {
    invoke<PickerState | null>('area_picker_next_monitor').catch(() => {})
  }, [])

  // --- Keys -----------------------------------------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(false) }
      else if (event.key === 'Enter') { event.preventDefault(); finish(true) }
      else if (event.key === 'Tab') { event.preventDefault(); nextMonitor() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish, nextMonitor])

  // --- The mouse -------------------------------------------------------------
  const point = (event: { clientX: number; clientY: number }) => ({
    x: clamp01(event.clientX / Math.max(1, window.innerWidth)),
    y: clamp01(event.clientY / Math.max(1, window.innerHeight)),
  })

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    // The card's buttons are ordinary buttons; a press on them is theirs.
    if (target.closest('[data-card]')) return
    event.preventDefault()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    const p = point(event)
    const handle = target.dataset.handle as Handle | undefined
    const current = rectRef.current
    if (handle && current) {
      dragRef.current = { kind: 'resize', handle, origin: current }
    } else if (target.dataset.area === 'true' && current) {
      dragRef.current = { kind: 'move', startX: p.x, startY: p.y, origin: current }
    } else {
      dragRef.current = { kind: 'draw', startX: p.x, startY: p.y }
    }
    setDragging(true)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const p = point(event)
    if (drag.kind === 'draw') {
      setRect(between(drag.startX, drag.startY, p.x, p.y))
    } else if (drag.kind === 'move') {
      const dx = p.x - drag.startX
      const dy = p.y - drag.startY
      setRect({
        ...drag.origin,
        x: Math.min(1 - drag.origin.w, Math.max(0, drag.origin.x + dx)),
        y: Math.min(1 - drag.origin.h, Math.max(0, drag.origin.y + dy)),
      })
    } else {
      setRect(resized(drag.origin, drag.handle, p.x, p.y))
    }
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(false)
    if (!drag) return
    const p = point(event)
    if (drag.kind === 'draw') {
      const drawn = between(drag.startX, drag.startY, p.x, p.y)
      // A click on the glass with nothing drawn keeps whatever was there.
      if (drawn.w < CLICK_SLOP && drawn.h < CLICK_SLOP) return
      setRect(sanitizeMouseArea(drawn))
    } else if (rectRef.current) {
      setRect(sanitizeMouseArea(rectRef.current))
    }
  }

  // --- Layout ---------------------------------------------------------------
  const monitor = state?.monitor
  const fit = normalizeMouseAreaFit(state?.request.fit)
  const padAspect = state?.request.padAspect && state.request.padAspect > 0 ? state.request.padAspect : 1
  const screenAspect = monitor && monitor.height > 0 ? monitor.width / monitor.height : 16 / 9
  const shown = rect ? sanitizeMouseArea(rect) : null
  const footprint = shown && fit === 'UNIFORM' ? padFootprint(shown, fit, padAspect, screenAspect) : null
  const pixels = shown && monitor ? mouseAreaPixels(shown, monitor.width, monitor.height) : null
  // The card sits at the top unless the rectangle is up there, in which case
  // it moves out of the way to the bottom.
  const cardAtBottom = Boolean(shown && shown.y < 0.3 && shown.x < 0.75 && shown.x + shown.w > 0.25)
  const asStyle = (r: MouseArea) => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` })

  return (
    <div
      className={styles.root}
      data-dragging={dragging}
      data-empty={!shown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {!shown && <div className={styles.scrim} />}
      {footprint && <div className={styles.footprint} style={asStyle(footprint)} aria-hidden="true" />}
      {shown && (
        <div className={styles.area} style={asStyle(shown)} data-area="true">
          {HANDLES.map(handle => <span key={handle} className={styles.handle} data-handle={handle} />)}
          {pixels && (
            <span className={styles.size} data-handle={undefined}>
              {pixels.width} × {pixels.height} px
            </span>
          )}
        </div>
      )}

      <div className={styles.card} data-card="true" data-bottom={cardAtBottom}>
        <div className={styles.cardText}>
          <span className={styles.eyebrow}>Mouse area · {padName(state?.request.pad ?? '')}</span>
          <span className={styles.title}>
            {shown ? describeMouseArea(shown) : 'Drag a rectangle where the pad should move the mouse'}
          </span>
          <span className={styles.hint}>
            {shown ? 'Drag inside to move it, drag a corner to resize, or draw a new one. ' : ''}
            Enter keeps it · Esc cancels
            {monitor && monitor.count > 1 ? ` · Tab: next monitor (${monitor.index + 1} of ${monitor.count})` : ''}
            {fit === 'UNIFORM' && shown ? ' · dashed: the pad’s full travel' : ''}
          </span>
        </div>
        <div className={styles.cardActions}>
          {monitor && monitor.count > 1 && (
            <button type="button" className={styles.button} onClick={nextMonitor}>Next monitor</button>
          )}
          <button type="button" className={styles.button} onClick={() => finish(false)}>Cancel</button>
          <button type="button" className={`${styles.button} ${styles.primary}`} disabled={!shown} onClick={() => finish(true)}>Keep</button>
        </div>
      </div>
    </div>
  )
}

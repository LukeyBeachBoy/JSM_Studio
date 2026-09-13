import { MenuDrawing } from './MenuDrawing'
import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { RAW_BUTTONS } from '../utils/controllerStatus'
import { resolveIncludes } from '../utils/configIncludes'
import {
  hitTestRegion,
  isStickSurface,
  resolveOverlayMenus,
  toUnit,
  type OverlayMenu,
} from '../utils/overlayLayout'
import { FALLBACK_PAD_ASPECT, padAspect, placeMenu } from '../utils/padGeometry'
import { resolveIcons, type IconData } from '../utils/iconLibrary'
import styles from './Overlay.module.css'

// Paths the mapper can report as its live configuration that are not profiles
// anyone chose: the file Studio applies THROUGH (it copies the edited profile
// here rather than loading it in place), and the stub loaded when mapping is
// off. Seeing either means nothing has been switched at runtime, so the
// overlay should use Studio's own selection -- which, unlike the preview, is
// the file the user is actually editing.
const NOT_A_CHOSEN_PROFILE = ['profiles-library/applied-preview.txt', 'MappingDisabled.txt']

/**
 * The configuration the mapper is actually running, if it differs from the one
 * Studio has selected. Null when there is nothing to follow.
 *
 * JoyShockMapper sets this on the `RESET_MAPPINGS` of whatever file it loads,
 * so it tracks a runtime `"profiles-library/....txt"` binding that Studio never
 * sees. Telemetry is the only place it surfaces.
 */
async function liveProfilePath(): Promise<string | null> {
  const sample = await invoke<{ activeProfile?: string } | null>('get_latest_telemetry_sample').catch(() => null)
  const path = sample?.activeProfile?.trim().replace(/\\/g, '/')
  if (!path || !/\.txt$/i.test(path)) return null
  return NOT_A_CHOSEN_PROFILE.some(skip => skip.toLowerCase() === path.toLowerCase()) ? null : path
}

// JSM's own paddle names. controllerStatus calls these SL/SR/FNL/FNR because it
// speaks the wire protocol; a config speaks LSL/RSR/LSR/RSL. The bit numbers are
// the ones global_chords.rs uses, so overlay and backend agree on what is held.
const CHORD_BITS: Record<string, number> = {
  ...RAW_BUTTONS,
  LSL: 19,
  RSR: 20,
  LSR: 21,
  RSL: 22,
}

type PadSample = { x: number; y: number; touched: boolean } | null
type OverlayPacket = {
  buttons: number
  leftPad: PadSample
  rightPad: PadSample
  leftStick: { x: number; y: number } | null
  rightStick: { x: number; y: number } | null
  touchpadWidth: number
  touchpadHeight: number
}

type OverlaySurfaceKey = 'LEFT' | 'RIGHT' | 'LSTICK' | 'RSTICK'

/** Wedge clip paths and names, matching the backend's clockwise-from-up order. */


export function Overlay() {
  const [menus, setMenus] = useState<Record<string, OverlayMenu>>({})
  // Only the menu IDENTITY lives in React state. Finger position and the
  // highlighted region are written straight to the DOM below, because at 240 Hz
  // a React render per packet is the difference between smooth and unusable.
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [aspect, setAspect] = useState<number>(FALLBACK_PAD_ASPECT)
  const [icons, setIcons] = useState<Record<string, IconData>>({})

  const rootRef = useRef<HTMLDivElement | null>(null)
  const dotRef = useRef<HTMLDivElement | null>(null)
  const regionRefs = useRef<(HTMLDivElement | null)[]>([])
  const menusRef = useRef(menus)
  const activeKeyRef = useRef(activeKey)
  const selectedRef = useRef(-1)
  const aspectRef = useRef(FALLBACK_PAD_ASPECT)
  menusRef.current = menus
  activeKeyRef.current = activeKey

  // --- Tell the backend how fast this display actually is -------------------
  // The main UI is deliberately capped at 60 Hz; the overlay is not, so the
  // emitter is told the real refresh rate and matches it. Measured rather than
  // assumed, because there is no reliable API for it.
  useEffect(() => {
    let frames = 0
    let start = 0
    let raf = 0
    const step = (t: number) => {
      if (!start) start = t
      if (++frames < 40) {
        raf = requestAnimationFrame(step)
        return
      }
      const hz = Math.round((frames - 1) * 1000 / (t - start))
      invoke('overlay_set_refresh_hz', { hz: Math.min(1000, Math.max(30, hz)) }).catch(() => {})
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  // --- Keep the menu definitions in step with the active profile ------------
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const active = await invoke<{ path?: string; content?: string } | null>('get_active_profile')
        if (!active?.content) return
        // `get_active_profile` is what Studio has SELECTED, which is not always
        // what the mapper is RUNNING. A binding can load another configuration
        // at runtime (`RSR,S = "profiles-library/Wardogs Menu.txt"`), and that
        // never goes through Studio, so its stored selection still names the
        // profile you switched away from -- and the overlay would keep drawing
        // that profile's menus over a controller that no longer has them.
        //
        // The mapper reports what it actually loaded, so prefer that. Two paths
        // are not real profiles and must fall through to the selection: the
        // preview file Studio itself applies through, and the placeholder it
        // loads when mapping is off.
        let root = active.path ?? 'active'
        let rootText = active.content
        const live = await liveProfilePath()
        if (live && live !== root) {
          const content = await invoke<string | null>('read_config_file', { path: live }).catch(() => null)
          if (typeof content === 'string') {
            root = live
            rootText = content
          }
        }
        // Resolve imports, or a profile built on a shared template would show an
        // overlay for only the handful of lines it overrides itself.
        const files: Record<string, string> = {}
        files[root] = rootText
        const seen = new Set<string>([root])
        const queue = [rootText]
        while (queue.length) {
          const text = queue.shift()!
          for (const line of text.split(/\r?\n/)) {
            const path = line.trim()
            if (!path || path.startsWith('#') || path.includes('=') || !/\.txt$/i.test(path)) continue
            if (seen.has(path)) continue
            seen.add(path)
            const content = await invoke<string | null>('read_config_file', { path }).catch(() => null)
            if (typeof content === 'string') {
              files[path] = content
              queue.push(content)
            }
          }
        }
        const resolved = resolveIncludes(root, files)
        if (cancelled) return
        const next = resolveOverlayMenus(resolved.effectiveText ?? rootText)
        setMenus(next)
        // Resolved here rather than at draw time: loading a set is a disk read
        // of up to a few megabytes, and the overlay has to appear instantly.
        const names = Object.values(next).flatMap(menu => menu.regions.map(r => r.icon))
        if (names.some(Boolean)) {
          const art = await resolveIcons(names)
          if (!cancelled) setIcons(previous => ({ ...previous, ...art }))
        }
      } catch {
        /* A profile that cannot be read simply shows no overlay. */
      }
    }
    load()
    const timer = setInterval(load, 2000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  // --- The hot path ---------------------------------------------------------
  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    listen<OverlayPacket>('overlay-telemetry', event => {
      if (disposed) return
      const { buttons, leftPad, rightPad } = event.payload
      // The pad's real shape, so the menu is drawn the same shape as the thing
      // under the thumb. Only re-rendered when it actually changes (a hotplug).
      const aspect = padAspect(event.payload)
      if (aspect !== aspectRef.current) {
        aspectRef.current = aspect
        setAspect(aspect)
      }
      const held = (name: string) => {
        const bit = CHORD_BITS[name as keyof typeof CHORD_BITS]
        return bit === undefined ? false : (BigInt(buttons) >> BigInt(bit)) & 1n ? true : false
      }

      // Which surface is live, which each menu's `show` option decides:
      //
      //   ring  -- only once the input is out in the ring, where a segment is
      //            actually selected. The menu confirms the choice.
      //   touch -- as soon as there is contact or any real tilt, so the menu is
      //            up while you are still aiming at the action you want. What
      //            you want when a region fires the moment it is touched.
      //
      // The layer is not known yet -- choosing it needs to know which surface is
      // live -- so the base menu's rule governs the surface, falling back to a
      // layered one for a profile that defines only layers.
      const { leftStick, rightStick } = event.payload
      const menus = menusRef.current
      const menuFor = (surface: OverlaySurfaceKey) =>
        menus[surface] ?? menus[Object.keys(menus).find(key => key.startsWith(`${surface}:`)) ?? '']

      const padLive = (surface: 'LEFT' | 'RIGHT', sample: PadSample) => {
        if (!sample?.touched) return false
        const menu = menuFor(surface)
        if (!menu) return false
        if (menu.placement.reveal === 'touch') return true
        // Deliberately the hit test rather than a distance: on a rectangular
        // grid every touch selects something, so 'ring' is simply "a region is
        // selected" and those pads behave exactly as they always have.
        return hitTestRegion(menu, sample.x, sample.y) >= 0
      }

      const stickLive = (surface: 'LSTICK' | 'RSTICK', value?: { x: number; y: number } | null) => {
        if (!value) return false
        const menu = menuFor(surface)
        if (!menu) return false
        const magnitude = Math.hypot(value.x, value.y)
        // 'touch' still needs a floor. A stick reports a little noise at rest,
        // and without one the wheel would flicker on an untouched controller;
        // the stick's own inner dead zone is exactly "has this moved at all".
        if (menu.placement.reveal === 'touch') return magnitude > menu.centreDeadzone
        return magnitude > Math.max(0, menu.deadzone)
      }
      // Pads first: a thumb deliberately on a pad beats a stick that happens to
      // be pushed for movement.
      const pad: OverlaySurfaceKey | null =
        padLive('RIGHT', rightPad) ? 'RIGHT'
        : padLive('LEFT', leftPad) ? 'LEFT'
        : stickLive('RSTICK', rightStick) ? 'RSTICK'
        : stickLive('LSTICK', leftStick) ? 'LSTICK'
        : null
      // Sticks report -1..1 with +y UP; the hit test expects the pad convention
      // of +y down, so y is flipped here exactly as the backend flips it.
      const sample =
        pad === 'RIGHT' ? rightPad
        : pad === 'LEFT' ? leftPad
        : pad === 'RSTICK' && rightStick ? { x: rightStick.x, y: -rightStick.y, touched: true }
        : pad === 'LSTICK' && leftStick ? { x: leftStick.x, y: -leftStick.y, touched: true }
        : null

      if (!pad || !sample) {
        if (activeKeyRef.current !== null) setActiveKey(null)
        if (rootRef.current) rootRef.current.dataset.visible = 'false'
        return
      }

      // Most specific layer wins, mirroring the backend walking its chord stack
      // newest-first. A layered menu beats the pad's base menu.
      const candidates = Object.keys(menusRef.current).filter(key => {
        const [keyPad, layer] = key.split(':')
        if (keyPad !== pad) return false
        if (!layer) return true
        return layer.split(',').every(part => held(part))
      })
      const key = candidates.sort((a, b) => b.length - a.length)[0] ?? null
      if (key !== activeKeyRef.current) setActiveKey(key)
      if (!key) {
        if (rootRef.current) rootRef.current.dataset.visible = 'false'
        return
      }

      const menu = menusRef.current[key]
      if (rootRef.current) rootRef.current.dataset.visible = 'true'

      // Imperative from here: no React work per packet.
      if (dotRef.current) {
        dotRef.current.style.transform =
          `translate(${toUnit(sample.x) * 100}cqw, ${toUnit(sample.y) * 100}cqh) translate(-50%, -50%)`
      }
      const selected = hitTestRegion(menu, sample.x, sample.y)
      if (selected !== selectedRef.current) {
        const previous = regionRefs.current[selectedRef.current]
        if (previous) previous.dataset.selected = 'false'
        const next = regionRefs.current[selected]
        if (next) next.dataset.selected = 'true'
        selectedRef.current = selected
      }
    }).then(fn => { if (disposed) fn(); else unlisten = fn }).catch(() => {})
    return () => { disposed = true; unlisten?.() }
  }, [])

  // Deliberately does NOT enable the emitter. The window is created hidden at
  // startup so that the first pad touch does not pay ~100ms of WebView creation;
  // whether telemetry actually flows is the toggle's decision, not this
  // component's, or merely existing would turn the feature on.

  // A new menu means new region elements, all freshly rendered unselected, so
  // the remembered index would otherwise point at an element that no longer
  // exists and the first highlight of the new menu would never clear.
  useEffect(() => {
    selectedRef.current = -1
  }, [activeKey])

  // Re-place the window when the active menu changes, so each menu can live
  // wherever the user put it rather than all sharing one spot.
  useEffect(() => {
    const menu = activeKey ? menus[activeKey] : null
    if (!menu) return
    let cancelled = false
    invoke<{ x: number; y: number; width: number; height: number }>('overlay_workarea')
      .then(area => {
        if (cancelled) return
        // The work area is in physical pixels, so the stored logical size is
        // scaled by the display's DPI. placeMenu keeps the box fully on screen
        // near an edge. A stick wheel is round and owes nothing to the pad's
        // shape, so it stays square whatever the touchpad happens to be.
        const surface = (activeKey ?? '').split(':')[0] as OverlaySurfaceKey
        const box = placeMenu(
          menu.placement,
          isStickSurface(surface) ? 1 : aspect,
          area,
          window.devicePixelRatio || 1
        )
        invoke('overlay_set_bounds', box).catch(() => {})
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [activeKey, menus, aspect])

  const menu = activeKey ? menus[activeKey] : null

  return (
    <div className={styles.root} ref={rootRef} data-visible="false">
      {menu && (
        <MenuDrawing menu={menu} icons={icons} onRegionRef={(index, el) => { regionRefs.current[index] = el }} onDotRef={el => { dotRef.current = el }} />
      )}
    </div>
  )
}

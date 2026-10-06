import { useEffect, useId, useRef, useState, type ComponentProps } from 'react'
import { directionalTarget } from '../../hooks/useKeyboardNav'
import { MenuPreview } from './MenuPreview'
import { hitTestRegion } from '../../utils/overlayLayout'

/** A single page-navigation stop with an explicit, escapable action-navigation mode. */
export function VirtualMenuPreview(props: ComponentProps<typeof MenuPreview>) {
  const host = useRef<HTMLDivElement>(null)
  const entry = useRef<HTMLButtonElement>(null)
  const [active, setActive] = useState(false)
  const latestMenu = useRef(props.menu)
  latestMenu.current = props.menu
  const help = useId()
  const [previewHeight, setPreviewHeight] = useState(() => Math.max(140, Math.min(360, window.innerHeight * .4)))
  useEffect(() => {
    const resize = () => setPreviewHeight(Math.max(140, Math.min(360, window.innerHeight * .4)))
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => {
    const node = host.current
    if (!node) return
    const items = () => Array.from(node.querySelectorAll<HTMLElement>('[data-nav-skip][role="button"]'))
    const radial = () => latestMenu.current.shape === 'RADIAL' || latestMenu.current.shape === 'EIGHT_WAY'
    let deflected = false
    const move = (key: string) => {
      const current = document.activeElement as HTMLElement
      if (!node.contains(current) || current === entry.current) return false
      const actions = items()
      // Wheel segments form a ring, not a rectangular page with a bottom edge.
      const index = actions.indexOf(current)
      const next = radial()
        ? actions[(index + (key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1) + actions.length) % actions.length]
        : directionalTarget(current, actions, key)
      next?.focus({ preventScroll: true })
      return true // At an edge, retain focus instead of entering page settings.
    }
    const stick = (event: Event) => {
      if (!radial() || !node.contains(document.activeElement) || document.activeElement === entry.current) { deflected = false; return }
      event.preventDefault()
      const menu = latestMenu.current
      const { leftStick, rightStick } = (event as CustomEvent<{ leftStick: { x: number; y: number }; rightStick: { x: number; y: number } }>).detail
      const point = Math.hypot(leftStick.x, leftStick.y) > .25 ? leftStick : rightStick
      const magnitude = Math.hypot(point.x, point.y)
      if (magnitude <= Math.max(.25, menu.deadzone)) {
        if (deflected && menu.centerRegion) items()[menu.regions.length]?.focus({ preventScroll: true })
        deflected = false
        return
      }
      deflected = true
      const index = hitTestRegion(menu, point.x, -point.y)
      const target = items()[index]
      if (target && target !== document.activeElement) target.focus({ preventScroll: true })
    }
    const keyboard = (event: KeyboardEvent) => {
      if (!node.contains(document.activeElement) || document.activeElement === entry.current) return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'Escape') {
        setActive(false)
        entry.current?.focus({ preventScroll: true })
      } else if (event.key === 'Tab') {
        const actions = items()
        const index = actions.indexOf(document.activeElement as HTMLElement)
        actions[(index + (event.shiftKey ? -1 : 1) + actions.length) % actions.length]?.focus({ preventScroll: true })
      } else if (!event.key.startsWith('Arrow') || !move(event.key)) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', keyboard, true)
    node.addEventListener('jsm:preview-stick', stick)
    return () => {
      window.removeEventListener('keydown', keyboard, true)
      node.removeEventListener('jsm:preview-stick', stick)
    }
  }, [])
  return <div ref={host} className="virtual-menu-preview" data-preview-navigation data-active={active}
    onFocusCapture={event => { if ((event.target as HTMLElement) !== entry.current) setActive(true) }}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setActive(false) }}>
    <MenuPreview {...props} hotCommand={active ? null : props.hotCommand} maxHeight={previewHeight} managedFocus />
    <button ref={entry} type="button" className="button button--secondary" aria-describedby={help}
      onClick={() => {
        setActive(true)
        host.current?.scrollIntoView({ block: 'center', inline: 'nearest' })
        host.current?.querySelector<HTMLElement>('[data-nav-skip][role="button"]')?.focus({ preventScroll: true })
      }}>Edit actions</button>
    <p id={help} className="virtual-menu-preview__hint">{active ? 'Select edits · Back exits' : 'Select to enter · Back / Esc to leave'}</p>
  </div>
}

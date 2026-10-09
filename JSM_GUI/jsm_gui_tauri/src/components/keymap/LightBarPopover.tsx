import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import keymapStyles from '../Keymap.module.css'
import styles from './LightBarPicker.module.css'
import { hexFromHsv, hsvFromHex, normalizeHex, type Hsv } from './lightBarColor'

type Props = {
  /** The swatch row this opens under (or over, near the bottom of the window). */
  anchor: HTMLElement | null
  /** "#rrggbb", already normalised. Edits reach the owner live through onChange. */
  color: string
  onChange: (hex: string) => void
  onClose: () => void
}

const WIDTH = 320
const MARGIN = 16

/**
 * The full colour editor behind the "custom" swatch (TODO-47): the
 * hue/saturation wall, the three channel sliders and the hex field, in a
 * popover anchored to the swatch row. Portalled to the body so it escapes a
 * card's overflow, and a focus trap the shell already understands:
 * data-focus-trap puts the pad inside it and hands focus back on close, and
 * B / Escape reach Done through data-modal-close. A click outside closes it
 * too, and lets that click through to whatever it landed on.
 */
export function LightBarPopover({ anchor, color, onChange, onClose }: Props) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  // Keep hue when the user picks white/black, where RGB cannot store it.
  const [selection, setSelection] = useState(() => ({ source: color, hsv: hsvFromHex(color) }))
  const hsv = selection.source === color ? selection.hsv : hsvFromHex(color)
  const choose = (next: Hsv) => {
    const hex = hexFromHsv(next)
    setSelection({ source: hex, hsv: next })
    onChange(hex)
  }
  const pickPosition = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    choose({ ...hsv, s: Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)), v: Math.max(0, Math.min(100, (1 - (event.clientY - bounds.top) / bounds.height) * 100)) })
  }

  const [draft, setDraft] = useState(color.slice(1))
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setDraft(color.slice(1)) }, [color, editing])
  const commit = () => {
    setEditing(false)
    const next = normalizeHex(draft)
    if (next) { setSelection({ source: next, hsv: hsvFromHex(next) }); onChange(next) }
    else setDraft(color.slice(1))
  }
  // Closing while the hex field still holds a valid draft keeps that draft:
  // React does not blur an input it unmounts, so commit here first.
  const requestClose = () => {
    if (editing) {
      const next = normalizeHex(draft)
      if (next && next !== color) onChange(next)
    }
    onClose()
  }
  const latest = useRef(requestClose)
  latest.current = requestClose

  // Placed under the swatch row, or above it when the window ends first,
  // and kept there while the page or a sheet scrolls under it.
  const [box, setBox] = useState({ top: MARGIN, left: MARGIN })
  useLayoutEffect(() => {
    const place = () => {
      const width = Math.min(WIDTH, window.innerWidth - MARGIN * 2)
      const height = ref.current?.offsetHeight ?? 420
      const rect = anchor?.getBoundingClientRect() ?? new DOMRect(MARGIN, MARGIN, 0, 0)
      const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN))
      const below = rect.bottom + 8
      const top = below + height <= window.innerHeight - MARGIN
        ? below
        : Math.max(MARGIN, Math.min(rect.top - 8 - height, window.innerHeight - height - MARGIN))
      setBox({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    document.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      document.removeEventListener('scroll', place, true)
    }
  }, [anchor])

  // A pointer landing outside the popover and its swatch row closes it. The
  // row stays live so a preset can still be picked while it is open.
  useEffect(() => {
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null
      if (!target || ref.current?.contains(target) || anchor?.contains(target)) return
      latest.current()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [anchor])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    requestClose()
  }

  const title = t('keymap.lightBarCustomTitle', 'Custom colour')
  return createPortal(
    <div
      ref={ref}
      className={styles.popover}
      role="dialog"
      aria-label={title}
      data-focus-trap="true"
      data-capture-ignore="true"
      data-light-bar-popover
      data-hints="B:Done"
      style={{ top: box.top, left: box.left, width: Math.min(WIDTH, window.innerWidth - MARGIN * 2) }}
      onKeyDown={onKeyDown}
    >
      <div className={styles.head}>
        <span className={styles.title}>{title}</span>
        <span className={keymapStyles.lightBarPreview} style={{ background: color }} role="img" aria-label={`Selected color ${color}`} />
      </div>
      <div className={keymapStyles.lightBarWall} aria-hidden="true" data-color-wall
        style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pickPosition(event) }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pickPosition(event) }}
        onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}>
        <span className={keymapStyles.lightBarPointer} style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, background: color }} />
      </div>
      <div className={keymapStyles.lightBarChannels}>
        {([
          ['h', 'Hue', 359, '°'], ['s', 'Saturation', 100, '%'], ['v', 'Color value', 100, '%'],
        ] as const).map(([channel, label, max, unit]) => (
          <label key={channel} className={keymapStyles.lightBarChannel}>
            <span>{label}<output>{Math.round(hsv[channel])}{unit}</output></span>
            <input type="range" aria-label={label} min={0} max={max} step={1} value={Math.round(hsv[channel])}
              data-hints="MOVE:Choose / adjust;B:Done"
              data-adjusting="true"
              className={channel === 'h' ? keymapStyles.lightBarHue : undefined}
              onKeyDown={event => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                event.preventDefault(); event.stopPropagation()
                choose({ ...hsv, [channel]: Math.max(0, Math.min(max, Math.round(hsv[channel]) + (event.key === 'ArrowRight' ? 1 : -1))) })
              }}
              onChange={event => choose({ ...hsv, [channel]: Number(event.target.value) })} />
          </label>
        ))}
      </div>
      <div className={styles.foot}>
        <label className={keymapStyles.lightBarHex}>
          <span aria-hidden="true">#</span>
          <input
            type="text"
            inputMode="text"
            maxLength={6}
            value={draft}
            placeholder={color.slice(1)}
            aria-label={t('keymap.lightBarHex', 'Light bar colour, hex')}
            onFocus={() => setEditing(true)}
            onChange={event => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setDraft(color.slice(1)); event.currentTarget.blur() } }}
          />
        </label>
        <button type="button" className="button button--secondary button--sm" data-modal-close data-hints="A:Done;B:Done" onClick={requestClose}>
          {t('common.done', 'Done')}
        </button>
      </div>
    </div>,
    document.body,
  )
}

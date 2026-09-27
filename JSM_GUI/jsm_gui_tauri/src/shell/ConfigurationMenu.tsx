import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '../components/icons/Icon'

// The Configuration menu (console refinement 1e): everything about the file
// being edited that is not the one state button, as a centred list opened by
// the Menu button, ☰ in the title bar, or the configuration chip. A dialog
// rather than a dropdown so it opens the same way from the pad as from the
// mouse; useKeyboardNav traps focus in it and B closes it through
// data-modal-close. Idle items stay focusable and say why (Components 13.13).
//
// It is also the pad's way to what the title bar holds -- which configuration
// is being edited, the editing layer, the controller output, mapping on or
// off, Apply -- the way a console's ☰ opens a quick menu rather than sending
// the cursor up to a toolbar. An item with choices opens them in place, in
// the same panel; B steps back up to the menu, and B again closes it.

/** One choice in an item's in-place list. */
export type ConfigurationChoice = {
  key: string
  label: string
  meta?: string
  /** The current value: checked, and where focus lands when the list opens. */
  checked?: boolean
  idle?: boolean
  /** A colour square before the label (layers). */
  swatch?: string
  onSelect: () => void
}

export type ConfigurationMenuItem = {
  key: string
  icon: IconName
  label: string
  /** Right-hand note: what Undo undoes, a shortcut, why an item is idle, the current value. */
  meta?: string
  /** Idle: shown and focusable, but A does nothing. */
  idle?: boolean
  /** A list of choices opened in place instead of acting at once. */
  choices?: ConfigurationChoice[]
  /** Starts a new group: a thin rule above it. */
  divider?: boolean
  onSelect?: () => void
}

type ConfigurationMenuProps = {
  open: boolean
  configName: string
  items: ConfigurationMenuItem[]
  onClose: () => void
}

export function ConfigurationMenu({ open, configName, items, onClose }: ConfigurationMenuProps) {
  const [viewing, setViewing] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // The item a list was opened from, to land on when stepping back.
  const cameFrom = useRef<string | null>(null)
  const sub = viewing ? items.find(item => item.key === viewing && item.choices) : undefined

  useEffect(() => { if (!open) { setViewing(null); cameFrom.current = null } }, [open])

  // Changing view moves focus into it: onto the current choice in a list,
  // back onto the item the list came from in the menu. Only when the view
  // changes -- the items are rebuilt on every render of the app (the live
  // preview re-renders it constantly), and following them pulled focus back
  // to the current choice as fast as the pad could move off it.
  const hasSub = Boolean(sub)
  useEffect(() => {
    if (!open) return
    const list = listRef.current
    if (!list) return
    const target = hasSub
      ? list.querySelector<HTMLElement>('[aria-checked="true"]') ?? list.querySelector<HTMLElement>('button')
      : cameFrom.current ? list.querySelector<HTMLElement>(`[data-key="${CSS.escape(cameFrom.current)}"]`) : null
    target?.focus({ preventScroll: false })
  }, [open, viewing, hasSub])

  if (!open) return null

  const back = () => { cameFrom.current = viewing; setViewing(null) }

  return (
    <div className="modal-overlay config-menu-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}
      // B inside a list goes back up to the menu, not out of it. Handled
      // before useKeyboardNav, which would press Close.
      onKeyDown={event => { if (event.key === 'Escape' && sub) { event.preventDefault(); event.stopPropagation(); back() } }}>
      <div className="config-menu" role="dialog" aria-modal="true" aria-labelledby="config-menu-title">
        <div className="config-menu__header">
          <span className="eyebrow">{sub ? 'Configuration menu' : 'Configuration'}</span>
          <b id="config-menu-title" className="config-menu__title">{sub ? sub.label : configName}</b>
          <button type="button" className="sheet__close" tabIndex={-1} data-nav-skip data-modal-close aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        {sub ? (
          <div ref={listRef} className="config-menu__items config-menu__items--choices" role="radiogroup" aria-labelledby="config-menu-title">
            <button type="button" className="config-menu__item config-menu__back" data-hints="A:Back;B:Back" onClick={back}>
              <Icon name="back" size={20} />
              <b className="config-menu__label">Back</b>
            </button>
            {sub.choices!.map(choice => (
              <button key={choice.key} type="button" role="radio" className="config-menu__item" aria-checked={Boolean(choice.checked)}
                aria-disabled={choice.idle ? true : undefined} data-reason={choice.idle ? choice.meta : undefined}
                data-hints={choice.idle ? 'B:Back' : 'A:Choose;B:Back'}
                onClick={() => { if (choice.idle) return; onClose(); choice.onSelect() }}>
                {choice.checked
                  ? <Icon name="success" size={20} />
                  : choice.swatch ? <span className="config-menu__swatch" style={{ background: choice.swatch }} aria-hidden="true" /> : <span className="config-menu__spacer" aria-hidden="true" />}
                <b className="config-menu__label">{choice.label}</b>
                {choice.meta && <span className="config-menu__meta">{choice.meta}</span>}
              </button>
            ))}
          </div>
        ) : (
          <div ref={listRef} className="config-menu__items" role="group" aria-labelledby="config-menu-title">
            {items.map(item => (
              <button key={item.key} type="button" data-key={item.key} className={`config-menu__item${item.divider ? ' config-menu__item--divided' : ''}`}
                aria-disabled={item.idle ? true : undefined} data-reason={item.idle ? item.meta : undefined}
                aria-haspopup={item.choices ? 'true' : undefined}
                data-hints={item.idle ? 'B:Close' : item.choices ? 'A:Open;B:Close' : 'A:Choose;B:Close'}
                onClick={() => {
                  if (item.idle) return
                  if (item.choices) { setViewing(item.key); return }
                  onClose()
                  item.onSelect?.()
                }}>
                <Icon name={item.icon} size={20} />
                <b className="config-menu__label">{item.label}</b>
                {item.meta && <span className="config-menu__meta">{item.meta}</span>}
                {item.choices && <Icon name="chevronRight" size={18} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

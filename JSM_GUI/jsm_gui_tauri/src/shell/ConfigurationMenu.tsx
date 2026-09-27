import { Icon, type IconName } from '../components/icons/Icon'

// The Configuration menu (console refinement 1e): everything about the file
// being edited that is not the one state button, as a centred list opened by
// the Menu button, ☰ in the title bar, or the configuration chip. A dialog
// rather than a dropdown so it opens the same way from the pad as from the
// mouse; useKeyboardNav traps focus in it and B closes it through
// data-modal-close. Idle items stay focusable and say why (Components 13.13).

export type ConfigurationMenuItem = {
  key: string
  icon: IconName
  label: string
  /** Right-hand note: what Undo undoes, a shortcut, why an item is idle. */
  meta?: string
  /** Idle: shown and focusable, but A does nothing. */
  idle?: boolean
  onSelect: () => void
}

type ConfigurationMenuProps = {
  open: boolean
  configName: string
  items: ConfigurationMenuItem[]
  onClose: () => void
}

export function ConfigurationMenu({ open, configName, items, onClose }: ConfigurationMenuProps) {
  if (!open) return null
  return (
    <div className="modal-overlay config-menu-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="config-menu" role="dialog" aria-modal="true" aria-labelledby="config-menu-title">
        <div className="config-menu__header">
          <span className="eyebrow">Configuration</span>
          <b id="config-menu-title" className="config-menu__title">{configName}</b>
          <button type="button" className="sheet__close" tabIndex={-1} data-nav-skip data-modal-close aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="config-menu__items" role="group" aria-labelledby="config-menu-title">
          {items.map(item => (
            <button key={item.key} type="button" className="config-menu__item"
              aria-disabled={item.idle ? true : undefined} data-reason={item.idle ? item.meta : undefined}
              data-hints={item.idle ? 'B:Close' : 'A:Choose;B:Close'}
              onClick={() => { if (item.idle) return; onClose(); item.onSelect() }}>
              <Icon name={item.icon} size={20} />
              <b className="config-menu__label">{item.label}</b>
              {item.meta && <span className="config-menu__meta">{item.meta}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

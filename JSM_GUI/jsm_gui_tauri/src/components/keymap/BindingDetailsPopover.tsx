import { useContext, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { LayerUsageContext, useInputUses } from '../LayerBar'
import { actionsOnInput, describeAction } from '../../utils/layers'
import { useSettingOriginInfo } from './settingOriginInfo'
import keymapStyles from '../Keymap.module.css'

type Props = {
  /** The row this popover describes; it opens under it. */
  anchor: HTMLElement | null
  command: string
  title: string
  /** What the input sends, in words. */
  summary: string
  modeshiftCount: number
  onClose: () => void
}

/**
 * Y on a binding row (Buttons Content, "Details"): where the value comes
 * from, what else uses this input and what shifts it, without opening the
 * editor. It is a focus trap, so the pad's B (Escape) closes it and focus
 * returns to the row. Portalled to the body: the row lives inside a
 * <details> that may be closed, and a closed details renders none of its
 * children but the summary.
 */
export function BindingDetailsPopover({ anchor, command, title, summary, modeshiftCount, onClose }: Props) {
  const origin = useSettingOriginInfo(command)
  const uses = useInputUses(command)
  const { actions, layers } = useContext(LayerUsageContext)
  const layerActions = actionsOnInput(actions, command).map(action => describeAction(action, layers))
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    if (!anchor) return
    const place = () => {
      const rect = anchor.getBoundingClientRect()
      const width = Math.min(420, rect.width)
      const left = Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16))
      const top = rect.bottom + 6 + 240 > window.innerHeight ? Math.max(16, rect.top - 6 - 240) : rect.bottom + 6
      setBox({ top, left, width })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor])
  if (!box) return null
  const originLine = !origin || origin.kind === 'default'
    ? 'Not set: JoyShockMapper uses its own default.'
    : origin.kind === 'own'
      ? 'Set in this configuration.'
      : origin.kind === 'inherited'
        ? `Inherited from ${origin.sourceName ?? 'an import'}.`
        : origin.baseValue
          ? `Overrides ${origin.sourceName ?? 'the import'} (${origin.baseValue}).`
          : `Overrides ${origin.sourceName ?? 'the import'}.`
  return createPortal(
    <div
      className={keymapStyles.detailsPopover}
      role="dialog"
      aria-label={`Details for ${title}`}
      data-focus-trap="true"
      data-hints="B:Close"
      style={{ top: box.top, left: box.left, width: box.width }}
    >
      <div className={keymapStyles.detailsPopoverHead}>
        <span className={keymapStyles.detailsPopoverTitle}>{title}</span>
        <button type="button" className="button button--ghost button--sm" data-modal-close onClick={onClose}>Close</button>
      </div>
      <dl className={keymapStyles.detailsPopoverList}>
        <dt>Sends</dt><dd>{summary || 'Nothing'}</dd>
        <dt>Origin</dt><dd>{originLine}</dd>
        <dt>Modeshifts</dt><dd>{modeshiftCount ? `${modeshiftCount} · shown in the editor` : 'None'}</dd>
        <dt>Layer actions</dt><dd>{layerActions.length ? layerActions.join(' · ') : 'None'}</dd>
        <dt>Used by</dt>
        <dd>
          {uses.length ? uses.join(' · ') : 'Nothing else'}
          {uses.length > 0 && (
            <button type="button" className="link-btn" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('jsm:input-uses', { detail: command })) }}>Inspect uses</button>
          )}
        </dd>
      </dl>
    </div>,
    document.body
  )
}

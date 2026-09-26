import { useTranslation } from 'react-i18next'
import { NumberField } from '../NumberField'
import { Select } from '../ui/Select'
import { Icon } from '../icons/Icon'
import { setOverlayPlacement, type OverlayMenu, type OverlayPad, type OverlayPlacement } from '../../utils/overlayLayout'
import keymapStyles from '../Keymap.module.css'

type Props = {
  /** The menu this edits, as resolveOverlayMenus keys it: RIGHT, RIGHT:MISC2, RSTICK. */
  menuKey: string
  menu: OverlayMenu
  onChange: (updater: (previous: string) => string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * One menu's look, beside the preview that shows it (15c): how wide it is
 * drawn, how big its text is, and what each region shows. This is where the
 * itch to fix a label that overflows its wedge is felt, so this is where it
 * is scratched -- the Menu layout page keeps where each menu sits on screen.
 */
export function MenuAppearance({ menuKey, menu, onChange, open, onOpenChange }: Props) {
  const { t } = useTranslation()
  const [pad, layer = ''] = menuKey.split(':')
  const placement = menu.placement
  const write = (next: Partial<OverlayPlacement>) =>
    onChange(previous => setOverlayPlacement(previous, pad as OverlayPad, layer, { ...placement, ...next }))
  const hasIcons = menu.regions.some(region => region.icon)
  const shows = [
    placement.showLabels ? t('keymap.menuShowsNames', 'names') : '',
    placement.showKeys ? t('keymap.menuShowsKeys', 'keys') : '',
    hasIcons && placement.showIcons !== false ? t('keymap.menuShowsIcons', 'icons') : '',
  ].filter(Boolean)
  const summary = t('keymap.menuAppearanceSummary', '{{width}} px wide · {{font}} px text · {{shows}}', {
    width: Math.round(placement.size),
    font: Math.round(placement.fontSize),
    shows: shows.length ? shows.join(', ') : t('keymap.menuShowsNothing', 'shape only'),
  })
  const toggle = (label: string, hint: string, checked: boolean, onToggle: (checked: boolean) => void, disabled = false) => (
    <label className={`setting-row setting-row--compact ${keymapStyles.stickRow} ${keymapStyles.padSwitchRow}`} data-hints="A:Toggle;B:Back">
      <div className={keymapStyles.stickRowText}>
        <span className={keymapStyles.stickRowTitle}>{label}</span>
        <span className={keymapStyles.stickRowHint}>{hint}</span>
      </div>
      <input type="checkbox" className={keymapStyles.padSwitch} aria-label={label} checked={checked} disabled={disabled} onChange={event => onToggle(event.target.checked)} />
    </label>
  )
  return (
    <details className={`${keymapStyles.stickRowDetails} ${keymapStyles.menuAppearance}`} data-menu-appearance={menuKey} open={open} onToggle={event => onOpenChange(event.currentTarget.open)}>
      <summary className={`setting-row setting-row--compact ${keymapStyles.stickRow} ${keymapStyles.stickRowSummary}`} data-hints={open ? 'A:Close;B:Back' : 'A:Adjust;B:Back'}>
        <Icon name="menuLayout" size={20} />
        <div className={keymapStyles.stickRowText}>
          <span className={keymapStyles.stickRowTitle}>{t('keymap.menuAppearance', 'Menu appearance')}</span>
          <span className={keymapStyles.stickRowHint}>{summary}</span>
        </div>
        <span className={keymapStyles.stickRowChevron} aria-hidden="true" />
      </summary>
      <div className={keymapStyles.stickRowBody}>
        <NumberField layout="inline" label={t('keymap.menuWidth', 'Width')} value={Math.round(placement.size)} onChange={value => write({ size: Number(value) || 280 })}
          min={120} max={900} step={10} hint={t('keymap.menuWidthHint', 'Size on screen, in pixels; the height follows the pad’s shape')} />
        <NumberField layout="inline" label={t('keymap.menuTextSize', 'Text size')} value={Math.round(placement.fontSize)} onChange={value => write({ fontSize: Number(value) || 14 })}
          min={8} max={48} step={1} hint={t('keymap.menuTextSizeHint', 'Smaller text keeps a long name inside its slice')} />
        {toggle(t('keymap.menuShowNames', 'Action names'), t('keymap.menuShowNamesHint', 'The name you gave each region'), placement.showLabels, checked => write({ showLabels: checked }))}
        {toggle(t('keymap.menuShowKeys', 'Keys'), t('keymap.menuShowKeysHint', 'The key each region sends, as a keycap'), placement.showKeys, checked => write({ showKeys: checked }))}
        {toggle(t('keymap.menuShowIcons', 'Icons'), hasIcons ? t('keymap.menuShowIconsHint', 'The icon each region was given') : t('keymap.menuNoIcons', 'No region has an icon yet: add one on a region’s name'), hasIcons && placement.showIcons !== false, checked => write({ showIcons: checked }), !hasIcons)}
        <div className={`setting-row setting-row--compact ${keymapStyles.stickRow}`} data-capture-ignore="true">
          <div className={keymapStyles.stickRowText}>
            <span className={keymapStyles.stickRowTitle}>{t('keymap.overlayRevealLegend', 'Show the menu')}</span>
            <span className={keymapStyles.stickRowHint}>{placement.reveal === 'touch'
              ? t('keymap.menuRevealTouchHint', 'Up before anything is chosen, so you can aim')
              : t('keymap.menuRevealRingHint', 'Hidden until a region is under your thumb')}</span>
          </div>
          <Select
            value={placement.reveal}
            onValueChange={value => write({ reveal: value as OverlayPlacement['reveal'] })}
            ariaLabel={t('keymap.overlayRevealLegend', 'Show the menu')}
            options={[
              { value: 'touch', label: t('keymap.overlayRevealTouch', 'As soon as it is touched') },
              { value: 'ring', label: t('keymap.overlayRevealRing', 'Once a region is selected') },
            ]}
          />
        </div>
        <div className={keymapStyles.menuAppearanceFoot}>
          <span>{t('keymap.menuPositionNote', 'Where it sits on screen is set on the Menu layout page, beside your other menus.')}</span>
          <button type="button" className="button button--secondary button--sm" onClick={() => window.dispatchEvent(new CustomEvent('jsm:menu-layout', { detail: menuKey }))}>
            {t('keymap.menuPositionAction', 'Position on screen')}
          </button>
        </div>
      </div>
    </details>
  )
}

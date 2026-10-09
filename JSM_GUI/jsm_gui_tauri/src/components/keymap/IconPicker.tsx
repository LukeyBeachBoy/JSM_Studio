import { useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { listIcons, resolveIcon, resolveIcons, type IconData } from '../../utils/iconLibrary'
import { Icon } from '../icons/Icon'
import { ButtonGlyph } from '../glyphs/ButtonGlyph'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'
import { PickerPage } from './pickers/PickerPage'
import { MenuPreview } from './MenuPreview'
import { LayerUsageContext } from '../LayerBar'
import { useShell } from '../../shell/ShellContext'
import { readVirtualMenus } from '../../utils/virtualMenus'
import { namedMenuOverlay } from '../../utils/namedMenuOverlay'
import { resolveOverlayMenus, type OverlayMenu } from '../../utils/overlayLayout'
import styles from './IconPicker.module.css'

/** How many icons a page of the grid shows; "Show 160 more" adds another. */
const PAGE = 160

/** A menu item's icon as drawn on the menu, or the menu mark when it has none. */
export function BindingIconArt({ value, size = 22 }: { value?: string; size?: number }) {
  const [art, setArt] = useState<IconData | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!value) { setArt(null); return }
    resolveIcon(value).then(next => { if (!cancelled) setArt(next) })
    return () => { cancelled = true }
  }, [value])
  if (!art) return <Icon name="overview" size={size} />
  return <svg width={size} height={size} viewBox={`0 0 ${art.width} ${art.height}`} fill="currentColor" aria-hidden="true" dangerouslySetInnerHTML={{ __html: art.body }} />
}

// The categories (console v2, IconPicker): General and Game are the two bundled
// sets; Media and Navigation are hand-picked from the general set; Custom is
// where your own icons will go.
type Tab = 'general' | 'game' | 'media' | 'navigation' | 'custom'
const TABS: Array<{ id: Tab; labelKey: string; label: string }> = [
  { id: 'general', labelKey: 'keymap.iconSetLucide', label: 'General' },
  { id: 'game', labelKey: 'keymap.iconSetGame', label: 'Game' },
  { id: 'media', labelKey: 'keymap.iconSetMedia', label: 'Media' },
  { id: 'navigation', labelKey: 'keymap.iconSetNavigation', label: 'Navigation' },
  { id: 'custom', labelKey: 'keymap.iconSetCustom', label: 'Custom' },
]
const CURATED: Partial<Record<Tab, string[]>> = {
  media: ['play', 'pause', 'circle-play', 'circle-pause', 'skip-forward', 'skip-back', 'rewind', 'fast-forward', 'square', 'volume-2', 'volume-1', 'volume-x', 'mic', 'mic-off', 'music', 'headphones', 'radio', 'video', 'camera', 'image', 'film', 'tv', 'monitor', 'speaker', 'disc-3', 'repeat', 'shuffle', 'list-music', 'cast', 'airplay', 'podcast'],
  navigation: ['house', 'arrow-up', 'arrow-down', 'arrow-left', 'arrow-right', 'arrow-up-left', 'arrow-up-right', 'arrow-down-left', 'arrow-down-right', 'chevron-up', 'chevron-down', 'chevron-left', 'chevron-right', 'corner-up-left', 'undo-2', 'redo-2', 'map', 'map-pin', 'compass', 'navigation', 'locate', 'crosshair', 'move', 'maximize', 'minimize', 'log-in', 'log-out', 'menu', 'grid-3x3', 'layout-grid', 'search', 'zoom-in', 'zoom-out', 'refresh-cw', 'rotate-ccw', 'external-link', 'flag', 'target'],
}
const SET_FOR: Partial<Record<Tab, string>> = { general: 'lucide', game: 'game-icons' }

/** "game-icons:wooden-crate" reads "Wooden crate". */
export const iconName = (value: string) => {
  const words = (value.split(':').pop() ?? value).replace(/[-_]+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : value
}

type Props = {
  /** Iconify name currently assigned, or '' for none. */
  value: string
  onChange: (icon: string) => void
  /** The menu item's label, for the eyebrow and "Shown above “Supply crate”". */
  label?: string
  /** Whose glyphs are drawn. */
  family?: ControllerVisualFamily
  /** The item's command on its menu: a pad region ("LT4") or a named menu's
   *  "<id>:<index>". Finds the menu for the live preview; without it the
   *  picker looks for a region carrying `label`. */
  item?: string
  /** The menu's name, when the caller knows it better ("Build menu"). */
  menuName?: string
}

/**
 * Change icon (3d): a console button carrying the icon it changes. It opens
 * the full-screen icon picker (console v2, IconPicker.dc.html).
 */
export function IconPicker({ value, onChange, label, item, menuName }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<IconData | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!value) { setCurrent(null); return }
    resolveIcon(value).then(next => { if (!cancelled) setCurrent(next) })
    return () => { cancelled = true }
  }, [value])
  return (
    <>
      <button type="button" className="console-btn console-btn--lg" onClick={() => setOpen(true)} aria-haspopup="dialog"
        data-caption={value ? t('pickers.iconCaption', 'Icon · {{name}}', { name: iconName(value) }) : t('keymap.iconNone', 'No icon')} data-hints="A:Change icon;B:Back">
        {current
          ? <svg className={styles.glyph} viewBox={`0 0 ${current.width} ${current.height}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: current.body }} />
          : <Icon name="overview" size={18} />}
        {t('keymap.changeIcon', 'Change icon')}
      </button>
      {open && <IconPickerPage value={value} itemLabel={label} item={item} menuName={menuName} onClose={() => setOpen(false)} onChange={icon => { onChange(icon); setOpen(false) }} />}
    </>
  )
}

/** The menu this item sits on, as the overlay draws it. */
function useItemMenu(item: string | undefined, label: string | undefined): { menu: OverlayMenu; command: string; name: string } | null {
  const { text = '' } = useContext(LayerUsageContext)
  return useMemo(() => {
    const named = readVirtualMenus(text).menus
    const virtual = item ? /^([A-Za-z][\w-]*):(\d+)$/.exec(item) : null
    if (virtual) {
      const menu = named.find(entry => entry.id === virtual[1])
      if (menu) return { menu: namedMenuOverlay(menu), command: item!, name: menu.name }
    }
    const pads = resolveOverlayMenus(text)
    const padName = (key: string) => ({ LEFT: 'Left trackpad', RIGHT: 'Right trackpad', LSTICK: 'Left stick wheel', RSTICK: 'Right stick wheel' } as Record<string, string>)[key.split(':')[0]] ?? 'Menu'
    if (item) {
      for (const [key, menu] of Object.entries(pads)) if (menu.regions.some(region => region.command === item)) return { menu, command: item, name: padName(key) }
    }
    if (label) {
      for (const menu of named) {
        const index = menu.actions.findIndex(action => action.label === label)
        if (index >= 0) return { menu: namedMenuOverlay(menu), command: `${menu.id}:${index}`, name: menu.name }
      }
      for (const [key, menu] of Object.entries(pads)) {
        const region = menu.regions.find(entry => entry.label === label)
        if (region) return { menu, command: region.command, name: padName(key) }
      }
    }
    return null
  }, [text, item, label])
}

/**
 * Pick an icon (console v2, IconPicker.dc.html): a full-screen page. Categories
 * on LT / RT, labelled tiles, "Show 160 more"; the aside shows the menu with the
 * focused icon in this item's slot. A uses the focused icon, X sets none, Y
 * searches, B cancels.
 */
export function IconPickerPage({ value, itemLabel, item, menuName, onChange, onClose }: { value: string; itemLabel?: string; item?: string; menuName?: string; onChange: (icon: string) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const { family, configName } = useShell()
  const glyphFamily = family === 'generic' ? undefined : family
  const [tab, setTab] = useState<Tab>(() => value.startsWith('game-icons:') ? 'game' : 'general')
  const [query, setQuery] = useState('')
  const [names, setNames] = useState<string[]>([])
  const [art, setArt] = useState<Record<string, IconData>>({})
  const [loading, setLoading] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [more, setMore] = useState(false)
  const [focused, setFocused] = useState<string>(value)
  const gridRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const opening = useRef(true)
  const found = useItemMenu(item, itemLabel)
  const menuLabel = menuName ?? found?.name ?? t('pickers.iconMenu', 'Menu')
  const itemName = itemLabel || t('pickers.iconThisItem', 'This item')

  useEffect(() => { setLimit(PAGE) }, [tab, query])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // A short debounce: typing a word should not walk a 4000-icon set per key.
    const timer = setTimeout(async () => {
      const needle = query.trim().toLowerCase()
      const set = SET_FOR[tab]
      // One past the page: that one says whether "Show more" is needed.
      const list = set
        ? await listIcons(set, query, limit + 1)
        : (CURATED[tab] ?? []).filter(name => !needle || name.includes(needle)).map(name => `lucide:${name}`)
      if (cancelled) return
      setMore(list.length > limit)
      const page = list.slice(0, limit)
      setNames(page)
      const next = await resolveIcons(page)
      if (!cancelled) { setArt(previous => ({ ...previous, ...next })); setLoading(false) }
    }, 120)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [tab, query, limit])
  // The current icon's art, for the "Now" card, whatever category is open.
  useEffect(() => { if (value && !art[value]) resolveIcon(value).then(next => { if (next) setArt(previous => ({ ...previous, [value]: next })) }) }, [value, art])

  // The pad starts on the current icon, else the first one -- not in search.
  useEffect(() => {
    if (!opening.current || loading || !names.length) return
    opening.current = false
    requestAnimationFrame(() => {
      const grid = gridRef.current
      ;(grid?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? grid?.querySelector<HTMLElement>('button'))?.focus()
    })
  }, [loading, names])

  const step = (to: Tab) => {
    setQuery('')
    setTab(to)
    // The old tiles go; land on the new category's first tile once it loads.
    opening.current = true
    gridRef.current?.focus({ preventScroll: true })
  }
  const clear = () => onChange('')
  const preview = useMemo(() => {
    if (!found) return null
    const icon = focused ?? ''
    const swap = (region: OverlayMenu['regions'][number]) => region.command === found.command ? { ...region, icon } : region
    return { ...found.menu, regions: found.menu.regions.map(swap), ...(found.menu.centerRegion ? { centerRegion: swap(found.menu.centerRegion) } : {}) }
  }, [found, focused])
  const total = tab === 'game' ? t('pickers.iconCountGame', 'Thousands of game icons') : tab === 'general' ? t('pickers.iconCountGeneral', 'Over a thousand everyday icons') : tab === 'custom' ? t('pickers.iconCountCustom', 'Your own icons') : t('pickers.iconCountCurated', '{{count}} hand-picked icons', { count: (CURATED[tab] ?? []).length })
  const hints = (name: string) => `A:${t('pickers.iconUseNamed', 'Use {{name}}', { name })};X:${t('keymap.iconClear', 'No icon')};Y:${t('pickers.iconSearchShort', 'Search')}`

  return (
    <PickerPage kind="icon" onClose={onClose} backLabel={t('common.cancel', 'Cancel')} asideWidth={340}
      lead={<span className={styles.lead}><BindingIconArt value={value} size={30} /></span>}
      eyebrow={`${menuLabel} · ${itemName}`} title={t('pickers.iconTitle', 'Pick an icon')}
      where={[configName ?? t('pickers.configuration', 'Configuration'), t('app.nav.virtualMenus', 'Menus'), menuLabel, itemName].join(' · ')}
      groups={TABS.map(item => ({ id: item.id, label: t(item.labelKey, item.label) }))} group={tab} onGroup={id => step(id as Tab)}
      stepLabel={t('pickers.iconCategory', 'Category')}
      groupNote={tab === 'custom' ? total : t('pickers.iconShowing', '{{total}} · showing the first {{count}}', { total, count: names.length })}
      hints={[{ button: 'X', label: t('keymap.iconClear', 'No icon') }, { button: 'Y', label: t('pickers.iconSearchShort', 'Search') }]}
      onPad={button => {
        if (button === 'X') { clear(); return true }
        if (button === 'Y') { searchRef.current?.focus(); return true }
        return false
      }}
      aside={<>
        <span className={styles.lbl}>{t('pickers.iconOnTheMenu', 'On the menu')}</span>
        <div className={styles.previewWell} data-icon-preview>
          {preview
            ? <MenuPreview menu={preview} aspect={preview.displayAspect ?? 1} fill hotCommand={found!.command} maxHeight={230} />
            : <span className={styles.previewFallback}><BindingIconArt value={focused} size={72} /></span>}
        </div>
        <div className={styles.focusedName}>
          <b>{focused ? iconName(focused) : t('keymap.iconNone', 'No icon')}</b>
          <span>{t('pickers.iconShownAboveNamed', 'Shown above “{{label}}” on the menu', { label: itemName })}</span>
        </div>
        <div className={styles.nowCard}>
          <span className={styles.nowIcon}><BindingIconArt value={value} size={28} /></span>
          <span className={styles.nowText}><span>{t('pickers.iconNow', 'Now')}</span><b>{value ? iconName(value) : t('keymap.iconNone', 'No icon')}</b></span>
          <button type="button" className={styles.nowClear} tabIndex={-1} onClick={clear}><ButtonGlyph button="X" size={24} family={glyphFamily} />{t('keymap.iconClear', 'No icon')}</button>
        </div>
        <span className={styles.note}>{t('pickers.iconTravel', 'Icons travel with the configuration. Your own icons will go under Custom.')}</span>
      </>}>
      <label className={styles.search}>
        <Icon name="search" size={18} />
        <input ref={searchRef} type="search" tabIndex={-1} value={query} placeholder={t('keymap.iconSearch', 'Search icons')} aria-label={t('keymap.iconSearch', 'Search icons')}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'ArrowDown' || (event.key === 'Enter' && names.length)) { event.preventDefault(); gridRef.current?.querySelector<HTMLElement>('button')?.focus() } }} />
        <ButtonGlyph button="Y" size={24} family={glyphFamily} />
      </label>
      <div ref={gridRef} className={styles.grid} tabIndex={-1} aria-label={t('pickers.iconTitle', 'Pick an icon')} data-icon-grid>
        {tab === 'custom' && (
          <div className={styles.empty}>
            <b>{t('pickers.iconCustomTitle', 'Nothing here yet')}</b>
            <span>{t('pickers.iconCustomEmpty', 'Your own icons will go under Custom. Until then, General and Game have thousands to choose from.')}</span>
          </div>
        )}
        {tab !== 'custom' && loading && names.length === 0 && <p className={styles.status}>{t('common.loading', 'Loading…')}</p>}
        {tab !== 'custom' && !loading && names.length === 0 && <p className={styles.status}>{t('keymap.iconNoResults', 'Nothing matched')}</p>}
        {names.map(name => {
          const icon = art[name]
          const isCurrent = name === value
          const label = iconName(name)
          return (
            <button key={name} type="button" className={styles.tile} aria-pressed={isCurrent} aria-label={label} data-icon={name}
              data-caption={isCurrent ? t('pickers.iconCurrentCaption', '{{name}} · on the menu now', { name: label }) : label}
              data-hints={hints(label)} onFocus={() => setFocused(name)} onMouseEnter={() => { if (document.body.dataset.inputSource === 'mouse') setFocused(name) }} onClick={() => onChange(name)}>
              {icon && <svg className={styles.tileGlyph} viewBox={`0 0 ${icon.width} ${icon.height}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon.body }} />}
              <span className={styles.tileLabel}>{isCurrent ? t('pickers.iconCurrentLabel', '{{name}} (current)', { name: label }) : label}</span>
              {isCurrent && <span className={styles.tileCheck} aria-hidden="true"><Icon name="success" size={12} /></span>}
            </button>
          )
        })}
        {more && !loading && (
          <button type="button" className={styles.more} data-hints={`A:${t('pickers.iconShowMore', 'Show {{count}} more', { count: PAGE })};X:${t('keymap.iconClear', 'No icon')};Y:${t('pickers.iconSearchShort', 'Search')}`}
            onClick={() => setLimit(current => current + PAGE)}>
            {t('pickers.iconShowMore', 'Show {{count}} more', { count: PAGE })} ▾
          </button>
        )}
      </div>
    </PickerPage>
  )
}

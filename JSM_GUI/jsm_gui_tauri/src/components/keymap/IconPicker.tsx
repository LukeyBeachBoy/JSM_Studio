import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { listIcons, resolveIcon, resolveIcons, type IconData } from '../../utils/iconLibrary'
import { Icon } from '../icons/Icon'
import { Dialog } from '../ui/Dialog'
import { ButtonGlyph } from '../glyphs/ButtonGlyph'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'
import styles from './IconPicker.module.css'

/** How many icons a page of the grid shows; "Show more" adds another. */
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

// The tabs of the icon modal (1g). General and Game are the two bundled sets;
// Media and Navigation are hand-picked from the general set; Custom is where
// imported icons will go, and is empty until importing exists.
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

type Props = {
  /** Iconify name currently assigned, or '' for none. */
  value: string
  onChange: (icon: string) => void
  /** The menu item's label, for "Icon for “Home”". */
  label?: string
  /** Whose LB / RB are drawn beside the tabs. */
  family?: ControllerVisualFamily
}

/**
 * Change icon (3d) and the icon picker it opens (1g): a centred modal over a
 * scrim, never placed relative to its button. LB / RB step the tabs, Y
 * searches, A uses the focused icon, X clears it, B cancels. A set is
 * megabytes of JSON; it is only read once the modal opens.
 */
export function IconPicker({ value, onChange, label, family }: Props) {
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
      {/* "Change icon" (3d): a console button carrying the icon it changes. */}
      <button type="button" className="console-btn console-btn--lg" onClick={() => setOpen(true)} aria-haspopup="dialog"
        title={value || t('keymap.iconNone', 'No icon')} data-hints="A:Change icon;B:Back">
        {current
          ? <svg className={styles.glyph} viewBox={`0 0 ${current.width} ${current.height}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: current.body }} />
          : <Icon name="overview" size={18} />}
        {t('keymap.changeIcon', 'Change icon')}
      </button>
      {open && <IconModal value={value} label={label} family={family} onClose={() => setOpen(false)} onChange={icon => { onChange(icon); setOpen(false) }} />}
    </>
  )
}

function IconModal({ value, label, family, onChange, onClose }: { value: string; label?: string; family?: ControllerVisualFamily; onChange: (icon: string) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>(() => value.startsWith('game-icons:') ? 'game' : 'general')
  const [query, setQuery] = useState('')
  const [names, setNames] = useState<string[]>([])
  const [art, setArt] = useState<Record<string, IconData>>({})
  const [loading, setLoading] = useState(false)
  // A bundled set has thousands of icons; the grid shows a page and says
  // when there are more, rather than stopping at 160 in silence.
  const [limit, setLimit] = useState(PAGE)
  const [more, setMore] = useState(false)
  const tabsRef = useRef<HTMLElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const opening = useRef(true)
  const glyphFamily = family === 'generic' ? undefined : family

  useEffect(() => { setLimit(PAGE) }, [tab, query])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // A short debounce: typing a word should not walk a 4000-icon set per key.
    const timer = setTimeout(async () => {
      const needle = query.trim().toLowerCase()
      const set = SET_FOR[tab]
      // One past the page: that one says whether "Show more" is needed.
      const found = set
        ? await listIcons(set, query, limit + 1)
        : (CURATED[tab] ?? []).filter(name => !needle || name.includes(needle)).map(name => `lucide:${name}`)
      if (cancelled) return
      setMore(found.length > limit)
      const page = found.slice(0, limit)
      setNames(page)
      const next = await resolveIcons(page)
      if (!cancelled) { setArt(previous => ({ ...previous, ...next })); setLoading(false) }
    }, 120)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [tab, query, limit])

  // The pad starts on the current icon, else the first one -- not in search.
  useEffect(() => {
    if (!opening.current || loading || !names.length) return
    opening.current = false
    queueMicrotask(() => {
      const grid = gridRef.current
      ;(grid?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? grid?.querySelector<HTMLElement>('button'))?.focus()
    })
  }, [loading, names])

  const focusTab = (next: Tab) => tabsRef.current?.querySelector<HTMLButtonElement>(`[data-icon-tab="${next}"]`)?.focus({ preventScroll: true })
  const step = (by: number) => {
    const next = TABS[(TABS.findIndex(item => item.id === tab) + by + TABS.length) % TABS.length].id
    // The focused icon tile is removed when the new category loads. Keep the
    // pad's event target inside the dialog by landing on its persistent tab.
    focusTab(next)
    setQuery('')
    setTab(next)
  }
  const clear = () => onChange('')
  const onPad = (button: string) => {
    if (button === 'LB' || button === 'RB') { step(button === 'RB' ? 1 : -1); return true }
    if (button === 'X') { clear(); return true }
    if (button === 'Y') { searchRef.current?.focus(); return true }
    return false
  }
  // The same buttons from the keyboard, when not typing.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).matches('input')) return
    const key = event.key.toLowerCase()
    if (key === 'x') { event.preventDefault(); clear() }
    if (key === 'y') { event.preventDefault(); searchRef.current?.focus() }
    if (key === '[' || key === ']') { event.preventDefault(); step(key === ']' ? 1 : -1) }
  }
  const title = label ? t('keymap.iconFor', 'Icon for “{{label}}”', { label }) : t('keymap.iconForItem', 'Icon for this item')

  return (
    <Dialog onClose={onClose} width={840} height={580} scrim={0.72} className={styles.modal} onPad={onPad} onKeyDown={onKeyDown}
      lead={<span className={styles.preview} aria-hidden="true"><BindingIconArt value={value} size={22} /></span>}
      title={title}
      subtitle={t('keymap.iconShownAbove', 'Shown above the label on the menu')}
      aside={
        <>
          <label className={styles.search}>
            <Icon name="search" size={16} />
            <input ref={searchRef} type="search" value={query} placeholder={t('keymap.iconSearch', 'Search icons')} aria-label={t('keymap.iconSearch', 'Search icons')}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => { if (event.key === 'ArrowDown' || (event.key === 'Enter' && names.length)) { event.preventDefault(); gridRef.current?.querySelector<HTMLElement>('button')?.focus() } }} />
          </label>
          <button type="button" className="console-btn" disabled title={t('keymap.iconImportLater', 'Importing your own icons is coming later')}>
            {t('keymap.iconImportButton', '+ Import')}
          </button>
        </>
      }
      toolbar={
        <nav ref={tabsRef} className={styles.tabs} aria-label={t('keymap.iconCategories', 'Icon categories')}>
          <ButtonGlyph button="LB" size={22} family={glyphFamily} />
          {TABS.map(item => (
            <button key={item.id} type="button" className={styles.tab} data-icon-tab={item.id} aria-pressed={tab === item.id} onClick={() => { focusTab(item.id); setQuery(''); setTab(item.id) }}>
              {t(item.labelKey, item.label)}
            </button>
          ))}
          <ButtonGlyph button="RB" size={22} family={glyphFamily} />
        </nav>
      }
      footerNote={t('keymap.iconBundled', 'Bundled with the configuration')}
      hints={[
        { button: 'X', label: t('keymap.iconClear', 'No icon') },
        { button: 'A', label: t('keymap.iconUse', 'Use icon') },
        { button: 'B', label: t('common.cancel', 'Cancel') },
      ]}
      actions={
        <>
          <button type="button" className="console-btn" onClick={clear} disabled={!value}>{t('keymap.iconClear', 'No icon')}</button>
          <button type="button" className="console-btn" onClick={onClose}>{t('common.cancel', 'Cancel')}</button>
        </>
      }>
      <div ref={gridRef} className={styles.grid} aria-label={title}>
        {tab === 'custom' && <p className={styles.status}>{t('keymap.iconCustomEmpty', 'Your own icons will live here. Importing them is coming later.')}</p>}
        {tab !== 'custom' && loading && names.length === 0 && <p className={styles.status}>{t('common.loading', 'Loading…')}</p>}
        {tab !== 'custom' && !loading && names.length === 0 && <p className={styles.status}>{t('keymap.iconNoResults', 'Nothing matched')}</p>}
        {names.map(name => {
          const icon = art[name]
          const current = name === value
          return (
            // The current icon wears a check badge; the focus ring is focus's alone.
            <button key={name} type="button" className={styles.tile} aria-pressed={current} title={name.split(':')[1]} aria-label={name.split(':')[1]}
              data-hints="A:Use icon;X:No icon;Y:Search;LB/RB:Category;B:Cancel" onClick={() => onChange(name)}>
              {icon && <svg className={styles.tileGlyph} viewBox={`0 0 ${icon.width} ${icon.height}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon.body }} />}
              {current && <span className={styles.tileCheck} aria-hidden="true"><Icon name="success" size={12} /></span>}
            </button>
          )
        })}
        {more && !loading && (
          <button type="button" className={`console-btn ${styles.more}`} data-hints="A:Show more;X:No icon;Y:Search;LB/RB:Category;B:Cancel" onClick={() => setLimit(current => current + PAGE)}>
            {t('keymap.iconShowMore', 'Show more')}
          </button>
        )}
      </div>
    </Dialog>
  )
}

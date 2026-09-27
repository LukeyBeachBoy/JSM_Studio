import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AVAILABLE_ICON_SETS, listIcons, resolveIcon, resolveIcons, type IconData } from '../../utils/iconLibrary'
import { Icon } from '../icons/Icon'
import styles from './IconPicker.module.css'

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

type Props = {
  /** Iconify name currently assigned, or '' for none. */
  value: string
  onChange: (icon: string) => void
}

/** A set is megabytes of JSON; it is only read once someone opens the picker. */
export function IconPicker({ value, onChange }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [set, setSet] = useState(AVAILABLE_ICON_SETS[0] ?? 'lucide')
  const [query, setQuery] = useState('')
  const [names, setNames] = useState<string[]>([])
  const [art, setArt] = useState<Record<string, IconData>>({})
  const [loading, setLoading] = useState(false)

  // The chosen icon is resolved even while the picker is shut, so the button
  // shows what is assigned rather than just its name.
  useEffect(() => {
    if (!value) return
    let cancelled = false
    resolveIcons([value]).then(next => { if (!cancelled) setArt(prev => ({ ...prev, ...next })) })
    return () => { cancelled = true }
  }, [value])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    // A short debounce: typing a word should not walk a 4000-icon set per key.
    const timer = setTimeout(async () => {
      const found = await listIcons(set, query, 120)
      if (cancelled) return
      setNames(found)
      const next = await resolveIcons(found)
      if (!cancelled) {
        setArt(prev => ({ ...prev, ...next }))
        setLoading(false)
      }
    }, 160)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [open, set, query])

  const current = value ? art[value] : undefined
  const triggerRef = useRef<HTMLButtonElement>(null)
  // B / Escape inside the panel shuts the panel and returns to its button.
  // Without this the key fell through to the row's own Escape handling and
  // folded the whole binding card away, panel and all.
  const close = () => { setOpen(false); triggerRef.current?.focus() }
  const setLabels = useMemo(
    () => ({ lucide: t('keymap.iconSetLucide', 'General'), 'game-icons': t('keymap.iconSetGame', 'Game') }) as Record<string, string>,
    [t]
  )

  return (
    <div className={styles.wrap}>
      {/* "Change icon" (3d): a console button carrying the icon it changes. */}
      <button
        ref={triggerRef}
        type="button"
        className="console-btn console-btn--lg"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title={value || t('keymap.iconNone', 'No icon')}
        data-hints="A:Change icon;B:Back"
      >
        {current ? (
          <svg
            className={styles.glyph}
            viewBox={`0 0 ${current.width} ${current.height}`}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: current.body }}
          />
        ) : (
          <Icon name="overview" size={18} />
        )}
        {t('keymap.changeIcon', 'Change icon')}
      </button>

      {open && (
        <div className={styles.panel} onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); close() } }}>
          <div className={styles.controls}>
            {AVAILABLE_ICON_SETS.map(prefix => (
              <button
                key={prefix}
                type="button"
                className={`${styles.setChip} ${prefix === set ? styles.setChipActive : ''}`}
                onClick={() => setSet(prefix)}
              >
                {setLabels[prefix] ?? prefix}
              </button>
            ))}
            <input
              className={styles.search}
              value={query}
              placeholder={t('keymap.iconSearch', 'Search icons')}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          <div className={styles.grid}>
            {value && (
              <button
                type="button"
                className={styles.clear}
                onClick={() => { onChange(''); close() }}
              >
                {t('keymap.iconClear', 'No icon')}
              </button>
            )}
            {loading && names.length === 0 && (
              <span className={styles.status}>{t('common.loading', 'Loading…')}</span>
            )}
            {!loading && names.length === 0 && (
              <span className={styles.status}>{t('keymap.iconNoResults', 'Nothing matched')}</span>
            )}
            {names.map(name => {
              const icon = art[name]
              return (
                <button
                  key={name}
                  type="button"
                  className={`${styles.option} ${name === value ? styles.optionActive : ''}`}
                  title={name}
                  onClick={() => { onChange(name); close() }}
                >
                  {icon && (
                    <svg
                      className={styles.glyph}
                      viewBox={`0 0 ${icon.width} ${icon.height}`}
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: icon.body }}
                    />
                  )}
                </button>
              )
            })}
          </div>
          <p className={styles.hint}>
            {t('keymap.iconHint', 'Icons are bundled with the app and resolve offline. They appear above the action in the trackpad overlay.')}
          </p>
        </div>
      )}
    </div>
  )
}

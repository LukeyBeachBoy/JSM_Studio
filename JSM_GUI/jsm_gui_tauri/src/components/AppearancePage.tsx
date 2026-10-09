import { useEffect, useRef, useState, type FocusEvent } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './AppearancePage.module.css'
import { BrandMark } from './BrandMark'
import { ACCENTS, ACCENT_META, APP_NAME, type Accent } from '../brand/brand'
import { useAccent } from '../hooks/useAccent'
import { useTheme, type Theme } from '../hooks/useTheme'
import { useAppLanguage } from '../hooks/useAppLanguage'
import type { AppLanguage } from '../i18n/language'
import { useConfigNames } from '../hooks/useDisplayPrefs'
import { ScreenDistanceRow } from './settings/ControllerSettings'
import { SettingsColumns, SettingsNote, SettingsSection, SwitchRow } from './settings/SettingsKit'
import settingsStyles from './settings/Settings.module.css'

// Settings ▸ Look & language (console v2, SettingsLook.dc.html): move across a
// choice to see it before you pick it. Theme and accent are picture cards;
// focusing one previews it on the whole app, A keeps it, leaving the group
// puts back what you had. Language as cards, Screen distance, Show config
// names, and a preview of the app in the colours on screen.

const THEMES: { value: Theme; label: string; caption: string }[] = [
  { value: 'dark', label: 'Dark', caption: 'Easy on the eyes from the couch' },
  { value: 'light', label: 'Light', caption: 'For a bright room' },
  { value: 'system', label: 'Same as Windows', caption: 'Follows Windows’ own setting' },
]
const LANGUAGES: { value: AppLanguage; label: string; native: string }[] = [
  { value: 'en', label: 'English', native: 'English' },
  { value: 'zh-CN', label: 'Simplified Chinese', native: '简体中文' },
]

/** A theme card's picture: the app's frame in that theme's colours. */
function ThemeArt({ theme }: { theme: Theme }) {
  const half = (dark: boolean, x: number, width: number) => <g>
    <rect x={x} y="6" width={width} height="68" fill={dark ? '#131920' : '#f1f4f7'} />
    <rect x={x} y="6" width={width} height="12" fill={dark ? '#0d1217' : '#e6ebf0'} />
    <rect x={x + 8} y="26" width={width - 16} height="10" rx="3" fill={dark ? '#1f2730' : '#ffffff'} />
    <rect x={x + 8} y="42" width={width - 16} height="10" rx="3" fill={dark ? '#1f2730' : '#ffffff'} />
    <rect x={x + 8} y="58" width={(width - 16) / 2} height="8" rx="3" fill="var(--accent)" />
  </g>
  return <svg viewBox="0 0 120 80" aria-hidden="true">
    <clipPath id={`theme-${theme}`}><rect x="6" y="6" width="108" height="68" rx="8" /></clipPath>
    <g clipPath={`url(#theme-${theme})`}>{theme === 'system' ? <>{half(true, 6, 54)}{half(false, 60, 54)}</> : half(theme === 'dark', 6, 108)}</g>
    <rect x="6" y="6" width="108" height="68" rx="8" fill="none" stroke="var(--art-line)" strokeWidth="1.5" />
  </svg>
}

export function AppearancePage() {
  const { t } = useTranslation()
  const { accent, setAccent } = useAccent()
  const { theme, setTheme, resolved } = useTheme()
  const { language, setLanguage } = useAppLanguage()
  const { shown: configNames, setShown: setConfigNames } = useConfigNames()
  // What the app shows while a card is focused: a preview, put back on leaving.
  const [previewAccent, setPreviewAccent] = useState<Accent | null>(null)
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(null)
  const kept = useRef({ accent, theme })
  kept.current = { accent, theme }
  const paintAccent = (value: Accent) => { document.documentElement.dataset.accent = value }
  const paintTheme = (value: Theme) => {
    const resolvedTheme = value === 'system' ? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : value
    document.documentElement.dataset.theme = resolvedTheme
  }
  useEffect(() => () => { paintAccent(kept.current.accent); paintTheme(kept.current.theme) }, [])
  const leave = (group: 'accent' | 'theme') => (event: FocusEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    if (group === 'accent') { setPreviewAccent(null); paintAccent(kept.current.accent) }
    else { setPreviewTheme(null); paintTheme(kept.current.theme) }
  }
  const shownAccent = previewAccent ?? accent
  const meta = ACCENT_META[shownAccent]
  const shownTheme = previewTheme ?? theme
  const shownResolved = shownTheme === 'system' ? resolved : shownTheme

  return (
    <SettingsColumns asideLabel="Preview" main={<>
      <SettingsSection title={t('appearance.theme', 'Theme')} note={previewTheme && previewTheme !== theme ? `Previewing ${THEMES.find(item => item.value === previewTheme)?.label}. A keeps it.` : undefined}>
        <div className={styles.cards} role="radiogroup" aria-label={t('theme.label', 'Theme')} onBlur={leave('theme')}>
          {THEMES.map(item => (
            <button key={item.value} type="button" role="radio" aria-checked={theme === item.value} className={styles.card} data-current={theme === item.value ? 'true' : undefined}
              data-hints={`A:Use ${item.label};MOVE:Compare;B:Home`} data-caption={`${item.label} · ${item.caption}`}
              onFocus={() => { setPreviewTheme(item.value); paintTheme(item.value) }}
              onClick={() => { setTheme(item.value); setPreviewTheme(null) }}>
              <span className={styles.cardArt}><ThemeArt theme={item.value} /></span>
              <b>{item.value === 'system' ? item.label : t(`theme.${item.value}`, item.label)}</b>
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title={t('appearance.accent', 'Accent')} note={previewAccent && previewAccent !== accent ? `Previewing ${ACCENT_META[previewAccent].name}. A keeps it.` : meta.note}>
        <div className={styles.swatches} role="radiogroup" aria-label={t('appearance.accent', 'Accent')} onBlur={leave('accent')}>
          {ACCENTS.map(id => {
            const item = ACCENT_META[id]
            const selected = id === accent
            return (
              <button key={id} type="button" role="radio" aria-checked={selected} className={styles.swatch} data-accent={id} data-selected={selected}
                data-hints={`A:Use ${item.name};MOVE:Compare;B:Home`} data-caption={`${item.name} · ${item.hex}`}
                onFocus={() => { setPreviewAccent(id); paintAccent(id) }}
                onClick={() => { setAccent(id); setPreviewAccent(null) }}>
                <BrandMark accent={id} size={56} className={styles.swatchMark} />
                <span className={styles.swatchText}>
                  <b>{item.name}</b>
                  <span className={styles.swatchHex}>{resolved === 'light' ? item.ink : item.hex}</span>
                </span>
                <span className={styles.swatchDot} style={{ background: item.hex }} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </SettingsSection>

      <SettingsSection title={t('language.label', 'Language')}>
        <div className={styles.cards} role="radiogroup" aria-label={t('language.label', 'Language')} data-columns="2">
          {LANGUAGES.map(item => (
            <button key={item.value} type="button" role="radio" aria-checked={language === item.value} className={styles.card} data-current={language === item.value ? 'true' : undefined}
              data-hints={`A:Use ${item.label};B:Home`} onClick={() => void setLanguage(item.value)} lang={item.value}>
              <span className={styles.cardArt} aria-hidden="true"><span className={styles.languageGlyph}>{item.value === 'en' ? 'Aa' : '中文'}</span></span>
              <b>{item.native}</b>
            </button>
          ))}
        </div>
      </SettingsSection>

      <div className={settingsStyles.sectionBody}>
        <ScreenDistanceRow />
        <SwitchRow label={t('appearance.configNames', 'Show config names')} hint={t('appearance.configNamesHelp', 'Shows each setting’s file name, for editing by hand')}
          on={configNames} onChange={setConfigNames} onReset={() => setConfigNames(false)} />
      </div>
    </>} aside={<>
      <div className={settingsStyles.panel} aria-label="Preview">
        <h3 className={settingsStyles.panelTitle}>Preview <span className={settingsStyles.rowHint}>{meta.name} · {shownResolved}</span></h3>
        <div className={styles.preview} aria-hidden="true">
          <div className={styles.bar}>
            <BrandMark size={20} accent={shownAccent} />
            <span className={styles.barName}>{APP_NAME}</span>
            <span className={styles.barSep}>/</span>
            <span className={styles.barConfig}>Wardogs</span>
            <span className={styles.barSpacer} />
            <span className="button button--primary">Save</span>
          </div>
          <div className={styles.tabs}><span data-current="true">Buttons</span><span>Gyro</span><span>Layers</span></div>
          <div className={styles.row} data-selected="true"><span>Turn speed</span><span className={styles.rowMeta}>2.3×</span></div>
          <div className={styles.row}><span>Invert vertical aim</span><span className={styles.toggle} /></div>
          <div className={styles.chips}>
            <span className={styles.chip} style={{ background: 'var(--layer-1-soft)', color: 'var(--layer-1-ink)' }}>Vehicles</span>
            <span className={styles.chip} style={{ background: 'var(--layer-2-soft)', color: 'var(--layer-2-ink)' }}>Comms</span>
            <span className={styles.chip} style={{ background: 'var(--layer-3-soft)', color: 'var(--layer-3-ink)' }}>Tactical map</span>
          </div>
        </div>
      </div>
      <div className={settingsStyles.panel}>
        <h3 className={settingsStyles.panelTitle}>The app icon follows it</h3>
        <div className={styles.icons} aria-hidden="true">
          <span><BrandMark size={40} accent={shownAccent} /><small>Window</small></span>
          <span><BrandMark size={32} accent={shownAccent} /><small>Taskbar</small></span>
          <span><BrandMark size={20} accent={shownAccent} /><small>Tray</small></span>
        </div>
        <SettingsNote>{t('appearance.iconNote', 'The Start menu shortcut keeps the cyan mark until JSM Evolved is reinstalled.')}</SettingsNote>
      </div>
    </>} />
  )
}

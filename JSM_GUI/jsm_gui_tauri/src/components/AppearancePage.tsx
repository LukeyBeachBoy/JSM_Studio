import { useTranslation } from 'react-i18next'
import styles from './AppearancePage.module.css'
import { ThemeToggle } from './ThemeToggle'
import { LanguageSelect } from './LanguageSelect'
import { BrandMark } from './BrandMark'
import { ACCENTS, ACCENT_META, APP_NAME } from '../brand/brand'
import { useAccent } from '../hooks/useAccent'
import { useTheme } from '../hooks/useTheme'
import sideNavStyles from './SideNav.module.css'

/**
 * Appearance: theme, language and the accent. The accent is one of the four
 * JSM Evolved marks (Brand JSM Evolved.dc.html); choosing one recolours the
 * app as you click, and the window and tray icons follow it.
 */
export function AppearancePage() {
  const { t } = useTranslation()
  const { accent, setAccent } = useAccent()
  const { resolved } = useTheme()
  const meta = ACCENT_META[accent]

  return (
    <div className="prefs-columns">
      <div className="prefs-column" data-nav-region="appearance">
        <h3 className="prefs-eyebrow">{t('appearance.theme', 'Theme')}</h3>
        <div className={sideNavStyles.navSettings}>
          <ThemeToggle className={sideNavStyles.navThemeToggle} />
          <LanguageSelect className={sideNavStyles.navLanguageSelect} />
        </div>

        <h3 className="prefs-eyebrow">{t('appearance.accent', 'Accent')}</h3>
        <div className={styles.swatches} role="radiogroup" aria-label={t('appearance.accent', 'Accent')} data-hints="MOVE:Choose;A:Select;B:Back">
          {ACCENTS.map(id => {
            const item = ACCENT_META[id]
            const selected = id === accent
            return (
              <button key={id} type="button" role="radio" aria-checked={selected}
                className={styles.swatch} data-accent={id} data-selected={selected} onClick={() => setAccent(id)}>
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
        <p className={styles.note}>{meta.note}</p>
        <p className={styles.note}>{t('appearance.iconNote', 'The window, taskbar and tray icons change with the accent. The Start menu shortcut keeps the cyan mark until the app is reinstalled.')}</p>
      </div>

      <div className="prefs-column" data-nav-region="preview">
        <h3 className="prefs-eyebrow">{t('appearance.preview', 'Preview')}</h3>
        <div className={styles.preview} aria-hidden="true">
          <div className={styles.lockup}>
            <BrandMark size={56} />
            <span className={styles.wordmark}><b>JSM</b> <em>Evolved</em></span>
          </div>
          <div className={styles.bar}>
            <BrandMark size={20} />
            <span className={styles.barName}>{APP_NAME}</span>
            <span className={styles.barSep}>/</span>
            <span className={styles.barConfig}>Wardogs</span>
            <span className={styles.barSpacer} />
            <span className="button button--primary">Apply 3 changes</span>
          </div>
          <div className={styles.controls}>
            <span className="button button--secondary">Secondary</span>
            <span className="segmented"><span aria-checked="true" role="radio">Dark</span><span role="radio">Light</span><span role="radio">System</span></span>
            <input type="checkbox" checked readOnly tabIndex={-1} />
          </div>
          <div className={styles.row} data-selected="true">
            <span>Selected row</span>
            <span className={styles.rowMeta}>Focus ring and fill</span>
          </div>
          <div className={styles.chips}>
            <span className={styles.chip} style={{ background: 'var(--command-soft)', color: 'var(--command)', boxShadow: 'inset 0 0 0 1px var(--command-line)' }}>Command</span>
            <span className={styles.chip} style={{ background: 'var(--shift-soft)', color: 'var(--shift-ink)', boxShadow: 'inset 0 0 0 1px var(--shift-line)' }}>Modeshift</span>
            <span className={styles.chip} style={{ background: 'var(--layer-1-soft)', color: 'var(--layer-1-ink)' }}>Layer 1</span>
            <span className={styles.chip} style={{ background: 'var(--layer-2-soft)', color: 'var(--layer-2-ink)' }}>Layer 2</span>
            <span className={styles.chip} style={{ background: 'var(--layer-3-soft)', color: 'var(--layer-3-ink)' }}>Layer 3</span>
          </div>
          <div className={styles.semantics}>
            <span><i style={{ background: 'var(--ok)' }} />OK</span>
            <span><i style={{ background: 'var(--warn)' }} />Warning</span>
            <span><i style={{ background: 'var(--error)' }} />Error</span>
            <span><i style={{ background: 'var(--telemetry)' }} />Telemetry</span>
          </div>
        </div>
      </div>
    </div>
  )
}

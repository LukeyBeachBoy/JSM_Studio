import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CREDIT_GROUPS } from '../data/credits'
import { desktopBridge } from '../platform/desktopBridge'
import { Icon } from './icons/Icon'
import styles from './CreditsPage.module.css'

export function CreditsPage() {
  const { t } = useTranslation()
  const [linkError, setLinkError] = useState(false)
  const openLink = async (url: string) => {
    setLinkError(false)
    try { await desktopBridge.openExternal(url) } catch { setLinkError(true) }
  }

  return (
    <div className={styles.credits}>
      <p className={styles.intro}>{t('credits.intro')}</p>
      <p className={styles.note}>{t('credits.notExhaustive')}</p>
      {linkError && <p role="alert" className={styles.error}>{t('credits.linkError')}</p>}
      <div className={styles.groups}>
        {CREDIT_GROUPS.map(group => (
          <section key={group.id} className={styles.group} aria-labelledby={`credits-${group.id}`} data-nav-region={`credits-${group.id}`}>
            <h2 id={`credits-${group.id}`} className="prefs-eyebrow">{t(`credits.groups.${group.id}`, group.title)}</h2>
            <ul className={styles.list}>
              {group.entries.map(entry => (
                <li key={entry.id}>
                  <a className={styles.entry} href={entry.url} target="_blank" rel="noopener noreferrer"
                    onClick={event => { event.preventDefault(); void openLink(entry.url) }} data-hints="A:Open link;B:Back">
                    <span className={styles.text}>
                      <b>{entry.name}</b>
                      <span>{t(`credits.entries.${entry.id}`, entry.description)}</span>
                    </span>
                    <Icon name="source" size={18} title={t('credits.openProject')} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

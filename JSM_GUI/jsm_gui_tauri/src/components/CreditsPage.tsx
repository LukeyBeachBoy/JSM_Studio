import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import { CREDIT_GROUPS, type CreditEntry } from '../data/credits'
import { desktopBridge } from '../platform/desktopBridge'
import { APP_STARTED_AT, appVersion, checkForUpdatesNow, describeChecked, describeUpdate, shellBridge, useUpdateStatus } from '../platform/shellBridge'
import licenceText from '../../../../LICENSE.md?raw'
import { BrandMark } from './BrandMark'
import { SubPage } from './ui/console'
import { usePadButton } from './settings/SettingsKit'
import styles from './CreditsPage.module.css'

// Settings ▸ About & credits (console v2, SettingsAbout.dc.html): the app and
// its version with the update status, three links, the people behind it, the
// projects it stands on with the rest behind "And 13 more", and the licence.
// A opens a link, X checks for updates, Y reads the licence.

export const PROJECT_LINKS = [
  { id: 'project', label: 'Project page', url: 'https://github.com/LukeyBeachBoy/JSM_Studio' },
  { id: 'whatsnew', label: 'What’s new', url: 'https://github.com/LukeyBeachBoy/JSM_Studio/releases' },
  { id: 'gyrowiki', label: 'GyroWiki', url: 'http://gyrowiki.jibbsmart.com' },
]

// The short line under each person (SettingsAbout.dc.html).
const PEOPLE_ROLE: Record<string, string> = {
  jibb: 'Made JoyShockMapper, flick stick and its gyro controls',
  nicolas: 'Electronicks · lead developer since version 3',
  evan: 'JSM Custom Curve and the app this grew from',
  hotuns: 'JSM Studio, the desktop app before this one',
  luke: 'JSM Evolved and Steam Controller support',
  ceski: 'Controller support in the Custom Curve line',
}
// The projects on the page; the rest fold behind "And N more".
const FEATURED = ['sdl', 'jsl', 'motion', 'vigem', 'hidhide', 'euro', 'tauri'] as const
const FEATURED_LABEL: Record<string, [string, string]> = {
  sdl: ['SDL', 'Controller input and sensors'],
  jsl: ['JoyShockLibrary', 'Where JoyShockMapper began'],
  motion: ['GamepadMotionHelpers', 'Gyro fusion, calibration'],
  vigem: ['ViGEmBus', 'Virtual Xbox and DualShock'],
  hidhide: ['HidHide', 'Hides the real controller'],
  euro: ['1€ Filter', 'Smooths the gyro'],
  tauri: ['Tauri and React', 'The desktop app itself'],
}

const shortName = (name: string) => name.replace(/\s*\(.*\)\s*$/, '')
const initials = (name: string) => shortName(name).split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()

export function CreditsPage() {
  const { t } = useTranslation()
  const [linkError, setLinkError] = useState(false)
  const [more, setMore] = useState(false)
  const [licence, setLicence] = useState(false)
  const update = useUpdateStatus()
  const host = useRef<HTMLDivElement>(null)
  usePadButton('X', () => { void checkForUpdatesNow() }, host)
  usePadButton('Y', () => { setLicence(true) }, host)
  const openLink = async (url: string) => {
    setLinkError(false)
    try { await desktopBridge.openExternal(url) } catch { setLinkError(true) }
  }
  const people = CREDIT_GROUPS.find(group => group.id === 'people')?.entries ?? []
  const all = CREDIT_GROUPS.flatMap(group => group.entries.map(entry => ({ ...entry, group: group.id })))
  const featured = FEATURED.map(id => all.find(entry => entry.id === id)).filter((entry): entry is CreditEntry & { group: string } => Boolean(entry))
  const rest = CREDIT_GROUPS.filter(group => group.id !== 'people').map(group => ({ ...group, entries: group.entries.filter(entry => !(FEATURED as readonly string[]).includes(entry.id) && entry.id !== 'react') })).filter(group => group.entries.length)
  const restCount = rest.reduce((sum, group) => sum + group.entries.length, 0)
  const hints = (a: string) => `${a};X:Check for updates;Y:Read the licence;B:Home`
  const link = (entry: CreditEntry, title: string, sub: string, avatar?: string) => (
    <a key={entry.id} className={styles.entry} href={entry.url} target="_blank" rel="noopener noreferrer" data-credit={entry.id}
      onClick={event => { event.preventDefault(); void openLink(entry.url) }} data-hints={hints('A:Open link')} data-caption={`${title} · ${t(`credits.entries.${entry.id}`, entry.description)}`}>
      {avatar && <span className={styles.avatar} aria-hidden="true">{avatar}</span>}
      <span className={styles.text}><b>{title}</b><span>{sub}</span></span>
    </a>
  )

  return (
    <div ref={host} className={styles.credits}>
      <header className={styles.about}>
        <BrandMark size={72} />
        <div className={styles.aboutText}>
          <h2 className={styles.appName}>JSM Evolved</h2>
          <p className={styles.version} data-update-status={update?.available ? 'available' : update?.error ? 'error' : update?.checkedAtMs ? 'current' : 'unknown'}>
            Version {update?.currentVersion || appVersion} · <b>{describeUpdate(update)}</b> · {describeChecked(update, APP_STARTED_AT)}
          </p>
          <p className={styles.builtOn}>Built on JoyShockMapper · MIT licence</p>
        </div>
        <button type="button" className="button button--secondary" onClick={() => update?.available ? void shellBridge.installUpdate() : void checkForUpdatesNow()} data-hints={hints(update?.available ? 'A:Install and restart' : 'A:Check for updates')}>
          {update?.checking ? 'Checking…' : update?.available ? `Get ${update.latestVersion}` : 'Check for updates'}
        </button>
      </header>
      {linkError && <p role="alert" className={styles.error}>{t('credits.linkError')}</p>}

      <section className={styles.tiles} aria-label="Links" data-nav-region="links">
        {PROJECT_LINKS.map(item => (
          <button key={item.id} type="button" className={styles.tile} data-hints={hints('A:Open link')} onClick={() => void openLink(item.url)}>
            <b>{item.label} ↗</b>
          </button>
        ))}
        <span className={styles.tileNote}>A opens it in your browser</span>
      </section>

      <section className={styles.group} aria-labelledby="credits-people" data-nav-region="credits-people">
        <h2 id="credits-people" className={styles.groupTitle}>People behind it</h2>
        <p className={styles.intro}>Years of community work in gyro controls and mapping. Thank you.</p>
        <div className={styles.list}>
          {people.map(entry => link(entry, shortName(entry.name), PEOPLE_ROLE[entry.id] ?? t(`credits.entries.${entry.id}`, entry.description), initials(entry.name)))}
        </div>
      </section>

      <section className={styles.group} aria-labelledby="credits-projects" data-nav-region="credits-projects">
        <h2 id="credits-projects" className={styles.groupTitle}>Projects it stands on</h2>
        <div className={styles.list}>
          {featured.map(entry => link(entry, FEATURED_LABEL[entry.id]?.[0] ?? entry.name, FEATURED_LABEL[entry.id]?.[1] ?? entry.description))}
          <button type="button" className={styles.entry} data-hints={hints('A:Open')} onClick={() => setMore(true)} data-credits-more="">
            <span className={styles.text}><b>And {restCount} more ▸</b><span>Tools, upstream contributors, GyroWiki</span></span>
          </button>
        </div>
      </section>

      <p className={styles.note}>MIT licence · © 2018–2021 Julian “Jibb” Smart, 2021– Nicolas Lessard. {t('credits.notExhaustive')}</p>

      <SubPage open={more} onClose={() => setMore(false)} crumbRoot="Settings" trail={['About & credits']} title={`And ${restCount} more`} backLabel="Back to About">
        <div className={styles.credits}>
          {rest.map(group => (
            <section key={group.id} className={styles.group} aria-labelledby={`credits-${group.id}`}>
              <h2 id={`credits-${group.id}`} className={styles.groupTitle}>{t(`credits.groups.${group.id}`, group.title)}</h2>
              <div className={styles.list}>{group.entries.map(entry => link(entry, entry.name, t(`credits.entries.${entry.id}`, entry.description)))}</div>
            </section>
          ))}
        </div>
      </SubPage>

      <SubPage open={licence} onClose={() => setLicence(false)} crumbRoot="Settings" trail={['About & credits']} title="The licence" backLabel="Back to About">
        <article className={styles.licence} tabIndex={0} data-hints="MOVE:Scroll;B:Back to About"><ReactMarkdown>{licenceText}</ReactMarkdown></article>
      </SubPage>
    </div>
  )
}

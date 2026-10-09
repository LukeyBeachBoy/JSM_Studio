import { useEffect, useState } from 'react'
import { desktopBridge } from '../../platform/desktopBridge'
import { setCachedAutostart, usePreferences } from '../../platform/preferenceStore'
import { APP_STARTED_AT, appVersion, checkForUpdatesNow, describeChecked, describeUpdate, shellBridge, useUpdateStatus, type StartupPreferences } from '../../platform/shellBridge'
import { showToast } from '../../utils/toast'
import { ModeCards, OpenRow, SubPage } from '../ui/console'
import { ResetDefaultSettings } from '../ResetDefaultSettings'
import { SettingsColumns, SettingsNote, SettingsSection, SwitchRow } from './SettingsKit'
import styles from './Settings.module.css'

// Settings ▸ Startup (console v2, SettingsStartup.dc.html; D19, D20): what
// happens when Windows starts, and keeping JSM Evolved up to date.

const NAMED = 'named:'

/** "When Windows starts": the logon task, the tray, the configuration it loads. */
function WhenWindowsStarts({ tray, loads }: { tray: boolean; loads: string }) {
  return (
    <svg viewBox="0 0 320 170" role="img" aria-label={`When Windows starts: JSM Evolved ${tray ? 'waits in the tray' : 'opens its window'} and loads ${loads}`}>
      <rect x="10" y="20" width="300" height="120" rx="12" fill="var(--art-body)" stroke="var(--art-line)" strokeWidth="2" />
      <rect x="10" y="118" width="300" height="22" rx="0" fill="var(--art-well)" />
      <rect x="248" y="122" width="14" height="14" rx="3" fill="var(--accent)" />
      {!tray && <rect x="60" y="38" width="200" height="66" rx="8" fill="var(--art-cap)" stroke="var(--art-detail)" strokeWidth="1.5" />}
      {!tray && <rect x="60" y="38" width="200" height="12" rx="4" fill="var(--accent)" />}
      <text x="160" y="160" textAnchor="middle" fill="var(--text-2)" fontSize="13">{tray ? 'In the tray' : 'Window open'} · loads {loads}</text>
    </svg>
  )
}

export function StartupPage({ libraryProfiles, liveName }: { libraryProfiles: string[]; liveName: string | null }) {
  const { autostart } = usePreferences()
  const [autostartPending, setAutostartPending] = useState(false)
  const [startup, setStartup] = useState<StartupPreferences | null>(null)
  const [fallback, setFallback] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const update = useUpdateStatus()
  useEffect(() => {
    let live = true
    void shellBridge.getStartupPreferences().then(value => { if (live) setStartup(value) }).catch(() => {})
    void desktopBridge.getAutoloadFallback().then(value => { if (live) setFallback(value.profileName) }).catch(() => {})
    return () => { live = false }
  }, [])

  const changeAutostart = async (next: boolean) => {
    setAutostartPending(true)
    const previous = autostart ?? !next
    setCachedAutostart(next)
    const success = await desktopBridge.setAutostartEnabled(next)
    setAutostartPending(false)
    if (!success) {
      setCachedAutostart(previous)
      showToast('Windows did not take the change. Try again, or check Task Scheduler.', 'error')
    }
  }
  const saveStartup = async (patch: Partial<StartupPreferences>) => {
    if (!startup) return
    const next = { ...startup, ...patch }
    setStartup(next)
    try { setStartup(await shellBridge.setStartupPreferences(next)) } catch (error) { setStartup(startup); showToast(String(error), 'error') }
  }

  const choice = startup?.startupProfile ?? 'last'
  const named = choice.startsWith(NAMED) ? choice.slice(NAMED.length) : null
  const loads = choice === 'fallback' ? fallback ?? 'Desktop gamepad' : named ?? liveName ?? 'the last one live'
  const waiting = startup ? undefined : 'Reading the startup settings…'
  const updateLine = `Version ${update?.currentVersion || appVersion} · ${describeChecked(update, APP_STARTED_AT)}`

  return (
    <SettingsColumns asideLabel="When Windows starts" main={<>
      <div className={styles.sectionBody}>
        <SwitchRow label="Start with Windows" hint="No permission prompt each time you sign in" on={autostart} pending={autostartPending}
          onChange={next => void changeAutostart(next)} onReset={() => void changeAutostart(false)} />
        <SwitchRow label="Start in the tray" hint="Mapping runs; the window stays out of the way" on={startup ? startup.startInTray : null}
          disabled={autostart === false ? 'Only matters when JSM Evolved starts with Windows' : undefined}
          onChange={startInTray => void saveStartup({ startInTray })} onReset={() => void saveStartup({ startInTray: true })} />
      </div>
      <SettingsSection title="What loads first" note="Until a game with its own configuration comes to the front">
        <ModeCards columns={3} value={choice === 'fallback' ? 'fallback' : named ? 'named' : 'last'} useLabel={card => card.value === 'named' ? 'Pick another' : `Use ${card.label}`}
          onChange={value => { if (value === 'named') setPicking(true); else void saveStartup({ startupProfile: value }) }}
          options={[
            { value: 'last', label: 'Last one live', caption: liveName ? `${liveName}, today` : 'Whatever was live last', unavailable: waiting },
            { value: 'fallback', label: fallback ?? 'Desktop gamepad', caption: fallback ? 'When no game matches' : 'For Windows itself · set one in Launch with game', unavailable: waiting ?? (fallback ? undefined : 'Choose a configuration for “When nothing matches” in Library ▸ Launch with game first') },
            { value: 'named', label: named ?? 'Pick another', caption: named ? 'Chosen from your library · A picks again' : 'From your library', unavailable: waiting },
          ]} />
      </SettingsSection>
      <SettingsSection title="Updates">
        <OpenRow label={describeUpdate(update)} hint={updateLine} value={update?.checking ? 'Checking…' : update?.available ? 'Get it ▸' : 'Check now'}
          data={{ 'data-update-status': update?.available ? 'available' : update?.error ? 'error' : update?.checkedAtMs ? 'current' : 'unknown' }}
          onOpen={() => {
            if (update?.available) void shellBridge.installUpdate().catch(error => showToast(String(error), 'error'))
            else void checkForUpdatesNow()
          }} hints={update?.available ? 'A:Install and restart;B:Home' : 'A:Check now;B:Home'} />
        <SettingsNote>When there’s a new version, a line under the header offers to install it and restart.</SettingsNote>
      </SettingsSection>
      <ResetDefaultSettings />

      <SubPage open={picking} onClose={() => setPicking(false)} crumbRoot="Settings" trail={['Startup', 'What loads first']} title="Pick another" backLabel="Back to Startup">
        <div className={styles.mainColumn} style={{ maxWidth: 760 }} role="radiogroup" aria-label="What loads first">
          {libraryProfiles.map(name => (
            <button key={name} type="button" role="radio" aria-checked={named === name} className={styles.switchRow} data-autofocus={named === name ? '' : undefined}
              data-hints="A:Load this first;B:Back" onClick={() => { void saveStartup({ startupProfile: `${NAMED}${name}` }); setPicking(false) }}>
              <span className={styles.rowText}><span className={styles.rowLabel}>{name}</span></span>
              {named === name && <span className={styles.tag} data-tone="accent">Loads first</span>}
            </button>
          ))}
        </div>
      </SubPage>
    </>} aside={
      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>When Windows starts</h3>
        <WhenWindowsStarts tray={autostart !== false && (startup?.startInTray ?? true)} loads={loads} />
        <p className={styles.panelNote}>{autostart ? `JSM Evolved starts as you sign in${startup?.startInTray === false ? ' and opens its window' : ', in the tray'}, and ${loads} is live until a game with its own configuration comes to the front.` : 'JSM Evolved waits until you open it.'}</p>
      </div>
    } />
  )
}

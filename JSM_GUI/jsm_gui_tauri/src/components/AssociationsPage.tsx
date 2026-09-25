import { useCallback, useEffect, useState } from 'react'
import { desktopBridge, type AutoloadRule } from '../platform/desktopBridge'
import { AppSelect } from './ui/AppSelect'
import { Icon } from './icons/Icon'
import { showToast } from '../utils/toast'
import styles from './AssociationsPage.module.css'

type AssociationsPageProps = {
  libraryProfiles: string[]
  autoloadEnabled: boolean
  runtimeBusy?: boolean
  onAutoloadEnabledChange: (enabled: boolean) => void
}

// Associations (Tuning and Studio Pages 16f): each app and the configuration
// it loads when it comes to the front, with a switch to pause one without
// losing it. Adding an app goes through the full manager (header action),
// which can pick from running programs.
export function AssociationsPage({ libraryProfiles, autoloadEnabled, runtimeBusy, onAutoloadEnabledChange }: AssociationsPageProps) {
  const [rules, setRules] = useState<AutoloadRule[]>([])
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    setRules(await desktopBridge.listAutoloadRules())
    setLoading(false)
  }, [])
  useEffect(() => {
    void refresh()
    // The manager dialog writes rules too; re-read when it closes.
    const reload = () => void refresh()
    window.addEventListener('jsm:associations-changed', reload)
    return () => window.removeEventListener('jsm:associations-changed', reload)
  }, [refresh])

  const change = async (rule: AutoloadRule, profileName: string) => {
    const saved = await desktopBridge.saveAutoloadRule(rule.processName, profileName)
    if (!saved) { showToast(`Could not change what ${rule.processName} loads.`, 'error'); return }
    await refresh()
  }
  const setPaused = async (rule: AutoloadRule, paused: boolean) => {
    const saved = await desktopBridge.setAutoloadRulePaused(rule.processName, paused)
    if (!saved) { showToast(`Could not ${paused ? 'pause' : 'resume'} ${rule.processName}.`, 'error'); return }
    await refresh()
  }
  const remove = async (rule: AutoloadRule) => {
    const result = await desktopBridge.deleteAutoloadRule(rule.processName)
    if (!result.success) { showToast(`Could not remove ${rule.processName}.`, 'error'); return }
    await refresh()
  }

  const describe = (rule: AutoloadRule) =>
    rule.builtIn ? 'Studio’s own navigation, while Studio is in front'
      : rule.paused ? 'Paused'
        : rule.missingProfile ? 'Its configuration is missing'
          : rule.kind === 'advanced' ? 'Runs its own commands'
            : 'Loads when it comes to the front'

  return (
    <div className={styles.page}>
      <label className={styles.masterSwitch}>
        <input type="checkbox" checked={autoloadEnabled} disabled={runtimeBusy} onChange={event => onAutoloadEnabledChange(event.target.checked)} />
        <span>
          <span>Switch configurations automatically</span>
          <small>{autoloadEnabled ? 'The apps below load their configuration when they come to the front.' : 'Off: the configuration you apply stays until you change it.'}</small>
        </span>
      </label>

      {loading ? <p className={styles.note}>Reading associations…</p> : rules.length === 0 ? (
        <p className={styles.empty}>No apps yet. Add an app and choose the configuration it loads.</p>
      ) : (
        <ul className={styles.rows}>
          {rules.map(rule => (
            <li key={rule.fileName} className={styles.row} data-paused={rule.paused || undefined}>
              <span className={styles.appIcon} aria-hidden="true"><Icon name={rule.builtIn ? 'library' : 'associations'} size={20} /></span>
              <span className={styles.text}>
                <span className={styles.name}>{rule.builtIn ? 'JSM Studio' : rule.processName}</span>
                <span className={styles.sub}>{describe(rule)}</span>
              </span>
              {rule.kind === 'profile' && !rule.builtIn ? (
                <span className={styles.loads}>
                  <span className={styles.loadsLabel}>loads</span>
                  <AppSelect aria-label={`Configuration ${rule.processName} loads`} value={rule.profileName ?? ''} disabled={runtimeBusy}
                    onChange={event => void change(rule, event.target.value)}>
                    {rule.missingProfile && rule.profileName && <option value={rule.profileName}>{rule.profileName} (missing)</option>}
                    {libraryProfiles.map(name => <option key={name} value={name}>{name}</option>)}
                  </AppSelect>
                </span>
              ) : <span className={styles.loadsLabel}>{rule.builtIn ? 'built in' : 'custom'}</span>}
              {!rule.builtIn && <>
                <input type="checkbox" aria-label={`${rule.processName} association on`} checked={!rule.paused} onChange={event => void setPaused(rule, !event.target.checked)} />
                <button type="button" className={`icon-button ${styles.remove}`} aria-label={`Remove ${rule.processName}`} title="Remove" onClick={() => void remove(rule)}>
                  <Icon name="remove" size={18} />
                </button>
              </>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

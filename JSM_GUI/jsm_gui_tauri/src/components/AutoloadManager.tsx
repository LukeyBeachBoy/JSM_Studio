import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopBridge, type AutoloadRule, type RunningProcess } from '../platform/desktopBridge'
import { showToast } from '../utils/toast'
import { Switch } from './AssociationsPage'
import styles from './AutoloadManager.module.css'
import { AppSelect } from './ui/AppSelect'

type AutoloadManagerProps = {
  libraryProfiles: string[]
  autoloadEnabled: boolean
  runtimeBusy: boolean
  onAutoloadEnabledChange: (enabled: boolean) => Promise<void> | void
  onClose: () => void
}

const exeName = (processName: string) => (/\.exe$/i.test(processName) ? processName : `${processName}.exe`)
const stem = (processName: string) => processName.replace(/\.exe$/i, '')

// "+ Add app" (Tuning and Studio Pages 16f): pick a running program so a
// pad-only user never types an executable name, or type one; then the
// configuration it loads. The rules already written are listed under it.
export function AutoloadManager({
  libraryProfiles,
  autoloadEnabled,
  runtimeBusy,
  onAutoloadEnabledChange,
  onClose,
}: AutoloadManagerProps) {
  const { t } = useTranslation()
  const [rules, setRules] = useState<AutoloadRule[]>([])
  const [loading, setLoading] = useState(true)
  const [busyRule, setBusyRule] = useState<string | null>(null)
  const [processName, setProcessName] = useState('')
  const [profileName, setProfileName] = useState('')
  const [selectedProfiles, setSelectedProfiles] = useState<Record<string, string>>({})
  const [running, setRunning] = useState<RunningProcess[]>([])
  const [runningLoading, setRunningLoading] = useState(true)

  const defaultProfile = libraryProfiles[0] ?? ''

  useEffect(() => {
    if (!profileName && defaultProfile) {
      setProfileName(defaultProfile)
    }
  }, [defaultProfile, profileName])

  const refreshRules = useCallback(async () => {
    setLoading(true)
    try {
      const nextRules = await desktopBridge.listAutoloadRules()
      setRules(nextRules.filter(rule => !rule.builtIn))
      setSelectedProfiles(prev => {
        const next = { ...prev }
        nextRules.forEach(rule => {
          if (rule.kind === 'profile') {
            next[rule.processName] = rule.profileName ?? defaultProfile
          }
        })
        return next
      })
    } catch (error) {
      console.error('Failed to load AutoLoad rules', error)
      showToast(t('messages.autoloadRuleFailed'), 'error')
    } finally {
      setLoading(false)
    }
  }, [defaultProfile, t])

  const refreshRunning = useCallback(async () => {
    setRunningLoading(true)
    try {
      const list = await desktopBridge.listRunningProcesses()
      // One row per executable, the first window's title.
      const seen = new Map<string, RunningProcess>()
      for (const process of list) {
        const key = exeName(process.processName).toLowerCase()
        if (!seen.has(key)) seen.set(key, process)
      }
      setRunning([...seen.values()].sort((left, right) => left.processName.localeCompare(right.processName)))
    } catch {
      setRunning([])
    } finally {
      setRunningLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshRules()
    void refreshRunning()
  }, [refreshRules, refreshRunning])

  const sortedProfiles = useMemo(
    () => [...libraryProfiles].sort((left, right) => left.localeCompare(right)),
    [libraryProfiles]
  )
  const known = useMemo(() => new Set(rules.map(rule => stem(rule.processName).toLowerCase())), [rules])

  const handleSaveRule = async (targetProcess: string, targetProfile: string) => {
    const name = stem(targetProcess.trim())
    if (!name || !targetProfile) return
    setBusyRule(name)
    try {
      // The bridge answers null rather than throwing when the rule was not written.
      const saved = await desktopBridge.saveAutoloadRule(name, targetProfile)
      if (!saved) throw new Error('rule not saved')
      await refreshRules()
      showToast(t('messages.autoloadRuleSaved'))
      if (stem(targetProcess.trim()) === stem(processName.trim())) {
        setProcessName('')
      }
    } catch (error) {
      console.error('Failed to save AutoLoad rule', error)
      showToast(t('messages.autoloadRuleFailed'), 'error')
    } finally {
      setBusyRule(null)
    }
  }

  const handleDeleteRule = async (targetProcess: string) => {
    setBusyRule(targetProcess)
    try {
      const result = await desktopBridge.deleteAutoloadRule(targetProcess)
      if (!result.success) throw new Error('rule not deleted')
      await refreshRules()
      showToast(t('messages.autoloadRuleDeleted'))
    } catch (error) {
      console.error('Failed to delete AutoLoad rule', error)
      showToast(t('messages.autoloadRuleFailed'), 'error')
    } finally {
      setBusyRule(null)
    }
  }

  const renderStatus = (rule: AutoloadRule) => {
    if (rule.kind !== 'profile') {
      return <span className={`${styles.chip} ${styles.chipNeutral}`}>{t('autoload.advancedRule')}</span>
    }
    if (rule.missingProfile) {
      return <span className={`${styles.chip} ${styles.chipWarn}`}>{t('autoload.missingProfile')}</span>
    }
    if (rule.paused) {
      return <span className={`${styles.chip} ${styles.chipNeutral}`}>Paused</span>
    }
    return <span className={`${styles.chip} ${styles.chipOk}`}>{t('autoload.profileRule')}</span>
  }

  const chosen = stem(processName.trim()).toLowerCase()

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className={`modal-card ${styles.modal}`} role="dialog" aria-modal="true" aria-label="Add app" onMouseDown={event => event.stopPropagation()} data-hints="A:Select;B:Close">
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>Add app</h3>
            <p className={styles.description}>Choose a running program, or type its executable name, and the configuration it loads when it comes to the front.</p>
          </div>
          <button type="button" className="button button--ghost button--sm" data-modal-close onClick={onClose}>
            {t('common.close')}
          </button>
        </div>

        <section className={styles.pickerPanel} aria-label="Running programs">
          <div className={styles.sectionHeader}>
            <span className={styles.eyebrow}>Running now</span>
            <button type="button" className="button button--ghost button--sm" onClick={() => void refreshRunning()} disabled={runningLoading}>
              {runningLoading ? t('common.refreshing') : t('autoload.refresh')}
            </button>
          </div>
          {runningLoading && running.length === 0 ? (
            <p className={styles.note}>Looking for windows…</p>
          ) : running.length === 0 ? (
            <p className={styles.note}>No windowed programs found. Type the executable name below.</p>
          ) : (
            <ul className={styles.processList}>
              {running.map(process => {
                const exe = exeName(process.processName)
                const already = known.has(stem(exe).toLowerCase())
                return (
                  <li key={`${exe}-${process.pid}`}>
                    <button type="button" className={styles.process} aria-pressed={chosen === stem(exe).toLowerCase()} onClick={() => setProcessName(exe)}>
                      <span className={styles.processText}>
                        <span className={styles.processName}>{exe}</span>
                        {process.windowTitle && <span className={styles.processTitle}>{process.windowTitle}</span>}
                      </span>
                      {already && <span className={`${styles.chip} ${styles.chipNeutral}`}>Already added</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className={styles.addForm} aria-label={t('autoload.addRule')}>
          <label className={styles.field}>
            <span>{t('autoload.program')}</span>
            <input
              className="text-field"
              value={processName}
              placeholder={t('autoload.processPlaceholder')}
              onChange={event => setProcessName(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>{t('autoload.profile')}</span>
            <AppSelect
              className="app-select"
              value={profileName}
              disabled={!sortedProfiles.length}
              onChange={event => setProfileName(event.target.value)}
            >
              {!sortedProfiles.length && <option value="">{t('autoload.selectProfile')}</option>}
              {sortedProfiles.map(profile => (
                <option key={profile} value={profile}>
                  {profile}
                </option>
              ))}
            </AppSelect>
          </label>
          <button
            type="button"
            className="button button--primary"
            disabled={!processName.trim() || !profileName || busyRule !== null}
            onClick={() => void handleSaveRule(processName, profileName)}
          >
            {known.has(chosen) ? 'Change what it loads' : 'Add app'}
          </button>
          <p className={styles.note}>{t('autoload.processHint')}</p>
        </section>

        <section className={styles.rulesPanel} aria-label={t('autoload.rulesTitle')}>
          <div className={styles.sectionHeader}>
            <span className={styles.eyebrow}>{t('autoload.rulesTitle')} · {rules.length}</span>
            <button type="button" className="button button--ghost button--sm" onClick={() => void refreshRules()} disabled={loading}>
              {t('autoload.refresh')}
            </button>
          </div>

          {loading ? (
            <p className={styles.note}>{t('autoload.loading')}</p>
          ) : rules.length === 0 ? (
            <p className={styles.note}>{t('autoload.empty')}</p>
          ) : (
            <div className={styles.ruleList}>
              {rules.map(rule => {
                const selectedProfile = selectedProfiles[rule.processName] ?? rule.profileName ?? defaultProfile
                const isBusy = busyRule === rule.processName
                return (
                  <div className={styles.ruleRow} key={rule.fileName} data-paused={rule.paused || undefined}>
                    <div className={styles.ruleProgram}>
                      <span>{exeName(rule.processName)}</span>
                      <small>{t('autoload.ruleFile', { file: rule.fileName })}</small>
                    </div>
                    <div className={styles.ruleProfile}>
                      {rule.kind === 'profile' ? (
                        <AppSelect
                          className="app-select"
                          aria-label={`Configuration ${exeName(rule.processName)} loads`}
                          value={selectedProfile}
                          disabled={!sortedProfiles.length || isBusy}
                          onChange={event => {
                            setSelectedProfiles(prev => ({ ...prev, [rule.processName]: event.target.value }))
                          }}
                        >
                          {sortedProfiles.map(profile => (
                            <option key={profile} value={profile}>
                              {profile}
                            </option>
                          ))}
                        </AppSelect>
                      ) : (
                        <span className={styles.note}>{t('autoload.advancedNote')}</span>
                      )}
                    </div>
                    <div className={styles.ruleStatus}>{renderStatus(rule)}</div>
                    <div className={styles.ruleActions}>
                      {rule.kind === 'profile' && (
                        <button
                          type="button"
                          className="button button--secondary button--sm"
                          disabled={!selectedProfile || isBusy || selectedProfile === rule.profileName}
                          onClick={() => void handleSaveRule(rule.processName, selectedProfile)}
                        >
                          {t('common.save')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="button button--danger button--sm"
                        disabled={isBusy}
                        onClick={() => void handleDeleteRule(rule.processName)}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <div className={`setting-row setting-row--compact ${styles.masterRow}`}>
          <span className={styles.masterText}>
            <span>{t('autoload.toggleLabel')}</span>
            <small>{t('autoload.toggleDescription')}</small>
          </span>
          <Switch on={autoloadEnabled} label={t('autoload.toggleLabel')} disabled={runtimeBusy} onChange={next => void onAutoloadEnabledChange(next)} />
        </div>
      </div>
    </div>
  )
}

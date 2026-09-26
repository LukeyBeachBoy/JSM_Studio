import { useCallback, useEffect, useRef, useState } from 'react'
import { desktopBridge, type AutoloadFallback, type AutoloadRule } from '../platform/desktopBridge'
import { PAD_EVENT, type PadEventDetail } from '../nav/useControllerNavigation'
import { AppSelect } from './ui/AppSelect'
import { Icon } from './icons/Icon'
import { showToast } from '../utils/toast'
import { relativeTime, useClock } from '../hooks/useLastSeenController'
import styles from './AssociationsPage.module.css'

type AssociationsPageProps = {
  libraryProfiles: string[]
  autoloadEnabled: boolean
  runtimeBusy?: boolean
  onAutoloadEnabledChange: (enabled: boolean) => void
}

/** The design's 52 × 30 toggle (Components 13.9), as a switch button. */
export function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={styles.switch} data-on={on || undefined} data-hints={on ? "A:Turn off;B:Back" : "A:Turn on;B:Back"}
      onClick={() => onChange(!on)}>
      <span className={styles.thumb} aria-hidden="true" />
    </button>
  )
}

const exeName = (processName: string) => (/\.exe$/i.test(processName) ? processName : `${processName}.exe`)

// Associations (Tuning and Studio Pages 16f): each app and the configuration
// it loads when it comes to the front, with a switch to pause one without
// losing it. Adding an app goes through the manager (header action), which
// can pick from running programs.
export function AssociationsPage({ libraryProfiles, autoloadEnabled, runtimeBusy, onAutoloadEnabledChange }: AssociationsPageProps) {
  const [rules, setRules] = useState<AutoloadRule[]>([])
  const [fallback, setFallback] = useState<AutoloadFallback | null>(null)
  const [loading, setLoading] = useState(true)
  // A destructive confirmation starts on Cancel (System States 17g): it is the
  // dialog's first control, which useKeyboardNav focuses when the overlay
  // appears. Focusing it here instead would run before that hook records the
  // Remove button as where to return, and B would leave focus nowhere.
  const [confirming, setConfirming] = useState<AutoloadRule | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const now = useClock()
  const refresh = useCallback(async () => {
    const [list, fallbackRule] = await Promise.all([
      desktopBridge.listAutoloadRules().catch(() => [] as AutoloadRule[]),
      desktopBridge.getAutoloadFallback().catch(() => null),
    ])
    // Studio's own navigation rule is native now (HANDOFF.md); it is not an association.
    setRules(list.filter(rule => !rule.builtIn))
    setFallback(fallbackRule)
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
    if (!saved) { showToast(`Could not change what ${exeName(rule.processName)} loads.`, 'error'); return }
    await refresh()
  }
  const setPaused = async (rule: AutoloadRule, paused: boolean) => {
    const saved = await desktopBridge.setAutoloadRulePaused(rule.processName, paused)
    if (!saved) { showToast(`Could not ${paused ? 'pause' : 'resume'} ${exeName(rule.processName)}.`, 'error'); return }
    await refresh()
  }
  const remove = async (rule: AutoloadRule) => {
    const result = await desktopBridge.deleteAutoloadRule(rule.processName)
    if (!result.success) { showToast(`Could not remove ${exeName(rule.processName)}.`, 'error'); return }
    await refresh()
  }
  const changeFallback = async (next: AutoloadFallback) => {
    const saved = await desktopBridge.setAutoloadFallback(next)
    if (!saved) { showToast('Could not change the desktop fallback.', 'error'); return }
    setFallback(saved)
  }

  // X on a row toggles it (the row's hint says "Enable / disable").
  useEffect(() => {
    const host = listRef.current
    if (!host) return
    const onPad = (event: Event) => {
      if ((event as CustomEvent<PadEventDetail>).detail.button !== 'X') return
      const row = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-process]')
      if (!row) return
      event.preventDefault()
      if (row.dataset.process === '__fallback__') { if (fallback) void changeFallback({ ...fallback, enabled: !fallback.enabled }); return }
      const rule = rules.find(candidate => candidate.processName === row.dataset.process)
      if (rule) void setPaused(rule, !rule.paused)
    }
    host.addEventListener(PAD_EVENT, onPad)
    return () => host.removeEventListener(PAD_EVENT, onPad)
  })

  const describe = (rule: AutoloadRule) =>
    rule.paused ? 'Paused'
      : rule.missingProfile ? 'Its configuration is missing'
        : rule.kind === 'advanced' ? 'Runs its own commands'
          : rule.lastMatchedAtMs ? `Last matched ${relativeTime(rule.lastMatchedAtMs, now)}` : 'Last matched never'

  // aria-busy until the rules load: the pad lands in the page once they have
  // (useKeyboardNav), not on whatever was there before they arrived.
  return (
    <div className={styles.page} aria-busy={loading || undefined}>
      {loading ? <p className={styles.note}>Reading associations…</p> : rules.length === 0 && !fallback ? (
        <p className={styles.empty}>No apps yet. Add an app and choose the configuration it loads.</p>
      ) : (
        <ul className={styles.rows} ref={listRef}>
          {rules.map(rule => (
            <li key={rule.fileName} className={styles.row} data-paused={rule.paused || undefined} data-process={rule.processName} data-hints="A:Change configuration;X:Enable / disable;B:Back">
              <span className={styles.appIcon} aria-hidden="true"><Icon name="associations" size={20} /></span>
              <span className={styles.text}>
                <span className={styles.name}>{exeName(rule.processName)}</span>
                <span className={styles.sub}>{describe(rule)}</span>
              </span>
              {rule.kind === 'profile' ? (
                <span className={styles.loads}>
                  <span className={styles.loadsLabel}>loads</span>
                  <AppSelect aria-label={`Configuration ${exeName(rule.processName)} loads`} value={rule.profileName ?? ''} disabled={runtimeBusy}
                    onChange={event => void change(rule, event.target.value)}>
                    {rule.missingProfile && rule.profileName && <option value={rule.profileName}>{rule.profileName} (missing)</option>}
                    {libraryProfiles.map(name => <option key={name} value={name}>{name}</option>)}
                  </AppSelect>
                </span>
              ) : <span className={styles.loadsLabel}>custom</span>}
              <Switch on={!rule.paused} label={`${exeName(rule.processName)} association on`} disabled={runtimeBusy} onChange={on => void setPaused(rule, !on)} />
              <button type="button" className={`icon-button ${styles.remove}`} aria-label={`Remove ${exeName(rule.processName)}`} title="Remove" onClick={() => setConfirming(rule)}>
                <Icon name="remove" size={18} />
              </button>
            </li>
          ))}
          {fallback && (
            <li className={styles.row} data-paused={!fallback.enabled || undefined} data-process="__fallback__" data-hints="A:Change configuration;X:Enable / disable;B:Back">
              <span className={styles.appIcon} aria-hidden="true"><Icon name="overview" size={20} /></span>
              <span className={styles.text}>
                <span className={styles.name}>Desktop (no app focused)</span>
                <span className={styles.sub}>{fallback.enabled ? 'Fallback' : 'Fallback · off'}</span>
              </span>
              <span className={styles.loads}>
                <span className={styles.loadsLabel}>loads</span>
                <AppSelect aria-label="Configuration the desktop loads" value={fallback.profileName ?? ''} disabled={runtimeBusy}
                  onChange={event => void changeFallback({ ...fallback, profileName: event.target.value || null })}>
                  <option value="">Nothing</option>
                  {libraryProfiles.map(name => <option key={name} value={name}>{name}</option>)}
                </AppSelect>
              </span>
              <Switch on={fallback.enabled} label="Desktop fallback on" disabled={runtimeBusy} onChange={enabled => void changeFallback({ ...fallback, enabled })} />
              <span className={styles.removeSpacer} aria-hidden="true" />
            </li>
          )}
        </ul>
      )}

      <div className={`setting-row setting-row--compact ${styles.masterRow}`} data-hints="A:Turn on / off;B:Back">
        <span className={styles.text}>
          <span className={styles.name}>Switch configurations automatically</span>
          <span className={styles.sub}>{autoloadEnabled ? 'The apps above load their configuration when they come to the front.' : 'Off: the configuration you apply stays until you change it.'}</span>
        </span>
        <Switch on={autoloadEnabled} label="Switch configurations automatically" disabled={runtimeBusy} onChange={onAutoloadEnabledChange} />
      </div>

      {/* Escape must preventDefault, or the same press also reaches the
          page's own handler once the overlay is gone and backs out of Studio. */}
      {confirming && (
        <div className="modal-overlay modal-overlay--over" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setConfirming(null) } }}>
          <div className="modal-card confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="remove-app-title" aria-describedby="remove-app-body">
            <h3 id="remove-app-title">Remove {exeName(confirming.processName)}?</h3>
            <p id="remove-app-body">
              {confirming.profileName ? <><strong>{confirming.profileName}</strong> no longer loads when {exeName(confirming.processName)} comes to the front; the configuration stays in your library.</> : `${exeName(confirming.processName)} no longer loads anything when it comes to the front.`}
            </p>
            <div className="confirm-dialog__actions">
              <button type="button" className="button button--secondary" data-modal-close onClick={() => setConfirming(null)}>Cancel</button>
              <button type="button" className="button button--danger-solid" onClick={() => { const rule = confirming; setConfirming(null); void remove(rule) }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

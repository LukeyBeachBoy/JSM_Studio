import { useCallback, useEffect, useRef, useState } from 'react'
import { desktopBridge, type AutoloadFallback, type AutoloadRule, type RunningGame } from '../platform/desktopBridge'
import { shellBridge, type ForegroundApp } from '../platform/shellBridge'
import { PAD_EVENT, type PadEventDetail } from '../nav/useControllerNavigation'
import { Icon } from './icons/Icon'
import { Sheet } from './ui/Sheet'
import { showToast } from '../utils/toast'
import { relativeTime, useClock } from '../hooks/useLastSeenController'
import { processStemOf } from '../hooks/useAppIcon'
import { nameHue } from './library/gameArt'
import { AppIconImage } from './AppIconImage'
import { MoreSheet } from './library/LibrarySheets'
import styles from './AssociationsPage.module.css'
import lib from './library/Library.module.css'

type AssociationsPageProps = {
  libraryProfiles: string[]
  autoloadEnabled: boolean
  runtimeBusy?: boolean
  onAutoloadEnabledChange: (enabled: boolean) => void
  /** The configuration the mapper runs now. */
  appliedProfileName?: string | null
  /** The footer's "where" after "Library · Launch with game". */
  onWhere?: (where: string | null) => void
  /** The header's count: "4 apps". */
  onCount?: (count: string | null) => void
}

/** The design's 52 × 30 toggle (Components 13.9), as a switch button. */
export function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} aria-disabled={disabled ? 'true' : undefined} className={styles.switch} data-on={on || undefined} data-hints={on ? 'A:Turn off;B:Back' : 'A:Turn on;B:Back'}
      onClick={() => { if (!disabled) onChange(!on) }}>
      <span className={styles.thumb} aria-hidden="true" />
    </button>
  )
}

const exeName = (processName: string) => (/\.exe$/i.test(processName) ? processName : `${processName}.exe`)
const same = (a: string, b: string) => processStemOf(a).toLowerCase() === processStemOf(b).toLowerCase()
const swatch = (name: string) => <i style={{ background: `hsl(${nameHue(name)} 55% 60%)` }} />

// Launch with game (console v2: LibraryTabs): when a game comes to the front,
// its configuration goes live. The master switch comes first; then each app,
// what it loads (A picks another), on or off (X), and the rest under Y More
// (remove, change the executable). The desktop fallback is last. Beside them:
// who is in front right now, and the apps running now with + Add.
export function AssociationsPage({ libraryProfiles, autoloadEnabled, runtimeBusy, onAutoloadEnabledChange, appliedProfileName, onWhere, onCount }: AssociationsPageProps) {
  const [rules, setRules] = useState<AutoloadRule[]>([])
  const [fallback, setFallback] = useState<AutoloadFallback | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<RunningGame[] | null>(null)
  const [front, setFront] = useState<ForegroundApp | null>(null)
  const [picker, setPicker] = useState<string | null>(null)
  const [moreFor, setMoreFor] = useState<AutoloadRule | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const now = useClock()

  const refresh = useCallback(async () => {
    const [list, fallbackRule] = await Promise.all([
      desktopBridge.listAutoloadRules().catch(() => [] as AutoloadRule[]),
      desktopBridge.getAutoloadFallback().catch(() => null),
    ])
    setRules(list.filter(rule => !rule.builtIn))
    setFallback(fallbackRule)
    setLoading(false)
  }, [])
  const readRunning = useCallback(async () => setRunning(await desktopBridge.listRunningGames()), [])
  useEffect(() => {
    void refresh()
    void readRunning()
    void shellBridge.getForegroundApp().then(setFront).catch(() => {})
    const stop = shellBridge.onForegroundApp(setFront)
    const reload = () => void refresh()
    window.addEventListener('jsm:associations-changed', reload)
    return () => { stop?.(); window.removeEventListener('jsm:associations-changed', reload) }
  }, [refresh, readRunning])
  useEffect(() => { onWhere?.(focused ? exeName(focused) : null) }, [focused, onWhere])
  useEffect(() => () => onWhere?.(null), [onWhere])
  useEffect(() => { onCount?.(`${rules.length} ${rules.length === 1 ? 'app' : 'apps'}`) }, [rules.length, onCount])
  useEffect(() => () => onCount?.(null), [onCount])

  const changed = () => { void refresh(); window.dispatchEvent(new Event('jsm:associations-changed')) }
  const change = async (processName: string, profileName: string) => {
    setPicker(null)
    if (processName === '__fallback__') { if (fallback) void changeFallback({ ...fallback, profileName }); return }
    const saved = await desktopBridge.saveAutoloadRule(processName, profileName)
    if (!saved) { showToast(`Couldn’t change what ${exeName(processName)} loads.`, 'error'); return }
    changed()
  }
  const setPaused = async (rule: AutoloadRule, paused: boolean) => {
    const saved = await desktopBridge.setAutoloadRulePaused(rule.processName, paused)
    if (!saved) { showToast(`Couldn’t ${paused ? 'pause' : 'resume'} ${exeName(rule.processName)}.`, 'error'); return }
    changed()
  }
  const remove = async (rule: AutoloadRule) => {
    const result = await desktopBridge.deleteAutoloadRule(rule.processName)
    if (!result.success) { showToast(`Couldn’t remove ${exeName(rule.processName)}.`, 'error'); return }
    changed()
  }
  const changeFallback = async (next: AutoloadFallback) => {
    const saved = await desktopBridge.setAutoloadFallback(next)
    if (!saved) { showToast('Couldn’t change what the desktop loads.', 'error'); return }
    setFallback(saved)
  }
  // A new app loads the configuration named like it, else the live one, else the first.
  const add = async (processName: string, exePath?: string) => {
    setAddOpen(false)
    const stem = processStemOf(processName)
    const guess = libraryProfiles.find(name => name.toLowerCase() === stem.toLowerCase()) ?? appliedProfileName ?? libraryProfiles[0]
    if (!guess) { showToast('Make a configuration first.', 'error'); return }
    const saved = await desktopBridge.saveAutoloadRule(stem, guess, { exePath, autoApply: true })
    if (!saved) { showToast(`Couldn’t add ${exeName(stem)}.`, 'error'); return }
    changed()
    showToast(`${exeName(stem)} loads ${guess}. A on it picks another.`)
  }
  const browse = async () => {
    const picked = await desktopBridge.pickExecutable().catch(() => null)
    if (picked) await add(processStemOf(picked), picked)
  }
  const changeExe = async (rule: AutoloadRule) => {
    setMoreFor(null)
    const picked = await desktopBridge.pickExecutable().catch(() => null)
    if (!picked) return
    const stem = processStemOf(picked)
    if (!same(stem, rule.processName)) await desktopBridge.deleteAutoloadRule(rule.processName)
    const saved = await desktopBridge.saveAutoloadRule(stem, rule.profileName ?? appliedProfileName ?? libraryProfiles[0], { exePath: picked, autoApply: !rule.paused })
    if (!saved) showToast('Couldn’t change the app.', 'error')
    changed()
  }

  // X on a row turns it on or off; Y opens its More sheet.
  useEffect(() => {
    const host = listRef.current
    if (!host) return
    const onPad = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      const row = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-process]')
      if (!row || (button !== 'X' && button !== 'Y')) return
      event.preventDefault()
      if (row.dataset.process === '__fallback__') { if (button === 'X' && fallback) void changeFallback({ ...fallback, enabled: !fallback.enabled }); return }
      const rule = rules.find(candidate => candidate.processName === row.dataset.process)
      if (!rule) return
      if (button === 'X') void setPaused(rule, !rule.paused)
      else setMoreFor(rule)
    }
    host.addEventListener(PAD_EVENT, onPad)
    return () => host.removeEventListener(PAD_EVENT, onPad)
  })

  const inFront = (rule: AutoloadRule) => Boolean(front && same(front.processName, rule.processName))
  // A paused rule made from an executable only lends its art (TODO-46).
  const describe = (rule: AutoloadRule) =>
    inFront(rule) && !rule.paused && autoloadEnabled ? (rule.profileName === appliedProfileName ? 'In front now · live' : 'In front now')
      : rule.paused ? (rule.exePath ? 'Art only · not launched automatically' : 'Off')
        : rule.missingProfile ? 'Its configuration is missing'
          : rule.kind === 'advanced' ? 'Runs its own commands'
            : rule.lastMatchedAtMs ? `Last matched ${relativeTime(rule.lastMatchedAtMs, now)}` : 'Not matched yet'
  const frontRule = rules.find(rule => inFront(rule) && !rule.paused)
  const added = (process: RunningGame) => rules.some(rule => same(rule.processName, process.processName))

  return (
    <div className={lib.lwgLayout} aria-busy={loading || undefined}>
      <div className={lib.page} ref={listRef}>
        <div className={lib.master} data-hints="A:Turn on / off;B:Home">
          <span><b>Switch configurations automatically</b><small>{autoloadEnabled ? 'When an app below comes to the front, its configuration goes live.' : 'Off: the one you make live stays until you change it'}</small></span>
          <Switch on={autoloadEnabled} label="Switch configurations automatically" disabled={runtimeBusy} onChange={onAutoloadEnabledChange} />
        </div>

        <p className={lib.eyebrow}>Apps</p>
        {loading ? <p className={lib.muted}>Reading apps…</p> : (
          <ul className={lib.apps}>
            {rules.map(rule => {
              const live = inFront(rule) && !rule.paused && autoloadEnabled
              return (
                <li key={rule.fileName} className={lib.app} data-paused={rule.paused || undefined} data-process={rule.processName}>
                  <button type="button" className={lib.appButton} data-hints="A:What it loads;X:On · off;Y:More;B:Home"
                    aria-label={`${exeName(rule.processName)} · ${describe(rule)} · loads ${rule.profileName ?? 'its own commands'}`}
                    onFocus={() => setFocused(rule.processName)} onBlur={() => setFocused(null)}
                    onClick={() => { if (rule.kind === 'profile') setPicker(rule.processName); else setMoreFor(rule) }}>
                    <span className={lib.appIcon} aria-hidden="true"><AppIconImage exePath={rule.exePath} size={32} fallback={<Icon name={rule.kind === 'advanced' ? 'command' : 'associations'} size={20} />} /></span>
                    <span><span className={lib.appName}>{exeName(rule.processName)}</span><span className={lib.appStatus} data-live={live || undefined} style={{ display: 'block' }}>{describe(rule)}</span></span>
                  </button>
                  <span className={lib.loads}>loads<span className={lib.loadsChip}>{rule.kind === 'profile' && rule.profileName ? <>{swatch(rule.profileName)}{rule.profileName}{rule.missingProfile ? ' (missing)' : ''}</> : 'Custom'}</span></span>
                  <Switch on={!rule.paused} label={`${exeName(rule.processName)} on`} disabled={runtimeBusy} onChange={on => void setPaused(rule, !on)} />
                  {live && <p className={lib.appHint}>Goes live when this game is in front.</p>}
                </li>
              )
            })}
            <li>
              <button type="button" className={lib.addApp} data-hints="A:Add app;B:Home" onClick={() => { void readRunning(); setAddOpen(true) }}>
                <span className={lib.appIcon} aria-hidden="true"><Icon name="add" size={20} /></span>
                <span><b>Add app</b><small>Pick one that’s running, or browse for an .exe</small></span>
              </button>
            </li>
          </ul>
        )}

        {fallback && <>
          <p className={lib.eyebrow}>When nothing matches</p>
          <ul className={lib.apps}>
            <li className={lib.app} data-paused={!fallback.enabled || undefined} data-process="__fallback__">
              <button type="button" className={lib.appButton} data-hints="A:What it loads;X:On · off;B:Home" onFocus={() => setFocused('Desktop and other apps')} onBlur={() => setFocused(null)}
                aria-label={`Desktop and other apps · loads ${fallback.profileName ?? 'nothing'}`} onClick={() => setPicker('__fallback__')}>
                <span className={lib.appIcon} aria-hidden="true"><Icon name="overview" size={20} /></span>
                <span><b style={{ fontSize: 17 }}>Desktop and other apps</b><span className={lib.appStatus} style={{ display: 'block' }}>{fallback.enabled ? 'Used when no app above is in front' : 'Off · the live configuration stays'}</span></span>
              </button>
              <span className={lib.loads}>loads<span className={lib.loadsChip}>{fallback.profileName ? <>{swatch(fallback.profileName)}{fallback.profileName}</> : 'Nothing'}</span></span>
              <Switch on={fallback.enabled} label="Desktop and other apps on" disabled={runtimeBusy} onChange={enabled => void changeFallback({ ...fallback, enabled })} />
            </li>
          </ul>
        </>}
      </div>

      <aside className={lib.aside} aria-label="Right now">
        <p className={lib.eyebrow}>Right now</p>
        <div className={lib.rightNow} aria-hidden="true">
          <span className={lib.screen}>{front ? exeName(front.processName) : 'Desktop'}</span>
          <span style={{ color: 'var(--accent)' }}>→</span>
          <span className={lib.liveBox}>{frontRule?.profileName ?? (fallback?.enabled ? fallback.profileName : null) ?? appliedProfileName ?? 'Nothing'}<small style={{ color: 'var(--ok)' }}>● Live</small></span>
        </div>
        <p className={lib.sentence}>
          {!autoloadEnabled ? <>Switching is off, so <b>{appliedProfileName ?? 'the live configuration'}</b> stays live.</>
            : frontRule ? <><b>{exeName(frontRule.processName)}</b> is in front, so <b>{frontRule.profileName}</b> is live.</>
              : front ? <><b>{exeName(front.processName)}</b> has no configuration, so {fallback?.enabled && fallback.profileName ? <><b>{fallback.profileName}</b> is live.</> : <>the live one stays.</>}</>
                : <>Nothing is in front yet.</>}
        </p>
        <p className={lib.eyebrow}>Running now</p>
        <div className={lib.running}>
          {running === null && <p className={lib.muted}>Looking…</p>}
          {running?.slice(0, 6).map(process => {
            const already = added(process)
            return (
              <button key={`${process.processName}-${process.pid}`} type="button" className={lib.runRow} aria-disabled={already ? 'true' : undefined}
                data-reason={already ? 'Already added' : undefined} data-hints={already ? 'B:Home' : 'A:Add;B:Home'}
                onClick={() => { if (!already) void add(process.processName, process.exePath) }}>
                <AppIconImage exePath={process.exePath} size={24} fallback={<Icon name="associations" size={18} />} />
                <span>{exeName(process.processName)}</span>
                <span>{already ? 'Already added' : '+ Add'}</span>
              </button>
            )
          })}
          <button type="button" className={lib.browse} data-hints="A:Browse;B:Home" onClick={() => void browse()}><Icon name="folder" size={20} /><span>Browse for an .exe…</span></button>
        </div>
      </aside>

      {picker && (
        <Sheet open onClose={() => setPicker(null)} eyebrow="Library · Launch with game" title={picker === '__fallback__' ? 'Desktop and other apps loads…' : `${exeName(picker)} loads…`}
          description="The configuration that goes live when it comes to the front." hints={[{ button: 'A', label: 'Choose' }, { button: 'B', label: 'Back' }]} width={520}>
          {picker === '__fallback__' && (
            <button type="button" className={lib.pickRow} role="menuitemradio" aria-checked={!fallback?.profileName} onClick={() => void change('__fallback__', '')}><span>Nothing</span><span>The live one stays</span></button>
          )}
          {libraryProfiles.map(name => {
            const checked = picker === '__fallback__' ? fallback?.profileName === name : rules.find(rule => rule.processName === picker)?.profileName === name
            return (
              <button key={name} type="button" className={lib.pickRow} role="menuitemradio" aria-checked={checked} data-autofocus={checked ? '' : undefined}
                data-hints="A:Choose;B:Back" onClick={() => void change(picker, name)}>
                <span>{name}</span><span>{checked ? 'Now' : ''}</span>
              </button>
            )
          })}
        </Sheet>
      )}
      {moreFor && (
        <MoreSheet open onClose={() => setMoreFor(null)} eyebrow="Library · Launch with game" title={exeName(moreFor.processName)} file={moreFor.exePath}
          items={[
            ...(moreFor.kind === 'profile' ? [{ key: 'loads', icon: 'library' as const, label: 'What it loads', note: moreFor.profileName ?? undefined, run: () => { setMoreFor(null); setPicker(moreFor.processName) } }] : []),
            { key: 'toggle', icon: 'apply', label: moreFor.paused ? 'Turn on' : 'Turn off', note: moreFor.paused ? 'Goes live when it comes to the front' : 'Keeps its art; doesn’t go live', run: () => { setMoreFor(null); void setPaused(moreFor, !moreFor.paused) } },
            { key: 'exe', icon: 'folder', label: 'Change the app', note: 'Browse for its .exe', run: () => void changeExe(moreFor) },
          ]}
          remove={{ label: `Remove ${exeName(moreFor.processName)}`, body: <>{moreFor.profileName ? <><b>{moreFor.profileName}</b> no longer goes live when {exeName(moreFor.processName)} comes to the front. The configuration stays in your library.</> : `${exeName(moreFor.processName)} no longer runs anything when it comes to the front.`}</>, run: () => { const rule = moreFor; setMoreFor(null); void remove(rule) } }} />
      )}
      <Sheet open={addOpen} onClose={() => setAddOpen(false)} eyebrow="Library · Launch with game" title="Add app" description="Pick one that’s running, or browse for an .exe. It loads the configuration with its name, or the live one; A on it changes that."
        hints={[{ button: 'A', label: 'Add' }, { button: 'B', label: 'Back' }]} width={560}>
        {running?.map(process => {
          const already = added(process)
          return (
            <button key={`${process.processName}-${process.pid}`} type="button" className={lib.runRow} aria-disabled={already ? 'true' : undefined} data-reason={already ? 'Already added' : undefined}
              onClick={() => { if (!already) void add(process.processName, process.exePath) }}>
              <AppIconImage exePath={process.exePath} size={24} fallback={<Icon name="associations" size={18} />} />
              <span>{process.name ? `${process.name} · ` : ''}{exeName(process.processName)}</span>
              <span>{already ? 'Already added' : '+ Add'}</span>
            </button>
          )
        })}
        <button type="button" className={lib.browse} onClick={() => void browse()}><Icon name="folder" size={20} /><span>Browse for an .exe…</span></button>
      </Sheet>
    </div>
  )
}

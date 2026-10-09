import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { MapperConsole, copyLog, useMapperLog } from './MapperConsole'
import styles from './MappingDebugPage.module.css'
import settingsStyles from './settings/Settings.module.css'
import { desktopBridge, type InputDebugEvent, type InputDebugHookStatus } from '../platform/desktopBridge'
import { shellBridge } from '../platform/shellBridge'
import { showToast } from '../utils/toast'
import { OpenRow, SubPage } from './ui/console'
import { SettingsColumns, SettingsSection, StatusStrip } from './settings/SettingsKit'
import { usePressCapture } from './settings/usePressCapture'
import { PAD_EVENT, type PadEventDetail } from '../nav/useControllerNavigation'

// Settings ▸ Troubleshooting log (console v2, SettingsTroubleshooting.dc.html):
// the mapper's state and live log, a command line, then "Look closer" (what
// Windows receives; where a button is used) and "Fix it" (copy the log,
// restart the mapper, reconnect controllers). What Windows receives
// (SettingsMappingDebug.dc.html) is a sub-page that captures while it is open.

type MappingDebugPageProps = {
  consoleText?: string
  configText: string
  appliedConfig: string
  hasPendingChanges: boolean
  /** The configuration live now, for "Mapper running · Wardogs". */
  liveName?: string | null
  /** The mapper stopped by itself. */
  mapperStopped?: boolean
}

type ActiveInputMap = Record<string, InputDebugEvent>

const MAX_EVENTS = 100

const fallbackStatus: InputDebugHookStatus = {
  supported: true,
  running: false,
  platform: 'windows',
}

export function MappingDebugPage({ consoleText, configText, appliedConfig, hasPendingChanges, liveName, mapperStopped }: MappingDebugPageProps) {
  const log = useMapperLog(consoleText)
  const [receives, setReceives] = useState(false)
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const findButton = usePressCapture(buttons => {
    // The first button pressed: what it does, everywhere it is used.
    window.dispatchEvent(new CustomEvent('jsm:input-uses', { detail: buttons[0] }))
  })
  const restart = async () => {
    setBusy('restart')
    try { await shellBridge.restartMapper(); showToast(`${liveName ?? 'The configuration'} loads again in a second.`, 'success') }
    catch (error) {
      // Older builds: launching is restarting.
      try { await desktopBridge.launchJSM(); showToast('The mapper is starting.', 'success') } catch { showToast(`Could not restart the mapper: ${error instanceof Error ? error.message : String(error)}`, 'error') }
    } finally { setBusy(null) }
  }
  const reconnect = async () => {
    setBusy('reconnect')
    // Once: RECONNECT_CONTROLLERS drops every controller, so it is never retried here.
    try {
      const result = await desktopBridge.reconnectJsmControllers()
      showToast(result.success ? 'Every controller dropped for a moment and came back.' : 'The mapper did not take it. Try Restart the mapper.', result.success ? 'success' : 'error')
    } catch (error) { showToast(`Could not reconnect: ${error instanceof Error ? error.message : String(error)}`, 'error') }
    finally { setBusy(null) }
  }
  const state = mapperStopped ? 'Mapper stopped' : `Mapper running${liveName ? ` · ${liveName}` : ''}`

  return (
    <>
    <SettingsColumns asideLabel="Look closer and fix it" main={<>
      <StatusStrip items={[
        { label: state, tone: mapperStopped ? 'warn' : 'ok' },
        { label: log.paused ? 'Paused' : 'Live', tone: log.paused ? 'off' : 'ok' },
      ]} />
      <MapperConsole log={log} consoleText={consoleText} onMore={() => setMenu(true)} />
    </>} aside={<>

      <SettingsSection title="Look closer">
        <OpenRow label="What Windows receives" hint="Each key and click JSM sends, live" onOpen={() => setReceives(true)} hints="A:Open;B:Home" />
        <OpenRow label="Where is a button used?" hint={findButton.capturing ? 'Press it now · Esc cancels' : 'Press it to see all it does'} onOpen={findButton.start} hints="A:Press a button;B:Home" />
      </SettingsSection>

      <SettingsSection title="Fix it">
        <OpenRow label="Copy the log" hint="To paste into a bug report" value={`${log.lines.length} lines`} onOpen={() => void copyLog(log.lines)} hints="A:Copy;B:Home" data={{ 'data-fix': 'copy', 'data-autofocus': '' }} />
        <OpenRow label="Restart the mapper" hint={`${liveName ?? 'The live configuration'} loads again in a second`} onOpen={() => void restart()} disabled={busy === 'restart' ? 'Restarting…' : undefined} hints="A:Restart;B:Home" data={{ 'data-fix': 'restart' }} />
        <OpenRow label="Reconnect controllers" hint="Every controller drops for a moment, then comes back" onOpen={() => void reconnect()} disabled={busy === 'reconnect' ? 'Reconnecting…' : undefined} hints="A:Reconnect;B:Home" data={{ 'data-fix': 'reconnect' }} />
      </SettingsSection>
    </>} />
      <WindowsReceives open={receives} onClose={() => setReceives(false)} configText={configText} appliedConfig={appliedConfig} hasPendingChanges={hasPendingChanges} liveName={liveName} />

      <SubPage open={menu} onClose={() => setMenu(false)} crumbRoot="Settings" trail={['Troubleshooting log']} title="Copy, clear…" backLabel="Back">
        <div className={settingsStyles.mainColumn} style={{ maxWidth: 640 }}>
          <OpenRow label="Copy the log" hint="To paste into a bug report" onOpen={() => { setMenu(false); void copyLog(log.lines) }} hints="A:Copy;B:Back" />
          <OpenRow label="Clear the log" hint="Only what this page shows; the mapper keeps running" onOpen={() => { setMenu(false); log.clear() }} hints="A:Clear;B:Back" />
          <OpenRow label="Clear recent commands" onOpen={() => { setMenu(false); void shellBridge.clearRecentConsoleCommands() }} hints="A:Clear;B:Back" />
        </div>
      </SubPage>
    </>
  )
}

/** What Windows receives: every key, click and scroll Windows sees after JSM
 *  maps the controller. Captures while open; leaving stops it. */
function WindowsReceives({ open, onClose, configText, appliedConfig, hasPendingChanges, liveName }: {
  open: boolean; onClose: () => void; configText: string; appliedConfig: string; hasPendingChanges: boolean; liveName?: string | null
}) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<InputDebugHookStatus>(fallbackStatus)
  const [events, setEvents] = useState<InputDebugEvent[]>([])
  const [activeInputs, setActiveInputs] = useState<ActiveInputMap>({})
  const [isBusy, setIsBusy] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [injectedOnly, setInjectedOnly] = useState(true)
  const [since, setSince] = useState<number | null>(null)
  const [menu, setMenu] = useState(false)
  const activeInputsRef = useRef<ActiveInputMap>({})
  const runningRef = useRef(false)
  const localEventIdRef = useRef(-1)
  const lastGlobalKeyboardEventRef = useRef<Record<string, number>>({})
  const hasPendingConfigText = hasPendingChanges || configText !== appliedConfig

  const start = async () => {
    setIsBusy(true)
    try {
      const nextStatus = await desktopBridge.startInputDebugHook()
      runningRef.current = nextStatus.running
      setStatus(nextStatus)
      if (nextStatus.running) setSince(Date.now())
    } catch (error) {
      showToast(`Could not start capturing: ${error instanceof Error ? error.message : String(error)}`, 'error')
    } finally { setIsBusy(false) }
  }
  const stop = async () => {
    setIsBusy(true)
    try {
      const nextStatus = await desktopBridge.stopInputDebugHook()
      runningRef.current = nextStatus.running
      activeInputsRef.current = {}
      setActiveInputs({})
      setStatus(nextStatus)
    } catch (error) {
      showToast(`Could not stop capturing: ${error instanceof Error ? error.message : String(error)}`, 'error')
    } finally { setIsBusy(false) }
  }

  // Captures on entry; leaving stops it.
  useEffect(() => {
    if (!open) return
    let disposed = false
    void desktopBridge.getInputDebugHookStatus().then(nextStatus => {
      if (disposed) return
      runningRef.current = nextStatus.running
      setStatus(nextStatus)
      if (nextStatus.supported && !nextStatus.running) void start()
      else if (nextStatus.running) setSince(Date.now())
    }).catch(error => {
      if (!disposed) setStatus({ supported: false, running: false, platform: 'unknown', message: error instanceof Error ? error.message : String(error) })
    })
    return () => {
      disposed = true
      if (runningRef.current) void desktopBridge.stopInputDebugHook()
      runningRef.current = false
      setEvents([]); activeInputsRef.current = {}; setActiveInputs({})
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    runningRef.current = status.running
    if (!open || !status.running) return undefined
    return desktopBridge.onInputDebugEvent(event => {
      if (event.source === 'keyboard') lastGlobalKeyboardEventRef.current[globalKeyboardDedupKey(event)] = Date.now()
      const shouldLog = applyActiveInputEvent(event, activeInputsRef)
      setActiveInputs(activeInputsRef.current)
      if (!isPaused && shouldLog) setEvents(current => [event, ...current].slice(0, MAX_EVENTS))
    })
  }, [isPaused, status.running, open])

  useEffect(() => {
    if (!open || !status.running) return undefined
    const handleKeyEvent = (event: KeyboardEvent) => {
      // The pad navigates through synthetic key events, and Escape leaves:
      // neither is swallowed, or the page could not be left or driven.
      if (!event.isTrusted || event.key === 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      event.stopPropagation()
      const action = event.type === 'keydown' ? 'down' : 'up'
      const keyCode = event.keyCode || event.which || undefined
      const keyLabel = keyboardEventLabel(event)
      const debugEvent: InputDebugEvent = {
        id: localEventIdRef.current--, timestamp: Date.now(), source: 'keyboard', action, keyCode, keyLabel,
        injected: false, captureSource: 'appWindow', summary: `App window keyboard ${keyLabel} ${action}`,
      }
      const lastGlobalEventAt = lastGlobalKeyboardEventRef.current[globalKeyboardDedupKey(debugEvent)] ?? 0
      if (Date.now() - lastGlobalEventAt < 120) return
      const shouldLog = applyActiveInputEvent(debugEvent, activeInputsRef)
      setActiveInputs(activeInputsRef.current)
      if (!isPaused && shouldLog) setEvents(current => [debugEvent, ...current].slice(0, MAX_EVENTS))
    }
    window.addEventListener('keydown', handleKeyEvent, true)
    window.addEventListener('keyup', handleKeyEvent, true)
    return () => {
      window.removeEventListener('keydown', handleKeyEvent, true)
      window.removeEventListener('keyup', handleKeyEvent, true)
    }
  }, [isPaused, status.running, open])

  // X pauses the log; Y opens Clear, copy…; LB/RB flip From JSM / Everything.
  useEffect(() => {
    if (!open) return
    const onPad = (event: Event) => {
      if (event.defaultPrevented || menu) return
      const button = (event as CustomEvent<PadEventDetail>).detail.button
      if (button === 'X') { event.preventDefault(); setIsPaused(value => !value) }
      if (button === 'Y') { event.preventDefault(); setMenu(true) }
      if (button === 'LB' || button === 'RB') { event.preventDefault(); setInjectedOnly(button === 'LB') }
    }
    document.addEventListener(PAD_EVENT, onPad)
    return () => document.removeEventListener(PAD_EVENT, onPad)
  }, [open, menu])

  const visibleEvents = events.filter(event => isVisibleInCurrentFilter(event, injectedOnly))
  const held = Object.values(activeInputs).filter(event => isVisibleInCurrentFilter(event, injectedOnly))
  const copyEvents = () => {
    const text = visibleEvents.map(event => `${formatEventTime(event.timestamp)} ${describeEvent(event, t)} · ${originOf(event)}`).join('\n')
    void navigator.clipboard.writeText(text).then(() => showToast(`Copied ${visibleEvents.length} events`, 'success')).catch(() => showToast('Could not copy', 'error'))
  }
  const hints = `A:${status.running ? 'Stop capture' : 'Start capture'};X:${isPaused ? 'Resume the log' : 'Pause the log'};Y:Clear, copy…;LB/RB:From JSM / Everything;B:Back`

  return (
    <SubPage open={open} onClose={onClose} crumbRoot="Settings" trail={['Troubleshooting log']} title="What Windows receives"
      badge={status.running ? 'Capturing · leaving stops it' : 'Not capturing'} hints={[{ button: 'LB/RB', label: 'From JSM / Everything' }]}>
      <div className={styles.receives}>
        <div className={styles.receivesMain}>
          <p className={styles.description}>Every key, click and scroll Windows sees after JSM maps your controller. It can’t see a virtual gamepad or JSM’s own actions.</p>
          {!status.supported ? (
            <div className={styles.unsupported}><strong>Windows only</strong><p className={styles.description}>{status.message ?? `Capturing works in the Windows app (here: ${status.platform}).`}</p></div>
          ) : (
            <OpenRow label={status.running ? 'Capturing' : 'Not capturing'} hint={status.running ? `since ${since ? formatEventTime(since).slice(0, 8) : 'now'} · A stops it. X pauses the log; the picture stays live.` : 'A starts it again'}
              value={status.running ? 'Stop capture' : 'Start capture'} onOpen={() => void (status.running ? stop() : start())} disabled={isBusy ? 'Working…' : undefined} hints={hints} data={{ 'data-capture': status.running ? 'on' : 'off' }} />
          )}
          {hasPendingConfigText && <div className={styles.warning}>{liveName ?? 'This configuration'} has changes that aren’t live yet. This shows what the live version sends.</div>}

          <section className={styles.panel} aria-label="Held now">
            <div className={styles.panelHeader}><div className={styles.panelTitle}>Live</div><div className={styles.panelMeta}>● {held.length} held</div></div>
            <div className={styles.heldPicture}>
              {held.length === 0
                ? <span className={styles.empty}>{status.running ? 'Nothing held right now.' : 'Start capture to see what is held.'}</span>
                : held.map(event => event.source === 'mouse'
                  ? <span key={eventIdentity(event)} className={styles.mouseCap} data-button={event.mouseButton}><svg viewBox="0 0 40 56" aria-hidden="true"><rect x="2" y="2" width="36" height="52" rx="18" fill="var(--art-body)" stroke="var(--art-line)" strokeWidth="2" /><path d="M20 2v20M2 22h36" stroke="var(--art-line)" strokeWidth="2" />{event.mouseButton === 'left' && <path d="M4 20V18A16 16 0 0 1 19 4V20Z" fill="var(--accent)" />}{event.mouseButton === 'right' && <path d="M36 20V18A16 16 0 0 0 21 4V20Z" fill="var(--accent)" />}{event.mouseButton === 'middle' && <rect x="17" y="8" width="6" height="12" rx="3" fill="var(--accent)" />}</svg><small>{describeOutput(event, t)}</small></span>
                  : <kbd key={eventIdentity(event)} className={styles.keyCap}>{event.keyLabel ?? '?'}</kbd>)}
            </div>
          </section>
        </div>
        <section className={styles.panel} aria-label="Event log">
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>Event log</div>
            <div className={styles.panelMeta}>{visibleEvents.length} of the last {MAX_EVENTS}{isPaused ? ' · paused' : ''}</div>
          </div>
          <div className="segmented" role="radiogroup" aria-label="Show events from">
            <button type="button" role="radio" aria-checked={injectedOnly} tabIndex={-1} onClick={() => setInjectedOnly(true)}>From JSM</button>
            <button type="button" role="radio" aria-checked={!injectedOnly} tabIndex={-1} onClick={() => setInjectedOnly(false)}>Everything</button>
          </div>
          <div className={styles.eventList} tabIndex={0} role="log" data-hints={hints}>
            {visibleEvents.length === 0
              ? <div className={styles.empty}>{status.running ? 'Nothing yet. Press something on the controller.' : 'Start capture to see events.'}</div>
              : visibleEvents.map(event => (
                <div key={event.id} className={styles.eventRow} data-injected={event.injected ? 'true' : undefined}>
                  <time className={styles.eventTime}>{formatEventTime(event.timestamp)}</time>
                  <span className={styles.eventTitle}>{describeEvent(event, t)}</span>
                  <span className={styles.eventOrigin}>{originOf(event)}</span>
                </div>
              ))}
          </div>
          <p className={styles.description}>Newest at the top. “Everything” adds your real keyboard and mouse.</p>
        </section>
      </div>
      <SubPage open={menu} onClose={() => setMenu(false)} crumbRoot="Settings" trail={['Troubleshooting log', 'What Windows receives']} title="Clear, copy…" backLabel="Back">
        <div className={settingsStyles.mainColumn} style={{ maxWidth: 640 }}>
          <OpenRow label="Clear the events" onOpen={() => { setMenu(false); setEvents([]) }} hints="A:Clear;B:Back" />
          <OpenRow label="Copy the events" hint="As text, newest first" onOpen={() => { setMenu(false); copyEvents() }} hints="A:Copy;B:Back" />
        </div>
      </SubPage>
    </SubPage>
  )
}

const originOf = (event: InputDebugEvent) => event.captureSource === 'appWindow' ? 'App window' : event.injected ? `From JSM${event.lowerIntegrityInjected ? ' · lower rights' : ''}` : 'Your keyboard and mouse'

function describeEvent(event: InputDebugEvent, t: (key: string, options?: Record<string, unknown>) => string) {
  if (event.source === 'wheel') return `Wheel ${formatSignedNumber(event.wheelDelta ?? 0)} · scroll`
  const action = event.action === 'down' ? 'down' : event.action === 'up' ? 'up' : 'scroll'
  return event.source === 'keyboard' ? `Keyboard ${describeOutput(event, t)} ${action}` : `${describeOutput(event, t)} ${action}`
}


function applyActiveInputEvent(event: InputDebugEvent, activeInputsRef: MutableRefObject<ActiveInputMap>) {
  const key = eventIdentity(event)
  const current = activeInputsRef.current
  const wasActive = Boolean(current[key])

  if (event.action === 'down') {
    activeInputsRef.current = { ...current, [key]: event }
    return !wasActive
  }

  if (event.action === 'up') {
    const next = { ...current }
    delete next[key]
    activeInputsRef.current = next
    return wasActive
  }

  return true
}

function eventIdentity(event: InputDebugEvent) {
  if (event.source === 'keyboard') return `keyboard:${event.keyCode ?? event.scanCode ?? event.keyLabel ?? 'unknown'}`
  if (event.source === 'mouse') return `mouse:${event.mouseButton ?? 'unknown'}`
  return `wheel:${event.id}`
}

function isVisibleInCurrentFilter(event: InputDebugEvent, injectedOnly: boolean) {
  return !injectedOnly || event.injected || event.captureSource === 'appWindow'
}

function globalKeyboardDedupKey(event: InputDebugEvent) {
  return `${event.action}:${event.keyCode ?? event.scanCode ?? event.keyLabel ?? 'unknown'}`
}

function keyboardEventLabel(event: KeyboardEvent) {
  if (event.key && event.key.length === 1) return event.key.toUpperCase()
  if (event.key && event.key !== 'Unidentified') return event.key
  if (event.code) return event.code.replace(/^Key/, '').replace(/^Digit/, '')
  return `VK ${event.keyCode || event.which || '?'}`
}

function describeOutput(event: InputDebugEvent, t: (key: string, options?: Record<string, unknown>) => string) {
  if (event.source === 'keyboard') {
    return event.keyLabel ?? t('mappingDebug.unknownKey', { code: event.keyCode ?? '?' })
  }

  if (event.source === 'mouse') {
    const key = `mappingDebug.mouseButton.${event.mouseButton ?? 'unknown'}`
    return t(key)
  }

  return t('mappingDebug.wheelDelta', { delta: formatSignedNumber(event.wheelDelta ?? 0) })
}

function formatSignedNumber(value: number) {
  return value > 0 ? `+${value}` : String(value)
}

function formatEventTime(timestamp: number) {
  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${ms}`
}

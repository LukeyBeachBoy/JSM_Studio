import { useCallback, useEffect, useRef, useState } from 'react'
import { desktopBridge } from '../platform/desktopBridge'
import { shellBridge, appVersion } from '../platform/shellBridge'
import { PAD_EVENT, type PadEventDetail } from '../nav/useControllerNavigation'
import { requestValueEntry } from '../nav/textEntry'
import { showToast } from '../utils/toast'
import styles from './MapperConsole.module.css'

// The Troubleshooting log (console v2, SettingsTroubleshooting.dc.html): the
// mapper's live log, each line stamped when the app first saw it, newest at
// the bottom; a command line the on-screen keyboard types into; the recent
// commands, one press each. X pauses the log, Y copies or clears it.

export type LogLine = { at: number; text: string; kind?: 'command' | 'output' }

const MAX_LINES = 600
export const stamp = (ms: number) => {
  const time = new Date(ms)
  const pad = (value: number, size = 2) => String(value).padStart(size, '0')
  return `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}.${pad(time.getMilliseconds(), 3)}`
}
const tone = (text: string) =>
  /error|unrecognized|cancelled|failed|could not|not a valid/i.test(text) ? 'bad' : /warning|kept as written|deprecated/i.test(text) ? 'warn' : undefined

// Lines in `next` that `previous` did not already end with. The mapper sends a
// rolling tail, so the overlap is found by the longest run of previous's last
// lines that starts next.
export function newConsoleLines(previous: string[], next: string[]) {
  for (let overlap = Math.min(previous.length, next.length); overlap > 0; overlap--) {
    let matches = true
    for (let index = 0; index < overlap; index++) {
      if (previous[previous.length - overlap + index] !== next[index]) { matches = false; break }
    }
    if (matches) return next.slice(overlap)
  }
  return next
}

/** The log as text for a bug report: the version, then every line, stamped. */
export const logText = (lines: LogLine[]) => [
  `JSM Evolved ${appVersion} · troubleshooting log · copied ${new Date().toLocaleString()}`,
  ...lines.map(line => `${stamp(line.at)} ${line.kind === 'command' ? '› ' : ''}${line.text.replace(/^> /, '')}`),
].join('\n')

/** Copy the log: to the clipboard, with a toast saying so. */
export async function copyLog(lines: LogLine[]) {
  const text = logText(lines)
  try {
    await navigator.clipboard.writeText(text)
    showToast(`Copied ${lines.length} ${lines.length === 1 ? 'line' : 'lines'} · paste it into a bug report`, 'success')
    return true
  } catch {
    // An older WebView without the clipboard API: the selection route.
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'; area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    showToast(ok ? 'Copied the log' : 'Could not copy the log', ok ? 'success' : 'error')
    return ok
  }
}

/** The log's lines, kept while the page is open: paused, cleared, appended. */
export function useMapperLog(consoleText?: string) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [paused, setPaused] = useState(false)
  const seen = useRef<string[]>([])
  useEffect(() => {
    const next = (consoleText ?? '').split(/\r?\n/).filter(line => line.trim())
    const added = newConsoleLines(seen.current, next)
    seen.current = next
    if (!added.length || paused) return
    const now = Date.now()
    setLines(current => [...current, ...added.map(text => ({ at: now, text }))].slice(-MAX_LINES))
  }, [consoleText, paused])
  const add = useCallback((added: LogLine[]) => setLines(current => [...current, ...added].slice(-MAX_LINES)), [])
  return { lines, paused, setPaused, clear: () => setLines([]), add }
}

type MapperConsoleProps = {
  consoleText?: string
  /** The shared log (Troubleshooting); the console keeps its own when absent. */
  log?: ReturnType<typeof useMapperLog>
  /** Y: the page's "Copy, clear…" menu. */
  onMore?: () => void
}

export function MapperConsole({ consoleText, log: shared, onMore }: MapperConsoleProps) {
  const own = useMapperLog(shared ? undefined : consoleText)
  const log = shared ?? own
  const [command, setCommand] = useState('')
  const [sending, setSending] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const viewport = useRef<HTMLDivElement | null>(null)
  const follow = useRef(true)
  const input = useRef<HTMLInputElement | null>(null)
  const host = useRef<HTMLElement | null>(null)

  useEffect(() => { void shellBridge.listRecentConsoleCommands().then(setRecent).catch(() => {}) }, [])
  useEffect(() => {
    const element = viewport.current
    if (element && follow.current) element.scrollTop = element.scrollHeight
  }, [log.lines])

  const send = async (raw?: string) => {
    const text = (raw ?? command).trim()
    if (!text) return
    setSending(true)
    log.add([{ at: Date.now(), text, kind: 'command' }])
    void shellBridge.recordConsoleCommand(text).then(setRecent).catch(() => {})
    try {
      const result = await desktopBridge.runCalibrationCommand(text)
      const output = (result.output ?? '').split(/\r?\n/).map(line => line.trimEnd()).filter(Boolean)
      const now = Date.now()
      log.add((output.length ? output : [result.success ? '(done)' : 'The mapper did not take the command. Is it running?']).map(line => ({ at: now, text: line, kind: 'output' as const })))
      setCommand('')
    } catch (error) {
      log.add([{ at: Date.now(), text: `Could not send it: ${error instanceof Error ? error.message : String(error)}`, kind: 'output' }])
    } finally {
      setSending(false)
    }
  }
  const type = () => requestValueEntry({
    title: 'Type a command', eyebrow: 'Troubleshooting log', value: command, suggestions: recent.slice(0, 4),
    hint: 'Enter sends it to the mapper, e.g. LIST_CONTROLLERS or GYRO_SENS = 2.3',
    onDone: value => { setCommand(value); void send(value) },
  })

  // X pauses the log and Y opens Copy, clear… from anywhere in the console.
  useEffect(() => {
    const element = host.current
    if (!element) return
    const onPad = (event: Event) => {
      if (event.defaultPrevented) return
      const button = (event as CustomEvent<PadEventDetail>).detail.button
      if (button === 'X') { event.preventDefault(); log.setPaused(value => !value) }
      if (button === 'Y' && onMore) { event.preventDefault(); onMore() }
    }
    element.addEventListener(PAD_EVENT, onPad)
    return () => element.removeEventListener(PAD_EVENT, onPad)
  }, [log, onMore])

  const hints = (a: string) => `${a};X:${log.paused ? 'Resume the log' : 'Pause the log'};${onMore ? 'Y:Copy, clear…;' : ''}B:Home`
  return (
    <section ref={host} className={styles.console} aria-label="JoyShockMapper log">
      <div className={styles.toolbar}>
        <span className={styles.meta} data-paused={log.paused ? 'true' : undefined}>{log.paused ? 'Paused · new lines wait' : 'Live'}</span>
        <span className={styles.meta}>Newest at the bottom · last {MAX_LINES} lines</span>
        <span className={styles.toolbarSpacer} />
        <button type="button" className="button button--ghost button--sm" tabIndex={-1} onClick={() => log.setPaused(value => !value)}>X {log.paused ? 'Resume' : 'Pause'}</button>
      </div>
      <div ref={viewport} className={styles.log} tabIndex={0} role="log" aria-live="polite" aria-label="JoyShockMapper live log" data-hints={hints('MOVE:Scroll')}
        onScroll={event => { const element = event.currentTarget; follow.current = element.scrollTop + element.clientHeight >= element.scrollHeight - 8 }}>
        {log.lines.length === 0
          ? <span className={styles.waiting}>{consoleText ? 'Nothing new since this page opened.' : 'Waiting for the mapper’s log…'}</span>
          : log.lines.map((line, index) => (
            <div key={index} className={styles.line} data-tone={line.kind === 'command' ? 'command' : tone(line.text)}>
              <span className={styles.time}>{stamp(line.at)}</span>
              <span className={styles.text}>{line.kind === 'command' ? `› ${line.text.replace(/^> /, '')}` : line.text}</span>
            </div>
          ))}
      </div>
      <form className={styles.commandLine} onSubmit={event => { event.preventDefault(); void send() }}>
        <span className={styles.prompt} aria-hidden="true">›</span>
        <input ref={input} aria-label="Command to send to JoyShockMapper" placeholder="Type a command" value={command} data-hints="A:Keyboard;B:Leave field"
          onChange={event => setCommand(event.target.value)} spellCheck={false} />
        <button type="button" className="button button--secondary button--sm" data-hints={hints('A:Keyboard')} onClick={type} data-caption="Keyboard · A opens the on-screen keyboard; Enter sends. Or pick a recent one">Keyboard</button>
        <button type="submit" className="button button--ghost button--sm" tabIndex={-1} disabled={sending || !command.trim()}>{sending ? 'Sending…' : 'Send'}</button>
      </form>
      <p className={styles.help}>A opens the on-screen keyboard; Enter sends. Or pick a recent one.</p>
      {recent.length > 0 && (
        <div className={styles.recent} role="group" aria-label="Recent commands">
          <span className={styles.recentTitle}>Recent</span>
          {recent.map(item => (
            <button key={item} type="button" className={styles.recentItem} data-hints={hints('A:Send it')} onClick={() => void send(item)}>{item}</button>
          ))}
        </div>
      )}
    </section>
  )
}

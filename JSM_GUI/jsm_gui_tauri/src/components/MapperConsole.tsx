import { useEffect, useRef, useState } from 'react'
import { desktopBridge } from '../platform/desktopBridge'
import styles from './MapperConsole.module.css'

type Line = { at: number; text: string; kind?: 'command' | 'output' }

const MAX_LINES = 600
const stamp = (ms: number) => {
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

// Debug console (Tuning and Studio Pages 16i): the mapper's live log, each
// line stamped when Studio first saw it, and a line to send it commands.
export function MapperConsole({ consoleText }: { consoleText?: string }) {
  const [lines, setLines] = useState<Line[]>([])
  const [paused, setPaused] = useState(false)
  const [command, setCommand] = useState('')
  const [sending, setSending] = useState(false)
  const seen = useRef<string[]>([])
  const viewport = useRef<HTMLDivElement | null>(null)
  const follow = useRef(true)

  useEffect(() => {
    const next = (consoleText ?? '').split(/\r?\n/).filter(line => line.trim())
    const added = newConsoleLines(seen.current, next)
    seen.current = next
    if (!added.length || paused) return
    const now = Date.now()
    setLines(current => [...current, ...added.map(text => ({ at: now, text }))].slice(-MAX_LINES))
  }, [consoleText, paused])

  useEffect(() => {
    const element = viewport.current
    if (element && follow.current) element.scrollTop = element.scrollHeight
  }, [lines])

  const send = async () => {
    const text = command.trim()
    if (!text) return
    setSending(true)
    setLines(current => [...current, { at: Date.now(), text: `> ${text}`, kind: 'command' as const }].slice(-MAX_LINES))
    try {
      const result = await desktopBridge.runCalibrationCommand(text)
      const output = result.output.split(/\r?\n/).map(line => line.trimEnd()).filter(Boolean)
      const now = Date.now()
      setLines(current => [...current, ...(output.length ? output : [result.success ? '(done)' : 'The mapper did not take the command. Is it running?'])
        .map(line => ({ at: now, text: line, kind: 'output' as const }))].slice(-MAX_LINES))
      setCommand('')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className={styles.console} aria-label="JoyShockMapper console">
      <div className={styles.toolbar}>
        <span className={styles.meta}>{paused ? 'Paused · new lines are not shown' : 'Live'}</span>
        <button type="button" className="button button--secondary button--sm" onClick={() => setPaused(value => !value)}>{paused ? 'Resume' : 'Pause'}</button>
        <button type="button" className="button button--tertiary button--sm" onClick={() => setLines([])} disabled={!lines.length}>Clear</button>
      </div>
      <div ref={viewport} className={styles.log} tabIndex={0} role="log" aria-live="polite" aria-label="JoyShockMapper live console"
        onScroll={event => { const element = event.currentTarget; follow.current = element.scrollTop + element.clientHeight >= element.scrollHeight - 8 }}>
        {lines.length === 0
          ? <span className={styles.waiting}>{consoleText ? 'Nothing new since this page opened.' : 'Waiting for console output from JoyShockMapper…'}</span>
          : lines.map((line, index) => (
            <div key={index} className={styles.line} data-tone={line.kind === 'command' ? 'command' : tone(line.text)}>
              <span className={styles.time}>{stamp(line.at)}</span>
              <span className={styles.text}>{line.text}</span>
            </div>
          ))}
      </div>
      <form className={styles.commandLine} onSubmit={event => { event.preventDefault(); void send() }}>
        <span className={styles.prompt} aria-hidden="true">›</span>
        <input aria-label="Command to send to JoyShockMapper" placeholder="A command, e.g. RESET_MAPPINGS or LIST_CONTROLLERS" value={command}
          onChange={event => setCommand(event.target.value)} spellCheck={false} />
        <button type="submit" className="button button--secondary button--sm" disabled={sending || !command.trim()}>{sending ? 'Sending…' : 'Send'}</button>
      </form>
    </section>
  )
}

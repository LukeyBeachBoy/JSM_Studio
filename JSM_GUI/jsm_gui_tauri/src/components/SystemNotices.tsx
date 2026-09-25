import type { MapperExit } from '../platform/desktopBridge'
import { Icon } from './icons/Icon'
import styles from './SystemNotices.module.css'

export type ConfigError = { profile: string; file: string; line: number; text: string; reason: string }

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const fileName = (path: string) => path.split(/[\\/]/).pop()?.replace(/\.txt$/i, '') ?? path

type MapperDownProps = {
  exit: MapperExit
  restarting?: boolean
  onRestart: () => void
  onOpenConsole: () => void
  /** A slim banner on Studio's own pages, which still work without the mapper. */
  compact?: boolean
}

// The mapper isn't running (System States 17c): what happened, what still
// works, and the one next step. The facts under it are the exit code, when,
// and the last thing the mapper printed.
export function MapperDown({ exit, restarting, onRestart, onOpenConsole, compact }: MapperDownProps) {
  const facts = [`exit code ${exit.exitCode}`, clock(exit.stoppedAtMs), exit.lastLine ? `last line: “${exit.lastLine}”` : null].filter(Boolean).join(' · ')
  if (compact) return (
    <div className={styles.banner} role="alert">
      <span className={styles.bannerDot} aria-hidden="true" />
      <span className={styles.bannerText}><b>The mapper isn’t running.</b> <span className={styles.facts}>{facts}</span></span>
      <button type="button" className="button button--primary button--sm" disabled={restarting} onClick={onRestart}>{restarting ? 'Restarting…' : 'Restart mapper'}</button>
    </div>
  )
  return (
    <div className={styles.panel} role="alert">
      <span className={styles.mark} aria-hidden="true"><Icon name="error" size={24} /></span>
      <h2 className={styles.title}>The mapper isn’t running</h2>
      <p className={styles.body}>
        JoyShockMapper stopped unexpectedly. Your controller is behaving as a plain controller until it restarts. Nothing in your configuration was lost.
      </p>
      <div className={styles.actions}>
        <button type="button" className="button button--primary" disabled={restarting} onClick={onRestart}>{restarting ? 'Restarting…' : 'Restart mapper'}</button>
        <button type="button" className="button button--secondary" onClick={onOpenConsole}>Open debug console</button>
      </div>
      <p className={styles.facts}>{facts}</p>
    </div>
  )
}

type ConfigErrorsProps = {
  errors: ConfigError[]
  /** The applied text, to show the lines around the first error when it is in the profile itself. */
  appliedText?: string | null
  onOpenSource: (error: ConfigError) => void
  onDismiss: () => void
}

// Couldn't load a line (System States 17e): which line, why, the lines around
// it, and a way straight to it. JoyShockMapper skips a line it cannot use and
// applies the rest, so this says exactly that rather than "nothing applied".
export function ConfigErrors({ errors, appliedText, onOpenSource, onDismiss }: ConfigErrorsProps) {
  const first = errors[0]
  if (!first) return null
  const inProfile = first.file === first.profile
  const lines = inProfile && appliedText ? appliedText.split(/\r?\n/) : null
  const from = Math.max(1, first.line - 2)
  const context = lines ? lines.slice(from - 1, Math.min(lines.length, first.line + 2)) : null
  const where = inProfile ? `on line ${first.line}` : `in ${fileName(first.file)}, line ${first.line}`
  return (
    <section className={styles.errorCard} role="alert" aria-label="Configuration errors">
      <div className={styles.errorText}>
        <span className={styles.eyebrow}>Couldn’t load {errors.length > 1 ? `${errors.length} lines` : 'a line'}</span>
        <h2 className={styles.errorTitle}>{fileName(first.profile)} has an error {where}</h2>
        <p className={styles.body}>
          JoyShockMapper skipped {errors.length > 1 ? 'these lines' : 'this line'} and applied the rest. Fix it in the source editor, or open the file as raw text; nothing else in the configuration was touched.
        </p>
        {errors.length > 1 && (
          <ul className={styles.errorList}>
            {errors.slice(1, 4).map(error => <li key={`${error.file}:${error.line}`}>{error.file === error.profile ? `Line ${error.line}` : `${fileName(error.file)} line ${error.line}`} · <code>{error.text}</code> · {error.reason}</li>)}
            {errors.length > 4 && <li>and {errors.length - 4} more</li>}
          </ul>
        )}
        <div className={styles.actions}>
          <button type="button" className="button button--primary" onClick={() => onOpenSource(first)}>Open source editor at line {first.line}</button>
          <button type="button" className="button button--secondary" onClick={onDismiss}>Dismiss</button>
        </div>
      </div>
      <pre className={styles.code} aria-label={`Line ${first.line} and the lines around it`}>
        {context
          ? context.map((text, index) => {
              const number = from + index
              const bad = number === first.line
              return <span key={number} className={bad ? styles.codeBad : undefined}><span className={styles.codeNumber}>{number}</span>{text}{bad && <span className={styles.codeReason}> ← {first.reason}</span>}{'\n'}</span>
            })
          : <span className={styles.codeBad}><span className={styles.codeNumber}>{first.line}</span>{first.text}<span className={styles.codeReason}> ← {first.reason}</span></span>}
      </pre>
    </section>
  )
}

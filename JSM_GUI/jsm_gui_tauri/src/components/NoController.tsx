import { relativeTime, useClock, useLastSeenController } from '../hooks/useLastSeenController'
import styles from './NoController.module.css'

const OUTLINE = 'M52 8 C36 8 30 14 26 30 L6 112 C2 132 14 146 30 142 C40 139 44 130 50 118 L56 108 H144 L150 118 C156 130 160 139 170 142 C186 146 198 132 194 112 L174 30 C170 14 164 8 148 8 Z'

type NoControllerProps = {
  configName?: string | null
  /** Where "Keep editing" sends focus: the page's first control. */
  onKeepEditing?: () => void
  /** A controller just appeared (System States 17b): its name, for the
      second or so before its live art replaces this. */
  connecting?: { name: string; detail?: string; output?: string }
}

// No controller connected (System States 17a): replaces the live art until a
// pad appears. Says what happened, that the configuration stays editable, and
// the one next step. The dashed outline breathes while Studio is searching.
export function NoController({ configName, onKeepEditing, connecting }: NoControllerProps) {
  const seen = useLastSeenController()
  const now = useClock()
  if (connecting) {
    // The progress line fills and the outline turns accent; the page's own
    // art cross-fades in after.
    return (
      <div className={`${styles.panel} ${styles.connecting}`} role="status">
        <svg className={styles.art} viewBox="0 0 200 150" aria-hidden="true">
          <path className={styles.outline} d={OUTLINE} />
        </svg>
        <span className={styles.progress} aria-hidden="true"><span /></span>
        <h2 className={styles.title}>Connecting to {connecting.name}</h2>
        <p className={styles.body}>
          Reading the controller{connecting.output ? ` and starting the ${connecting.output} output` : configName ? ` and loading ${configName}` : ''}.
        </p>
        {connecting.detail && <span className={styles.detail}>{connecting.detail}</span>}
      </div>
    )
  }
  const who = seen.name ?? 'your controller'
  return (
    <div className={styles.panel} role="status">
      <svg className={styles.art} viewBox="0 0 200 150" aria-hidden="true">
        <path className={styles.outline} d={OUTLINE} />
        <circle className={styles.ring} cx="100" cy="68" r="16" />
        <circle className={styles.dot} cx="100" cy="68" r="8" />
      </svg>
      <h2 className={styles.title}>No controller connected</h2>
      <p className={styles.body}>
        Connect {seen.name ? `the ${who}` : who} with its cable or dongle, or turn it on. Studio is searching and will pick it up the moment it appears. Your configurations stay editable with mouse and keyboard.
      </p>
      <div className={styles.actions}>
        {onKeepEditing && <button type="button" className="button button--secondary" onClick={onKeepEditing}>{configName ? `Keep editing ${configName}` : 'Keep editing'}</button>}
        <button type="button" className="button button--tertiary" onClick={() => window.dispatchEvent(new CustomEvent('jsm:open-docs', { detail: { setting: 'connecting' } }))}>Troubleshoot</button>
      </div>
      <span className={styles.searching}>Searching every 2 s · {seen.at ? `last seen ${relativeTime(seen.at, now)}` : 'not seen yet this session'}</span>
    </div>
  )
}

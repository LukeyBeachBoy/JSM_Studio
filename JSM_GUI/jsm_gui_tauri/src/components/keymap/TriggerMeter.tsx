import styles from './TriggerMeter.module.css'

type TriggerMeterProps = {
  /** Trigger travel from telemetry, 0 (released) to 1 (fully pulled). */
  pull: number
  /** The soft press point (TRIGGER_THRESHOLD); 0 means JSM's default. */
  threshold: number
}

// The live trigger (Configuration Pages 15a): the pull as a bar, with the soft
// press point (accent) and full pull (white) marked on the same scale, so you
// can see where a squeeze lands before binding anything to it.
export function TriggerMeter({ pull, threshold }: TriggerMeterProps) {
  const travel = Math.max(0, Math.min(1, pull))
  const soft = threshold > 0 ? Math.min(1, threshold) : 0
  const state = travel >= 0.995 ? 'full' : soft > 0 && travel >= soft ? 'soft' : 'rest'
  return (
    <div className={styles.meter} data-state={state} aria-label={`Live trigger ${Math.round(travel * 100)}%`} role="meter"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(travel * 100)}>
      <div className={styles.head}>
        <span>Live</span>
        <span className={styles.value}>{Math.round(travel * 100)}%</span>
      </div>
      <div className={styles.track}>
        <span className={styles.fill} style={{ transform: `scaleX(${travel})` }} />
        {soft > 0 && <span className={styles.soft} style={{ left: `${soft * 100}%` }} />}
        <span className={styles.full} />
      </div>
      <div className={styles.scale}>
        {soft > 0 && <span style={{ left: `${soft * 100}%` }}>soft {soft.toFixed(2)}</span>}
        <span className={styles.fullLabel}>full pull</span>
      </div>
    </div>
  )
}

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
// The readout is the raw count on the trigger's 15-bit axis, the way the
// design shows it ("19004 / 32767"): the number the soft point is set against.
const RAW_MAX = 32767

export function TriggerMeter({ pull, threshold }: TriggerMeterProps) {
  const travel = Math.max(0, Math.min(1, pull))
  const soft = threshold > 0 ? Math.min(1, threshold) : 0
  const state = travel >= 0.995 ? 'full' : soft > 0 && travel >= soft ? 'soft' : 'rest'
  const raw = Math.round(travel * RAW_MAX)
  return (
    <div className={styles.meter} data-state={state} aria-label={`Live trigger ${raw} of ${RAW_MAX}`} role="meter"
      aria-valuemin={0} aria-valuemax={RAW_MAX} aria-valuenow={raw}>
      <div className={styles.head}>
        <span>Live</span>
        <span className={styles.value}>{raw} / {RAW_MAX}</span>
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

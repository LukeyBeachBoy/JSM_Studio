import { useEffect, useRef } from 'react'
import styles from './StickPlot.module.css'

type StickPlotProps = {
  /** Stick position from telemetry, -1..1 on each axis, up positive. */
  x: number
  y: number
  /** Deadzones as fractions of full travel. */
  inner: number
  outer: number
  label: string
}

const R = 72

// The live stick (Configuration Pages 15b): the gate, the inner deadzone as a
// dashed ring, the outer deadzone as the solid ring inside the gate, the stick
// as a dot with a short fading trail, and the raw position underneath.
export function StickPlot({ x, y, inner, outer, label }: StickPlotProps) {
  const cx = 80 + Math.max(-1, Math.min(1, x)) * R
  const cy = 80 - Math.max(-1, Math.min(1, y)) * R
  const trail = useRef<{ x: number; y: number }[]>([])
  useEffect(() => {
    trail.current = [{ x: cx, y: cy }, ...trail.current].slice(0, 4)
  })
  const magnitude = Math.hypot(x, y)
  const inDeadzone = magnitude < inner
  return (
    <figure className={styles.plot}>
      <svg viewBox="0 0 160 160" role="img" aria-label={`${label} live position`}>
        <circle className={styles.gate} cx="80" cy="80" r={R} />
        <line className={styles.axis} x1="80" y1={80 - R} x2="80" y2={80 + R} />
        <line className={styles.axis} x1={80 - R} y1="80" x2={80 + R} y2="80" />
        {outer > 0 && outer < 1 && <circle className={styles.outer} cx="80" cy="80" r={R * (1 - outer)} />}
        {inner > 0 && <circle className={styles.inner} cx="80" cy="80" r={Math.max(2, R * inner)} />}
        {trail.current.slice(1).map((dot, index) => (
          <circle key={index} className={styles.trail} cx={dot.x} cy={dot.y} r={5 - index} opacity={0.5 - index * 0.14} />
        ))}
        <circle className={inDeadzone ? styles.dotIdle : styles.dot} cx={cx} cy={cy} r="7" />
      </svg>
      <figcaption className={styles.readout}>x {x.toFixed(2)} · y {y.toFixed(2)}</figcaption>
    </figure>
  )
}

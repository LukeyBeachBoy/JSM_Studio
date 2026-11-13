import { calibrationOutline, type StickGeometry, type StickPoint } from '../../utils/stickGeometry'
import styles from './StickGeometryPreview.module.css'

export function StickGeometryPreview({ raw, adjusted, geometry, inner, outer }: { raw: StickPoint | null; adjusted: StickPoint | null; geometry: StickGeometry; inner: number; outer: number }) {
  const radius = 72, cx = 100, cy = 100
  const point = (p: StickPoint | null) => ({ x: cx + Math.max(-1, Math.min(1, p?.x ?? 0)) * radius, y: cy - Math.max(-1, Math.min(1, p?.y ?? 0)) * radius })
  const physical = point(raw), mapped = point(adjusted)
  const outline = calibrationOutline(geometry)
  const magnitude = adjusted ? Math.min(1, Math.hypot(adjusted.x, adjusted.y)) : 0
  const heading = adjusted && magnitude > .05 ? ((Math.atan2(adjusted.x, adjusted.y) * 180 / Math.PI + 360) % 360).toFixed(1) : null
  return <figure className={styles.preview} data-stick-vectors="">
    <svg viewBox="0 0 200 200" role="img" aria-label="Physical and adjusted stick vectors">
      <circle className={styles.gate} cx={cx} cy={cy} r={radius} />
      {outline.length > 0 && <g data-calibration-outline="">
        <polygon points={outline.map(p => `${cx + p.x * radius},${cy - p.y * radius}`).join(' ')} fill="var(--accent)" fillOpacity=".12" stroke="var(--accent)" strokeWidth="1.5" />
        {outline.filter((_, i) => i % 17 === 0).map((p, i) => <g key={i}>
          <line x1={cx} y1={cy} x2={cx + p.x * radius} y2={cy - p.y * radius} stroke="var(--accent)" strokeOpacity=".5" strokeDasharray="2 3" />
          <circle cx={cx + p.x * radius} cy={cy - p.y * radius} r="3" fill="var(--accent)" />
          <text x={cx + p.x * radius * .8} y={cy - p.y * radius * .8 + 3} textAnchor="middle" fill="var(--accent)" fontSize="10">{['F', 'R', 'B', 'L'][i]}</text>
        </g>)}
      </g>}
      <path className={styles.axis} d="M100 28V172 M28 100H172" />
      <circle className={styles.deadzone} cx={cx} cy={cy} r={radius * Math.max(0, Math.min(1, inner))} />
      <circle className={styles.edge} cx={cx} cy={cy} r={radius * Math.max(0, Math.min(1, 1 - outer))} />
      {geometry.restrictor && <circle className={styles.ring} cx={cx} cy={cy} r={radius * geometry.range} />}
      <g className={styles.labels}><text x="100" y="17">N</text><text x="185" y="104">E</text><text x="100" y="192">S</text><text x="15" y="104">W</text></g>
      <line className={styles.raw} x1={cx} y1={cy} x2={physical.x} y2={physical.y} />
      <circle className={styles.rawDot} cx={physical.x} cy={physical.y} r="4" />
      <line className={styles.adjusted} x1={cx} y1={cy} x2={mapped.x} y2={mapped.y} data-adjusted-vector="" />
      <circle className={styles.adjustedDot} cx={mapped.x} cy={mapped.y} r="5" />
    </svg>
    <figcaption>
      <div className={styles.legend}><span data-vector="raw">Physical</span><span data-vector="adjusted">Adjusted</span></div>
      <strong>{raw ? `${Math.round(magnitude * 100)}%${heading === null ? ' · resting' : ` · ${heading}°`}` : 'Connect to see live input'}</strong>
      <small>Before deadzones and stick mode</small>
    </figcaption>
  </figure>
}

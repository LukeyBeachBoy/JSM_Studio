import { niceCeil } from '../../utils/niceNumbers'
import type { SmoothingFrame } from '../../utils/gyroSteadiness'
import styles from './SmoothingComparison.module.css'

const format = (value: number) => String(Number(value.toFixed(2)))
const pathOf = (points: [number, number][]) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('')

/** Separate, time-aligned plots keep the input visible even when output is
 * identical. Signed components also expose direction changes a speed-magnitude
 * plot would hide. Both plots share one zero-centred scale and time window. */
export function SmoothingComparison({ frames, live, active, paused, onPause }: { frames: SmoothingFrame[]; live: boolean; active: boolean; paused: boolean; onPause?: () => void }) {
  const latest = frames[frames.length - 1]
  const end = latest?.at ?? 0
  const maximum = niceCeil(Math.max(1, ...frames.flatMap(frame => [Math.abs(frame.x), Math.abs(frame.y), Math.abs(frame.filteredX), Math.abs(frame.filteredY)])))
  const same = frames.every(frame => Math.abs(frame.x - frame.filteredX) < 1e-6 && Math.abs(frame.y - frame.filteredY) < 1e-6)
  const width = 420, height = 150, left = 44, right = 10, top = 12, bottom = 25
  const x = (at: number) => left + Math.max(0, Math.min(1, (at - end + 2000) / 2000)) * (width - left - right)
  const y = (value: number) => top + (1 - value / maximum) / 2 * (height - top - bottom)
  const panels = [
    { id: 'before', label: 'Before smoothing', horizontal: 'x', vertical: 'y' },
    { id: 'after', label: 'After smoothing', horizontal: 'filteredX', vertical: 'filteredY' },
  ] as const
  return <figure className={styles.comparison} data-smoothing-comparison={live ? 'live' : 'simulation'} data-identical={same}>
    <figcaption className={styles.legend}>
      <span><i />Horizontal</span><span><i data-dashed />Vertical</span>
      {onPause && <button className={styles.pause} type="button" aria-pressed={paused} onClick={onPause}>{paused ? 'Resume live' : 'Pause trace'}</button>}
    </figcaption>
    {panels.map(panel => <div className={styles.panel} key={panel.id} data-smoothing-panel={panel.id}>
      <div className={styles.heading}><b>{panel.label}</b><span>{latest ? `H ${format(latest[panel.horizontal])} · V ${format(latest[panel.vertical])} °/s` : 'Waiting for motion'}</span></div>
      <svg className={styles.plot} viewBox={`0 0 ${width} ${height}`} role="img"
        aria-label={`${panel.label}. ${live ? paused ? 'Paused controller samples' : 'Selected controller samples' : 'Simulated example'}. Horizontal and vertical angular velocity over the last 2 seconds, from minus ${format(maximum)} to plus ${format(maximum)} degrees per second.${latest ? ` Latest horizontal ${format(latest[panel.horizontal])}, vertical ${format(latest[panel.vertical])} degrees per second.` : ''}`}
        data-live-sweep={live} data-scale={maximum}>
        {[-maximum, 0, maximum].map(value => <g key={value} className={styles.axis}>
          <path d={`M${left} ${y(value)} H${width - right}`} />
          <text x={left - 6} y={y(value) + 4} textAnchor="end">{value > 0 ? '+' : ''}{format(value)}</text>
        </g>)}
        <path className={styles.signal} data-axis="horizontal" d={pathOf(frames.map(frame => [x(frame.at), y(frame[panel.horizontal])]))} />
        <path className={styles.signal} data-axis="vertical" d={pathOf(frames.map(frame => [x(frame.at), y(frame[panel.vertical])]))} />
        <g className={styles.axis}>
          <text x={left} y={height - 5}>−2 s</text><text x={x(end - 1000)} y={height - 5} textAnchor="middle">−1 s</text><text x={width - right} y={height - 5} textAnchor="end">{live && !paused ? 'Now' : '0 s'}</text>
        </g>
      </svg>
    </div>)}
    <p className={styles.caption}>Same time and °/s scale. Solid is horizontal; dashed is vertical.</p>
    {paused && live && <p className={styles.caption}>Trace paused. Settings still update the smoothing preview.</p>}
    {(!active || same) && <p className={styles.status}>{!active ? 'Smoothing is off: input and output are identical.' : 'Input and output are identical in this sample window.'}</p>}
  </figure>
}

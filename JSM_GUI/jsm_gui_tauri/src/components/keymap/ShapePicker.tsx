import styles from './ShapePicker.module.css'

export type RegionShape = 'RECTANGLE' | 'FOUR_WAY' | 'EIGHT_WAY' | 'RADIAL'

const SHAPES: { value: RegionShape; label: string; art: JSX.Element }[] = [
  {
    value: 'RECTANGLE', label: 'Grid',
    art: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" /></>,
  },
  {
    value: 'FOUR_WAY', label: '4-way',
    art: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="m4.5 4.5 15 15M19.5 4.5l-15 15" /></>,
  },
  {
    value: 'EIGHT_WAY', label: '8-way',
    art: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="m4.5 4.5 15 15M19.5 4.5l-15 15M12 3.5v17M3.5 12h17" /></>,
  },
  {
    value: 'RADIAL', label: 'Radial',
    art: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /><path d="M12 3.5V9M12 15v5.5M3.5 12H9M15 12h5.5" /></>,
  },
]

type ShapePickerProps = {
  value: string
  onChange: (value: RegionShape) => void
  disabled?: boolean
  /** Named after the pad it belongs to, so two pickers read apart. */
  label?: string
}

// The region shape as visual tiles (Configuration Pages 15c): Grid, 4-way,
// 8-way, Radial -- each drawn the way the pad will be divided, so the choice
// is seen rather than read.
export function ShapePicker({ value, onChange, disabled, label = 'Regions' }: ShapePickerProps) {
  const current = (value || 'RECTANGLE') as RegionShape
  return (
    <div className={styles.picker} role="radiogroup" aria-label={label}>
      {SHAPES.map(shape => (
        <button
          key={shape.value}
          type="button"
          role="radio"
          aria-checked={current === shape.value}
          className={styles.tile}
          disabled={disabled}
          onClick={() => onChange(shape.value)}
          data-hints="A:Choose;B:Back"
        >
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shape.art}</svg>
          <span>{shape.label}</span>
        </button>
      ))}
    </div>
  )
}

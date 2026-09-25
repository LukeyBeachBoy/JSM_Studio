import { useRef, useState } from 'react'
import * as RadixSlider from '@radix-ui/react-slider'
import styles from './Slider.module.css'

type SliderProps = {
  value: number
  onValueChange: (value: number) => void
  min: number
  max: number
  step: number
  disabled?: boolean
  ariaLabel?: string
  className?: string
  /** X while adjusting switches between fine and coarse steps. */
  onToggleFine?: () => void
  coarse?: boolean
}

const TICKS = 21

// Replaces `input[type=range]`, whose track and thumb can only be styled through
// vendor pseudo-elements that differ per engine. This gives one track we control,
// a filled range showing where the value sits, and the same keyboard behaviour
// (arrows step, Home/End jump) the native control had.
//
// Adjust mode (Gyro.dc.html): arrows move focus until the slider is entered with
// Enter / A; then Left and Right change the value, X switches fine / coarse,
// Enter keeps it and Escape / B puts back the value adjusting started from.
export function Slider({ value, onValueChange, min, max, step, disabled, ariaLabel, className = '', onToggleFine, coarse }: SliderProps) {
  const [adjusting, setAdjusting] = useState(false)
  const startValue = useRef(value)
  const announce = () => window.dispatchEvent(new Event('jsm:interaction-hint'))
  const begin = () => { startValue.current = value; setAdjusting(true); announce() }
  const end = (revert: boolean) => {
    if (revert && startValue.current !== value) onValueChange(startValue.current)
    setAdjusting(false)
    announce()
  }
  return (
    <RadixSlider.Root
      onBlur={() => { if (adjusting) { setAdjusting(false); announce() } }}
      onKeyDownCapture={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); event.stopPropagation()
          if (adjusting) end(false); else begin()
          return
        }
        if (event.key === 'Escape' && adjusting) { event.preventDefault(); event.stopPropagation(); end(true); return }
        if ((event.key === 'x' || event.key === 'X') && adjusting && onToggleFine) { event.preventDefault(); event.stopPropagation(); onToggleFine(); return }
        if (event.key.startsWith('Arrow') && !adjusting) {
          // Suppress Radix's adjustment, then let the global directional navigator move focus.
          event.preventDefault(); event.stopPropagation()
          window.dispatchEvent(new CustomEvent('jsm:navigate-direction', { detail: event.key }))
        }
      }}
      data-adjusting={adjusting}
      data-coarse={coarse ? 'true' : undefined}
      data-pad-keys="X"
      className={`${styles.root} ${className}`.trim()}
      value={[value]}
      onValueChange={([next]) => onValueChange(next)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <RadixSlider.Track className={styles.track}>
        <RadixSlider.Range className={styles.range} />
      </RadixSlider.Track>
      {adjusting && (
        <span className={styles.ticks} aria-hidden="true">
          {Array.from({ length: TICKS }, (_, index) => <span key={index} data-major={index % 5 === 0 ? 'true' : undefined} />)}
        </span>
      )}
      <RadixSlider.Thumb className={styles.thumb} aria-label={ariaLabel}
        aria-description={adjusting ? `Adjusting${coarse ? ', coarse steps' : ''}. Left and Right change the value; Enter keeps it, Escape puts it back.` : 'Enter to adjust.'} />
    </RadixSlider.Root>
  )
}

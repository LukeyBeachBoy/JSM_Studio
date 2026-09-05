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
}

// Replaces `input[type=range]`, whose track and thumb can only be styled through
// vendor pseudo-elements that differ per engine. This gives one track we control,
// a filled range showing where the value sits, and the same keyboard behaviour
// (arrows step, Home/End jump) the native control had.
export function Slider({ value, onValueChange, min, max, step, disabled, ariaLabel, className = '' }: SliderProps) {
  return (
    <RadixSlider.Root
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
      <RadixSlider.Thumb className={styles.thumb} />
    </RadixSlider.Root>
  )
}

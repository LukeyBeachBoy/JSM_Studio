import styles from './ThemeToggle.module.css'
import { padFeedback, setFeedbackStrength, useFeedbackStrength, type FeedbackStrength } from '../nav/feedback'

const OPTIONS: { value: FeedbackStrength; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'strong', label: 'Strong' },
]

// Preferences → Controller: how strongly the pad answers Studio's own UI
// (nav/feedback.ts). Laid out like Theme; each change plays a select click at
// the new strength so it can be judged by feel.
export function ControllerFeedbackSetting({ className = '' }: { className?: string }) {
  const strength = useFeedbackStrength()
  const index = OPTIONS.findIndex(option => option.value === strength)
  const choose = (next: FeedbackStrength) => {
    setFeedbackStrength(next)
    padFeedback('select')
  }
  const step = (delta: number) => choose(OPTIONS[Math.min(OPTIONS.length - 1, Math.max(0, index + delta))].value)

  return (
    <div className={`${styles.row} ${className}`.trim()} data-hints="MOVE:Choose;A:Select;B:Back"
      title="Haptic ticks as you move, select, and step sections and pages. Controllers without haptics get a short rumble for selections and steps.">
      <span className={styles.text}>Controller feedback</span>
      <div className="segmented" role="radiogroup" aria-label="Controller feedback"
        onKeyDown={event => {
          // Left/Right pick within the control; Up/Down leave it to the page walk.
          if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1) }
          if (event.key === 'ArrowRight') { event.preventDefault(); step(1) }
        }}>
        {OPTIONS.map(option => (
          <button key={option.value} type="button" role="radio" aria-checked={strength === option.value} tabIndex={strength === option.value ? 0 : -1}
            onClick={() => choose(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

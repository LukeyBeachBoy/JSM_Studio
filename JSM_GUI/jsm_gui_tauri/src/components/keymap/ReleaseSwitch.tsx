import { useTranslation } from 'react-i18next'

type ReleaseSwitchProps = {
  /** True for "while released" ("!X"), false for the ordinary "while held". */
  released: boolean
  onChange: (released: boolean) => void
  /** What the switch decides, for screen readers: "When Comms applies". */
  ariaLabel: string
  disabled?: boolean
  /** Words for the two sides; a modeshift and a Hold read "Held"/"Released", a Toggle "Press"/"Release". */
  labels?: [string, string]
}

/**
 * Held or released: whether a modeshift or layer action follows its input
 * being down (the usual) or being up -- "hold a layer while I let go of the
 * grip". Two segments like Theme's, Left/Right to choose.
 */
export function ReleaseSwitch({ released, onChange, ariaLabel, disabled, labels }: ReleaseSwitchProps) {
  const { t } = useTranslation()
  const [held, up] = labels ?? [t('keymap.whileHeld', 'Held'), t('keymap.whileReleased', 'Released')]
  const options: [boolean, string][] = [[false, held], [true, up]]
  return (
    <div className="segmented segmented--tiny" role="radiogroup" aria-label={ariaLabel} data-hints="MOVE:Choose;A:Select;B:Back"
      onKeyDown={event => {
        // Left/Right pick; Up/Down leave it to the page walk.
        if (event.key === 'ArrowLeft' && released) { event.preventDefault(); onChange(false) }
        if (event.key === 'ArrowRight' && !released) { event.preventDefault(); onChange(true) }
      }}>
      {options.map(([value, label]) => (
        <button key={label} type="button" role="radio" aria-checked={released === value} tabIndex={released === value ? 0 : -1} disabled={disabled}
          onClick={() => { if (released !== value) onChange(value) }}>
          {label}
        </button>
      ))}
    </div>
  )
}

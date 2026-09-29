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
 * grip". Two segments like Theme's: the arrows move between them, A picks.
 */
export function ReleaseSwitch({ released, onChange, ariaLabel, disabled, labels }: ReleaseSwitchProps) {
  const { t } = useTranslation()
  const [held, up] = labels ?? [t('keymap.whileHeld', 'Held'), t('keymap.whileReleased', 'Released')]
  const options: [boolean, string][] = [[false, held], [true, up]]
  return (
    <div className="segmented segmented--tiny" role="radiogroup" aria-label={ariaLabel} data-hints="MOVE:Choose;A:Select;B:Back">
      {options.map(([value, label]) => (
        <button key={label} type="button" role="radio" aria-checked={released === value} disabled={disabled}
          onClick={() => { if (released !== value) onChange(value) }}>
          {label}
        </button>
      ))}
    </div>
  )
}

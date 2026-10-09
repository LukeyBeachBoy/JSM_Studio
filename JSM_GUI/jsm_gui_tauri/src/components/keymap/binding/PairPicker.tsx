import { useMemo, useRef, useState } from 'react'
import { Dialog } from '../../ui/Dialog'
import { InputGlyph } from '../../glyphs/InputGlyph'
import type { ControllerVisualFamily } from '../../../utils/controllerStatus'
import { usePressedInput } from './usePressedInput'
import { DIRECTION_GROUPS, HOLD_GROUPS, OPTIONAL_INPUTS, capLabel, groupOptions } from './inputGroups'
import styles from './binding.module.css'

// BindingMore's two pair cards: "Press together with… · Pick the other one by
// pressing it" and "Stick diagonal · Pick the two directions". The input the
// sheet is for is one of the pair; this picks the other. Pressing a grip,
// trigger, stick or pad picks it at once; the buttons that move around this
// screen are chosen from the list.

type Props = {
  kind: 'simultaneous' | 'diagonal'
  /** The input the binding is on, and its name ("A button"). */
  input: string
  inputName: string
  family: ControllerVisualFamily
  options: { value: string; label: string; disabled?: boolean }[]
  /** Pairs this input already has, offered but marked. */
  taken: string[]
  /** The current partner when changing one. */
  initial?: string
  onPick: (other: string) => void
  onClose: () => void
}

export function PairPicker({ kind, input, inputName, family, options, taken, initial, onPick, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(initial ?? null)
  const body = useRef<HTMLDivElement>(null)
  const self = input.toUpperCase()
  const { supported, listening } = usePressedInput(kind === 'simultaneous', pressed => {
    if (pressed === self) return
    setSelected(pressed)
    body.current?.querySelector<HTMLElement>(`[data-pair-input="${CSS.escape(pressed)}"]`)?.focus()
  })
  const groups = useMemo(() => {
    if (kind === 'diagonal') {
      const directions = DIRECTION_GROUPS.flatMap(group => group.commands)
      return groupOptions(DIRECTION_GROUPS, [...options, ...directions.filter(value => !options.some(option => option.value.toUpperCase() === value)).map(value => ({ value, label: value }))], value => directions.includes(value))
    }
    return groupOptions(HOLD_GROUPS, options, value => value === self || !supported || supported.has(value) || !OPTIONAL_INPUTS.has(value))
  }, [kind, options, supported, self])
  const title = kind === 'simultaneous' ? 'Press together with…' : 'Stick diagonal'
  const subtitle = kind === 'simultaneous'
    ? `${inputName} and one other button, pressed at the same moment.`
    : `Only while ${inputName} and one other direction are pushed at once, like up and right.`
  return (
    <Dialog onClose={onClose} width={900} eyebrow={`${inputName} · More`} title={title} subtitle={subtitle}
      footerNote={kind === 'simultaneous' ? 'A grip, trigger, stick or pad can be pressed on the controller; the rest are in the list.' : undefined}
      hints={[{ button: 'DPAD', label: 'Move' }, { button: 'A', label: 'Choose' }, { button: 'B', label: 'Cancel' }]}
      actions={<button type="button" className="console-btn console-btn--primary" aria-disabled={selected ? undefined : 'true'} data-reason={selected ? undefined : 'Pick the other button first'}
        onClick={() => selected && onPick(selected)} data-hints={selected ? 'A:Choose;B:Cancel' : 'B:Cancel'}>Choose</button>}>
      <div ref={body} className={styles.pairBody}>
        {kind === 'simultaneous' && listening && (
          <p className={styles.listenLine}><span className={styles.listenDot} aria-hidden="true" />Listening for the other button</p>
        )}
        <div className={styles.capGroups}>
          {groups.map(group => (
            <div key={group.key} style={{ display: 'contents' }}>
              <span className={styles.capGroupLabel}>{group.label}</span>
              <span className={styles.caps}>
                {group.items.map(value => {
                  const own = value === self
                  const unavailable = own ? 'This is the button you are setting' : undefined
                  return (
                    <button key={value} type="button" className={styles.cap} data-pair-input={value}
                      aria-pressed={selected === value} aria-disabled={unavailable ? 'true' : undefined} data-reason={unavailable}
                      data-caption={`${capLabel(value, family)}${taken.includes(value) ? ' · already paired with this button' : ''}`}
                      data-hints={unavailable ? 'B:Cancel' : 'A:Choose;B:Cancel'} data-glyph-cap=""
                      onClick={event => { if (unavailable) return; setSelected(value); if (event.detail === 0 || selected === value) onPick(value) }}>
                      <InputGlyph command={value} family={family} size={30} />
                      <span>{capLabel(value, family)}</span>{taken.includes(value) && <span className={styles.capDot} aria-hidden="true" />}
                    </button>
                  )
                })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  )
}

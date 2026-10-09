import { useState } from 'react'
import { Menu, type MenuItem } from '../../ui/Menu'
import { ActionPicker, type ActionPickerProps } from '../ActionPicker'
import { CYCLE_MAX_STEPS } from '../../../utils/cycleBinding'
import { commandForValue, inferOutputKindFromBindingValue } from '../../../utils/bindingCommands'
import { describeOutputValue } from '../../../utils/virtualController'
import type { ControllerVisualFamily } from '../../../utils/controllerStatus'
import styles from './binding.module.css'

// The steps of a Cycle through keys (console v2: Controller action ▸ Other ▸
// Cycle, and Fine-tune's card): the chain of keys, A changes one, Y reorders
// or removes it, "+ Step" adds another. Shared by the picker's page (choose the
// steps, then Add) and Fine-tune (change them in place).

type Props = {
  /** The input the cycle is on (a JSM name), for the step picker's words. */
  input: string
  steps: string[]
  onChange: (steps: string[]) => void
  family: ControllerVisualFamily
  virtualControllerType: ActionPickerProps['virtualControllerType']
  onEnableVirtualController?: ActionPickerProps['onEnableVirtualController']
}

export function CycleStepsEditor({ input, steps, onChange, family, virtualControllerType, onEnableVirtualController }: Props) {
  const [stepPicker, setStepPicker] = useState<number | null>(null)
  const [stepMenu, setStepMenu] = useState<number | null>(null)
  const stepItems = (index: number): MenuItem[] => [
    { label: 'Move earlier', disabled: index === 0, onSelect: () => { const next = [...steps]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next) } },
    { label: 'Move later', disabled: index === steps.length - 1, onSelect: () => { const next = [...steps]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange(next) } },
    { label: 'Remove this step', disabled: steps.length <= 2, onSelect: () => onChange(steps.filter((_, i) => i !== index)) },
  ]
  return (
    <>
      <div className={styles.stepChain} data-cycle-editor="true">
        {steps.map((step, index) => (
          <span key={index} style={{ display: 'contents' }}>
            {index > 0 && <span className={styles.stepArrow} aria-hidden="true">›</span>}
            <Menu open={stepMenu === index} onOpenChange={open => setStepMenu(open ? index : null)} items={stepItems(index)} ariaLabel={`Step ${index + 1}`}
              trigger={<button type="button" className={styles.step} data-own-y="" data-hints="A:Change step;Y:Reorder or remove;B:Back" aria-label={`Step ${index + 1}: ${describeOutputValue(step)}`}
                data-caption={`Step ${index + 1} · ${describeOutputValue(step)}`}
                onClick={event => { event.preventDefault(); setStepPicker(index) }}
                onPointerDown={event => event.preventDefault()}
                onKeyDown={event => { if (event.key === 'y' || event.key === 'Y') { event.preventDefault(); setStepMenu(index) } if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setStepPicker(index) } }}
                data-pad-keys="Y"><small>{index + 1}</small>{describeOutputValue(step)}</button>} />
          </span>
        ))}
        <button type="button" className={styles.step} data-add-step="" aria-disabled={steps.length >= CYCLE_MAX_STEPS ? 'true' : undefined} data-reason={steps.length >= CYCLE_MAX_STEPS ? `A cycle holds at most ${CYCLE_MAX_STEPS} steps` : undefined}
          data-hints="A:Add a step;B:Back" onClick={() => { if (steps.length < CYCLE_MAX_STEPS) { onChange([...steps, steps[steps.length - 1]]); setStepPicker(steps.length) } }}>+ Step</button>
      </div>
      {stepPicker !== null && steps[stepPicker] !== undefined && (
        <ActionPicker inputLabel={`Cycle · Step ${stepPicker + 1}`} command={{ ...commandForValue(input, steps[stepPicker]), outputKind: inferOutputKindFromBindingValue(steps[stepPicker]), outputValue: steps[stepPicker] }}
          virtualControllerType={virtualControllerType} onEnableVirtualController={onEnableVirtualController} specialOptions={[]} family={family}
          allowedOutputKinds={['keyboard', 'mouse', 'wheel', 'virtualController']}
          onClose={() => setStepPicker(null)} onSelect={patch => { if (!patch.outputValue) return; const next = [...steps]; next[stepPicker] = patch.outputValue; onChange(next); setStepPicker(null) }} />
      )}
    </>
  )
}

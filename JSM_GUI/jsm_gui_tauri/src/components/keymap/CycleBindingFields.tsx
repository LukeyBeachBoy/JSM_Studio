import { useState } from 'react'
import { ActionPicker } from './ActionPicker'
import { SummaryRow } from '../ui/SummaryRow'
import { inferOutputKindFromBindingValue, type BindingCommand, type BindingCommandPatch } from '../../utils/bindingCommands'
import { parseCycleBinding, cycleBinding, CYCLE_MAX_STEPS } from '../../utils/cycleBinding'
import { describeOutputValue, getVirtualControllerTokenType, type VirtualControllerType } from '../../utils/virtualController'

export function CycleBindingFields({ command, onChange, virtualControllerType = 'NONE', onEnableVirtualController }: { command: BindingCommand; onChange: (patch: BindingCommandPatch) => void; virtualControllerType?: VirtualControllerType; onEnableVirtualController?: () => void }) {
  const [selected, setSelected] = useState<number | null>(null)
  const steps = parseCycleBinding(command.outputValue)
  if (!steps) return null
  const write = (next: string[]) => { const value = cycleBinding(next); if (value) onChange({ outputValue: value, outputBehavior: 'tapOnce' }) }
  const current = selected === null ? null : steps[selected]
  return <div data-cycle-editor="true">
    <p>Each activation sends the next output once, then wraps to the first. Position belongs to this physical input and controller; reconnecting resets it. Editing the sequence starts a separate sequence. Step outputs use the normal native tap duration.</p>
    {virtualControllerType === 'NONE' && steps.some(step => getVirtualControllerTokenType(step)) && <p role="status">These steps require a virtual controller. Enable Xbox or DS4 output.</p>}
    {steps.map((step, index) => <div key={index}>
      <SummaryRow label={`Step ${index + 1}`} value={describeOutputValue(step)} onActivate={() => setSelected(index)} />
      <div className="button-row">
        <button type="button" className="console-btn" disabled={index === 0} onClick={() => { const next = [...steps]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; write(next) }} aria-label={`Move step ${index + 1} earlier`}>Move earlier</button>
        <button type="button" className="console-btn" disabled={steps.length <= 2} onClick={() => write(steps.filter((_, i) => i !== index))} aria-label={`Remove step ${index + 1}`}>Remove</button>
      </div>
    </div>)}
    <SummaryRow label="Add cycle step" value={`${steps.length} / ${CYCLE_MAX_STEPS}`} disabled={steps.length >= CYCLE_MAX_STEPS} onActivate={() => write([...steps, steps[steps.length - 1]])} />
    {selected !== null && current && <ActionPicker inputLabel={`Cycle · Step ${selected + 1}`} command={{ ...command, outputKind: inferOutputKindFromBindingValue(current), outputValue: current }}
      virtualControllerType={virtualControllerType} onEnableVirtualController={onEnableVirtualController} specialOptions={[]} allowedOutputKinds={['keyboard', 'mouse', 'wheel', 'virtualController']}
      onClose={() => setSelected(null)} onSelect={patch => { if (!patch.outputValue) return; const next = [...steps]; next[selected] = patch.outputValue; write(next); setSelected(null) }} />}
  </div>
}

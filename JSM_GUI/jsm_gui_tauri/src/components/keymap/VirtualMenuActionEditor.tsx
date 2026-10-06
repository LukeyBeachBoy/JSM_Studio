import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../ui/Sheet'
import { SummaryRow } from '../ui/SummaryRow'
import { ActionPicker } from './ActionPicker'
import { BindingCommandCard } from './BindingCommandCard'
import { BindingLabelField } from './BindingLabelField'
import { IconPicker } from './IconPicker'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'
import { parseRowsToCommands, commandForValue, updateCommandExpression, replaceFirstOutput, type BindingCommand, type BindingCommandPatch } from '../../utils/bindingCommands'
import { appendBaseLineTokens, createBindingExpression, explicitBindingTokens, parseBindingExpression, serializeBindingExpression, type ButtonBindingRow } from '../../utils/keymap'
import { getActionSpecialOptionList } from '../../keymap/schema'
import type { VirtualControllerType } from '../../utils/virtualController'
import { hasBindingParameters } from '../../utils/bindingParameters'

type Props = { title: string; value: string; label: string; icon: string; family?: ControllerVisualFamily; onLabelChange: (label: string) => void; onIconChange: (icon: string) => void; onChange: (value: string) => void; onClose: () => void; virtualControllerType: VirtualControllerType; onEnableVirtualController: () => void }
/** A menu item has a native Mapping, not another physical-input config line.
 * Reuse command rows while offering only events that this Mapping can execute. */
export function VirtualMenuActionEditor({ title, value, label, icon, family, onLabelChange, onIconChange, onChange, onClose, virtualControllerType, onEnableVirtualController }: Props) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [settingsFor, setSettingsFor] = useState<string | null>(null)
  const binding = value.trim().toUpperCase() === 'NONE' ? '' : value
  const expression = parseBindingExpression(binding)
  const row: ButtonBindingRow = { id: 'menu-item', slot: 'tap', label: title, binding, expression, editorMode: 'advanced', writeMode: 'line', supportsAdvancedEditor: true, canSwitchToSimple: false, isManual: false }
  const commands = parseRowsToCommands([row], 'N')
  const specials = getActionSpecialOptionList(t)
  const update = (command: BindingCommand, patch: BindingCommandPatch) => {
    const next = updateCommandExpression(command, patch)
    if (next) onChange(serializeBindingExpression(next) || 'NONE')
  }
  const remove = (command: BindingCommand) => {
    if (command.source.kind !== 'row' || !expression) return
    const tokens = explicitBindingTokens(expression.tokens)
    tokens.splice(command.source.tokenIndex, command.source.ledBrightnessTokenIndex === undefined ? 1 : 2)
    onChange(serializeBindingExpression(createBindingExpression(tokens)) || 'NONE')
  }
  const duplicate = (command: BindingCommand) => {
    if (command.source.kind !== 'row' || !expression) return
    const tokens = explicitBindingTokens(expression.tokens)
    const count = command.source.ledBrightnessTokenIndex === undefined ? 1 : 2
    tokens.splice(command.source.tokenIndex + count, 0, ...tokens.slice(command.source.tokenIndex, command.source.tokenIndex + count))
    onChange(serializeBindingExpression(createBindingExpression(tokens)))
  }
  return <Sheet open onClose={onClose} eyebrow="Virtual menu · Actions" title={title} width={680}>
    <div className="virtual-menu-action__identity">
      <div className="virtual-menu-action__name"><span>Action name</span><BindingLabelField value={label} onChange={onLabelChange} /></div>
      <IconPicker value={icon} onChange={onIconChange} label={label || title} family={family} />
    </div>
    <p>Click and release selection tap the item. Continuous selection holds it, enabling hold and turbo actions. A menu item can send several commands with independent activators.</p>
    <div data-menu-action-editor="true">
      {commands.map(command => <BindingCommandCard key={command.id} command={command} inputLabel={title} modifierOptions={[]} specialOptions={specials}
        virtualControllerType={virtualControllerType} isCapturing={false} onCapture={() => {}} allowCapture={false} allowHeldLed={false}
        allowedTriggers={['regular', 'tap', 'hold', 'release', 'turbo']} onUpdate={update} onRemove={remove} onDuplicate={duplicate}
        onEnableVirtualController={onEnableVirtualController} closeLabel="Menu"
        openSettingsOnMount={settingsFor === command.id} onSettingsOpened={() => setSettingsFor(null)} />)}
    </div>
    <SummaryRow label="Add command" value="Choose an action" onActivate={() => setAdding(true)} />
    {adding && <ActionPicker inputLabel={title} command={commandForValue('N', '')} virtualControllerType={virtualControllerType} specialOptions={specials}
      onEnableVirtualController={onEnableVirtualController} onClose={() => setAdding(false)} onSelect={patch => {
        if (patch.outputKind && patch.outputValue) {
          const next = parseBindingExpression(replaceFirstOutput('NONE\\', patch.outputKind, patch.outputValue))
          if (next) {
            if (hasBindingParameters(patch.outputValue)) setSettingsFor(`N-menu-item-${expression?.tokens.length ?? 0}`)
            onChange(serializeBindingExpression(createBindingExpression(appendBaseLineTokens(expression?.tokens ?? [], next.tokens))))
          }
        }
        setAdding(false)
      }} />}
  </Sheet>
}

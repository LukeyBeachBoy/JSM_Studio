import { useTranslation } from 'react-i18next'
import { inputDefinitions, readableSetting, visibleOverrideKeys } from '../utils/layers'
import { parseBindingExpression } from '../utils/keymap'
import { commandForValue, commandNameKey } from '../utils/bindingCommands'
import { describeBinding } from '../utils/bindingDescription'


/** Action names are metadata on the binding row, not separate overrides. */
export function LayerOverrideRows({ overrides, inputName, disabled, onRestore }: {
  overrides: Record<string, string>; inputName: (key: string) => string; disabled?: boolean; onRestore: (keys: string[]) => void
}) {
  const { t } = useTranslation()
  return <div className="layer-override-rows">{visibleOverrideKeys(overrides).map(key => {
    const value = overrides[key]
    const physical = key.split(',')[0]
    const names = Object.keys(overrides).filter(item => item === `# @label ${physical}` || item.startsWith(`# @label ${physical}::`))
    const tokens = parseBindingExpression(value)?.tokens ?? []
    const binding = inputDefinitions.some(input => input.command === key) || /^[LR]?[TM]\d+$/.test(key)
    const commands = tokens.map(token => { const command = commandForValue(key, token.raw || token.value); return { ...command, outputValue: token.value, sourceLine: key } })
    const content = binding ? commands.map((command, index) => {
      const name = overrides[`# @label ${commandNameKey(command, commands)}`]
      const color = /^LIGHT_BAR\s*=\s*x([0-9a-f]{6})$/i.exec(command.outputValue)?.[1]
      return <span key={index}>{index > 0 && ' · '}{name && `${name}: `}{color ? <>Change LED color to <span className="layer-override__color" style={{ background: `#${color}` }} role="img" aria-label={`Color #${color}`} /></> : describeBinding(command.outputValue, t)}</span>
    }) : /(?:^|,)LIGHT_BAR$/.test(key) ? <>{overrides[`# @label ${physical}::LED::0`] && `${overrides[`# @label ${physical}::LED::0`]}: `}Change LED color to <span className="layer-override__color" style={{ background: `#${value.replace(/^x/i, '')}` }} role="img" aria-label={`Color ${value}`} />{key.includes(',') && 'while held'}</> : describeBinding(value, t) || value
    return <div className="layer-override" key={key}>
      <span className="layer-override__name">{binding ? inputName(key) : readableSetting(key)}</span>
      <span className="layer-override__value">{content}{overrides[`# @label ${physical}`] && ` · ${overrides[`# @label ${physical}`]}`}</span>
      <button type="button" className="button button--tertiary" disabled={disabled} onClick={() => onRestore([key, ...names])}>Use Default</button>
    </div>
  })}</div>
}

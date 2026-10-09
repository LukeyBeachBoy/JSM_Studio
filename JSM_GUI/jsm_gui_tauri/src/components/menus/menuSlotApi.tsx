import type { ReactNode } from 'react'
import type { TFunction } from 'i18next'
import type { BindingApi } from '../keymap/binding/model'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'
import type { VirtualControllerType } from '../../utils/virtualController'
import type { ButtonDefinition } from '../../keymap/schema'
import { bindingCommandToToken, parseRowsToCommands, updateCommandExpression, type BindingCommand, type BindingCommandPreset } from '../../utils/bindingCommands'
import { appendBaseLineTokens, createBindingExpression, explicitBindingTokens, parseBindingExpression, serializeBindingExpression, type ButtonBindingRow } from '../../utils/keymap'
import { getActionSpecialOptionList } from '../../keymap/schema'

// A menu slice's action, for the binding sheet (BIND's BindingSheetBody): a
// slice has no config line of its own -- its binding is one expression inside
// the VIRTUAL_MENUS catalogue -- so every activation (press, tap, hold, let go,
// turbo) is a token of that one expression. Pairs and While holding do not
// apply to a slice and are not offered.

const SLOT: ButtonDefinition = { command: 'N', descriptionKey: 'virtualMenus.slice', playstation: 'Slice', xbox: 'Slice' }

type Options = {
  /** The slice's binding ("3", "G_ H", NONE for nothing). */
  value: string
  onChange: (value: string) => void
  title: string
  shortName: string
  label?: string
  onRename?: (value: string) => void
  family: ControllerVisualFamily
  glyph: ReactNode
  virtualControllerType: VirtualControllerType
  onEnableVirtualController: () => void
  t: TFunction
}

export function menuSlotApi({ value, onChange, title, shortName, label, onRename, family, glyph, virtualControllerType, onEnableVirtualController, t }: Options): BindingApi {
  const binding = value.trim().toUpperCase() === 'NONE' ? '' : value
  const expression = parseBindingExpression(binding)
  const row: ButtonBindingRow = { id: 'menu-item', slot: 'tap', label: title, binding, expression, editorMode: 'advanced', writeMode: 'line', supportsAdvancedEditor: true, canSwitchToSimple: false, isManual: false }
  const commands = parseRowsToCommands([row], 'N')
  const tokens = () => explicitBindingTokens(expression?.tokens ?? [])
  const write = (next: ReturnType<typeof tokens>) => onChange(serializeBindingExpression(createBindingExpression(next)) || 'NONE')
  const span = (command: BindingCommand) => command.source.kind !== 'row' ? null : { at: command.source.tokenIndex, count: command.source.ledBrightnessTokenIndex === undefined ? 1 : 2 }
  return {
    button: SLOT,
    command: 'N',
    shortName,
    longName: title,
    family,
    glyph,
    commands,
    label,
    onRename,
    pickerProps: { virtualControllerType, specialOptions: getActionSpecialOptionList(t), onEnableVirtualController, family },
    add: (activation, patch, extra) => {
      const preset: BindingCommandPreset = {
        triggerKind: ['regular', 'tap', 'hold', 'release', 'turbo'].includes(activation.kind) ? activation.kind : 'regular',
        outputKind: patch.outputKind ?? 'keyboard', outputValue: patch.outputValue ?? '', outputBehavior: patch.outputBehavior ?? 'normal',
        turboIntervalMs: extra?.turboIntervalMs ?? patch.turboIntervalMs, ledBrightness: extra?.ledBrightness ?? patch.ledBrightness,
      }
      if (!preset.outputValue.trim()) return
      const keys = preset.outputKind === 'keyboard' ? preset.outputValue.trim().split(/\s+/) : [preset.outputValue]
      write(appendBaseLineTokens(tokens(), keys.map(output => bindingCommandToToken({ ...preset, outputValue: output }))))
    },
    update: (command, patch) => {
      const next = updateCommandExpression(command, patch)
      if (next) onChange(serializeBindingExpression(next) || 'NONE')
    },
    remove: command => {
      const where = span(command)
      if (!where) return
      const next = tokens()
      next.splice(where.at, where.count)
      write(next)
    },
    clear: picked => {
      const drop = new Set(picked.flatMap(command => { const where = span(command); return where ? Array.from({ length: where.count }, (_, i) => where.at + i) : [] }))
      write(tokens().filter((_, index) => !drop.has(index)))
    },
    duplicate: command => {
      const where = span(command)
      if (!where) return
      const next = tokens()
      next.splice(where.at + where.count, 0, ...next.slice(where.at, where.at + where.count))
      write(next)
    },
    canPaste: false,
    pasteLabel: '',
    nameOf: () => undefined,
    capture: () => {},
    isCapturing: false,
    modifierOptions: [],
    shifted: true,
    emptyLabel: 'Nothing yet',
  }
}

import { useEffect, useMemo, useState } from 'react'
import { KindPicker, type SendKind } from '../components/keymap/pickers/KindPicker'
import { ActionPicker } from '../components/keymap/ActionPicker'
import { IconPickerPage } from '../components/keymap/IconPicker'
import { LayerUsageContext } from '../components/LayerBar'
import { commandForValue, type BindingCommand, type BindingCommandPatch, type BindingOutputKind, type BindingTriggerKind } from '../utils/bindingCommands'
import { readLayerActions, readLayers, setLayerActions } from '../utils/layers'
import { createVirtualMenu, writeVirtualMenus } from '../utils/virtualMenus'
import { useShell } from '../shell/ShellContext'

// Dev only (?mock): the console v2 pickers on their own, for checking them by
// hand or from a test (design/console-v2/notes/PICK.md).
//
//   window.dispatchEvent(new CustomEvent('jsm:picker', { detail: { kind: 'key', input: 'S', value: 'SPACE' } }))
//   window.dispatchEvent(new CustomEvent('jsm:icon-picker', { detail: { menu: 'Build menu', item: 'Supply crate', value: 'game-icons:wooden-crate' } }))
//
// What a picker hands back lands in window.__pickerResult.

// kind 'nested' is the ActionPicker the nested editors use (a cycle's steps, a menu's actions).
type Request = { kind: SendKind | 'nested'; input?: string; value?: string; outputKind?: BindingOutputKind; trigger?: BindingTriggerKind; empty?: boolean; source?: BindingCommand['source'] }

const SAMPLE = (() => {
  const base = [
    'RESET_MAPPINGS', 'S = SPACE', 'E = C', 'W = R', 'N = F', 'L = G', 'R = MMOUSE', 'ZL = RMOUSE', 'ZR = LMOUSE', 'GYRO_ON = MISC5',
    '# @layer {"id":"veh","name":"Vehicles","overrides":{"N":"H"}}',
    '# @layer {"id":"map","name":"Tactical map","overrides":{"S":"M"}}',
    '# @layer {"id":"comms","name":"Comms","overrides":{"E":"K"}}',
    '# @layer-action LSL = hold veh',
  ].join('\n') + '\n'
  const wheel = createVirtualMenu('wheel', 'Weapon wheel')
  const build = { ...createVirtualMenu('build', 'Build menu'), type: 'TOUCH' as const, columns: 2, actions: ['Supply crate', 'Wrench', 'Hammer', 'Wall'].map((label, index) => ({ binding: String(index + 5), label, icon: index ? '' : 'game-icons:wooden-crate' })) }
  return writeVirtualMenus(base, [wheel, build])
})()

export default function PickerPlayground() {
  const { configName } = useShell()
  const [request, setRequest] = useState<Request | null>(null)
  const [icon, setIcon] = useState<{ menu: string; item: string; value: string } | null>(null)
  const [text, setText] = useState(SAMPLE)
  useEffect(() => {
    const show = (event: Event) => setRequest((event as CustomEvent<Request>).detail)
    const showIcon = (event: Event) => setIcon((event as CustomEvent<{ menu: string; item: string; value: string }>).detail)
    window.addEventListener('jsm:picker', show)
    window.addEventListener('jsm:icon-picker', showIcon)
    return () => { window.removeEventListener('jsm:picker', show); window.removeEventListener('jsm:icon-picker', showIcon) }
  }, [])
  const layers = useMemo(() => readLayers(text), [text])
  const actions = useMemo(() => readLayerActions(text, layers), [text, layers])
  // As JSON would carry it: undefined fields left out.
  const record = (result: unknown) => { (window as unknown as { __pickerResult: unknown[] }).__pickerResult = [...((window as unknown as { __pickerResult?: unknown[] }).__pickerResult ?? []), JSON.parse(JSON.stringify(result))] }
  const command = request ? {
    ...commandForValue(request.input ?? 'S', request.value ?? '', request.trigger ?? 'regular'),
    ...(request.outputKind ? { outputKind: request.outputKind } : {}),
    ...(request.source ? { source: request.source } : {}),
  } : null
  return (
    <LayerUsageContext.Provider value={{ text, layers, actions, onSetActions: (input, next) => { record({ setActions: { input, next } }); setText(previous => setLayerActions(previous, input, next)) } }}>
      {request && command && request.kind === 'nested' && (
        <ActionPicker inputLabel="Cycle · Step 1" command={command} virtualControllerType="NONE" specialOptions={[]} allowedOutputKinds={['keyboard', 'mouse', 'wheel', 'virtualController']}
          onSelect={(patch: BindingCommandPatch) => record({ patch })} onClose={() => setRequest(null)} />
      )}
      {request && command && request.kind !== 'nested' && (
        <KindPicker kind={request.kind} inputLabel={request.input === 'S' || !request.input ? 'A button' : request.input} command={command}
          virtualControllerType="NONE" specialOptions={[]} libraryProfiles={request.empty ? [configName ?? 'Wardogs'] : ['Wardogs', 'Cyberpunk', 'FPS Template', 'Gamepad']} currentProfileName={configName ?? 'Wardogs'}
          defaultLedColor="#ff8800"
          onSelect={(patch: BindingCommandPatch) => record({ patch })} onClose={() => setRequest(null)}
          onCapture={() => record({ capture: true })} onEnableVirtualController={type => record({ enable: type ?? 'XBOX' })}
          onAddHeldLed={() => record({ heldLed: true })} onAddStickShift={(stick, mode) => record({ stickShift: { stick, mode } })}
          onAddLayerAction={(layerId, verb, onRelease) => record({ layer: { layerId, verb, onRelease } })} onSelectCombo={keys => record({ combo: keys })} />
      )}
      {icon && <IconPickerPage menuName={icon.menu} itemLabel={icon.item} value={icon.value} onClose={() => setIcon(null)} onChange={value => { record({ icon: value }); setIcon(null) }} />}
    </LayerUsageContext.Provider>
  )
}

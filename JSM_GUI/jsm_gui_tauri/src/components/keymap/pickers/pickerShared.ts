import { useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { BindingCommand, BindingTriggerKind } from '../../../utils/bindingCommands'
import { LayerUsageContext } from '../../LayerBar'
import { useShell } from '../../../shell/ShellContext'
import { inputDisplayName } from '../../../keymap/inputNames'
import { desktopBridge } from '../../../platform/desktopBridge'
import type { TelemetrySample } from '../../../hooks/useTelemetry'
import type { ControllerVisualFamily } from '../../../utils/controllerStatus'

// What every picker needs to say where it is and what is taken.

/** The activation in the design's words (V8): Press, Tap, Hold, Double-tap, Let go… */
export const activationLabel = (t: TFunction, trigger: BindingTriggerKind) => ({
  regular: t('pickers.activationPress', 'Press'),
  tap: t('pickers.activationTap', 'Tap'),
  hold: t('pickers.activationHold', 'Hold'),
  double: t('pickers.activationDouble', 'Double-tap'),
  release: t('pickers.activationRelease', 'Let go'),
  turbo: t('pickers.activationTurbo', 'Turbo'),
  chord: t('pickers.activationChord', 'Chord'),
  simultaneous: t('pickers.activationSimultaneous', 'Press together'),
  diagonal: t('pickers.activationDiagonal', 'Stick diagonal'),
  stickShift: t('pickers.activationStickShift', 'While held'),
})[trigger]

/** "A button · Press sends", "Wardogs · A button · Press", for one picker. */
export function usePickerWords(inputLabel: string, command: BindingCommand) {
  const { t } = useTranslation()
  const { configName } = useShell()
  const activation = activationLabel(t, command.triggerKind)
  // The binding sheet hands over "A · Press together LB" (the input and the
  // activation, already named); older callers only the input ("A button").
  const named = inputLabel.includes(' · ')
  const input = named ? inputLabel.split(' · ')[0] : inputLabel
  const said = named ? inputLabel : `${inputLabel} · ${activation}`
  return {
    activation,
    /** The input alone, for "A uses it", "When A is pressed". */
    input,
    eyebrow: t('pickers.eyebrow', '{{said}} sends', { said }),
    where: (extra?: string) => [configName ?? t('pickers.configuration', 'Configuration'), said, extra].filter(Boolean).join(' · '),
  }
}

/** Every output token a configuration line sends, with the first input that
 *  sends it where the line is a binding ("B button uses it"). */
export const usedTokens = (text: string) => {
  const used = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf('=')
    if (at < 0) continue
    const input = trimmed.slice(0, at).trim()
    const binding = /^[A-Za-z0-9+,!]{1,8}$/.test(input) ? input : ''
    for (const token of trimmed.slice(at + 1).split('#')[0].toUpperCase().match(/[A-Z0-9_]+/g) ?? []) if (!used.get(token)) used.set(token, binding)
  }
  return used
}

/** "<input> uses it": who else sends `token`, if anyone other than this input. */
export function useUsedBy(command: BindingCommand) {
  const { text = '' } = useContext(LayerUsageContext)
  const { family } = useShell()
  const used = useMemo(() => usedTokens(text), [text])
  return (token: string) => {
    if (!token || token === command.outputValue) return ''
    const by = used.get(token.toUpperCase())
    if (by === undefined) return ''
    if (by && by.toUpperCase() === command.physicalInput.toUpperCase()) return ''
    return by ? inputDisplayName(by, family as ControllerVisualFamily) : '-'
  }
}

/** The controllers connected right now, by JSM type (availability notes). */
export function useConnectedTypes() {
  const [types, setTypes] = useState<number[]>([])
  useEffect(() => {
    const dispose = desktopBridge.onTelemetrySample(payload => {
      const devices = (payload as TelemetrySample | null)?.devices ?? []
      const next = devices.map(device => device.type).filter((type): type is number => typeof type === 'number')
      setTypes(previous => previous.length === next.length && previous.every((type, at) => type === next[at]) ? previous : next)
    })
    return () => { dispose?.() }
  }, [])
  return types
}

export const STEAM_CONTROLLER_2026 = 24
export const DUALSENSE = 5

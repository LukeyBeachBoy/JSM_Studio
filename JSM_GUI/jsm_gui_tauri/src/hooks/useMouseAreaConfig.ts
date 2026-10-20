import { useCallback, useEffect, useMemo } from 'react'
import { desktopBridge } from '../platform/desktopBridge'
import { getKeymapValue, removeKeymapEntry, updateKeymapEntry } from '../utils/keymap'
import {
  DEFAULT_MOUSE_AREA,
  formatMouseArea,
  normalizeMouseAreaFit,
  parseMouseArea,
  type MouseArea,
  type MouseAreaFit,
} from '../utils/mouseArea'

// TOUCHPAD_AREA / TOUCHPAD_AREA_FIT for each pad scope the editor shows: the
// shared pad ('') and LEFT / RIGHT. Reads go through the imported baseline
// like every other pad setting; writes land in the profile's own text.
//
// The area is not typed in: `pick` opens the on-screen picker (services/
// area_picker.rs) and the rectangle comes back through onMouseAreaPicked,
// which this hook subscribes to so the result is written to the setting the
// picker was opened for.

export type MouseAreaScope = '' | 'LEFT' | 'RIGHT'

export type MouseAreaSettings = {
  /** The configured area, or null when the setting is absent (whole screen). */
  area: MouseArea | null
  fit: MouseAreaFit
  /** Whether the config sets a fit at all (absent reads as STRETCH). */
  fitSet: boolean
  setArea: (area: MouseArea | null) => void
  setFit: (fit: string) => void
  /** Opens the picker over the game, with this pad's current area to adjust. */
  pick: (padAspect: number) => void
}

type Args = {
  readText: string
  setConfigText?: React.Dispatch<React.SetStateAction<string>>
  /** Route picker results to this editor, even while the base editor is mounted. */
  settingPrefix?: string
}

const keyFor = (name: 'TOUCHPAD_AREA' | 'TOUCHPAD_AREA_FIT', scope: MouseAreaScope) => (scope ? `${scope}_${name}` : name)

export function useMouseAreaConfig({ readText, setConfigText, settingPrefix = '' }: Args): Record<MouseAreaScope, MouseAreaSettings> {
  const write = useCallback((key: string, value: string | null) => {
    setConfigText?.(previous => (value ? updateKeymapEntry(previous, key, [value]) : removeKeymapEntry(previous, key)))
  }, [setConfigText])

  // The picker's result names the pad it was opened for, so one listener
  // serves every scope and a result cannot land on the wrong pad.
  useEffect(() => desktopBridge.onMouseAreaPicked(result => {
    const scope = (['', 'LEFT', 'RIGHT'] as const).find(scope => result.pad === settingPrefix + scope)
    if (!result.area || scope === undefined) return
    write(keyFor('TOUCHPAD_AREA', scope), formatMouseArea(result.area))
  }), [write, settingPrefix])

  return useMemo(() => {
    const scopeSettings = (scope: MouseAreaScope): MouseAreaSettings => {
      const area = parseMouseArea(getKeymapValue(readText, keyFor('TOUCHPAD_AREA', scope)))
      const fitRaw = getKeymapValue(readText, keyFor('TOUCHPAD_AREA_FIT', scope))
      return {
        area,
        fit: normalizeMouseAreaFit(fitRaw),
        fitSet: Boolean(fitRaw?.trim()),
        setArea: next => write(keyFor('TOUCHPAD_AREA', scope), next ? formatMouseArea(next) : null),
        // Write both choices explicitly: deleting STRETCH would fall back to
        // an imported or unshifted UNIFORM setting instead of the chosen fit.
        setFit: next => write(keyFor('TOUCHPAD_AREA_FIT', scope), normalizeMouseAreaFit(next)),
        pick: padAspect => {
          void desktopBridge.openMouseAreaPicker({
            pad: settingPrefix + scope,
            area: area ?? DEFAULT_MOUSE_AREA,
            fit: normalizeMouseAreaFit(fitRaw),
            padAspect,
          })
        },
      }
    }
    return { '': scopeSettings(''), LEFT: scopeSettings('LEFT'), RIGHT: scopeSettings('RIGHT') }
  }, [readText, write, settingPrefix])
}

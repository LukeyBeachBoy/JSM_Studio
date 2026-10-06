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
}

const keyFor = (name: 'TOUCHPAD_AREA' | 'TOUCHPAD_AREA_FIT', scope: MouseAreaScope) => (scope ? `${scope}_${name}` : name)

export function useMouseAreaConfig({ readText, setConfigText }: Args): Record<MouseAreaScope, MouseAreaSettings> {
  const write = useCallback((key: string, value: string | null) => {
    setConfigText?.(previous => (value ? updateKeymapEntry(previous, key, [value]) : removeKeymapEntry(previous, key)))
  }, [setConfigText])

  // The picker's result names the pad it was opened for, so one listener
  // serves every scope and a result cannot land on the wrong pad.
  useEffect(() => desktopBridge.onMouseAreaPicked(result => {
    if (!result.area) return
    const scope = (result.pad === 'LEFT' || result.pad === 'RIGHT' ? result.pad : '') as MouseAreaScope
    write(keyFor('TOUCHPAD_AREA', scope), formatMouseArea(result.area))
  }), [write])

  return useMemo(() => {
    const scopeSettings = (scope: MouseAreaScope): MouseAreaSettings => {
      const area = parseMouseArea(getKeymapValue(readText, keyFor('TOUCHPAD_AREA', scope)))
      const fitRaw = getKeymapValue(readText, keyFor('TOUCHPAD_AREA_FIT', scope))
      return {
        area,
        fit: normalizeMouseAreaFit(fitRaw),
        fitSet: Boolean(fitRaw?.trim()),
        setArea: next => write(keyFor('TOUCHPAD_AREA', scope), next ? formatMouseArea(next) : null),
        // STRETCH is the mapper's default, so choosing it removes the line
        // rather than writing the default out.
        setFit: next => write(keyFor('TOUCHPAD_AREA_FIT', scope), normalizeMouseAreaFit(next) === 'UNIFORM' ? 'UNIFORM' : null),
        pick: padAspect => {
          void desktopBridge.openMouseAreaPicker({
            pad: scope,
            area: area ?? DEFAULT_MOUSE_AREA,
            fit: normalizeMouseAreaFit(fitRaw),
            padAspect,
          })
        },
      }
    }
    return { '': scopeSettings(''), LEFT: scopeSettings('LEFT'), RIGHT: scopeSettings('RIGHT') }
  }, [readText, write])
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { SummaryRow, RowGroup } from './ui/SummaryRow'
import { Menu } from './ui/Menu'
import { Icon } from './icons/Icon'
import { desktopBridge, type GlobalTiming } from '../platform/desktopBridge'
import { patchRuntimePreferences, usePreferences } from '../platform/preferenceStore'
import { showToast } from '../utils/toast'
import { timingLines, timingMilliseconds, type TimingKey } from '../utils/timing'

// Press timing & polling (console refinement 2f, D8): one global store shared
// by every configuration. Changes save as they are made -- there is no Apply
// on a Studio page -- and reach the running mapper at once. Older files that
// still set one of these lines are listed on the right, because their line
// replaces the shared value while they are applied; A moves the value into
// the shared store or removes the line.

// JoyShockMapper's own defaults (main.cpp).
const JSM_DEFAULTS = { holdPressMs: 150, dblPressMs: 150, simPressMs: 50, turboPeriodMs: 80, pollingMs: 3 }

type Values = typeof JSM_DEFAULTS

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`
const perSecond = (periodMs: number) => Math.max(1, Math.round(1000 / Math.max(1, periodMs)))

/** How a file's line reads, in the page's own units: "HOLD_PRESS_TIME = 0.20 s". */
const describeLine = (key: TimingKey, raw: string) => {
  const ms = timingMilliseconds(raw)
  if (ms === null) return `${key} = ${raw}`
  if (key === 'TICK_TIME') return `${key} = ${ms} ms`
  if (key === 'TURBO_PERIOD') return `${key} = ${perSecond(ms)} /s`
  if (ms < 10) return `${key} = ${ms} ms`
  return `${key} = ${seconds(ms)}`
}

const FIELD: Record<TimingKey, keyof GlobalTiming> = {
  HOLD_PRESS_TIME: 'holdPressMs', DBL_PRESS_WINDOW: 'dblPressMs', SIM_PRESS_WINDOW: 'simPressMs', TURBO_PERIOD: 'turboPeriodMs', TICK_TIME: 'pollingMs',
}

export type TimingOverride = { profile: string; key: TimingKey; raw: string }

type TimingPageProps = {
  /** Remove these lines from a configuration file (App handles the one being edited). */
  onRemoveLines: (profile: string, keys: TimingKey[]) => Promise<boolean>
  /** Changes when the library does, so the panel rescans. */
  libraryKey: string
}

export function TimingPage({ onRemoveLines, libraryKey }: TimingPageProps) {
  const { runtime } = usePreferences()
  const stored: Values = {
    holdPressMs: runtime?.holdPressMs ?? JSM_DEFAULTS.holdPressMs,
    dblPressMs: runtime?.dblPressMs ?? JSM_DEFAULTS.dblPressMs,
    simPressMs: runtime?.simPressMs ?? JSM_DEFAULTS.simPressMs,
    turboPeriodMs: runtime?.turboPeriodMs ?? JSM_DEFAULTS.turboPeriodMs,
    pollingMs: runtime?.defaultPollingMs ?? JSM_DEFAULTS.pollingMs,
  }
  // What the rows show while a value is being adjusted, before it is saved.
  const [draft, setDraft] = useState<Partial<Values>>({})
  const values: Values = { ...stored, ...draft }

  const save = useCallback(async (change: GlobalTiming, quiet = false) => {
    try {
      const next = await desktopBridge.setGlobalTiming(change)
      patchRuntimePreferences(next)
      if (!quiet) showToast('Saved · applies to every configuration', 'success')
      return true
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
      return false
    } finally {
      setDraft({})
    }
  }, [])

  // A value is saved when adjusting ends (A keeps it, or focus moves on), not
  // on every step: each save rewrites the defaults file and tells the mapper.
  const pending = useRef<GlobalTiming | null>(null)
  const stage = (field: keyof Values, value: number, change: GlobalTiming) => {
    setDraft(previous => ({ ...previous, [field]: value }))
    pending.current = { ...pending.current, ...change }
  }
  const commit = () => {
    const change = pending.current
    pending.current = null
    if (change) void save(change)
  }
  const revert = () => { pending.current = null; setDraft({}) }

  // ---- STILL SET IN A FILE: every library file that sets a timing line.
  const [overrides, setOverrides] = useState<TimingOverride[] | null>(null)
  const scan = useCallback(async () => {
    try {
      const names = await desktopBridge.listLibraryProfiles()
      const found: TimingOverride[] = []
      for (const name of names) {
        const profile = await desktopBridge.loadLibraryProfile(name)
        if (!profile) continue
        for (const line of timingLines(profile.content)) found.push({ profile: name, ...line })
      }
      setOverrides(found)
    } catch {
      setOverrides([])
    }
  }, [])
  useEffect(() => { void scan() }, [scan, libraryKey])

  const removeLine = async (item: TimingOverride, moveToShared: boolean) => {
    if (moveToShared) {
      const ms = timingMilliseconds(item.raw)
      if (ms === null || !await save({ [FIELD[item.key]]: ms }, true)) return
    }
    if (await onRemoveLines(item.profile, [item.key])) {
      showToast(moveToShared ? `Moved ${item.key} from ${item.profile} to the shared value` : `Removed ${item.key} from ${item.profile}`, 'success')
      void scan()
    }
  }

  const row = (props: { label: string; hint: string; field: keyof Values; shown: string; min: number; max: number; step: number; toMs?: (value: number) => number; fromMs?: (ms: number) => number }) => {
    const toMs = props.toMs ?? ((value: number) => value)
    const fromMs = props.fromMs ?? ((ms: number) => ms)
    const apiField: keyof GlobalTiming = props.field
    return (
      <SummaryRow size="settings" label={props.label} hint={props.hint} value={props.shown} mono defaultLabel="JSM default"
        onUseDefault={values[props.field] === JSM_DEFAULTS[props.field] ? undefined : () => void save({ [apiField]: JSM_DEFAULTS[props.field] })}
        adjust={{
          kind: 'number',
          value: fromMs(values[props.field]),
          min: props.min, max: props.max, step: props.step,
          onChange: value => stage(props.field, toMs(value), { [apiField]: toMs(value) }),
          onRevert: () => revert(),
          onCommit: () => commit(),
        }} />
    )
  }

  const byProfile = (overrides ?? []).reduce<Record<string, TimingOverride[]>>((groups, item) => {
    (groups[item.profile] ??= []).push(item)
    return groups
  }, {})

  return (
    <div className="timing-page">
      <div className="timing-page__rows" data-nav-region="timing">
        <RowGroup title="Press timing">
          {row({ label: 'Hold time', hint: 'How long a press counts as a hold', field: 'holdPressMs', shown: seconds(values.holdPressMs), min: 0.05, max: 1, step: 0.01, toMs: v => Math.round(v * 1000), fromMs: ms => ms / 1000 })}
          {row({ label: 'Double-press window', hint: 'Second press must land within', field: 'dblPressMs', shown: seconds(values.dblPressMs), min: 0.05, max: 1, step: 0.01, toMs: v => Math.round(v * 1000), fromMs: ms => ms / 1000 })}
          {row({ label: 'Simultaneous-press window', hint: 'Chords must start within', field: 'simPressMs', shown: seconds(values.simPressMs), min: 0.01, max: 0.5, step: 0.01, toMs: v => Math.round(v * 1000), fromMs: ms => ms / 1000 })}
          {row({ label: 'Turbo rate', hint: 'Repeats per second while held', field: 'turboPeriodMs', shown: `${perSecond(values.turboPeriodMs)} /s`, min: 1, max: 60, step: 1, toMs: v => Math.round(1000 / Math.max(1, v)), fromMs: ms => perSecond(ms) })}
        </RowGroup>
        <RowGroup title="Polling">
          {row({ label: 'Polling interval', hint: 'How often JSM reads the controller', field: 'pollingMs', shown: `${values.pollingMs} ms · ${perSecond(values.pollingMs)} Hz`, min: 1, max: 20, step: 1 })}
        </RowGroup>
      </div>

      <aside className="timing-page__files" aria-label="Still set in a file" data-nav-region="files">
        <span className="eyebrow">Still set in a file</span>
        {overrides === null
          ? <p className="timing-page__note">Checking your configurations…</p>
          : overrides.length === 0
            ? <p className="timing-page__note">Every configuration uses these values.</p>
            : <>
                {Object.entries(byProfile).flatMap(([profile, items]) => items.map(item => (
                  <Menu key={`${profile}:${item.key}`} ariaLabel={`${profile}.txt · ${item.key}`} width={300}
                    items={[
                      { label: 'Move to shared', description: 'Use this value everywhere and remove the line', icon: <Icon name="apply" size={18} />, onSelect: () => void removeLine(item, true) },
                      { label: 'Remove from file', description: 'Keep the shared value', icon: <Icon name="remove" size={18} />, onSelect: () => void removeLine(item, false) },
                    ]}
                    trigger={
                      <button type="button" className="summary-row timing-file" data-size="sheet" data-hints="A:Choose;B:Home">
                        <span className="summary-row__text">
                          <span className="summary-row__label">{profile}.txt</span>
                          <span className="summary-row__hint timing-file__line">{describeLine(item.key, item.raw)}</span>
                        </span>
                        <span className="summary-row__chevron" aria-hidden="true"><Icon name="chevronRight" size={18} /></span>
                      </button>
                    } />
                )))}
                <p className="timing-page__note">These files set their own value, which replaces the shared one while they’re applied. A removes the line from the file.</p>
              </>}
      </aside>
    </div>
  )
}

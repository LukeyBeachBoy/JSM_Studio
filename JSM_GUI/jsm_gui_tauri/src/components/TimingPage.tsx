import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { desktopBridge, type GlobalTiming } from '../platform/desktopBridge'
import { patchRuntimePreferences, usePreferences } from '../platform/preferenceStore'
import { showToast } from '../utils/toast'
import { timingLines, timingMilliseconds, type TimingKey } from '../utils/timing'
import { getPressedControllerCommandSet } from '../utils/controllerStatus'
import type { TelemetrySample } from '../hooks/useTelemetry'
import { ModeCards, OpenRow, SubPage, ValueRow } from './ui/console'
import { SettingsColumns, SettingsNote, SettingsSection } from './settings/SettingsKit'
import { ButtonGlyph } from './glyphs/ButtonGlyph'
import { useShell } from '../shell/ShellContext'
import styles from './settings/Settings.module.css'

// Settings ▸ Press timing (console v2, SettingsPressTiming.dc.html and
// SettingsTimingAdvanced): how long a hold is, how quick a double-tap is.
// Shared by every configuration and saved as it changes; it reaches the
// running mapper at once. Presets first (D7), then the rows, each with a test
// on the right: X listens to the controller and counts your tries.

// JoyShockMapper's own defaults (main.cpp).
export const JSM_DEFAULTS = { holdPressMs: 150, dblPressMs: 150, simPressMs: 50, turboPeriodMs: 80, pollingMs: 3 }
type Values = typeof JSM_DEFAULTS

/** D7: hold / double-tap / press-together, in milliseconds. "Custom" when the
 *  numbers match none. Turbo and polling are not part of a preset. */
export const TIMING_PRESETS = [
  { value: 'relaxed', label: 'Relaxed', caption: 'More time · hold 0.25 s', hold: 250, dbl: 250, sim: 60 },
  { value: 'default', label: 'Default', caption: 'JoyShockMapper’s own · hold 0.15 s', hold: 150, dbl: 150, sim: 50 },
  { value: 'quick', label: 'Quick', caption: 'For fast hands · hold 0.12 s', hold: 120, dbl: 120, sim: 40 },
] as const

export const presetOf = (values: Pick<Values, 'holdPressMs' | 'dblPressMs' | 'simPressMs'>) =>
  TIMING_PRESETS.find(preset => preset.hold === values.holdPressMs && preset.dbl === values.dblPressMs && preset.sim === values.simPressMs)?.value ?? 'custom'

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`
const perSecond = (periodMs: number) => Math.max(1, Math.round(1000 / Math.max(1, periodMs)))

/** How a file's line reads, in the page's own units: "Hold time 0.20 s". */
const NAMES: Record<TimingKey, string> = { HOLD_PRESS_TIME: 'Hold time', DBL_PRESS_WINDOW: 'Double-tap window', SIM_PRESS_WINDOW: 'Press-together window', TURBO_PERIOD: 'Turbo rate', TICK_TIME: 'Polling' }
const describeLine = (key: TimingKey, raw: string) => {
  const ms = timingMilliseconds(raw)
  if (ms === null) return `${NAMES[key]} ${raw}`
  if (key === 'TICK_TIME') return `${NAMES[key]} ${ms} ms · ${perSecond(ms)} Hz`
  if (key === 'TURBO_PERIOD') return `${NAMES[key]} ${perSecond(ms)} /s`
  return `${NAMES[key]} ${seconds(ms)}`
}

const FIELD: Record<TimingKey, keyof GlobalTiming> = {
  HOLD_PRESS_TIME: 'holdPressMs', DBL_PRESS_WINDOW: 'dblPressMs', SIM_PRESS_WINDOW: 'simPressMs', TURBO_PERIOD: 'turboPeriodMs', TICK_TIME: 'pollingMs',
}

export type TimingOverride = { profile: string; key: TimingKey; raw: string }

type TestKind = 'hold' | 'double' | 'together' | 'turbo' | 'polling'
type Attempt = { at: number; ok: boolean; text: string }

const TESTS: Record<TestKind, { title: string; ask: string; window: string }> = {
  hold: { title: 'Hold A', ask: 'Hold A, then let go', window: 'Longer than the hold time counts as a hold.' },
  double: { title: 'Tap A twice', ask: 'Tap A twice now', window: 'Shaded is the window. Tap again inside it.' },
  together: { title: 'Press A + B', ask: 'Press A and B together', window: 'Both inside the window count as together.' },
  turbo: { title: 'Hold for turbo', ask: 'Hold A for turbo', window: 'Each tick is one repeat while it is held.' },
  polling: { title: 'Polling graph', ask: 'Move a stick', window: 'Each tick is one read of the controller.' },
}

/** The live test (aside): listens to the controller while on, so A and B are
 *  counted instead of moving around the app. */
function TimingTest({ kind, values, listening, attempts, onSuggest }: { kind: TestKind; values: Values; listening: boolean; attempts: Attempt[]; onSuggest?: string }) {
  const { family } = useShell()
  const test = TESTS[kind]
  const counted = attempts.filter(attempt => attempt.ok).length
  const windowMs = kind === 'hold' ? values.holdPressMs : kind === 'double' ? values.dblPressMs : kind === 'together' ? values.simPressMs : kind === 'turbo' ? values.turboPeriodMs : values.pollingMs
  const scale = kind === 'polling' ? 40 : Math.max(400, windowMs * 2.2)
  const last = attempts[attempts.length - 1]
  return (
    <div className={styles.panel} data-timing-test={kind}>
      <h3 className={styles.panelTitle}>{test.ask}</h3>
      <span className={styles.panelNote}>{listening ? '● listening · B stops' : 'X starts listening'}</span>
      <svg viewBox="0 0 320 70" role="img" aria-label={`${test.title}: the window is ${kind === 'polling' ? `${windowMs} ms` : seconds(windowMs)}`}>
        <rect x="10" y="22" width="300" height="26" rx="6" fill="var(--surface-sunken)" />
        {kind === 'polling'
          ? Array.from({ length: Math.floor(300 / (300 * windowMs / scale)) + 1 }, (_, i) => <rect key={i} x={10 + i * (300 * windowMs / scale)} y="26" width="2" height="18" fill="var(--telemetry)" />)
          : <rect x={kind === 'hold' ? 10 + 300 * windowMs / scale : 10} y="22" width={kind === 'hold' ? 300 - 300 * windowMs / scale : 300 * windowMs / scale} height="26" rx="6" fill="var(--accent-soft)" stroke="var(--accent)" />}
        {last && kind !== 'polling' && <rect x={Math.min(306, 10 + 300 * Number(last.text.match(/\d+/)?.[0] ?? 0) / scale)} y="16" width="4" height="38" rx="2" fill={last.ok ? 'var(--ok)' : 'var(--warn)'} />}
        <text x="10" y="66" fill="var(--text-3)" fontSize="11">0</text>
        <text x="310" y="66" fill="var(--text-3)" fontSize="11" textAnchor="end">{kind === 'polling' ? `${scale} ms` : seconds(scale)}</text>
      </svg>
      <p className={styles.panelNote}>{test.window}</p>
      <div className={styles.list} aria-live="polite">
        {attempts.slice(-4).map(attempt => <span key={attempt.at} className={styles.cardSub}>{attempt.ok ? '✓' : '·'} {attempt.text}</span>)}
      </div>
      {attempts.length > 0 && <p className={styles.panelNote}><b>{counted} of {attempts.length} counted.</b>{onSuggest ? ` Missing a lot? ${onSuggest}` : ''}</p>}
      <div className={styles.sectionAction} style={{ marginLeft: 0 }}><ButtonGlyph button="X" size={20} family={family} />{listening ? 'Stop listening' : 'Try it'}</div>
    </div>
  )
}

type TimingPageProps = {
  /** Remove these lines from a configuration file (App handles the one being edited). */
  onRemoveLines: (profile: string, keys: TimingKey[]) => Promise<boolean>
  /** Changes when the library does, so the Advanced list rescans. */
  libraryKey: string
  /** The configuration being edited, for "Wardogs' own timing". */
  configName?: string | null
  /** Opens that configuration's own timing (Buttons ▸ Configuration timing). */
  onOpenConfigurationTiming?: () => void
}

export function TimingPage({ onRemoveLines, libraryKey, configName, onOpenConfigurationTiming }: TimingPageProps) {
  const { runtime } = usePreferences()
  const stored: Values = {
    holdPressMs: runtime?.holdPressMs ?? JSM_DEFAULTS.holdPressMs,
    dblPressMs: runtime?.dblPressMs ?? JSM_DEFAULTS.dblPressMs,
    simPressMs: runtime?.simPressMs ?? JSM_DEFAULTS.simPressMs,
    turboPeriodMs: runtime?.turboPeriodMs ?? JSM_DEFAULTS.turboPeriodMs,
    pollingMs: runtime?.defaultPollingMs ?? JSM_DEFAULTS.pollingMs,
  }
  const [draft, setDraft] = useState<Partial<Values>>({})
  const values: Values = { ...stored, ...draft }
  const [focused, setFocused] = useState<TestKind>('double')
  const [listening, setListening] = useState(false)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [advanced, setAdvanced] = useState(false)

  // Writes are queued and the last one wins: ◂ ▸ fire per step.
  const saveTimer = useRef<number | null>(null)
  const pending = useRef<GlobalTiming>({})
  const save = useCallback(async (change: GlobalTiming) => {
    try {
      const next = await desktopBridge.setGlobalTiming(change)
      patchRuntimePreferences(next)
      return true
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
      return false
    } finally {
      setDraft({})
    }
  }, [])
  const set = (patch: Partial<Values>) => {
    const next = { ...values, ...patch }
    // A hold has to last longer than the press-together window, or holds never start.
    if (next.holdPressMs <= next.simPressMs) {
      showToast(`Hold time has to be longer than the press-together window (${seconds(next.simPressMs)}). Not saved.`, 'error')
      return
    }
    setDraft(previous => ({ ...previous, ...patch }))
    pending.current = { ...pending.current, ...patch }
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      const change = pending.current
      pending.current = {}
      void save(change)
    }, 350)
  }
  useEffect(() => () => { if (saveTimer.current !== null) { window.clearTimeout(saveTimer.current); void desktopBridge.setGlobalTiming(pending.current).then(patchRuntimePreferences).catch(() => {}) } }, [])

  // ---- The test: while listening, navigation pauses and A / B presses are timed.
  const latest = useRef({ values, focused })
  latest.current = { values, focused }
  useEffect(() => {
    if (!listening) return
    document.body.dataset.padListening = 'true'
    document.body.dataset.padListeningMessage = 'Listening: press A (and B for together) · X or Esc stops'
    window.dispatchEvent(new Event('jsm:interaction-hint'))
    const stop = () => setListening(false)
    const timer = window.setTimeout(stop, 20_000)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' || event.key === 'x' || event.key === 'X') { event.preventDefault(); event.stopPropagation(); stop() } }
    window.addEventListener('keydown', onKey, true)
    let down: Record<string, number> = {}
    let lastTap = 0
    let ready = false
    const record = (attempt: Omit<Attempt, 'at'>) => setAttempts(list => [...list.slice(-11), { ...attempt, at: performance.now() + Math.random() }])
    const unsubscribe = desktopBridge.onTelemetrySample(payload => {
      const sample = payload as TelemetrySample
      // Only A, B and X count: a thumb resting on a trackpad is not a press.
      const pressed = new Set<string>([...getPressedControllerCommandSet(sample?.devices?.[0])].filter(command => command === 'S' || command === 'E' || command === 'W'))
      const now = performance.now()
      if (!ready) { if (pressed.size === 0) ready = true; return }
      const { values: v, focused: kind } = latest.current
      if (pressed.has('W')) { stop(); return }
      if (pressed.has('E') && !pressed.has('S') && kind !== 'together') { stop(); return }
      for (const button of ['S', 'E']) {
        if (pressed.has(button) && down[button] === undefined) {
          down[button] = now
          if (button === 'S' && kind === 'double') {
            const gap = lastTap ? now - lastTap : Infinity
            if (lastTap && gap < 1500) record({ ok: gap <= v.dblPressMs, text: `${Math.round(gap)} ms between taps` })
            lastTap = gap < 1500 && lastTap ? 0 : now
          }
          if (kind === 'together' && down.S !== undefined && down.E !== undefined) {
            const gap = Math.abs(down.S - down.E)
            record({ ok: gap <= v.simPressMs, text: `${Math.round(gap)} ms apart` })
          }
        }
        if (!pressed.has(button) && down[button] !== undefined) {
          const held = now - down[button]
          if (button === 'S' && kind === 'hold') record({ ok: held > v.holdPressMs, text: `${Math.round(held)} ms held · ${held > v.holdPressMs ? 'a hold' : 'a tap'}` })
          if (button === 'S' && kind === 'turbo') record({ ok: held > v.holdPressMs, text: `${Math.round(held)} ms held · ${Math.max(0, Math.floor((held - v.holdPressMs) / v.turboPeriodMs))} repeats` })
          delete down[button]
          if (Object.keys(down).length === 0 && kind === 'together') down = {}
        }
      }
    })
    return () => {
      delete document.body.dataset.padListening
      delete document.body.dataset.padListeningMessage
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey, true)
      unsubscribe()
      window.dispatchEvent(new Event('jsm:interaction-hint'))
    }
  }, [listening])
  const tryIt = (kind: TestKind) => ({ label: listening && focused === kind ? 'Stop listening' : 'Try it', run: () => { setFocused(kind); setAttempts([]); setListening(value => !(value && focused === kind)) } })
  const suggestion = (() => {
    const tries = attempts.length, missed = attempts.filter(attempt => !attempt.ok).length
    if (tries < 3 || missed * 2 < tries) return undefined
    if (focused === 'double') return `Try ${seconds(Math.min(1000, values.dblPressMs + 50))}.`
    if (focused === 'together') return `Try ${seconds(Math.min(500, values.simPressMs + 20))}.`
    if (focused === 'hold') return `Try ${seconds(Math.max(values.simPressMs + 10, values.holdPressMs - 30))}.`
    return undefined
  })()

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
      if (ms === null || !await save({ [FIELD[item.key]]: ms })) return
    }
    if (await onRemoveLines(item.profile, [item.key])) {
      showToast(moveToShared ? `${NAMES[item.key]} from ${item.profile} is now the shared value` : `Removed ${NAMES[item.key]} from ${item.profile}`, 'success')
      void scan()
    }
  }

  const preset = presetOf(values)
  const usePreset = (value: string) => {
    const chosen = TIMING_PRESETS.find(item => item.value === value)
    if (!chosen) return
    setDraft(previous => ({ ...previous, holdPressMs: chosen.hold, dblPressMs: chosen.dbl, simPressMs: chosen.sim }))
    void save({ holdPressMs: chosen.hold, dblPressMs: chosen.dbl, simPressMs: chosen.sim })
  }
  const row = (kind: TestKind, node: () => ReactNode) => <div onFocus={() => { if (!listening) setFocused(kind) }}>{node()}</div>

  return (
    <SettingsColumns asideLabel="Every row has a test" main={<>
      <ModeCards columns={3} value={preset} onChange={usePreset} label={undefined}
        options={TIMING_PRESETS.map(item => ({ value: item.value, label: item.label, caption: item.caption }))}
        more={preset === 'custom' ? { label: 'Custom', caption: `Hold ${seconds(values.holdPressMs)} · your own numbers`, current: true, onOpen: () => document.querySelector<HTMLElement>('[data-timing-row="hold"]')?.focus() } : undefined} />
      <div className={styles.sectionBody} data-nav-region="timing">
        {row('hold', () => <ValueRow label="Hold time" hint="Longer than this and a press is a hold" setting="HOLD_PRESS_TIME" global value={values.holdPressMs / 1000} min={0.05} max={1} step={0.01} fineStep={0.005}
          format={value => `${value.toFixed(2)} s`} onChange={value => set({ holdPressMs: Math.round(value * 1000) })} onReset={() => set({ holdPressMs: JSM_DEFAULTS.holdPressMs })} onX={tryIt('hold')} data={{ 'data-timing-row': 'hold' }} />)}
        {row('double', () => <ValueRow label="Double-tap window" hint="The second tap has to land within this" setting="DBL_PRESS_WINDOW" global value={values.dblPressMs / 1000} min={0.05} max={1} step={0.01} fineStep={0.005}
          format={value => `${value.toFixed(2)} s`} onChange={value => set({ dblPressMs: Math.round(value * 1000) })} onReset={() => set({ dblPressMs: JSM_DEFAULTS.dblPressMs })} onX={tryIt('double')} data={{ 'data-timing-row': 'double' }} />)}
        {row('together', () => <ValueRow label="Press-together window" hint="Buttons this close count as together" setting="SIM_PRESS_WINDOW" global value={values.simPressMs / 1000} min={0.01} max={0.5} step={0.01} fineStep={0.005}
          format={value => `${value.toFixed(2)} s`} onChange={value => set({ simPressMs: Math.round(value * 1000) })} onReset={() => set({ simPressMs: JSM_DEFAULTS.simPressMs })} onX={tryIt('together')} data={{ 'data-timing-row': 'together' }} />)}
        {row('turbo', () => <ValueRow label="Turbo rate" hint="Repeats while a turbo button is held" setting="TURBO_PERIOD" global value={perSecond(values.turboPeriodMs)} min={1} max={60} step={1}
          format={value => `${value} /s`} onChange={value => set({ turboPeriodMs: Math.round(1000 / Math.max(1, value)) })} onReset={() => set({ turboPeriodMs: JSM_DEFAULTS.turboPeriodMs })} onX={tryIt('turbo')} data={{ 'data-timing-row': 'turbo' }} />)}
        {row('polling', () => <ValueRow label="Controller polling" hint={`How often every controller is read · ${perSecond(values.pollingMs)} Hz`} setting="TICK_TIME" global value={values.pollingMs} min={1} max={20} step={1}
          format={value => `${value} ms`} onChange={value => set({ pollingMs: value })} onReset={() => set({ pollingMs: JSM_DEFAULTS.pollingMs })} onX={tryIt('polling')} data={{ 'data-timing-row': 'polling' }} />)}
        <OpenRow label="Advanced" hint="Per configuration, or while a button is held" value={overrides?.length ? `${overrides.length} set in a file` : 'All use these'} onOpen={() => setAdvanced(true)} />
      </div>

      <SubPage open={advanced} onClose={() => setAdvanced(false)} crumbRoot="Settings" trail={['Press timing']} title="Advanced" backLabel="Back to Press timing">
        <div className={styles.mainColumn} style={{ maxWidth: 980 }}>
          <SettingsSection title={configName ? `${configName}’s own timing` : 'A configuration’s own timing'} note="Rows on Shared follow Press timing. Change one and only that configuration uses it.">
            <OpenRow label="Hold time, double-tap, press-together, turbo and polling" hint="And what changes while a button is held · on the configuration's Buttons tab"
              value={configName ?? 'Choose a configuration'} onOpen={() => { setAdvanced(false); onOpenConfigurationTiming?.() }}
              disabled={configName ? undefined : 'Open a configuration first'} hints="A:Open;B:Back" />
          </SettingsSection>
          <SettingsSection title="Still set in a file" note="These files set their own value. It replaces the shared one while they’re live.">
            {overrides === null
              ? <SettingsNote>Checking your configurations…</SettingsNote>
              : overrides.length === 0
                ? <SettingsNote>Every configuration uses the shared values.</SettingsNote>
                : overrides.map(item => (
                  <div key={`${item.profile}:${item.key}`} className={styles.card} data-hints="A:Make it shared;X:Remove it;B:Back" data-timing-file={item.profile}
                    tabIndex={0} role="group" aria-label={`${item.profile} · ${describeLine(item.key, item.raw)}`}
                    onKeyDown={event => {
                      if (event.target !== event.currentTarget) return
                      if (event.key === 'Enter') { event.preventDefault(); void removeLine(item, true) }
                      if (event.key === 'x' || event.key === 'X') { event.preventDefault(); void removeLine(item, false) }
                    }}>
                    <span className={styles.cardText}><b className={styles.cardTitle}>{item.profile}</b><span className={`${styles.cardSub} timing-file__line`}>{describeLine(item.key, item.raw)}</span></span>
                    <button type="button" className="button button--secondary button--sm" tabIndex={-1} onClick={() => void removeLine(item, true)}>Make it shared</button>
                    <button type="button" className="button button--ghost button--sm" tabIndex={-1} onClick={() => void removeLine(item, false)}>Remove it</button>
                  </div>
                ))}
          </SettingsSection>
        </div>
      </SubPage>
    </>} aside={<>
      <TimingTest kind={focused} values={values} listening={listening} attempts={attempts} onSuggest={suggestion} />
      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>Every row has a test</h3>
        <div className={styles.list}>{(Object.keys(TESTS) as TestKind[]).map(kind => <span key={kind} className={styles.cardSub} data-current={kind === focused ? 'true' : undefined}>{kind === focused ? '▸ ' : ''}{TESTS[kind].title}</span>)}</div>
        <p className={styles.panelNote}>Shared by every configuration, saved as you change it.</p>
      </div>
    </>} />
  )
}

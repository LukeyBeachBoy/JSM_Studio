import { createContext, useContext, useEffect, useRef, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { readVirtualSetting, writeVirtualSetting } from '../../utils/virtualStickSettings'
import type { TelemetrySample } from '../../hooks/useTelemetry'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'
import { ValueRow, SegmentedRow, SwitchRow, type Segment } from '../ui/console'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import styles from './Gyro.module.css'

// What every console v2 Gyro screen reads and writes (design/console-v2,
// Gyro*.dc.html). The base screens read the configuration as the page sees it;
// a "While holding…" variant reads the configuration projected onto that held
// input (utils/modeshift projectModeshift) and its writes fold back into the
// chord, so the same screens edit both.

/** A controller as telemetry lists it (for Use gyro from…). */
export type GyroDevice = { handle: number; type: number; split?: number; vid?: number; pid?: number }

/** Settings the mapper applies to the whole configuration: never written as a held chord. */
export const GYRO_GLOBAL_KEYS = new Set([
  'VIRTUAL_CONTROLLER', 'ONE_EURO_FILTER', 'AUTO_CALIBRATE_GYRO', 'GYRO_CALIBRATION_DELAY', 'GYRO_CALIBRATION_TIME',
  'TICK_TIME', 'IGNORE_GYRO_DEVICES', 'COUNTER_OS_MOUSE_SPEED', 'IGNORE_OS_MOUSE_SPEED', 'REAL_WORLD_CALIBRATION', 'IN_GAME_SENS', 'ACCEL_CURVE_LINK',
])

export type GyroCallbacks = {
  onOpenCalibration?: () => void
  onRecalibrate?: () => void
  onTryIt?: () => void
  onCounterOsMouseSpeedChange: (enabled: boolean) => void
  counterOsMouseSpeed: boolean
  ignoredDevices?: string[]
  onToggleIgnoreDevice?: (vid: number, pid: number, ignore: boolean) => void
  /** Settings ▸ Controller (firmware re-centring). */
  onOpenControllerSettings?: () => void
  gridCommands?: string[]
}

export type GyroEnv = {
  /** What the rows read: the configuration, or its projection onto `held`. */
  text: string
  setText: Dispatch<SetStateAction<string>>
  /** The configuration itself, for settings that are never held. */
  rootText: string
  setRootText: Dispatch<SetStateAction<string>>
  /** The held input when this is a "While holding…" variant. */
  held: string | null
  /** Keys set by this file, mode or held variant (the rail's "Changed:"). */
  ownKeys: ReadonlySet<string>
  /** Why nothing can change right now (calibrating). */
  locked?: string
  family: ControllerVisualFamily
  sample: TelemetrySample | null
  devices?: GyroDevice[]
  callbacks: GyroCallbacks
}

const GyroEnvContext = createContext<GyroEnv | null>(null)
export const GyroEnvProvider = GyroEnvContext.Provider

export function useGyro() {
  const env = useContext(GyroEnvContext)
  if (!env) throw new Error('useGyro outside a GyroEnvProvider')
  const global = (key: string) => GYRO_GLOBAL_KEYS.has(key)
  const get = (key: string) => readVirtualSetting(global(key) ? env.rootText : env.text, key)
  const num = (key: string, fallback: number) => {
    const raw = get(key)
    const value = raw === undefined ? NaN : Number(raw.trim().split(/\s+/)[0])
    return Number.isFinite(value) ? value : fallback
  }
  /** '' removes the line, so the value is the default (or the base's) again. */
  const set = (key: string, value: string | number) => {
    const target = global(key) ? env.setRootText : env.setText
    target(previous => writeVirtualSetting(previous, key, value))
  }
  const changed = (...keys: string[]) => keys.some(key => env.ownKeys.has(key))
  return { ...env, get, num, set, reset: (key: string) => set(key, ''), changed }
}

// ---- Rows wired to one key.

type NumberRowProps = {
  k: string
  label: ReactNode
  hint?: ReactNode
  caption?: ReactNode
  fallback: number
  min: number
  max: number
  step: number
  fineStep?: number
  /** The stored value is shown multiplied by this (0-1 shown as %). */
  factor?: number
  format?: (shown: number) => string
  hero?: boolean
  disabled?: string
  onX?: { label: string; run: () => void }
  /** Writes something other than the plain value. */
  write?: (stored: number) => void
}

/** A number setting: ◂ ▸ changes it, A types it, Y goes back to the default. */
export function KeyNumberRow({ k, label, hint, caption, fallback, min, max, step, fineStep, factor = 1, format, hero, disabled, onX, write }: NumberRowProps) {
  const gyro = useGyro()
  const stored = gyro.num(k, fallback)
  const shown = Number((stored * factor).toFixed(6))
  return <ValueRow setting={GYRO_GLOBAL_KEYS.has(k) || !gyro.held ? k : undefined} label={label} hint={hint} caption={caption} hero={hero} onX={onX}
    value={shown} min={min * factor} max={max * factor} step={step * factor} fineStep={fineStep !== undefined ? fineStep * factor : undefined}
    format={format} disabled={disabled ?? gyro.locked} data={{ 'data-setting': k }}
    onChange={next => { const value = Number((next / factor).toFixed(6)); if (write) write(value); else gyro.set(k, value) }}
    onReset={gyro.get(k) !== undefined ? () => gyro.reset(k) : undefined} />
}

/** A few named values of one key, all visible. */
export function KeyChoiceRow({ k, label, hint, options, fallback, disabled, onX, write }: {
  k: string; label: ReactNode; hint?: ReactNode; options: Segment[]; fallback: string; disabled?: string
  onX?: { label: string; run: () => void }; write?: (value: string) => void
}) {
  const gyro = useGyro()
  const value = (gyro.get(k) ?? fallback).trim().toUpperCase()
  return <SegmentedRow setting={GYRO_GLOBAL_KEYS.has(k) || !gyro.held ? k : undefined} label={label} hint={hint} options={options} value={value}
    disabled={disabled ?? gyro.locked} onX={onX} data={{ 'data-setting': k }}
    onChange={next => (write ? write(next) : gyro.set(k, next))}
    onReset={gyro.get(k) !== undefined ? () => gyro.reset(k) : undefined} />
}

/** The kit's switch row (ui/console Rows): the whole row is the switch; A, ◂ or ▸ flip it; Y goes back to the default. */
export { SwitchRow }

/** A switch over an ON / OFF key. */
export function KeySwitchRow({ k, label, hint, fallback = false, disabled, onValue = 'ON', offValue }: {
  k: string; label: ReactNode; hint?: ReactNode; fallback?: boolean; disabled?: string; onValue?: string; offValue?: string
}) {
  const gyro = useGyro()
  const raw = gyro.get(k)
  const on = raw === undefined ? fallback : raw.trim().toUpperCase() === onValue
  return <SwitchRow setting={k} label={label} hint={hint} on={on} disabled={disabled ?? gyro.locked}
    onChange={next => gyro.set(k, next ? onValue : offValue ?? 'OFF')}
    onReset={raw !== undefined ? () => gyro.reset(k) : undefined} />
}

/**
 * A screen's own X / Y when no row claimed them: X "Try it" (Test mode with
 * the configuration as it is now), and whatever else the screen passes.
 */
export function PadActions({ x, y, children, className }: { x?: () => void; y?: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef({ x, y })
  latest.current = { x, y }
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const onPad = (event: Event) => {
      if (event.defaultPrevented) return
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      const run = button === 'X' ? latest.current.x : button === 'Y' ? latest.current.y : undefined
      if (!run) return
      event.preventDefault()
      run()
    }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [])
  return <div ref={ref} className={className}>{children}</div>
}

/** "● live 19 °/s" beside a visual's title. */
export function LiveTag({ children }: { children?: ReactNode }) {
  return <span className={styles.live}><i aria-hidden="true" />live{children !== undefined && <> · {children}</>}</span>
}

/** A visual's title row. */
export function VisualTitle({ title, live }: { title: ReactNode; live?: ReactNode | true }) {
  return <header className={styles.visualTitle}><b>{title}</b>{live !== undefined && <LiveTag>{live === true ? undefined : live}</LiveTag>}</header>
}

/** A small label over a group of rows ("SENDS", "TURN USING"). */
export function RowLabel({ children }: { children: ReactNode }) {
  return <div className={styles.rowLabel}>{children}</div>
}

/** A note under rows, in the caption's colour. */
export function Note({ children, tone }: { children: ReactNode; tone?: 'warn' }) {
  return <p className={styles.note} data-tone={tone} role={tone === 'warn' ? 'status' : undefined}>{children}</p>
}

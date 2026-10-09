import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopBridge, type RunningGame, type SteamGame } from '../../platform/desktopBridge'
import type { TelemetryDevice } from '../../hooks/useTelemetry'
import { SubPage } from '../ui/console'
import { Sheet } from '../ui/Sheet'
import { Icon } from '../icons/Icon'
import { InputGlyph } from '../glyphs/InputGlyph'
import { ButtonGlyph } from '../glyphs/ButtonGlyph'
import { ControllerStatusSvg } from '../ControllerStatusSvg'
import { Switch } from '../AssociationsPage'
import { suggestedName, type NewConfigurationDraft } from '../ConfigurationDialog'
import { requestValueEntry } from '../../nav/textEntry'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import { processStemOf, exeFileName } from '../../hooks/useAppIcon'
import { describeBinding } from '../../utils/bindingDescription'
import { inputDefinitions } from '../../utils/layers'
import { controllerSupportsInput, controllerVisualFamily, getPressedControllerCommandSet, type ControllerVisualFamily } from '../../utils/controllerStatus'
import { presetChoices, recommendedPreset, SHIPPED_BASES, type BuiltinBase, type ControllerCaps, type PresetChoice } from '../../utils/presetBases'
import { newGameText, type GameMeta } from '../../utils/libraryGraph'
import { playedAgo, steamArt, steamAppFor } from '../library/gameArt'
import { showToast } from '../../utils/toast'
import styles from './NewConfiguration.module.css'

// New configuration (console v2: NewConfigGame, NewConfig, NewConfigTry): an
// app-level, full-window flow, so it opens the moment it is asked for (Home's
// "New for a game", the Library's New cover, jsm:new-configuration) even on a
// cold start before the Library's code has loaded.
//
//   1 Game         running games first, then recent Steam games, or an .exe,
//                  or no game. Its name and art come along; Y renames, X turns
//                  Launch with game on (off: it only wears the game's art).
//   2 How you play one card per play style, built on the shipped preset bases
//                  (the variant for the connected controller); "Start from…"
//                  for another configuration, a Steam layout, a file or blank.
//   3 Try it       Test mode with the draft: press anything and see what was
//                  sent. Hold A to keep it, X to change something, B to go
//                  back; a tap is tested like any other button. Nothing is
//                  saved until Keep it; Back puts the live configuration back.

export type NewGame = {
  kind: 'running' | 'steam' | 'exe' | 'none'
  name: string
  processName?: string
  exePath?: string
  steamAppId?: string
}

type Props = {
  open: boolean
  onClose: () => void
  device?: TelemetryDevice
  family: ControllerVisualFamily
  libraryProfiles: string[]
  /** Studio is testing (the App's Test mode). */
  testing: boolean
  /** Why Test can't run now (no controller, Steam has it…), or null. */
  testReason: string | null
  /** Run the draft in Test mode; resolves false when it couldn't start. */
  onTry: (text: string) => Promise<boolean>
  /** Leave Test mode; `restore` puts the previously live configuration back. */
  onEndTry: (restore: boolean) => Promise<void>
  /** Make the file (and its Launch with game rule); its name, or null. */
  onCreate: (draft: NewConfigurationDraft) => Promise<string | null>
  /** After Keep it: open it on Layout, or listen for a button to change. */
  onFinish: (name: string, next: 'layout' | 'change', text: string) => void
  onImportFromSteam: () => void
  onImportFile: (fileName: string, content: string) => void
  /** Start from another configuration: a copy named for the game. */
  onCopyFrom: (source: string, name: string, game: NewGame) => Promise<void>
  onOpenExisting?: (name: string) => void
}

const HOLD_MS = 900
const CHOOSERS = ['S', 'W', 'E'] as const

const assignmentsOf = (text: string) => {
  const map = new Map<string, string>()
  const labels = new Map<string, string>()
  for (const raw of text.split(/\r?\n/)) {
    const label = /^\s*#\s*@label\s+([^=]+?)\s*=\s*(.+)$/.exec(raw)
    if (label) { labels.set(label[1].trim().toUpperCase(), label[2].trim()); continue }
    const line = raw.replace(/#.*$/, '').trim()
    const match = /^([^=]+?)\s*=\s*(.+)$/.exec(line)
    if (match) map.set(match[1].replace(/\s+/g, '').toUpperCase(), match[2].trim())
  }
  return { map, labels }
}

/** "What you get": the preset's main inputs, from its own text. */
export function whatYouGet(text: string, t: (key: string, fallback?: string) => string): { input: string; text: string }[] {
  const { map, labels } = assignmentsOf(text)
  const rows: { input: string; text: string }[] = []
  const describe = (value: string) => describeBinding(value, t as never)
  const named = (key: string, fallback: string) => labels.get(key) ?? fallback
  if (map.get('LEFT_STICK_MODE') === 'LEFT_STICK') rows.push({ input: 'LEFT_STICK', text: 'Steer · stick' })
  else if (map.get('LUP') && map.get('LLEFT')) rows.push({ input: 'LEFT_STICK', text: `Move · ${[map.get('LUP'), map.get('LLEFT'), map.get('LDOWN'), map.get('LRIGHT')].filter(Boolean).join(' ')}` })
  const gyro = map.get('GYRO_ON')
  if (gyro) rows.push({ input: gyro, text: `${['MISC5', 'MISC6'].includes(gyro) ? 'Hold' : `Hold ${named(gyro, 'it')} ·`} to aim with gyro`.replace('Hold to', 'Hold to') })
  if (map.get('MOTION_STICK_MODE')?.endsWith('STEER_X')) rows.push({ input: 'GY', text: 'Tilt to steer' })
  if (map.get('RIGHT_TOUCHPAD_MODE') === 'MOUSE') rows.push({ input: 'RIGHT_PAD', text: map.get('RIGHT_STICK_MODE') === 'RADIAL_MENU' ? 'Trackpad is the mouse' : 'Trackpad turns · mouse' })
  else if (map.get('TOUCHPAD_MODE') === 'MOUSE') rows.push({ input: 'CAPTURE', text: 'Touchpad turns · mouse' })
  const right = map.get('RIGHT_STICK_MODE')
  if (right === 'RADIAL_MENU') rows.push({ input: 'RIGHT_STICK', text: 'Wheel of hotkeys' })
  else if (right === 'AIM') rows.push({ input: 'RIGHT_STICK', text: map.get('L,RIGHT_STICK_MODE') ? 'Mouse · hold LB for a wheel' : 'Aim · mouse' })
  else if (right === 'RIGHT_STICK') rows.push({ input: 'RIGHT_STICK', text: 'Camera · stick' })
  if (map.get('ZR_MODE') === 'X_RT') rows.push({ input: 'ZR', text: 'Throttle · analog' })
  if (map.get('ZL_MODE') === 'X_LT') rows.push({ input: 'ZL', text: 'Brake · analog' })
  for (const key of ['ZR', 'ZL', 'S', 'E', 'W', 'N']) {
    const value = map.get(key)
    if (!value || rows.some(row => row.input === key)) continue
    rows.push({ input: key, text: `${named(key, describe(value))}${labels.has(key) ? ` · ${describe(value)}` : ''}` })
  }
  return rows.slice(0, 9)
}

/** What the connected controller has, for the preset cards. */
export function capsOf(device?: TelemetryDevice): ControllerCaps {
  const family = controllerVisualFamily(device?.type)
  return {
    family: device ? family : 'steam',
    gyro: !device ? true : family !== 'xbox' && family !== 'generic',
    trackpads: !device ? true : controllerSupportsInput(device, 'MISC2') || family === 'steam',
    grips: !device ? true : controllerSupportsInput(device, 'MISC5'),
  }
}

type LogEntry = { id: number; at: number; input: string; label: string; output: string }

export function NewConfigurationFlow(props: Props) {
  const { open, onClose, device, family, libraryProfiles, testing, testReason, onTry, onEndTry, onCreate, onFinish, onImportFromSteam, onImportFile, onCopyFrom } = props
  const { t } = useTranslation()
  const tt = (key: string, fallback?: string) => t(key, fallback ?? key)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [running, setRunning] = useState<RunningGame[] | null>(null)
  const [recent, setRecent] = useState<SteamGame[] | null>(null)
  const [game, setGame] = useState<NewGame | null>(null)
  const [name, setName] = useState('')
  const [typedName, setTypedName] = useState(false)
  const [launch, setLaunch] = useState(false)
  const [bases, setBases] = useState<BuiltinBase[]>(SHIPPED_BASES)
  const [preset, setPreset] = useState<PresetChoice | null>(null)
  const [focusedPreset, setFocusedPreset] = useState<string | null>(null)
  const [everyOpen, setEveryOpen] = useState(false)
  const [startFromOpen, setStartFromOpen] = useState<null | 'menu' | 'configs'>(null)
  const [busy, setBusy] = useState(false)
  const [tryState, setTryState] = useState<'idle' | 'starting' | 'testing' | 'failed'>('idle')
  const [log, setLog] = useState<LogEntry[]>([])
  const [failReason, setFailReason] = useState<string | null>(null)
  const [hold, setHold] = useState<{ button: string; progress: number } | null>(null)
  const [art, setArt] = useState<Record<string, string | null>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const ending = useRef(false)

  // Fresh each time it opens.
  useEffect(() => {
    if (!open) return
    setStep(1); setGame(null); setName(''); setTypedName(false); setLaunch(false); setPreset(null); setLog([]); setTryState('idle')
    void desktopBridge.listRunningGames().then(list => setRunning(list.slice(0, 6)))
    void desktopBridge.listRecentSteamGames(8).then(list => setRecent(list.slice(0, 8)))
    void desktopBridge.listBuiltinBases().then(list => { if (list.length) setBases(list) })
  }, [open])

  // Header art for every game on screen, once.
  const artFor = useCallback((key: string, find: () => Promise<string | null>) => {
    if (key in art) return art[key]
    setArt(current => key in current ? current : { ...current, [key]: null })
    void find().then(url => setArt(current => ({ ...current, [key]: url })))
    return null
  }, [art])
  const headerArt = (target: NewGame | null) => {
    if (!target) return null
    if (target.steamAppId) return artFor(`app:${target.steamAppId}`, () => steamArt(target.steamAppId!, 'header'))
    if (target.exePath) return artFor(`exe:${target.exePath}`, async () => { const app = await steamAppFor(target.exePath!); return app ? steamArt(app.appId, 'header') : null })
    return null
  }

  const pickGame = (next: NewGame) => {
    setGame(next)
    if (!typedName) setName(next.kind === 'none' ? '' : next.name)
  }
  const fromRunning = (process: RunningGame): NewGame => ({
    kind: 'running', processName: processStemOf(process.processName), exePath: process.exePath, steamAppId: process.steamAppId,
    name: process.name ?? (process.exePath ? suggestedName(process.exePath) : processStemOf(process.processName)),
  })
  const fromSteam = (entry: SteamGame): NewGame => ({ kind: 'steam', name: entry.name, steamAppId: entry.appId })
  useEffect(() => {
    if (!open || game || !running) return
    const first = running.find(process => process.kind !== 'app')
    if (first) pickGame(fromRunning(first))
  // Only the first list picks for you.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, running])

  const browse = async () => {
    const picked = await desktopBridge.pickExecutable().catch(() => null)
    if (!picked) return
    const app = await steamAppFor(picked)
    pickGame({ kind: 'exe', processName: processStemOf(picked), exePath: picked, steamAppId: app?.appId, name: app?.name ?? suggestedName(picked) })
    setStep(2)
  }
  const rename = () => requestValueEntry({
    title: 'Name', eyebrow: 'New configuration', value: name || game?.name || '',
    hint: game?.exePath ? 'From the game’s folder' : 'What the Library calls it', suggestions: game && game.name !== name ? [game.name] : undefined,
    onDone: value => { const trimmed = value.trim(); if (trimmed) { setName(trimmed); setTypedName(true) } },
  })
  const canLaunch = Boolean(game?.processName)
  const requestedName = (name || game?.name || 'New configuration').trim()
  const existingName = libraryProfiles.find(entry => entry.toLowerCase() === requestedName.toLowerCase())
  let availableName = requestedName
  for (let suffix = 2; libraryProfiles.some(entry => entry.toLowerCase() === availableName.toLowerCase()); suffix++) availableName = `${requestedName} ${suffix}`
  const openExisting = async () => {
    if (!existingName || !props.onOpenExisting) return
    ending.current = true
    if (testing) await onEndTry(true)
    props.onOpenExisting(existingName)
  }
  const nameConflict = existingName ? <div role="status"><p>{existingName} already exists. This copy will be {availableName}.</p>{props.onOpenExisting && <button type="button" className={styles.field} data-hints="A:Open existing;B:Back" onClick={() => void openExisting()}>Open {existingName}</button>}</div> : null
  const launchReason = !game || game.kind === 'none' ? 'Pick a game first' : !game.processName ? 'Start the game once to link it' : undefined

  // ---- Step 2: presets.
  const caps = useMemo(() => capsOf(device), [device?.type, device?.supportedButtons])
  const choices = useMemo(() => presetChoices(bases, caps), [bases, caps])
  const best = recommendedPreset(choices)
  const shown = choices.find(choice => choice.preset === (focusedPreset ?? preset?.preset ?? best)) ?? choices[0]
  const gameMeta: GameMeta | null = game?.steamAppId ? { steamAppId: game.steamAppId, name: game.name } : null
  const draftText = preset ? newGameText(preset.base.relativePath, gameMeta) : ''
  const resolvedDraft = preset ? `${draftText}\n${preset.base.text}` : ''

  const choosePreset = async (choice: PresetChoice) => {
    if (choice.unavailable) return
    setPreset(choice)
    setStep(3)
  }

  // ---- Step 3: try it.
  const startTry = useCallback(async (text: string) => {
    setLog([])
    if (testReason) { setFailReason(testReason); setTryState('failed'); return }
    setTryState('starting')
    const ok = await onTry(text)
    if (!ok) setFailReason('The test couldn’t start.')
    setTryState(ok ? 'testing' : 'failed')
  }, [onTry, testReason])
  useEffect(() => {
    if (open && step === 3 && preset && tryState === 'idle') void startTry(draftText)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, preset])
  // The test ended by itself (Esc, leaving the window): back to the styles.
  useEffect(() => {
    if (step === 3 && tryState === 'testing' && !testing && !ending.current) { setTryState('idle'); setStep(2); showToast('The test ended. Nothing was saved.') }
  }, [testing, step, tryState])

  const create = async (): Promise<string | null> => {
    const finalName = availableName
    return onCreate({ name: finalName, processName: game?.processName, exePath: game?.exePath, autoApply: canLaunch && launch, text: draftText })
  }
  const keep = async (next: 'layout' | 'change') => {
    if (busy) return
    setBusy(true)
    ending.current = true
    try {
      if (testing) await onEndTry(false)
      const created = await create()
      if (!created) { showToast('Couldn’t create the configuration.', 'error'); return }
      onFinish(created, next, draftText)
    } finally { setBusy(false); ending.current = false }
  }
  const back = async () => {
    ending.current = true
    if (testing) await onEndTry(true)
    ending.current = false
    setTryState('idle')
    setStep(2)
  }
  const backRef = useRef(back)
  backRef.current = back
  const keepRef = useRef(keep)
  keepRef.current = keep
  const cancel = async () => {
    if (testing) { ending.current = true; await onEndTry(true); ending.current = false }
    onClose()
  }

  // Hold to choose: telemetry, since Studio's pad navigation is paused in a test.
  const heldSince = useRef<Record<string, number>>({})
  const fired = useRef<Set<string>>(new Set())
  const lastPadEdge = useRef(0)
  const previous = useRef<Set<string>>(new Set())
  const { map: draftMap, labels: draftLabels } = useMemo(() => assignmentsOf(resolvedDraft), [resolvedDraft])
  const pressed = device ? getPressedControllerCommandSet(device) : new Set<string>()
  // Sticks, triggers and the right pad count as presses for the log.
  const status = device?.status
  if (status) {
    if (status.leftStick.y < -0.5) pressed.add('LUP')
    if (status.leftStick.y > 0.5) pressed.add('LDOWN')
    if (status.leftStick.x < -0.5) pressed.add('LLEFT')
    if (status.leftStick.x > 0.5) pressed.add('LRIGHT')
    if (status.triggers.right > 0.5) pressed.add('ZR')
    if (status.triggers.left > 0.5) pressed.add('ZL')
    if (status.rightPad?.touched) pressed.add('RIGHT_PAD')
  }
  const pressedKey = [...pressed].sort().join(',')
  useEffect(() => {
    if (step !== 3) return
    const now = performance.now()
    const before = previous.current
    if (pressedKey !== [...before].sort().join(',')) lastPadEdge.current = now
    // Attribute each new press to what the draft sends for it.
    for (const command of pressed) {
      if (before.has(command)) continue
      const pad = command === 'RIGHT_PAD' ? draftMap.get('RIGHT_TOUCHPAD_MODE') : undefined
      const value = draftMap.get(command)
      const gyro = draftMap.get('GYRO_ON') === command
      if (command === 'RIGHT_PAD' && pad !== 'MOUSE') continue
      if (!value && !gyro && command !== 'RIGHT_PAD') continue
      const output = gyro || command === 'RIGHT_PAD' ? 'Mouse' : describeBinding(value ?? '', t)
      const label = gyro ? 'Gyro aim on' : command === 'RIGHT_PAD' ? 'Look' : /^L(UP|DOWN|LEFT|RIGHT)$/.test(command) ? 'Move' : draftLabels.get(command) ?? output
      setLog(current => [{ id: now, at: Date.now(), input: command, label, output }, ...current].slice(0, 8))
    }
    previous.current = new Set(pressed)
    if (pressed.has('-') && pressed.has('+')) return // View + Menu is the test's own exit
    for (const button of CHOOSERS) {
      if (pressed.has(button)) { if (!(button in heldSince.current)) heldSince.current[button] = now }
      else { delete heldSince.current[button]; fired.current.delete(button) }
    }
  })
  useEffect(() => {
    if (step !== 3 || !open) return
    let frame = 0
    const tick = () => {
      const now = performance.now()
      const entry = Object.entries(heldSince.current).filter(([button]) => !fired.current.has(button)).sort((a, b) => a[1] - b[1])[0]
      if (entry) {
        const progress = Math.min(1, (now - entry[1]) / HOLD_MS)
        setHold(current => current?.button === entry[0] && Math.abs(current.progress - progress) < .02 ? current : { button: entry[0], progress })
        if (progress >= 1) {
          fired.current.add(entry[0])
          setHold(null)
          if (entry[0] === 'S') void keepRef.current('layout')
          else if (entry[0] === 'W') void keepRef.current('change')
          else void backRef.current()
        }
      } else setHold(current => current ? null : current)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  // keep/back read the latest state through closure each frame they fire.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, open, busy])

  // The capture layer: while trying, what the draft sends (keys, clicks,
  // wheel) is logged and kept away from Studio's own controls. Input that
  // doesn't follow a press on the pad is the person's own and goes through.
  useEffect(() => {
    if (!open || step !== 3 || tryState !== 'testing') return
    const injected = () => performance.now() - lastPadEdge.current < 300 || Object.keys(heldSince.current).length > 0
    const swallow = (event: Event) => {
      if (!event.isTrusted) return
      if (!injected()) {
        // The person's own Esc leaves the test the way Back does.
        if (event.type === 'keydown' && (event as KeyboardEvent).key === 'Escape') { event.preventDefault(); event.stopPropagation(); void backRef.current() }
        return
      }
      event.preventDefault()
      event.stopPropagation()
    }
    document.body.dataset.testCapture = 'true'
    const types = ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'click', 'auxclick', 'pointerdown', 'pointerup', 'contextmenu', 'wheel'] as const
    types.forEach(type => window.addEventListener(type, swallow, { capture: true, passive: false }))
    return () => { delete document.body.dataset.testCapture; types.forEach(type => window.removeEventListener(type, swallow, { capture: true })) }
  }, [open, step, tryState])

  const focusChoice = useCallback((force: boolean) => {
    window.requestAnimationFrame(() => {
      const root = document.querySelector<HTMLElement>('[data-new-configuration]')
      if (!root) return
      const active = document.activeElement as HTMLElement | null
      if (!force && active && root.contains(active) && !active.matches('[data-alt]')) return
      root.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true })
    })
  }, [])
  useEffect(() => { if (open) focusChoice(true) }, [open, step, focusChoice])
  useEffect(() => { if (open && step === 1) focusChoice(false) }, [open, step, running, recent, focusChoice])

  // ---- Pad on steps 1 and 2 (Studio's navigation is on): X and Y.
  useEffect(() => {
    if (!open || step === 3) return
    const host = document.querySelector<HTMLElement>('[data-new-configuration]')?.closest<HTMLElement>('[data-subpage]')
    if (!host) return
    const onPad = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      if (step === 1 && button === 'X') { event.preventDefault(); if (canLaunch) setLaunch(value => !value) }
      else if (step === 1 && button === 'Y') { event.preventDefault(); rename() }
      else if (step === 2 && button === 'Y') { event.preventDefault(); setEveryOpen(true) }
    }
    host.addEventListener(PAD_EVENT, onPad)
    return () => host.removeEventListener(PAD_EVENT, onPad)
  })

  if (!open) return null
  const stepper = (
    <span className={styles.stepper} aria-label={`Step ${step} of 3`}>
      {(['Game', 'How you play', 'Try it'] as const).map((label, index) => {
        const state = index + 1 < step ? 'done' : index + 1 === step ? 'now' : 'later'
        return <span key={label} data-state={state} style={{ display: 'contents' }}>
          {index > 0 && <hr />}
          <span data-state={state}><i>{state === 'done' ? '✓' : index + 1}</i>{label}</span>
        </span>
      })}
    </span>
  )
  const header = <header className={styles.head}><b>New configuration</b>{stepper}</header>
  const gameName = game && game.kind !== 'none' ? game.name : 'this game'

  const stepOne = () => {
    const games = running?.filter(process => process.kind !== 'app') ?? []
    const apps = running?.filter(process => process.kind === 'app').slice(0, Math.max(0, 2 - games.length)) ?? []
    const list = [...games, ...apps].slice(0, 4)
    const heroArt = headerArt(game)
    return (
      <div className={styles.layout}>
        <section className={styles.main} aria-label="Which game is this for?">
          <h1>Which game is this for?</h1>
          <p>Games that are running come first. You can change this later.</p>
          {list.length > 0 && <>
            <p className={styles.eyebrow}>Running now</p>
            <div className={styles.running}>
              {list.map((process, index) => {
                const candidate = fromRunning(process)
                const current = game?.kind === 'running' && game.processName === candidate.processName
                const thumb = headerArt(candidate)
                return (
                  <button key={`${process.processName}-${process.pid}`} type="button" className={styles.game} aria-current={current || undefined} data-autofocus={index === 0 ? '' : undefined}
                    data-hints="A:Choose & next;X:Launch with game;Y:Rename;B:Cancel" onFocus={() => pickGame(candidate)} onClick={() => { pickGame(candidate); setStep(2) }}>
                    <span className={styles.thumb}>{thumb ? <img className={styles.thumb} src={thumb} alt="" /> : <Icon name="associations" size={22} />}</span>
                    <span><b>{candidate.name}</b><small>{exeFileName(process.processName)}</small></span>
                    {current && <p>Selected game</p>}
                  </button>
                )
              })}
            </div>
          </>}
          {recent && recent.length > 0 && <>
            <p className={styles.eyebrow}>Recent Steam games</p>
            <div className={styles.recent}>
              {recent.slice(0, 4).map((entry, index) => {
                const candidate = fromSteam(entry)
                const thumb = entry.hasHeader || entry.hasCapsule ? headerArt(candidate) : null
                return (
                  <button key={entry.appId} type="button" className={styles.cap} aria-current={game?.steamAppId === entry.appId && game.kind === 'steam' || undefined}
                    data-autofocus={!list.length && index === 0 ? '' : undefined}
                    data-hints="A:Choose & next;Y:Rename;B:Cancel" onFocus={() => pickGame(candidate)} onClick={() => { pickGame(candidate); setStep(2) }}>
                    {thumb ? <img className={styles.capArt} src={thumb} alt="" /> : <span className={styles.capArt}><Icon name="library" size={24} /></span>}
                    <span><b>{entry.name}</b><small>{playedAgo(entry.lastPlayed)}</small></span>
                  </button>
                )
              })}
            </div>
          </>}
          <div className={styles.alts}>
            <button type="button" className={styles.alt} data-alt="" aria-current={game?.kind === 'exe' || undefined} data-hints="A:Browse;B:Cancel" onClick={() => void browse()}
              data-autofocus={!list.length && !recent?.length ? '' : undefined}>
              <Icon name="folder" size={24} /><span><b>Browse for an .exe…</b><small>For games outside Steam</small></span>
            </button>
            <button type="button" className={styles.alt} data-alt="" aria-current={game?.kind === 'none' || undefined} data-hints="A:Choose & next;Y:Rename;B:Cancel"
              onFocus={() => pickGame({ kind: 'none', name: '' })} onClick={() => { pickGame({ kind: 'none', name: '' }); setStep(2) }}>
              <Icon name="remove" size={24} /><span><b>No specific game</b><small>Gets a plain icon. Add a game later.</small></span>
            </button>
          </div>
        </section>
        <aside className={styles.aside} aria-label="Your new configuration">
          <p className={styles.eyebrow} style={{ margin: 0 }}>Your new configuration</p>
          <div className={styles.hero}>{heroArt && <img src={heroArt} alt="" />}<b>{game && game.kind !== 'none' ? game.name : 'No game'}</b></div>
          <button type="button" className={styles.field} data-hints="A:Rename;Y:Rename;B:Cancel" onClick={rename}>
            <span>Name</span><b>{availableName}</b><small>{game?.exePath ? 'From the game’s folder' : 'Library name'}</small>
          </button>
          {nameConflict}
          <div className={styles.toggleRow}>
            <span><b>Launch with game</b><small>{launch ? 'Goes live when this game is in front.' : 'Uses the game’s name and art.'}{launchReason && game?.kind === 'steam' ? ` ${launchReason}.` : ''}</small></span>
            <Switch on={canLaunch && launch} label="Launch with game" disabled={!canLaunch} onChange={setLaunch} />
          </div>
          <p className={styles.foot}>Next, pick how you want to play. Importing from Steam or a file is there too.</p>
        </aside>
      </div>
    )
  }

  const stepTwo = () => (
    <div className={styles.layout}>
      <section className={styles.main} aria-label={`How do you want to play ${gameName}?`}>
        <div className={styles.found}>
          {headerArt(game) ? <img className={styles.thumb} src={headerArt(game)!} alt="" /> : <span className={styles.thumb} />}
          <span><small>{game?.kind === 'running' ? `Found running · ${exeFileName(game.processName ?? '')}` : game?.kind === 'steam' ? 'From your Steam library' : game?.kind === 'exe' ? exeFileName(game.processName ?? '') : 'No specific game'}</small>
            <h1 style={{ margin: 0 }}>How do you want to play {gameName}?</h1></span>
        </div>
        <div className={styles.cards} role="radiogroup" aria-label="Play styles"
          onFocus={event => { const value = (event.target as HTMLElement).dataset?.preset; if (value) setFocusedPreset(value) }}>
          {choices.map(choice => (
            <button key={choice.preset} type="button" role="radio" aria-checked={preset?.preset === choice.preset} className={styles.card} data-preset={choice.preset}
              aria-disabled={choice.unavailable ? 'true' : undefined} data-reason={choice.unavailable}
              data-autofocus={choice.preset === (preset?.preset ?? best) ? '' : undefined}
              data-hints={choice.unavailable ? 'B:Back to game' : 'A:Choose & try it;Y:Show every binding;B:Back to game'}
              data-caption={choice.unavailable ? `${choice.title} · ${choice.unavailable}` : `${choice.title} · ${choice.blurb}`}
              onClick={() => void choosePreset(choice)}>
              {choice.preset === best && <span className={styles.best}>Best with your controller</span>}
              <b>{choice.title}</b>
              <p>{choice.unavailable ?? choice.blurb}</p>
            </button>
          ))}
          <button type="button" className={styles.card} data-start="true" data-hints="A:Start from…;B:Back to game" onClick={() => setStartFromOpen('menu')}>
            <b>Start from…</b><p>Another configuration, a Steam layout, a file, or blank.</p>
          </button>
        </div>
      </section>
      <aside className={styles.aside} aria-label="What you get">
        <p className={styles.eyebrow} style={{ margin: 0 }}>What you get</p>
        {shown && <>
          <b style={{ fontSize: 24 }}>{shown.title}</b>
          <ul className={styles.gets}>
            {whatYouGet(shown.base.text, tt).map(row => (
              <li key={`${row.input}-${row.text}`}><InputGlyph command={row.input} family={family} size={28} /><span>{row.text}</span></li>
            ))}
          </ul>
        </>}
        <p className={styles.foot}>Next you’ll try it right here, with live feedback. Change anything later from Layout.</p>
      </aside>
    </div>
  )

  const choice = (button: 'S' | 'W' | 'E', label: string, sub: string, primary?: boolean, note?: ReactNode) => {
    const progress = hold?.button === button ? hold.progress : 0
    const glyph = button === 'S' ? 'A' : button === 'W' ? 'X' : 'B'
    return (
      <button type="button" className={styles.choice} data-primary={primary || undefined} data-hints="A:Hold: Keep it;X:Hold: Change something;B:Hold: Back"
        onClick={() => { if (button === 'S') void keep('layout'); else if (button === 'W') void keep('change'); else void back() }}>
        <span className={styles.ring} aria-hidden="true">
          <svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="18" fill="none" stroke="var(--line-2)" strokeWidth="3" />
            <circle cx="20" cy="20" r="18" fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray={`${progress * 113.1} 113.1`} /></svg>
          <ButtonGlyph button={glyph} size={24} family={family} />
        </span>
        <span><b>{label}</b><small>{sub}</small></span>
        {note && <p>{note}</p>}
      </button>
    )
  }
  const stepThree = () => {
    const now = Date.now()
    const labels: Record<string, string> = {}
    for (const [key, value] of draftMap) if (/^[A-Z0-9+-]+$/.test(key) && inputDefinitions.some(input => input.command === key)) labels[key] = `${draftLabels.get(key) ?? describeBinding(value, t)}${draftLabels.has(key) ? ` → ${describeBinding(value, t)}` : ''}`
    return (
      <div className={styles.layout}>
        <section className={styles.main} aria-label="Try it">
          <div className={styles.tryHead}>
            <span><small>{gameName === 'this game' ? 'New configuration' : gameName} · {preset?.title}</small><h1>Press anything to try it</h1></span>
            <span className={styles.chip}>{tryState === 'testing' ? 'Testing · nothing saved yet' : tryState === 'starting' ? 'Starting the test…' : 'Not testing · nothing saved yet'}</span>
          </div>
          <div className={styles.stage}>
            {tryState === 'failed'
              ? <div className={styles.reason} role="status">{failReason ?? 'The test couldn’t start.'} You can still keep it, and try it later from Home.</div>
              : device ? <div style={{ width: '100%', maxWidth: 860 }}><ControllerStatusSvg device={device} boundCommands={new Set(Object.keys(labels))} selectedCommand={log[0]?.input ?? null} bindingLabels={labels} backView="always" /></div>
                : <p>Connect a controller to try it.</p>}
          </div>
        </section>
        <aside className={styles.aside} aria-label="What was sent">
          <p className={styles.eyebrow} style={{ margin: 0, display: 'flex' }}>What was sent<span className={styles.liveDot}>● live</span></p>
          {nameConflict}
          <ul className={styles.log} aria-live="polite">
            {log.length === 0 && <li><time /><span /><span style={{ color: 'var(--text-2)' }}>Press a button, pull a trigger, touch a pad.</span></li>}
            {log.map((entry, index) => (
              <li key={entry.id}>
                <time>{index === 0 ? 'now' : `${((now - entry.at) / 1000).toFixed(1)}s`}</time>
                <InputGlyph command={entry.input} family={family} size={24} />
                <span>{entry.label} →</span>
                <b>{entry.output}</b>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {choice('S', 'Keep it', 'Saves it and opens Layout', true, 'Hold to choose. A quick tap is tested like any other button.')}
            {choice('W', 'Change something', 'Hold · pick a button to change')}
            {choice('E', 'Back', 'Hold · try another way to play')}
          </div>
        </aside>
      </div>
    )
  }

  const hints = step === 1
    ? [{ button: 'A' as const, label: 'Choose & next' }, { button: 'X' as const, label: 'Launch with game' }, { button: 'Y' as const, label: 'Rename' }]
    : step === 2 ? [{ button: 'A' as const, label: 'Choose & try it' }, { button: 'Y' as const, label: 'Show every binding' }]
      : [{ button: 'A' as const, label: 'Hold: Keep it' }, { button: 'X' as const, label: 'Hold: Change something' }]
  const everyBinding = preset ?? shown
  return (
    <SubPage open onClose={() => { if (step === 1) void cancel(); else if (step === 2) setStep(1); else void back() }}
      trail={[]} title="New configuration" bare backLabel={step === 1 ? 'Cancel' : step === 2 ? 'Back to game' : 'Hold: Back'}
      where={step === 3 ? 'Step 3 of 3 · tap to test, hold to choose' : `Step ${step} of 3`} hints={hints}>
      <div data-new-configuration="" data-step={step} style={{ height: '100%' }}>
        {header}
        {step === 1 ? stepOne() : step === 2 ? stepTwo() : stepThree()}
      </div>
      <Sheet open={everyOpen && Boolean(everyBinding)} onClose={() => setEveryOpen(false)} eyebrow={`New configuration · ${everyBinding?.title ?? ''}`} title="Every binding"
        description={everyBinding ? `From ${everyBinding.base.fileName}. A game built on it changes only what it sets itself.` : undefined} hints={[{ button: 'B', label: 'Back' }]} width={600}>
        {everyBinding && [...assignmentsOf(everyBinding.base.text).map].map(([key, value]) => {
          const input = inputDefinitions.find(definition => definition.command === key)
          return (
            <div key={key} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) auto', alignItems: 'center', gap: 12, minHeight: 40 }} tabIndex={0} data-hints="B:Back">
              {input ? <InputGlyph command={key} family={family} size={24} /> : <span />}
              <span>{input ? describeBinding(value, t) : key.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase())}</span>
              <code style={{ color: 'var(--text-3)' }}>{key} = {value}</code>
            </div>
          )
        })}
      </Sheet>
      <Sheet open={startFromOpen !== null} onClose={() => setStartFromOpen(startFromOpen === 'configs' ? 'menu' : null)} eyebrow="New configuration" title={startFromOpen === 'configs' ? 'Another configuration' : 'Start from…'}
        hints={[{ button: 'A', label: 'Choose' }, { button: 'B', label: 'Back' }]} width={520}>
        {startFromOpen === 'menu' && <>
          {[
            { label: 'Another configuration', note: 'A copy, named for this game', run: () => setStartFromOpen('configs') },
            { label: 'A Steam layout', note: 'Brought over from Steam Input', run: () => { setStartFromOpen(null); onClose(); onImportFromSteam() } },
            { label: 'A file', note: 'A JoyShockMapper .txt', run: () => fileRef.current?.click() },
            { label: 'Blank', note: 'Every input unbound', run: async () => {
              setStartFromOpen(null)
              const created = await onCreate({ name: (name || game?.name || 'New configuration').trim(), processName: game?.processName, exePath: game?.exePath, autoApply: canLaunch && launch, text: newGameText(null, gameMeta) })
              if (created) onFinish(created, 'layout', '')
            } },
          ].map(item => (
            <button key={item.label} type="button" className="unsaved-choice" data-hints="A:Choose;B:Back" onClick={() => void item.run()}>
              <span className="unsaved-choice__text"><span className="unsaved-choice__label">{item.label}</span><span className="unsaved-choice__hint">{item.note}</span></span>
            </button>
          ))}
          <input ref={fileRef} type="file" accept=".txt,.cfg,.ini,*/*" hidden onChange={async event => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            setStartFromOpen(null)
            onClose()
            onImportFile(file.name, await file.text())
          }} />
        </>}
        {startFromOpen === 'configs' && libraryProfiles.filter(entry => entry !== 'Default Global Chords').map(entry => (
          <button key={entry} type="button" className="unsaved-choice" data-hints="A:Copy it;B:Back" onClick={() => { setStartFromOpen(null); void onCopyFrom(entry, (name || game?.name || `${entry} copy`).trim(), game ?? { kind: 'none', name: '' }) }}>
            <span className="unsaved-choice__text"><span className="unsaved-choice__label">{entry}</span></span>
          </button>
        ))}
      </Sheet>
    </SubPage>
  )
}

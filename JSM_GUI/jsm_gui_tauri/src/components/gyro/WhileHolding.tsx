import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import { SubPage, OpenRow } from '../ui/console'
import { InputGlyph } from '../glyphs/InputGlyph'
import { AddModeshiftSheet } from '../keymap/AddModeshiftSheet'
import { foldModeshift, projectModeshift } from '../../utils/modeshift'
import { moveGyroSettingChord, TILT_MODESHIFT_KEYS, SHARED_MOTION_OUTPUT_KEYS, isGyroModeshiftKey } from '../../utils/gyroSettingsScope'
import { updateKeymapEntry } from '../../utils/keymap'
import { readVirtualSetting } from '../../utils/virtualStickSettings'
import { useGyro, GyroEnvProvider, Note, GYRO_GLOBAL_KEYS, type GyroEnv } from './GyroContext'
import { getKeymapValue, removeKeymapEntry } from '../../utils/keymap'
import { heldTriggers, HELD_LINE } from './WhenOn'
import { useHoldInputs, inputName } from './inputs'
import styles from './Gyro.module.css'

// Mode shift for gyro and tilt (When is gyro on? ▸ Mode shift, D11's flow): the held inputs that change gyro, each opening the same
// Fine-tune (or Tilt) screens scoped to that input. This replaces the old
// "Gyro modeshifts" panel and the separate sensitivity shift view (Base values
// / While shifted): there is one way to edit held gyro settings.

type Source = 'gyro' | 'tilt'

/** The configuration as seen while `trigger` is held; writes fold back into its chord. */
export function useHeldEnv(trigger: string | null): GyroEnv | null {
  const gyro = useGyro()
  const projected = useMemo(() => (trigger ? projectModeshift(gyro.rootText, trigger) : ''), [gyro.rootText, trigger])
  const { setRootText } = gyro
  const setProjected = useCallback<Dispatch<SetStateAction<string>>>(update => {
    if (!trigger) return
    let next = typeof update === 'function' ? update(projected) : update
    // Settings the mapper applies to the whole configuration (the virtual pad,
    // the adaptive filter switch…) never become held chords: write them plainly.
    const globals: [string, string | undefined][] = []
    for (const key of GYRO_GLOBAL_KEYS) {
      const before = getKeymapValue(projected, key), after = getKeymapValue(next, key)
      if (before === after) continue
      globals.push([key, after])
      next = before === undefined ? removeKeymapEntry(next, key) : updateKeymapEntry(next, key, [before])
    }
    setRootText(previous => globals.reduce((text, [key, value]) => value === undefined ? removeKeymapEntry(text, key) : updateKeymapEntry(text, key, [value]),
      foldModeshift(previous, trigger, next, {}, projected)))
  }, [projected, setRootText, trigger])
  const ownKeys = useMemo(() => {
    const keys = new Set<string>()
    if (!trigger) return keys
    for (const line of gyro.rootText.split(/\r?\n/)) {
      const match = line.match(HELD_LINE)
      if (match && match[1].toUpperCase() === trigger.toUpperCase()) keys.add(match[2].toUpperCase())
    }
    return keys
  }, [gyro.rootText, trigger])
  if (!trigger) return null
  return { ...gyro, text: projected, setText: setProjected, held: trigger, ownKeys }
}

const inTiltScope = (key: string) => TILT_MODESHIFT_KEYS.test(key) || SHARED_MOTION_OUTPUT_KEYS.test(key)
const inScope = (key: string, source: Source) => (source === 'gyro' ? isGyroModeshiftKey(key) : inTiltScope(key))

/** Every "X,KEY" line of the trigger in this scope, gone: the held input changes nothing any more. */
function removeHeld(text: string, trigger: string, source: Source) {
  if (source === 'gyro') return moveGyroSettingChord(text, trigger, '')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  return text.split(/\r?\n/).filter(line => {
    const match = line.match(HELD_LINE)
    return !(match && match[1].toUpperCase() === trigger.toUpperCase() && inTiltScope(match[2].toUpperCase()))
  }).join(eol)
}

/** Retarget a held variant to another button. */
function moveHeld(text: string, from: string, to: string, source: Source) {
  if (source === 'gyro') return moveGyroSettingChord(text, from, to)
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  return text.split(/\r?\n/).map(line => {
    const match = line.match(HELD_LINE)
    if (!match || match[1].toUpperCase() !== from.toUpperCase() || !inTiltScope(match[2].toUpperCase())) return line
    const at = line.indexOf(match[1])
    return line.slice(0, at) + to + line.slice(at + match[1].length)
  }).join(eol)
}

function summary(rootText: string, trigger: string, source: Source) {
  const keys = rootText.split(/\r?\n/).flatMap(line => {
    const match = line.match(HELD_LINE)
    if (!match || match[1].toUpperCase() !== trigger.toUpperCase()) return []
    const key = match[2].toUpperCase()
    return inScope(key, source) ? [key] : []
  })
  const named: string[] = []
  const value = (key: string) => readVirtualSetting(rootText, `${trigger},${key}`)?.toLowerCase().replace(/_/g, ' ')
  if (keys.some(key => /GYRO_SENS|MIN_GYRO|MAX_GYRO|ACCEL_/.test(key))) named.push('speed')
  if (keys.includes('GYRO_OUTPUT')) named.push(`sends ${value('GYRO_OUTPUT') ?? 'another output'}`)
  if (keys.some(key => /^GYRO_(ON|OFF)$/.test(key))) named.push('on or off')
  if (keys.some(key => /CUTOFF|SMOOTH|ONE_EURO|SNAP|BRAKE|DAMPEN|FLOOR/.test(key))) named.push('steadiness')
  if (keys.some(key => /GYRO_SPACE|GYRO_AXIS|FROM_GYRO_AXIS/.test(key))) named.push('direction')
  if (keys.some(key => /HAPTIC/.test(key))) named.push('rumble')
  if (keys.includes('MOTION_STICK_MODE')) named.push(`tilt: ${value('MOTION_STICK_MODE') ?? ''}`)
  return named.length ? `Changes ${named.join(', ')}` : `${keys.length} setting${keys.length === 1 ? '' : 's'}`
}

/** The list of held variants; `renderEditor` draws the scoped editor for the open one. */
export function WhileHolding({ open, onClose, trail, source, renderEditor, initialEditing }: {
  open: boolean; onClose: () => void; trail: string[]; source: Source
  /** Open straight on this held input's editor (Review changes jumps here). */
  initialEditing?: string | null
  renderEditor: (trigger: string, close: () => void, trail: string[]) => ReactNode
}) {
  const gyro = useGyro()
  const holdInputs = useHoldInputs(gyro.family, gyro.callbacks.gridCommands)
  const [editing, setEditing] = useState<string | null>(initialEditing ?? null)
  useEffect(() => { if (open && initialEditing) setEditing(initialEditing) }, [open, initialEditing])
  // `release`: the variant applies while the button is up ("!L,KEY"), the "Let go" of a binding's conditions.
  const [picking, setPicking] = useState<{ from: string | null; release?: boolean } | null>(null)
  const triggers = heldTriggers(gyro.rootText, source)
  const noun = source === 'tilt' ? 'tilt' : 'gyro'
  const nameOf = (trigger: string) => (trigger.startsWith('!') ? `${inputName(trigger.slice(1), gyro.family)} let go` : `${inputName(trigger, gyro.family)} held`)
  const titleOf = (trigger: string) => (trigger.startsWith('!') ? `Mode shift · ${inputName(trigger.slice(1), gyro.family)} let go` : `Mode shift · ${inputName(trigger, gyro.family)}`)
  const Noun = source === 'tilt' ? 'Tilt' : 'Gyro'
  const add = (trigger: string) => {
    // A held variant exists once it changes something: start it from what is in force.
    const key = source === 'tilt' ? 'MOTION_STICK_MODE' : 'GYRO_OUTPUT'
    const current = readVirtualSetting(gyro.rootText, key) ?? (source === 'tilt' ? 'NO_MOUSE' : 'MOUSE')
    gyro.setRootText(previous => updateKeymapEntry(previous, `${trigger},${key}`, [current]))
    setEditing(trigger)
  }
  return (
    <SubPage open={open} onClose={onClose} trail={trail} title="Mode shift" backLabel="Back">
      <div className={styles.holdingPage} data-while-holding-page={source}>
        <header className={styles.pageHeading}><h1>{Noun} mode shift</h1>
          <p>{source === 'tilt' ? 'Hold a button to change what tilt does.' : 'Hold a button to change gyro: slower while aiming, off in menus, a stick when driving.'}</p></header>
        {triggers.length === 0 && <Note>None yet. Add a button, then change any {noun} setting for while it is held.</Note>}
        {triggers.map(trigger => (
          <OpenRow key={trigger} label={<span className={styles.heldLabel}><InputGlyph command={trigger.replace(/^!/, '')} family={gyro.family} size={28} />{nameOf(trigger)}</span>}
            hint={summary(gyro.rootText, trigger, source)} onOpen={() => setEditing(trigger)}
            hints="A:Change settings;X:Remove;Y:Change button;B:Back" data={{ 'data-held': trigger }} />
        ))}
        <OpenRow label="Add a button" hint="Pick the button to hold" onOpen={() => setPicking({ from: null })} hints="A:Pick button;B:Back" data={{ 'data-add-held': '' }} />
        <OpenRow label="Add a button to let go of" hint={`Changes ${noun} while the button is up, like a binding's Let go`} onOpen={() => setPicking({ from: null, release: true })} hints="A:Pick button;B:Back" data={{ 'data-add-released': '' }} />
        <HeldPad onRemove={trigger => gyro.setRootText(previous => removeHeld(previous, trigger, source))} onRebind={trigger => setPicking({ from: trigger })} />
      </div>
      {picking && <AddModeshiftSheet inputName={noun} command={source === 'tilt' ? 'TILT' : 'GYRO'} family={gyro.family} modifiers={holdInputs}
        taken={triggers.map(item => item.replace(/^!/, ''))} initial={picking.from?.replace(/^!/, '') ?? null}
        eyebrow={picking.from ? `${Noun} · Change the button` : picking.release ? `${Noun} · Mode shift · let go` : `${Noun} · Mode shift`}
        onClose={() => setPicking(null)}
        onNext={picked => {
          const from = picking.from
          // Rebinding keeps whether it was held or let go.
          const trigger = (from ? from.startsWith('!') : picking.release) ? `!${picked}` : picked
          if (from) gyro.setRootText(previous => moveHeld(previous, from, trigger, source))
          else add(trigger)
          setPicking(null)
        }} />}
      {editing && renderEditor(editing, () => setEditing(null), [...trail, titleOf(editing)])}
    </SubPage>
  )
}

/** X removes a held variant, Y changes its button (pad events on the list's rows). */
function HeldPad({ onRemove, onRebind }: { onRemove: (trigger: string) => void; onRebind: (trigger: string) => void }) {
  const latest = useRef({ onRemove, onRebind })
  latest.current = { onRemove, onRebind }
  const anchor = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const page = anchor.current?.closest('[data-while-holding-page]')
    if (!page) return
    const onPad = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      const row = (event.target as Element | null)?.closest<HTMLElement>('[data-held]')
      if (!row?.dataset.held) return
      if (button === 'X') { event.preventDefault(); latest.current.onRemove(row.dataset.held) }
      else if (button === 'Y') { event.preventDefault(); latest.current.onRebind(row.dataset.held) }
    }
    page.addEventListener(PAD_EVENT, onPad)
    return () => page.removeEventListener(PAD_EVENT, onPad)
  }, [])
  return <span ref={anchor} hidden />
}

/** A held variant's editor: the same screens, scoped to the held input. */
export function HeldScope({ trigger, children }: { trigger: string; children: ReactNode }) {
  const env = useHeldEnv(trigger)
  if (!env) return null
  return <GyroEnvProvider value={env}>{children}</GyroEnvProvider>
}

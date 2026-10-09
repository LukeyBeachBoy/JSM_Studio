import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SubPage } from '../ui/console'
import { useShell } from '../../shell/ShellContext'
import { useTelemetry } from '../../hooks/useTelemetry'
import { controllerSupportsInput } from '../../utils/controllerStatus'
import { deliberatePresses } from '../../nav/usePressToFind'
import { FACE_BUTTONS, DPAD_BUTTONS, BUMPER_BUTTONS, TRIGGER_BUTTONS, CENTER_BUTTONS, PADDLE_BUTTONS, MINI_BUTTONS, MISC_BUTTONS, LEFT_STICK_BUTTONS, RIGHT_STICK_BUTTONS } from '../../keymap/schema'
import { InputGlyph } from '../glyphs/InputGlyph'
import { inputDisplayName } from '../../keymap/inputNames'
import { inputLong } from './modeText'
import styles from './Modes.module.css'

// "Press a new one to change it" (ModeHow "With this button", ModeChanges "More
// buttons · + Add", Menus "Opened by" openers): listen for the next button
// pressed on the controller, or choose one from the list, which is always shown.
//
// While listening the app's own navigation is paused the way "Find a button"
// pauses it (body[data-pad-listening], nav/usePressToFind), so A and the
// D-pad can be picked too. Only deliberate presses count (deliberatePresses:
// a thumb resting on a pad or a hand round the grips is contact, not a press),
// and a tap of B cancels listening, as the banner and the footer say.

const CHOICES = [...FACE_BUTTONS, ...DPAD_BUTTONS, ...BUMPER_BUTTONS, ...TRIGGER_BUTTONS.filter(b => !b.command.endsWith('F')), ...CENTER_BUTTONS, ...PADDLE_BUTTONS, ...MINI_BUTTONS, ...MISC_BUTTONS,
  ...LEFT_STICK_BUTTONS.filter(b => b.command === 'L3'), ...RIGHT_STICK_BUTTONS.filter(b => b.command === 'R3')]
const LISTEN_MS = 10000

type Props = {
  open: boolean
  trail: string[]
  title: string
  /** What the pick is for: "Turns Vehicles on". */
  purpose?: string
  /** Inputs that cannot be chosen, with why. */
  unavailable?: (command: string) => string | undefined
  onPick: (command: string) => void
  onClose: () => void
}

export function ButtonCapture({ open, ...props }: Props) {
  return open ? <CaptureBody {...props} /> : null
}

function CaptureBody({ trail, title, purpose, unavailable, onPick, onClose }: Omit<Props, 'open'>) {
  const { t } = useTranslation()
  const { family } = useShell()
  const { sample } = useTelemetry()
  const device = sample?.devices?.[0]
  const [listening, setListening] = useState(true)
  const [left, setLeft] = useState(LISTEN_MS / 1000)
  const previous = useRef<Set<string>>(new Set())
  const ready = useRef(false)
  const latest = useRef({ onPick, unavailable })
  latest.current = { onPick, unavailable }
  const choices = useMemo(() => CHOICES.filter(choice => controllerSupportsInput(device, choice.command)), [device])
  const live = listening && !!device

  // Pause navigation while listening; Escape (or a B tap, below) stops it.
  useEffect(() => {
    if (!live) return
    ready.current = false
    document.body.dataset.padListening = 'true'
    document.body.dataset.padListeningMessage = 'Press a button · B or Esc cancels'
    window.dispatchEvent(new Event('jsm:interaction-hint'))
    const started = Date.now()
    const tick = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((LISTEN_MS - (Date.now() - started)) / 1000))
      setLeft(remaining)
      if (!remaining) setListening(false)
    }, 250)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setListening(false) } }
    window.addEventListener('keydown', onKey, true)
    return () => {
      delete document.body.dataset.padListening
      delete document.body.dataset.padListeningMessage
      clearInterval(tick)
      window.removeEventListener('keydown', onKey, true)
      window.dispatchEvent(new Event('jsm:interaction-hint'))
    }
  }, [live])

  // Listening over (or no controller): the pad lands on the list.
  const grid = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (live) return
    requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>('button[tabindex="0"]:not([aria-disabled="true"])')?.focus({ preventScroll: true }))
  }, [live])

  useEffect(() => {
    const pressed = deliberatePresses(device)
    if (!live) { previous.current = pressed; return }
    // The press that opened this (A) must be let go before anything counts.
    if (!ready.current) { if (pressed.size === 0) ready.current = true; previous.current = pressed; return }
    const fresh = [...pressed].filter(command => !previous.current.has(command))
    previous.current = pressed
    if (!fresh.length) return
    // B cancels, as the banner says; it is never captured here.
    if (fresh.includes('E')) { setListening(false); return }
    const normal = fresh[0] === 'ZLF' ? 'ZL' : fresh[0] === 'ZRF' ? 'ZR' : fresh[0]
    if (!CHOICES.some(choice => choice.command === normal)) return
    if (latest.current.unavailable?.(normal)) return
    setListening(false)
    latest.current.onPick(normal)
  }, [live, device])

  return (
    <SubPage open onClose={onClose} trail={trail} title={title} backLabel="Cancel"
      hints={[{ button: 'A', label: 'Choose' }]}>
      <div className={styles.capture}>
        <div className={styles.captureListen} data-listening={live ? 'true' : undefined} role="status" aria-live="polite">
          {live
            ? <><b>Press a button on the controller</b><span>{purpose ? `${purpose} · ` : ''}Tap it and let go, or choose one below · B cancels · {left} s</span></>
            : <><b>Choose a button</b><span>{purpose ? `${purpose} · ` : ''}{device ? 'Or listen again and press one on the controller.' : 'Connect a controller to press one instead.'}</span></>}
        </div>
        {!live && device && <button type="button" className={styles.captureAgain} data-hints="A:Listen;B:Cancel" onClick={() => { previous.current.clear(); setLeft(LISTEN_MS / 1000); setListening(true) }}>Listen for a button</button>}
        <div ref={grid} className={styles.captureGrid} role="listbox" aria-label="Buttons">
          {choices.map(choice => {
            const reason = unavailable?.(choice.command)
            return <button key={choice.command} type="button" role="option" aria-selected="false" className={styles.captureChoice}
              aria-disabled={reason ? 'true' : undefined} data-reason={reason} tabIndex={live ? -1 : 0}
              data-hints={reason ? 'B:Cancel' : 'A:Choose;B:Cancel'} data-caption={`${inputLong(choice.command, family, t)}${reason ? ` · ${reason}` : ''}`}
              onClick={() => { if (!reason) onPick(choice.command) }}>
              <InputGlyph command={choice.command} family={family} size={28} />
              <span>{inputDisplayName(choice.command, family)}</span>
            </button>
          })}
        </div>
      </div>
    </SubPage>
  )
}

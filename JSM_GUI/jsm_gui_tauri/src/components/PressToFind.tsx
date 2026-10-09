import { useEffect, useState, type ReactNode } from 'react'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { ControllerStatusSvg } from './ControllerStatusSvg'
import { InputGlyph } from './glyphs/InputGlyph'
import { inputDisplayName } from '../keymap/inputNames'
import { controllerVisualFamily } from '../utils/controllerStatus'
import styles from './keymap/binding/binding.module.css'

// Buttons' right-hand aside (console v2, ButtonList): "Where it is on your
// controller" -- the connected pad's art with the focused row's input lit --
// and "Find a button": A on the card listens for a few seconds, and the next
// button pressed on the controller jumps straight to its row. Nothing jumps
// unless asked: holding the pad squeezes the grip sensors (nav/usePressToFind.ts).
// Below 1024px, where the aside is stacked away, FindButtonBar starts it.
// ListeningBanner says it is listening, wherever it was started from.

type Props = {
  device?: TelemetryDevice
  listening: boolean
  onListen: () => void
  onStop: () => void
}

/** The input of the row that has focus, as the art names it. */
function useFocusedInput() {
  const [input, setInput] = useState<string | null>(null)
  useEffect(() => {
    const read = () => {
      const row = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.main-pane [data-input-command]')
      const command = row?.dataset.inputCommand
      if (command) setInput(command.includes(',') ? command.split(',').pop()! : command)
    }
    read()
    document.addEventListener('focusin', read)
    return () => document.removeEventListener('focusin', read)
  }, [])
  return input
}

export function PressToFind({ device, listening, onListen, onStop }: Props) {
  const input = useFocusedInput()
  const family = controllerVisualFamily(device?.type)
  return (
    <aside className={styles.aside} aria-label="Where it is on your controller" data-press-to-find-aside="">
      <div className={styles.asideCard}>
        <div className={styles.asideArt}>
          {device
            ? <ControllerStatusSvg device={device} selectedCommand={input} />
            : <div className={styles.asideFallback}>{input && <InputGlyph command={input} family={family} size={64} />}<span>Connect a controller to see where it is.</span></div>}
        </div>
        <span className={styles.asideCaption}>{input ? `${inputDisplayName(input, family)} · where it is on your controller` : 'Where it is on your controller'}</span>
      </div>
      <button type="button" className={styles.pressCard} data-listening={listening ? 'true' : undefined} data-press-to-find=""
        aria-disabled={device ? undefined : 'true'} data-reason={device ? undefined : 'Connect a controller first'}
        onClick={() => { if (!device) return; if (listening) onStop(); else onListen() }}
        data-hints={listening ? 'B:Cancel' : device ? 'A:Find a button;B:Back' : 'B:Back'}
        data-caption="Find a button · press it on the controller to jump to its row">
        <span className={styles.eyebrowLabel}>{listening ? 'Listening…' : 'Find a button'}</span>
        <p>{listening ? 'Press a button on the controller. Its row comes up straight away.' : 'Press it on the controller to jump straight to its row. No need to hunt.'}</p>
        <small>{listening ? 'B, Esc or wait to cancel.' : device ? 'Select to listen for a few seconds.' : 'Connect a controller first.'}</small>
      </button>
    </aside>
  )
}

/** "Find a button" where the aside is stacked away (below 1024px). */
export function FindButtonBar({ device, listening, onListen, onStop }: Props) {
  return (
    <div className={styles.findBar}>
      <button type="button" className="button button--secondary" data-find-button="" data-listening={listening ? 'true' : undefined}
        aria-disabled={device ? undefined : 'true'} data-reason={device ? undefined : 'Connect a controller first'}
        onClick={() => { if (!device) return; if (listening) onStop(); else onListen() }}
        data-hints={listening ? 'B:Cancel' : device ? 'A:Find a button;B:Back' : 'B:Back'}>
        {listening ? 'Listening…' : 'Find a button'}
      </button>
    </div>
  )
}

/** Says it is listening, with what cancels it and how long is left. */
export function ListeningBanner({ until, onStop }: { until: number | null; onStop: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until === null) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [until])
  if (until === null) return null
  const seconds = Math.max(0, Math.ceil((until - now) / 1000))
  return (
    <div className={styles.listenBanner} role="status" aria-live="polite" data-press-to-find-banner="">
      <span className={styles.listenDot} aria-hidden="true" />
      <span>Press any button on the controller… <span className={styles.listenHint}>· B to cancel</span></span>
      <span className={styles.listenCount} aria-label={`${seconds} seconds left`}>{seconds}s</span>
      <button type="button" className={styles.listenCancel} onClick={onStop}>Cancel</button>
    </div>
  )
}

/** The Buttons page: the list, and the aside beside it (stacked away below 1024px). */
export function ButtonsPageLayout({ aside, children }: { aside?: ReactNode; children: ReactNode }) {
  if (!aside) return <>{children}</>
  return <div className={styles.buttonsLayout}><div>{children}</div>{aside}</div>
}

import { useState } from 'react'
import { SubPage, ValueRow, OpenRow } from '../ui/console'
import { desktopBridge } from '../../platform/desktopBridge'
import { getKeymapValue } from '../../utils/keymap'
import { Note, readNumber, writeKeys, type SetText } from './shared'
import styles from './P4.module.css'

// Match a full turn (360°) (console v2, StickAdvanced; V8 rename of
// "Real-world calibration"). The guided version of RwcGuideModal: look up how
// many mouse counts make one full turn in the game at your in-game
// sensitivity, and REAL_WORLD_CALIBRATION = sensitivity ÷ (360 ÷ counts).
// Shared: Sticks ▸ Advanced and the flick's Advanced open it; Gyro (P5) can
// reuse it as is (props: the text, its writer, where it was opened from).

const SITE = 'https://www.mouse-sensitivity.com'

export function MatchFullTurn({ open, onClose, text, setText, trail }: { open: boolean; onClose: () => void; text: string; setText?: SetText; trail: string[] }) {
  const savedSens = readNumber(text, 'IN_GAME_SENS', 1)
  const [sens, setSens] = useState<number | null>(null)
  const [counts, setCounts] = useState(0)
  const [step, setStep] = useState(0)
  const current = getKeymapValue(text, 'REAL_WORLD_CALIBRATION')
  const inGame = sens ?? savedSens
  const computed = counts > 0 && inGame > 0 ? inGame / (360 / counts) : null
  const steps = ['Your in-game sensitivity', 'Counts for one full turn', 'Keep it']
  return (
    <SubPage open={open} onClose={onClose} trail={trail} title="Match a full turn (360°)" stepLabel="Step" onStep={direction => setStep(value => Math.max(0, Math.min(2, value + direction)))}
      where={`${trail.join(' · ')} · Match a full turn · ${steps[step]}`}>
      <div className={styles.whileHolding} data-match-full-turn={step}>
        <p className={styles.lede}>Makes turn speeds true to the game: a setting of 360°/s then really turns you once a second. Also used by flicks and gyro.{current ? ` Now: ${current}.` : ''}</p>
        <ol className={styles.guide} aria-label="Steps">
          {steps.map((label, index) => <li key={label} data-current={index === step ? 'true' : undefined}>{index + 1}. {label}</li>)}
        </ol>
        {step === 0 && <>
          <ValueRow hero label="In-game sensitivity" setting="IN_GAME_SENS" value={inGame} min={0} max={100} step={0.1} fineStep={0.01}
            caption="The mouse sensitivity set in the game’s own options. Keep it fixed afterwards." onChange={setSens} />
          <OpenRow label="Next" hint="Find the counts for one full turn" onOpen={() => setStep(1)} hints="A:Next;B:Back" />
        </>}
        {step === 1 && <>
          <OpenRow label="Look it up on mouse-sensitivity.com" hint="Pick the game, enter your sensitivity and read “counts per 360°”" value="Open site" onOpen={() => void desktopBridge.openExternal(SITE)} />
          <ValueRow hero label="Counts for one full turn" value={counts} min={0} max={50000} step={100} fineStep={1} caption="A types the number from the site." onChange={setCounts} />
          {computed !== null && <Note>Match a full turn will be {computed.toFixed(4)}.</Note>}
          <OpenRow label="Next" hint={computed === null ? 'Enter the counts first' : 'Keep the result'} disabled={computed === null ? 'Enter the counts for one full turn first.' : undefined} onOpen={() => setStep(2)} hints="A:Next;B:Back" />
        </>}
        {step === 2 && <>
          {computed === null ? <Note tone="warn">Enter your sensitivity and the counts first.</Note> : <Note>Sensitivity {inGame} with {counts} counts per turn gives {computed.toFixed(4)}.</Note>}
          <OpenRow label="Keep it" hint="Writes Match a full turn and your in-game sensitivity into this configuration" disabled={computed === null ? 'Nothing to keep yet.' : undefined}
            data={{ 'data-autofocus': '' }}
            onOpen={() => { if (computed === null) return; writeKeys(setText, { REAL_WORLD_CALIBRATION: Number(computed.toFixed(4)), IN_GAME_SENS: inGame }); onClose() }} hints="A:Keep it;B:Back" />
        </>}
      </div>
    </SubPage>
  )
}

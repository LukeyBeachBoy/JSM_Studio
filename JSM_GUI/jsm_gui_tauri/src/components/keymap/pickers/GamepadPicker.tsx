import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActionPickerProps } from '../ActionPicker'
import { PickerPage, useRefocusOn } from './PickerPage'
import { usePickerWords, useUsedBy } from './pickerShared'
import { ControllerArt } from './PickerArt'
import { InputGlyph } from '../../glyphs/InputGlyph'
import { getVirtualControllerLogicalOutput, getVirtualControllerTokenType, toVirtualControllerToken, type VirtualControllerLogicalOutput } from '../../../utils/virtualController'
import styles from './Pickers.module.css'

// Gamepad button (console v2, PickerFamily: "Xbox or DualShock 4 · whole sticks
// are on Sticks"). The virtual pad's buttons, drawn as that pad draws them; LT /
// RT switch between Xbox and DualShock 4.
//
// Decision (IMPLEMENTATION.md asked us to take one): switching the scheme here
// only changes what is shown. Choosing a button writes the token for the
// scheme shown and, when the configuration has no virtual pad or another
// scheme, turns that one on (onEnableVirtualController(scheme)) -- as choosing
// a pad button already turned on Xbox before. The status line says which.

type Scheme = 'XBOX' | 'DS4'
type PadButton = { logical: VirtualControllerLogicalOutput; glyph: string; xbox: string; ds4: string }

// The design's order: A B X Y LB RB LT RT L3 R3 View Menu Guide ↑ ↓ ← → DS4 pad.
const BUTTONS: PadButton[] = [
  { logical: 'faceSouth', glyph: 'S', xbox: 'A', ds4: 'Cross' },
  { logical: 'faceEast', glyph: 'E', xbox: 'B', ds4: 'Circle' },
  { logical: 'faceWest', glyph: 'W', xbox: 'X', ds4: 'Square' },
  { logical: 'faceNorth', glyph: 'N', xbox: 'Y', ds4: 'Triangle' },
  { logical: 'leftBumper', glyph: 'L', xbox: 'LB', ds4: 'L1' },
  { logical: 'rightBumper', glyph: 'R', xbox: 'RB', ds4: 'R1' },
  { logical: 'leftTriggerDigital', glyph: 'ZL', xbox: 'LT', ds4: 'L2' },
  { logical: 'rightTriggerDigital', glyph: 'ZR', xbox: 'RT', ds4: 'R2' },
  { logical: 'leftStickClick', glyph: 'L3', xbox: 'L3', ds4: 'L3' },
  { logical: 'rightStickClick', glyph: 'R3', xbox: 'R3', ds4: 'R3' },
  { logical: 'back', glyph: '-', xbox: 'View', ds4: 'Share' },
  { logical: 'start', glyph: '+', xbox: 'Menu', ds4: 'Options' },
  { logical: 'home', glyph: 'HOME', xbox: 'Guide', ds4: 'PS' },
  { logical: 'dpadUp', glyph: 'UP', xbox: '↑', ds4: '↑' },
  { logical: 'dpadDown', glyph: 'DOWN', xbox: '↓', ds4: '↓' },
  { logical: 'dpadLeft', glyph: 'LEFT', xbox: '←', ds4: '←' },
  { logical: 'dpadRight', glyph: 'RIGHT', xbox: '→', ds4: '→' },
  { logical: 'padClick', glyph: 'CAPTURE', xbox: 'DS4 pad', ds4: 'Touchpad click' },
]

export function GamepadPicker(props: ActionPickerProps & { onSearch?: () => void }) {
  const { inputLabel, command, onSelect, onClose, onSearch, virtualControllerType, onEnableVirtualController, allowedOutputKinds } = props
  const { t } = useTranslation()
  const words = usePickerWords(inputLabel, command)
  const usedBy = useUsedBy(command)
  const currentType = getVirtualControllerTokenType(command.outputValue)
  const [scheme, setScheme] = useState<Scheme>(currentType ?? (virtualControllerType === 'DS4' ? 'DS4' : 'XBOX'))
  const currentLogical = command.outputKind === 'virtualController' ? getVirtualControllerLogicalOutput(command.outputValue) : null
  const [focused, setFocused] = useState<PadButton>(() => BUTTONS.find(button => button.logical === currentLogical) ?? BUTTONS[0])
  const grid = useRef<HTMLDivElement>(null)
  useRefocusOn(grid, scheme, ['[data-current="true"]', 'button:not([aria-disabled="true"])'])

  const name = (button: PadButton) => scheme === 'DS4' ? button.ds4 : button.xbox
  const schemeName = scheme === 'DS4' ? 'DualShock 4' : 'Xbox'
  const turnsOn = virtualControllerType === 'NONE'
  const switches = !turnsOn && virtualControllerType !== scheme
  const status = turnsOn ? t('pickers.padTurnsOn', 'Turns on the virtual gamepad')
    : switches ? t('pickers.padSwitches', 'Switches this configuration’s virtual gamepad to {{scheme}}', { scheme: schemeName })
    : t('pickers.padIsOn', 'The virtual {{scheme}} pad is on', { scheme: schemeName })

  const choose = (button: PadButton) => {
    if (allowedOutputKinds && !allowedOutputKinds.includes('virtualController')) return
    const token = toVirtualControllerToken(button.logical, scheme)
    if (!token) return
    if (turnsOn || switches) onEnableVirtualController?.(scheme)
    onSelect({ outputKind: 'virtualController', outputValue: token, virtualControllerLogicalOutput: button.logical })
    onClose()
  }

  const by = usedBy(toVirtualControllerToken(focused.logical, scheme) ?? '')
  return (
    <PickerPage kind="gamepad" onClose={onClose} input={command.physicalInput} eyebrow={words.eyebrow} title={t('pickers.gamepadTitle', 'Gamepad button')}
      where={t('pickers.gameSees', '{{input}} · the game sees {{button}}', { input: words.input, button: name(focused) })}
      groups={[{ id: 'XBOX', label: 'Xbox' }, { id: 'DS4', label: 'DualShock 4' }]} group={scheme} onGroup={id => setScheme(id as Scheme)}
      stepLabel={t('pickers.xboxOrDs4', 'Xbox or DS4')}
      groupNote={t('pickers.sticksOnSticks', 'Whole sticks are on the Sticks tab')}
      hints={onSearch ? [{ button: 'Y', label: t('pickers.search', 'Search') }] : undefined}
      onPad={button => { if (button === 'Y' && onSearch) { onSearch(); return true } return false }}>
      <div className={styles.split} style={{ ['--split-w' as string]: '360px' }}>
        <div className={styles.splitSide}>
          <span className={turnsOn || switches ? styles.sideWarn : styles.sideQuiet}>{status}</span>
          <div className={styles.artWell} style={{ height: 220 }}>
            <ControllerArt family={scheme === 'DS4' ? 'playstation' : 'xbox'} model={scheme === 'DS4' ? 'dualshock-4' : 'xbox-series'} highlight={[focused.glyph]} />
          </div>
          <span className={styles.sideNote}>{by && by !== '-' ? t('pickers.usesItToo', '{{input}} uses it too', { input: by }) : t('pickers.gameSeesLine', 'The game sees {{button}}', { button: name(focused) })}</span>
        </div>
        <div ref={grid} className={styles.grid} style={{ ['--cols' as string]: 6 }} role="group" aria-label={`${schemeName} buttons`}>
          {BUTTONS.map(button => {
            const token = toVirtualControllerToken(button.logical, scheme)
            const unavailable = !token
            const isCurrent = button.logical === currentLogical && currentType === scheme
            return (
              <button key={button.logical} type="button" className={`${styles.tile} ${styles.padTile}`} data-logical={button.logical}
                data-current={isCurrent ? 'true' : undefined} aria-pressed={isCurrent} aria-label={name(button)}
                aria-disabled={unavailable ? 'true' : undefined}
                data-reason={unavailable ? t('pickers.ds4Only', 'Only a DualShock 4 has a touchpad to click · press LT or RT for DS4') : undefined}
                style={unavailable ? { background: 'transparent', boxShadow: 'inset 0 0 0 2px var(--surface-control)' } : undefined}
                data-caption={unavailable ? undefined : `${name(button)} · ${t('pickers.gameSeesLine', 'The game sees {{button}}', { button: name(button) })}`}
                data-hints={unavailable ? 'B:Back' : `A:${t('pickers.use', 'Use')}${onSearch ? `;Y:${t('pickers.search', 'Search')}` : ''}`}
                onFocus={() => setFocused(button)} onMouseEnter={() => { if (document.body.dataset.inputSource === 'mouse') setFocused(button) }}
                onClick={() => { if (!unavailable) choose(button) }}>
                {unavailable
                  ? <span className={styles.tileSub}>{button.xbox}</span>
                  // The guide button has no glyph of its own in the pad's art set.
                  : button.logical.startsWith('dpad') || button.logical === 'padClick' || button.logical === 'home'
                    ? <span className={styles.padLabel}>{name(button)}</span>
                    : <InputGlyph command={button.glyph} family={scheme === 'DS4' ? 'playstation' : 'xbox'} size={34} />}
              </button>
            )
          })}
        </div>
      </div>
    </PickerPage>
  )
}

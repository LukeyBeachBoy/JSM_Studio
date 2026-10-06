import { useContext, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ButtonDefinition } from '../../keymap/schema'
import type { OverlayMenu } from '../../utils/overlayLayout'
export type { PadRegionInfo } from '../../utils/menuDescriptions'
import type { IconName } from '../icons/iconData'
import { Icon } from '../icons/Icon'
import { MenuPreview } from './MenuPreview'
import { SummaryRow, RowGroup } from '../ui/SummaryRow'
import { Sheet } from '../ui/Sheet'
import { SettingOrigins } from '../SettingOrigin'
import { bindingSummary, describeMenuPlacement, type PadRegionInfo } from '../../utils/menuDescriptions'
import type { TouchpadModeCardConfig } from './TouchpadSettingsSection'
import type { LivePadTouch } from './TouchpadGridSection'
import { ScreenAreaPreview } from './ScreenAreaPreview'
import { MOUSE_AREA_FIT_OPTIONS, describeMouseArea, mapTouchToArea } from '../../utils/mouseArea'
import { toUnit } from '../../utils/overlayLayout'
import { TOUCHPAD_DUAL_STAGE_OPTIONS, touchpadDualStageHelpKey } from '../../utils/touchpadConfig'
import keymapStyles from '../Keymap.module.css'

const MODE_ICONS: Record<string, IconName> = { '': 'padNone', GRID_AND_STICK: 'padGrid', MOUSE: 'padMouse', MOUSE_AREA: 'padMouse', PS_TOUCHPAD: 'catGamepad' }
const MODE_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'GRID_AND_STICK', label: 'Menu' },
  { value: 'MOUSE', label: 'Mouse' },
  { value: 'MOUSE_AREA', label: 'Mouse area' },
  { value: 'PS_TOUCHPAD', label: 'PlayStation touchpad' },
]
const SHAPE_OPTIONS = [
  { value: 'RECTANGLE', label: 'Grid' },
  { value: 'FOUR_WAY', label: '4-way' },
  { value: 'EIGHT_WAY', label: '8-way' },
  { value: 'RADIAL', label: 'Radial' },
]
const SHAPE_LABELS: Record<string, string> = Object.fromEntries(SHAPE_OPTIONS.map(option => [option.value, option.label]))



type Props = {
  keyPrefix: 'LEFT_' | 'RIGHT_' | ''
  /** "Left pad". */
  title: string
  /** The connected pad's DOM identity: LEFT_PAD / RIGHT_PAD. */
  command: string
  config: TouchpadModeCardConfig
  /** The overlay's menu for this pad, when it is a grid. */
  menu?: OverlayMenu
  /** Where the menu's look is written: its overlay key and the config writer. */
  appearance?: { menuKey: string; onChange: (updater: (previous: string) => string) => void }
  /**
   * Put before every setting name this section shows an origin for. A pad
   * modeshift renders this same section against `MISC2,RIGHT_…` keys, and its
   * rows have to name where THOSE lines come from, not the unshifted ones.
   */
  settingPrefix?: string
  livePad?: LivePadTouch | null
  padAspect: number
  regions: ButtonDefinition[]
  selected: ButtonDefinition | null
  onSelect: (command: string) => void
  describeRegion: (command: string) => PadRegionInfo
  renderButton: (button: ButtonDefinition, options?: { defaultOpen?: boolean; label?: string; subtitle?: string; xAction?: { label: string; run: () => void } }) => ReactNode
  /** The line under the Mouse feel row, e.g. "Balanced smoothing · glide on · light ticks". */
  mouseFeel?: string
  /** The pad click: its binding's short name and its editor, for the Click row's sheet. */
  click?: { value: string; editor: ReactNode }
  /** Raw pad contact, independently bindable from click and regions. */
  touch?: { value: string; editor: ReactNode }
  feedback?: { value: string; editor: ReactNode }
  /** Bindings for inputs this pad does not have (a single-pad controller's). */
  otherControllers?: { count: number; id: string; children: ReactNode }
  /** The pad's touch stick, under the rows. */
  children?: ReactNode
  /** The pad's modeshifts: full width under the pad, each one this same section. */
  modeshifts?: ReactNode
  // Kept for callers written against the section before Mouse feel took the glide.
  trackballOn?: boolean
  onTrackballChange?: (on: boolean) => void
}

const WHERE_FOUR_WAY = ['Top', 'Right', 'Bottom', 'Left']

/**
 * One trackpad (console refinement 2b): the pad drawn in a 200px well, then
 * one summary row per thing the pad's mode needs. A menu pad: Mode, the
 * selected region, Click required and its On-screen menu. A mouse pad: Mode,
 * Sensitivity, Click and Mouse feel. The rest opens as a sheet from its row
 * -- columns, rows and centre deadzone live in the Mode sheet, dual-stage in
 * the Click sheet. X anywhere in a menu pad steps the selected region.
 */
export function PadSection({
  keyPrefix, title, command, config, menu, appearance, settingPrefix = '', livePad, padAspect, regions, selected, onSelect, describeRegion, renderButton,
  mouseFeel, click, touch, feedback, otherControllers, children, modeshifts,
}: Props) {
  const { t } = useTranslation()
  const configName = useContext(SettingOrigins).config
  const mode = (config.mode || '').toUpperCase()
  const grid = mode === 'GRID_AND_STICK'
  const shape = (config.gridShape || 'RECTANGLE').toUpperCase()
  const [sheet, setSheet] = useState<null | 'mode' | 'region' | 'click' | 'touch' | 'feedback' | 'sensitivity'>(null)
  const [othersOpen, setOthersOpen] = useState(false)
  const key = (name: string) => settingPrefix + keyPrefix + name
  const eyebrow = `Trackpads · ${configName ?? 'Configuration'}`

  const modeValue = grid ? `Menu · ${SHAPE_LABELS[shape] ?? shape}` : MODE_OPTIONS.find(option => option.value === mode)?.label ?? mode
  const detail = grid ? `Menu · ${regions.length} ${regions.length === 1 ? 'region' : 'regions'}` : modeValue

  const selectedIndex = selected ? regions.indexOf(selected) + 1 : 0
  const where = (index: number) => shape === 'FOUR_WAY'
    ? WHERE_FOUR_WAY[index - 1] ?? ''
    : shape === 'EIGHT_WAY' || shape === 'RADIAL'
      ? t('keymap.regionSegmentWhere', 'Segment {{index}}, clockwise from up', { index })
      : t('common.rowCol', { row: Math.floor((index - 1) / Math.max(1, config.gridColumns)) + 1, col: ((index - 1) % Math.max(1, config.gridColumns)) + 1 })
  const stepRegion = () => {
    if (regions.length === 0) return
    const next = regions[(Math.max(0, selectedIndex - 1) + 1) % regions.length]
    onSelect(next.command)
  }
  const onPadKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || !grid) return
    const target = event.target as HTMLElement
    if (target.matches('input, textarea, select, [contenteditable="true"]') || target.closest('.sheet-layer')) return
    if (event.key === 'x' || event.key === 'X') { event.preventDefault(); stepRegion() }
  }
  const livePoint = livePad?.touched ? { x: livePad.x, y: livePad.y } : null
  // Only a grid is a menu. A mouse pad used to draw the menu its click shift
  // opens, which made it look like a menu when touching it moves the mouse.
  const previewMenu = grid ? menu : undefined
  const previewAspect = previewMenu && (previewMenu.shape === 'RADIAL' || previewMenu.shape === 'EIGHT_WAY') ? 1 : padAspect
  const regionLabel = selected ? `${t('keymap.region', 'Region')} ${selectedIndex} · ${where(selectedIndex)}` : ''
  const sensitivity = config.sensitivity ?? 1
  const nextRegion = regions.length > 1 ? { label: t('keymap.nextRegion', 'Next region'), run: stepRegion } : undefined
  const mouseArea = mode === 'MOUSE_AREA'
  const areaFit = config.mouseAreaFit ?? 'STRETCH'
  // The live finger, put where the mapper would put the cursor: the preview
  // is a picture of the screen, not of the pad.
  const areaCursor = mouseArea && livePoint
    ? mapTouchToArea(toUnit(livePoint.x), toUnit(livePoint.y), config.mouseArea ?? { x: 0, y: 0, w: 1, h: 1 }, areaFit, padAspect, 16 / 9)
    : null

  return (
    <div className="pad-column" data-pad-keys={grid ? 'X' : undefined} onKeyDown={onPadKey}>
      <div className="pad-column__eyebrow">
        <span className="eyebrow">{title}</span>
        <span className="pad-column__detail">{detail}</span>
      </div>
      <div className="pad-column__well" data-hints={grid ? 'A:Bind;X:Next region;B:Back' : undefined}>
        {previewMenu
          ? <div className="pad-column__art" style={{ width: 176 * previewAspect }}>
              <MenuPreview menu={previewMenu} aspect={padAspect} fill selectedCommand={selected?.command ?? null} onSelect={onSelect} livePoint={livePoint} />
            </div>
          : mouseArea
          ? <div className="pad-column__art" style={{ width: 196 }}>
              <ScreenAreaPreview area={config.mouseArea ?? null} fit={areaFit} padAspect={padAspect} width={196} cursor={areaCursor} />
            </div>
          : <div className="pad-column__empty">
              <span className="pad-column__ring" aria-hidden="true">
                {mode !== 'MOUSE' && <Icon name={MODE_ICONS[mode] ?? 'padNone'} size={32} />}
                <span>{mode === 'MOUSE' ? t('keymap.padArtMouse', 'Moves the mouse') : mode === 'MOUSE_AREA' ? t('keymap.padArtMouseArea', 'Moves the mouse inside an area') : mode === 'PS_TOUCHPAD' ? t('keymap.padArtPs', 'PlayStation touchpad') : grid ? t('keymap.padArtEmpty', 'Bind a region to draw the menu') : t('keymap.padArtNone', 'No mode set')}</span>
              </span>
              {livePoint && <span className={keymapStyles.padStageDot} style={{ left: `calc(50% + ${livePoint.x * 88}px)`, top: `calc(50% + ${livePoint.y * 88}px)` }} aria-hidden="true" />}
            </div>}
      </div>

      <div className="pad-column__rows">
        <SummaryRow label={t('keymap.mode')} hint="What touching this pad does" setting={key('TOUCHPAD_MODE')} value={modeValue || 'Not set'}
          onActivate={() => setSheet('mode')} data={{ 'data-input-command': command }} />

        {grid && selected && (
          <SummaryRow label={regionLabel} hint="Selected on the preview" value={bindingSummary(describeRegion(selected.command))}
            onActivate={() => setSheet('region')} onX={nextRegion} data={{ 'data-input-command': settingPrefix + selected.command }} hints="A:Bind;B:Back" />
        )}
        {grid && (
          <SummaryRow label={t('keymap.clickRequired', 'Click required')} hint={t('keymap.clickRequiredHint', 'Regions fire only on pad click')}
            setting={key('GRID_REQUIRES_CLICK')} toggle={{ on: config.gridRequiresClick ?? false, onChange: next => config.onGridRequiresClickChange?.(next) }}
            onX={nextRegion} />
        )}
        {grid && menu && appearance && (
          <SummaryRow label="On-screen menu" hint={describeMenuPlacement(menu)} value="Arrange" hints="A:Arrange;B:Back" onX={nextRegion}
            onActivate={() => window.dispatchEvent(new CustomEvent('jsm:menu-layout', { detail: appearance.menuKey }))} />
        )}

        {mode === 'MOUSE' && (
          <SummaryRow label="Sensitivity" hint="Cursor distance per swipe" setting={key('TOUCHPAD_SENS')} mono
            value={`${sensitivity.toFixed(2)}×${config.sensitivityY !== undefined && config.sensitivityY !== sensitivity ? ` · ${config.sensitivityY.toFixed(2)}× up/down` : ''}`}
            onActivate={() => setSheet('sensitivity')} />
        )}
        {mouseArea && (
          <SummaryRow label={t('keymap.mouseAreaScreenArea', 'Screen area')} hint={t('keymap.mouseAreaScreenAreaHint', 'Draw it on the screen, over the game')}
            setting={key('TOUCHPAD_AREA')} mono value={describeMouseArea(config.mouseArea)} hints="A:Draw;B:Back"
            onActivate={config.onPickMouseArea} />
        )}
        {mouseArea && (
          <SummaryRow label={t('keymap.mouseAreaFit', 'Pad fit')} hint={t('keymap.mouseAreaFitHint', 'How a pad of a different shape lies over the area')}
            setting={key('TOUCHPAD_AREA_FIT')}
            adjust={{ kind: 'choice', value: areaFit, options: MOUSE_AREA_FIT_OPTIONS, onChange: value => config.onMouseAreaFitChange?.(value) }} />
        )}
        {touch && <SummaryRow label="Touch" hint="Finger contact on this pad" value={touch.value} onActivate={() => setSheet('touch')} />}
        {(click || config.onDualStageModeChange) && (
          <SummaryRow label="Click" hint="Pressing the pad in" value={click?.value ?? TOUCHPAD_DUAL_STAGE_OPTIONS.find(option => option.value === (config.dualStageMode || 'NO_SKIP'))?.label} onActivate={() => setSheet('click')} onX={grid ? nextRegion : undefined} />
        )}
        {feedback && <SummaryRow label="Feedback" hint="Movement ticks, click and release pulses" value={feedback.value} onActivate={() => setSheet('feedback')} />}
        {mode === 'MOUSE' && config.onOpenTuning && (
          <SummaryRow label="Trackpad feel" hint={mouseFeel ?? 'Mouse output tuning and shared feedback'} onActivate={config.onOpenTuning} />
        )}

        {otherControllers && (
          <details className={keymapStyles.stickRowDetails} id={otherControllers.id} open={othersOpen} onToggle={event => setOthersOpen(event.currentTarget.open)}>
            <summary className="summary-row" data-size="page" data-hints={othersOpen ? 'A:Hide;B:Back' : 'A:Show;B:Back'}>
              <span className="summary-row__text">
                <span className="summary-row__label">{t('keymap.otherControllerTypes', 'Other controller types')}</span>
                <span className="summary-row__hint">{t('keymap.otherControllerTypesHint', '{{count}} bindings for inputs this pad doesn’t have', { count: otherControllers.count })}</span>
              </span>
              <span className="summary-row__value">{othersOpen ? t('keymap.hide', 'Hide') : t('keymap.show', 'Show')}</span>
            </summary>
            <div className={keymapStyles.stickRowBody}>{otherControllers.children}</div>
          </details>
        )}
        {children}
      </div>
      {modeshifts}

      <Sheet open={sheet === 'mode'} onClose={() => setSheet(null)} eyebrow={eyebrow} title={`${title} · ${t('keymap.mode')}`}
        description="What touching this pad does. The layout rows only matter for a menu."
        hints={[{ button: 'A', label: 'Adjust' }, { button: 'Y', label: 'Use Default' }, { button: 'B', label: 'Close' }]}>
        <RowGroup title="Mode">
          <SummaryRow size="sheet" label={t('keymap.mode')} hint="What touching this pad does" setting={key('TOUCHPAD_MODE')}
            adjust={{ kind: 'choice', value: mode, options: MODE_OPTIONS, onChange: value => config.onModeChange?.(value) }} />
        </RowGroup>
        {grid && (
          <RowGroup title="Layout">
            <SummaryRow size="sheet" label="Regions" hint="How the pad is divided" setting={key('GRID_SHAPE')}
              adjust={{ kind: 'choice', value: shape, options: SHAPE_OPTIONS, onChange: value => config.onGridShapeChange?.(value) }} />
            {shape !== 'FOUR_WAY' && shape !== 'EIGHT_WAY' && <>
              <SummaryRow size="sheet" label={t('keymap.columns')} setting={key('GRID_SIZE')} mono
                hint={shape === 'RADIAL' ? t('keymap.gridShapeRadialSize', 'Rows times columns is the number of segments') : t('keymap.gridColumnsHint', 'Regions across the pad, up to five')}
                adjust={{ kind: 'number', value: config.gridColumns, min: 1, max: 5, step: 1, onChange: value => config.onGridSizeChange?.(value, config.gridRows) }} />
              <SummaryRow size="sheet" label={t('keymap.rows')} setting={key('GRID_SIZE')} mono
                hint={shape === 'RADIAL' ? t('keymap.gridShapeRadialSize', 'Rows times columns is the number of segments') : t('keymap.gridRowsHint', 'Regions down the pad, up to five')}
                adjust={{ kind: 'number', value: config.gridRows, min: 1, max: 5, step: 1, onChange: value => config.onGridSizeChange?.(config.gridColumns, value) }} />
            </>}
            {(shape === 'FOUR_WAY' || shape === 'EIGHT_WAY' || shape === 'RADIAL') && (
              <SummaryRow size="sheet" label={t('keymap.gridDeadzone', 'Centre deadzone')} hint={t('keymap.gridDeadzoneShort', 'How much of the middle presses nothing')}
                setting={key('GRID_DEADZONE')} mono value={`${Math.round((config.gridDeadzone ?? 0) * 100)}%`}
                adjust={{ kind: 'number', value: config.gridDeadzone ?? 0, min: 0, max: 1, step: 0.05, onChange: value => config.onGridDeadzoneChange?.(String(value)) }} />
            )}
          </RowGroup>
        )}
      </Sheet>

      <Sheet open={sheet === 'region' && Boolean(selected)} onClose={() => setSheet(null)} eyebrow={eyebrow} title={regionLabel}
        description={`${title}. X steps to the next region.`}
        hints={[{ button: 'A', label: 'Select' }, ...(nextRegion ? [{ button: 'X' as const, label: 'Next region' }] : []), { button: 'B', label: 'Close' }]}>
        {selected && renderButton(selected, {
          defaultOpen: true,
          label: regionLabel,
          subtitle: describeRegion(selected.command).label,
          xAction: nextRegion,
        })}
      </Sheet>

      <Sheet open={sheet === 'feedback' && Boolean(feedback)} onClose={() => setSheet(null)} eyebrow={eyebrow} title={`${title} · Feedback`}
        description="Feedback on this pad’s actuator. Movement ticks apply to Mouse mode; click and release work in every mode.">
        {feedback?.editor}
        {feedback?.value === 'Shared' && config.onOpenTuning && <SummaryRow size="sheet"
          label="Edit shared feedback" hint="Open the shared feedback defaults in Trackpad feel"
          onActivate={() => { setSheet(null); config.onOpenTuning?.() }} />}
      </Sheet>

      <Sheet open={sheet === 'touch' && Boolean(touch)} onClose={() => setSheet(null)} eyebrow={eyebrow} title={`${title} · Touch`}
        description="Bind finger contact independently of pad movement, menu regions and click. The touch/click policy controls how this binding combines with clicking.">
        {touch?.editor}
      </Sheet>

      <Sheet open={sheet === 'click' && Boolean(click || config.onDualStageModeChange)} onClose={() => setSheet(null)} eyebrow={eyebrow} title={`${title} · Click`}
        description="What pressing the pad does, and how its touch and click bindings combine."
        hints={[{ button: 'A', label: 'Select' }, { button: 'B', label: 'Close' }]}>
        {click?.editor}
        {config.onDualStageModeChange && (
          <RowGroup title="Click and touch">
            <SummaryRow size="sheet" label={t('keymap.touchpadDualStageMode')} hint="Combine this pad’s touch and click bindings"
              help={t(touchpadDualStageHelpKey(config.dualStageMode || 'NO_SKIP'))} setting={key('TOUCHPAD_DUAL_STAGE_MODE')}
              adjust={{ kind: 'choice', value: config.dualStageMode || 'NO_SKIP', options: TOUCHPAD_DUAL_STAGE_OPTIONS.map(option => ({ ...option, help: t(option.helpKey) })), onChange: value => config.onDualStageModeChange?.(value) }} />
          </RowGroup>
        )}
      </Sheet>

      <Sheet open={sheet === 'sensitivity'} onClose={() => setSheet(null)} eyebrow={eyebrow} title={`${title} · Sensitivity`}
        description={t('keymap.touchpadSensitivityHint', 'How far the mouse moves for a swipe across the pad')}>
        <SummaryRow size="sheet" label={t('keymap.touchpadSensitivityX', 'Horizontal sensitivity')} setting={key('TOUCHPAD_SENS')} mono value={`${sensitivity.toFixed(2)}×`}
          adjust={{ kind: 'number', value: sensitivity, min: 0, max: 10, step: 0.05, onChange: value => config.onSensitivityChange?.(String(value)) }} />
        <SummaryRow size="sheet" label={t('keymap.touchpadSensitivityY', 'Vertical sensitivity')} hint={t('keymap.touchpadSensitivityYHint', 'Vertical travel, when it should differ from horizontal')}
          setting={key('TOUCHPAD_SENS')} mono value={config.sensitivityY !== undefined ? `${config.sensitivityY.toFixed(2)}×` : 'Same'}
          adjust={{ kind: 'number', value: config.sensitivityY ?? sensitivity, min: 0, max: 10, step: 0.05, onChange: value => config.onSensitivityYChange?.(String(value)) }} />
      </Sheet>
    </div>
  )
}

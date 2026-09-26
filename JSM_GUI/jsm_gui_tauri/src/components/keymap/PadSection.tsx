import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ButtonDefinition } from '../../keymap/schema'
import type { OverlayMenu } from '../../utils/overlayLayout'
import type { IconName } from '../icons/iconData'
import { NumberField } from '../NumberField'
import { AdvancedDisclosure } from '../AdvancedDisclosure'
import { IconSelect } from './IconSelect'
import { AppSelect } from '../ui/AppSelect'
import { SettingOrigin } from '../SettingOrigin'
import { MenuPreview } from './MenuPreview'
import { MenuAppearance } from './MenuAppearance'
import { Icon } from '../icons/Icon'
import { ShapePicker } from './ShapePicker'
import { OriginMarker } from './OriginMarker'
import { useSettingOriginInfo } from './settingOriginInfo'
import type { TouchpadModeCardConfig } from './TouchpadSettingsSection'
import type { LivePadTouch } from './TouchpadGridSection'
import keymapStyles from '../Keymap.module.css'

const MODE_ICONS: Record<string, IconName> = { '': 'padNone', GRID_AND_STICK: 'padGrid', MOUSE: 'padMouse', PS_TOUCHPAD: 'catGamepad' }
const MODE_DESCRIPTIONS: Record<string, string> = {
  '': 'Not set: the pad does whatever JoyShockMapper defaults to',
  GRID_AND_STICK: 'Regions you bind, and a touch stick',
  MOUSE: 'Touch moves the mouse',
  PS_TOUCHPAD: 'Forwards touches to the virtual PlayStation pad',
}
const SHAPE_LABELS: Record<string, string> = { RECTANGLE: 'Grid', FOUR_WAY: '4-way', EIGHT_WAY: '8-way', RADIAL: 'Radial' }
const DUAL_STAGE_MODES = ['NO_FULL', 'NO_SKIP', 'NO_SKIP_EXCLUSIVE', 'MUST_SKIP', 'MAY_SKIP', 'MUST_SKIP_R', 'MAY_SKIP_R']

export type PadRegionInfo = { label?: string; binding: string; extra: number; icon?: string }

type Props = {
  keyPrefix: 'LEFT_' | 'RIGHT_'
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
   * markers have to name where THOSE lines come from, not the unshifted ones.
   */
  settingPrefix?: string
  livePad?: LivePadTouch | null
  padAspect: number
  regions: ButtonDefinition[]
  selected: ButtonDefinition | null
  onSelect: (command: string) => void
  describeRegion: (command: string) => PadRegionInfo
  renderButton: (button: ButtonDefinition, options?: { defaultOpen?: boolean; label?: string; subtitle?: string; xAction?: { label: string; run: () => void } }) => ReactNode
  /** Glide after lift-off (TOUCHPAD_TRACKBALL_DECAY > 0). */
  trackballOn?: boolean
  onTrackballChange?: (on: boolean) => void
  /** Bindings for inputs this pad does not have (a single-pad controller's). */
  otherControllers?: { count: number; id: string; children: ReactNode }
  /** The pad's click and touch stick, in the settings column. */
  children?: ReactNode
  /** The pad's modeshifts: full width under the pad, each one this same section. */
  modeshifts?: ReactNode
}

const WHERE_FOUR_WAY = ['Top of the pad', 'Right side of the pad', 'Bottom of the pad', 'Left side of the pad']

/**
 * One trackpad (Configuration Pages 15c): the overlay's own drawing of the pad
 * beside the shape tiles, the selected region's row and the click gate -- or,
 * for a mouse pad, its click regions, trackball glide and sensitivity.
 * Clicking a region on the preview, or X anywhere in the pad, steps the
 * selection.
 */
export function PadSection({
  keyPrefix, title, command, config, menu, appearance, settingPrefix = '', livePad, padAspect, regions, selected, onSelect, describeRegion, renderButton,
  trackballOn, onTrackballChange, otherControllers, children, modeshifts,
}: Props) {
  const { t } = useTranslation()
  const mode = (config.mode || '').toUpperCase()
  const grid = mode === 'GRID_AND_STICK'
  const shape = (config.gridShape || 'RECTANGLE').toUpperCase()
  const modeOrigin = useSettingOriginInfo(`${settingPrefix}${keyPrefix}TOUCHPAD_MODE`)
  const [othersOpen, setOthersOpen] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const key = (name: string) => settingPrefix + keyPrefix + name

  const detail = grid
    ? `${t('keymap.gridAndStick')} · ${SHAPE_LABELS[shape] ?? shape}`
    : mode === 'MOUSE'
      ? t('keymap.mouse')
      : mode ? MODE_DESCRIPTIONS[mode] ? t(`keymap.${mode === 'PS_TOUCHPAD' ? 'psTouchpad' : 'mouse'}`) : mode : undefined

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
    if (target.matches('input, textarea, select, [contenteditable="true"]')) return
    if (event.key === 'x' || event.key === 'X') { event.preventDefault(); stepRegion() }
  }
  const livePoint = livePad?.touched ? { x: livePad.x, y: livePad.y } : null
  // Only a grid is a menu. A mouse pad used to draw the menu its click shift
  // opens, which made it look like a menu when touching it moves the mouse.
  const previewMenu = grid ? menu : undefined
  const showAppearance = Boolean(grid && menu && appearance)
  const openAppearance = () => {
    setAppearanceOpen(true)
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-menu-appearance="${appearance?.menuKey}"] > summary`)?.focus())
  }

  return (
    <div className={keymapStyles.padSection} data-pad-keys={grid ? 'X' : undefined} onKeyDown={onPadKey}>
      <div className={keymapStyles.stickEyebrow}>
        <span className={keymapStyles.eyebrowHeading}>{title}</span>
        {detail && <span className={keymapStyles.stickEyebrowDetail}>{detail}</span>}
      </div>
      <div className={`${keymapStyles.stickLayout} ${keymapStyles.padLayout}`}>
        <div className={keymapStyles.padStageColumn}>
          <div className={keymapStyles.padStage} data-hints={grid ? 'A:Edit;X:Next region;B:Back' : undefined}>
            {previewMenu
              ? <MenuPreview menu={previewMenu} aspect={padAspect} fill selectedCommand={selected?.command ?? null} onSelect={onSelect} livePoint={livePoint} />
              : <div className={keymapStyles.padStageEmpty} style={{ aspectRatio: String(padAspect) }}>
                  <span className={keymapStyles.padStageArt} aria-hidden="true">
                    <Icon name={MODE_ICONS[mode] ?? 'padNone'} size={40} />
                    <span>{mode === 'MOUSE' ? t('keymap.padArtMouse', 'Moves the mouse') : mode === 'PS_TOUCHPAD' ? t('keymap.padArtPs', 'PlayStation touchpad') : grid ? t('keymap.padArtEmpty', 'Bind a region to draw the menu') : t('keymap.padArtNone', 'No mode set')}</span>
                  </span>
                  {livePoint && <span className={keymapStyles.padStageDot} style={{ left: `${(livePoint.x + 1) * 50}%`, top: `${(livePoint.y + 1) * 50}%` }} aria-hidden="true" />}
                </div>}
          </div>
          {showAppearance && (
            <button type="button" className={`button button--ghost button--sm ${keymapStyles.padStageLink}`} onClick={openAppearance}>
              <Icon name="menuLayout" size={16} />{t('keymap.menuAppearance', 'Menu appearance')}
            </button>
          )}
        </div>
        <div className={keymapStyles.stickRows}>
          <div className={`setting-row setting-row--compact ${keymapStyles.stickRow}`} data-input-command={command} data-capture-ignore="true" data-hints="A:Choose mode;B:Back">
            <div className={keymapStyles.stickRowText}>
              <span className={keymapStyles.stickRowTitle}>{t('keymap.mode')}</span>
              <span className={keymapStyles.stickRowHint}>
                {MODE_DESCRIPTIONS[mode] ?? mode}
              </span>
            </div>
            {/* Inherited or overridden, the marker names the file (15c "from FPS
                Template"), and stays addressable for the settings inventory. */}
            {(modeOrigin?.kind === 'override' || modeOrigin?.kind === 'inherited') && <OriginMarker setting={key('TOUCHPAD_MODE')} addressable />}
            <IconSelect
              icon={MODE_ICONS[mode] ?? 'padNone'}
              ariaLabel={`${title} ${t('keymap.mode')}`}
              value={mode}
              onValueChange={value => config.onModeChange?.(value)}
              placeholder={t('common.noneSelected')}
              options={[
                { value: '', label: t('common.noneSelected') },
                { value: 'GRID_AND_STICK', label: t('keymap.gridAndStick') },
                { value: 'MOUSE', label: t('keymap.mouse') },
                { value: 'PS_TOUCHPAD', label: t('keymap.psTouchpad') },
              ]}
            />
          </div>

          {grid && (
            <>
              <ShapePicker label={`${title} ${t('keymap.gridShape', 'Regions')}`} value={shape} onChange={value => config.onGridShapeChange?.(value)} />
              {shape !== 'FOUR_WAY' && shape !== 'EIGHT_WAY' && (
                <>
                  <NumberField layout="inline" label={t('keymap.columns')} setting={key('GRID_SIZE')} value={config.gridColumns} onChange={v => config.onGridSizeChange?.(Number(v) || 1, config.gridRows)} min={1} max={5} step={1}
                    hint={shape === 'RADIAL' ? t('keymap.gridShapeRadialSize', 'Rows times columns is the number of segments') : t('keymap.gridColumnsHint', 'Regions across the pad, up to five')} />
                  <NumberField layout="inline" label={t('keymap.rows')} setting={key('GRID_SIZE')} value={config.gridRows} onChange={v => config.onGridSizeChange?.(config.gridColumns, Number(v) || 1)} min={1} max={5} step={1}
                    hint={shape === 'RADIAL' ? t('keymap.gridShapeRadialSize', 'Rows times columns is the number of segments') : t('keymap.gridRowsHint', 'Regions down the pad, up to five')} />
                </>
              )}
              {(shape === 'FOUR_WAY' || shape === 'EIGHT_WAY' || shape === 'RADIAL') && (
                <NumberField layout="inline" label={t('keymap.gridDeadzone', 'Centre deadzone')} setting={key('GRID_DEADZONE')} value={config.gridDeadzone} onChange={v => config.onGridDeadzoneChange?.(v)} min={0} max={1} step={0.05}
                  hint={t('keymap.gridDeadzoneShort', 'How much of the middle presses nothing')} />
              )}
              {showAppearance && menu && appearance && (
                <MenuAppearance menuKey={appearance.menuKey} menu={menu} onChange={appearance.onChange} open={appearanceOpen} onOpenChange={setAppearanceOpen} />
              )}
              {selected && (() => {
                const info = describeRegion(selected.command)
                return renderButton(selected, {
                  defaultOpen: true,
                  label: `${t('keymap.region', 'Region')} ${selectedIndex}${info.label ? ` · ${info.label}` : ''}`,
                  subtitle: where(selectedIndex),
                  xAction: regions.length > 1 ? { label: t('keymap.nextRegion', 'Next region'), run: stepRegion } : undefined,
                })
              })()}
              <label className={`setting-row setting-row--compact ${keymapStyles.stickRow} ${keymapStyles.padSwitchRow}`} data-hints="A:Toggle;B:Back">
                <div className={keymapStyles.stickRowText}>
                  <span className={keymapStyles.stickRowTitle}>{t('keymap.clickRequired', 'Click required')}</span>
                  <span className={keymapStyles.stickRowHint}>{t('keymap.clickRequiredHint', 'Regions fire only on pad click')}</span>
                </div>
                <SettingOrigin setting={key('GRID_REQUIRES_CLICK')} />
                <input type="checkbox" className={keymapStyles.padSwitch} aria-label={t('keymap.gridRequiresClick')} checked={config.gridRequiresClick ?? false} onChange={event => config.onGridRequiresClickChange?.(event.target.checked)} />
              </label>
              <AdvancedDisclosure summary={config.dualStageMode || 'NO_SKIP'}>
                <label>
                  {t('keymap.touchpadDualStageMode')}
                  <AppSelect className="app-select" setting={key('TOUCHPAD_DUAL_STAGE_MODE')} value={config.dualStageMode || 'NO_SKIP'} onChange={event => config.onDualStageModeChange?.(event.target.value)}>
                    {DUAL_STAGE_MODES.map(value => <option key={value} value={value}>{value}</option>)}
                  </AppSelect>
                </label>
              </AdvancedDisclosure>
            </>
          )}

          {mode === 'MOUSE' && (
            <>
              {onTrackballChange && (
                <label className={`setting-row setting-row--compact ${keymapStyles.stickRow} ${keymapStyles.padSwitchRow}`} data-hints="A:Toggle;B:Back">
                  <div className={keymapStyles.stickRowText}>
                    <span className={keymapStyles.stickRowTitle}>{t('keymap.trackball', 'Trackball')}</span>
                    <span className={keymapStyles.stickRowHint}>{t('keymap.trackballHint', 'Glide after lift-off')}</span>
                  </div>
                  <SettingOrigin setting={settingPrefix + 'TOUCHPAD_TRACKBALL_DECAY'} />
                  <input type="checkbox" className={keymapStyles.padSwitch} aria-label={t('keymap.trackballGlide', 'Trackball glide after lift-off')} checked={Boolean(trackballOn)} onChange={event => onTrackballChange(event.target.checked)} />
                </label>
              )}
              <NumberField layout="inline" label={t('keymap.touchpadSensitivityX', 'Horizontal sensitivity')} setting={key('TOUCHPAD_SENS')} value={config.sensitivity} onChange={v => config.onSensitivityChange?.(v)} min={0} max={10} step={0.1} coarseStep={0.5} placeholder="1"
                hint={t('keymap.touchpadSensitivityHint', 'How far the mouse moves for a swipe across the pad')} />
              <NumberField layout="inline" label={t('keymap.touchpadSensitivityY', 'Vertical sensitivity')} setting={key('TOUCHPAD_SENS')} value={config.sensitivityY} onChange={v => config.onSensitivityYChange?.(v)} min={0} max={10} step={0.1} coarseStep={0.5} placeholder={config.sensitivity !== undefined ? String(config.sensitivity) : '1'}
                hint={t('keymap.touchpadSensitivityYHint', 'Vertical travel, when it should differ from horizontal')} />
              {config.onOpenTuning && (
                <div className={`setting-row setting-row--compact ${keymapStyles.stickRow}`} data-capture-ignore="true">
                  <div className={keymapStyles.stickRowText}>
                    <span className={keymapStyles.stickRowTitle}>{t('keymap.touchpadTuningTitle', 'Acceleration and smoothing')}</span>
                    <span className={keymapStyles.stickRowHint}>{t('keymap.touchpadTuningShort', 'Tuned for both pads at once')}</span>
                  </div>
                  <button type="button" className="button button--ghost button--sm" onClick={config.onOpenTuning}>{t('keymap.touchpadTuningPointerAction', 'Open trackpad tuning')}</button>
                </div>
              )}
            </>
          )}

          {otherControllers && (
            <details className={keymapStyles.stickRowDetails} id={otherControllers.id} open={othersOpen} onToggle={event => setOthersOpen(event.currentTarget.open)}>
              <summary className={`setting-row setting-row--compact ${keymapStyles.stickRow} ${keymapStyles.stickRowSummary}`} data-hints={othersOpen ? 'A:Hide;B:Back' : 'A:Show;B:Back'}>
                <div className={keymapStyles.stickRowText}>
                  <span className={keymapStyles.stickRowTitle}>{t('keymap.otherControllerTypes', 'Other controller types')}</span>
                  <span className={keymapStyles.stickRowHint}>{t('keymap.otherControllerTypesHint', '{{count}} bindings for inputs this pad doesn’t have', { count: otherControllers.count })}</span>
                </div>
                <span className={keymapStyles.valuePillQuiet}>{othersOpen ? t('keymap.hide', 'Hide') : t('keymap.show', 'Show')}</span>
              </summary>
              <div className={keymapStyles.stickRowBody}>{otherControllers.children}</div>
            </details>
          )}
          {/* The pad's click, touch stick and modeshifts stay in the settings
              column beside the pinned preview, not full width beneath it. */}
          {children}
        </div>
      </div>
      {modeshifts}
    </div>
  )
}

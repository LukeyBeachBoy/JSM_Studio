import { useTranslation } from 'react-i18next'
import { KeymapSection } from '../KeymapSection'
import keymapStyles from '../Keymap.module.css'
import styles from './Touchpad.module.css'
import { SectionActions } from '../SectionActions'
import { NumberField } from '../NumberField'
import { ShapePicker } from './ShapePicker'
import { AppSelect } from '../ui/AppSelect'
import { SummaryRow } from '../ui/SummaryRow'
import { ScreenAreaPreview } from './ScreenAreaPreview'
import { TOUCHPAD_DUAL_STAGE_OPTIONS, touchpadDualStageHelpKey } from '../../utils/touchpadConfig'
import { MOUSE_AREA_FIT_OPTIONS, describeMouseArea, type MouseArea, type MouseAreaFit } from '../../utils/mouseArea'

export type TouchpadModeCardConfig = {
  keyPrefix?: string
  mode: string
  dualStageMode: string
  gridColumns: number
  gridRows: number
  /** RECTANGLE (rows x columns), FOUR_WAY, EIGHT_WAY, or RADIAL. */
  gridShape?: string
  /** Fraction of the pad, centre to edge, that presses nothing in FOUR_WAY. */
  gridDeadzone?: number
  sensitivity?: number
  sensitivityY?: number
  onModeChange?: (v: string) => void
  onGridSizeChange?: (c: number, r: number) => void
  onGridShapeChange?: (v: string) => void
  onGridDeadzoneChange?: (v: string) => void
  onSensitivityChange?: (v: string) => void
  onSensitivityYChange?: (v: string) => void
  onDualStageModeChange?: (v: string) => void
  gridRequiresClick?: boolean
  onGridRequiresClickChange?: (checked: boolean) => void
  /** Takes the user to the Trackpad tuning page. Omitted, the pointer to it is hidden. */
  onOpenTuning?: () => void
  /** MOUSE_AREA: the rectangle of the screen the pad maps to; null is the whole screen. */
  mouseArea?: MouseArea | null
  mouseAreaFit?: MouseAreaFit
  onMouseAreaFitChange?: (v: string) => void
  /** Opens the on-screen picker to draw the area over the game. */
  onPickMouseArea?: () => void
  /** The pad's width over its height, for the area preview's UNIFORM ghost. */
  padAspect?: number
}

type Props = {
  touchpadMouseArea?: MouseArea | null
  touchpadMouseAreaFit?: MouseAreaFit
  onTouchpadMouseAreaFitChange?: (v: string) => void
  onPickTouchpadMouseArea?: () => void
  padAspect?: number
  left?: TouchpadModeCardConfig
  right?: TouchpadModeCardConfig
  touchpadMode: string
  touchpadDualStageMode: string
  gridColumns: number
  gridRows: number
  onTouchpadModeChange?: (v: string) => void
  onGridSizeChange?: (c: number, r: number) => void
  gridShape?: string
  gridDeadzone?: number
  onGridShapeChange?: (v: string) => void
  onGridDeadzoneChange?: (v: string) => void
  touchpadSensitivity?: number
  touchpadSensitivityY?: number
  onTouchpadSensitivityChange?: (v: string) => void
  onTouchpadSensitivityYChange?: (v: string) => void
  onTouchpadDualStageModeChange?: (v: string) => void
  touchpadGridRequiresClick?: boolean
  onTouchpadGridRequiresClickChange?: (checked: boolean) => void
  onOpenTuning?: () => void
  warnings?: string[]
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

// One pad's mode and the settings that only mean anything for that mode. Exported
// so the per-side Trackpads layout can place it inside a Left / Right column.
const MODE_DESCRIPTIONS: Record<string, string> = {
  GRID_AND_STICK: 'Regions you bind, and a touch stick',
  MOUSE: 'Touch moves the mouse',
  MOUSE_AREA: 'The pad is a map of one part of the screen: the cursor goes where your finger is, and stays inside',
  PS_TOUCHPAD: 'Forwards touches to the virtual PlayStation pad',
}

export function TouchpadModeCard({ config, title }: { config: TouchpadModeCardConfig; title?: string }) {
  const { t } = useTranslation()
  const key = (name: string) => (config.keyPrefix ?? '') + name
  return (
    <div className={styles.touchpadCard}>
      {title && <h4>{title}</h4>}
      <label>
        {t('keymap.mode')}
        <AppSelect setting={key('TOUCHPAD_MODE')} className="app-select" value={config.mode} onChange={e => config.onModeChange?.(e.target.value)}>
          <option value="">{t('common.noneSelected')}</option>
          <option value="GRID_AND_STICK">{t('keymap.gridAndStick')}</option>
          <option value="MOUSE">{t('keymap.mouse')}</option>
          <option value="MOUSE_AREA">{t('keymap.mouseArea', 'Mouse area')}</option>
          <option value="PS_TOUCHPAD">{t('keymap.psTouchpad')}</option>
        </AppSelect>
        {MODE_DESCRIPTIONS[config.mode] && <small>{MODE_DESCRIPTIONS[config.mode]}</small>}
      </label>
      {config.mode === 'GRID_AND_STICK' && (
        <>
          <ShapePicker label={`${title ?? ''} ${t('keymap.gridShape', 'Regions')}`.trim()} value={config.gridShape || 'RECTANGLE'} onChange={value => config.onGridShapeChange?.(value)} />
          {/* Each shape exposes only the dials that mean something to it: a
              wedge layout has four regions by definition, a wheel's rows and
              columns multiply into a segment count, and only the two round
              shapes have a hole in the middle. */}
          {config.gridShape === 'FOUR_WAY' && (
            <p className={styles.touchpadHint}>
              {t(
                'keymap.gridShapeFourWayHint',
                'The pad splits into four wedges about its centre, divided on the diagonals, so anywhere in the top quarter presses up. Regions 1 to 4 are up, right, down and left.'
              )}
            </p>
          )}
          {config.gridShape === 'EIGHT_WAY' && (
            <p className={styles.touchpadHint}>
              {t('keymap.gridShapeEightWayHint', 'The pad is divided into eight equal wedges, clockwise from up: up, up-right, right, down-right, down, down-left, left and up-left.')}
            </p>
          )}
          {config.gridShape === 'RADIAL' && (
            <p className={styles.touchpadHint}>
              {t('keymap.gridShapeRadialHint', {
                defaultValue:
                  'A weapon wheel of {{count}} segments, numbered clockwise from the top. Rows multiply by columns, so 8 x 1 and 4 x 2 both give eight. The deadzone is the hole in the middle, where nothing is selected.',
                count: Math.max(0, (config.gridColumns || 0) * (config.gridRows || 0)),
              })}
            </p>
          )}
          {config.gridShape !== 'FOUR_WAY' && config.gridShape !== 'EIGHT_WAY' && (
            <div className={styles.gridSizeInputs}>
              <NumberField
                layout="inline"
                label={t('keymap.columns')}
                setting={key('GRID_SIZE')} value={config.gridColumns}
                onChange={v => config.onGridSizeChange?.(Number(v) || 1, config.gridRows)}
                min={1}
                max={5}
                step={1}
              />
              <NumberField
                layout="inline"
                label={t('keymap.rows')}
                setting={key('GRID_SIZE')} value={config.gridRows}
                onChange={v => config.onGridSizeChange?.(config.gridColumns, Number(v) || 1)}
                min={1}
                max={5}
                step={1}
              />
            </div>
          )}
          {(config.gridShape === 'FOUR_WAY' || config.gridShape === 'EIGHT_WAY' || config.gridShape === 'RADIAL') && (
            <>
              <div className={styles.gridSizeInputs}>
                <NumberField
                  layout="inline"
                  label={t('keymap.gridDeadzone', 'Centre deadzone')}
                  setting={key('GRID_DEADZONE')} value={config.gridDeadzone}
                  onChange={v => config.onGridDeadzoneChange?.(v)}
                  min={0}
                  max={1}
                  step={0.05}
                />
              </div>
              <p className={styles.touchpadHint}>
                {t(
                  'keymap.gridDeadzoneHint',
                  'How much of the middle presses nothing, as a fraction of the pad from centre to edge. Stops a thumb resting at dead centre from flickering between two directions. 0 turns it off.'
                )}
              </p>
            </>
          )}
        </>
      )}
      {config.mode === 'MOUSE' && (
        <>
          <div className={styles.gridSizeInputs}>
            <NumberField
            layout="inline"
              label={t('keymap.touchpadSensitivityX', 'Horizontal sensitivity')}
              setting={key('TOUCHPAD_SENS')} value={config.sensitivity}
              onChange={v => config.onSensitivityChange?.(v)}
              min={0}
              max={10}
              step={0.1}
              coarseStep={0.5}
              placeholder="1"
            />
            <NumberField
            layout="inline"
              label={t('keymap.touchpadSensitivityY', 'Vertical sensitivity')}
              setting={key('TOUCHPAD_SENS')} value={config.sensitivityY}
              onChange={v => config.onSensitivityYChange?.(v)}
              min={0}
              max={10}
              step={0.1}
              coarseStep={0.5}
              placeholder={config.sensitivity !== undefined ? String(config.sensitivity) : '1'}
            />
          </div>
          {/* How a mouse pad feels is one set of dials shared by every pad
              set to Mouse: a row that opens its sheet (console refinement 2c). */}
          {config.onOpenTuning && (
            <SummaryRow label="Trackpad feel" hint="Mouse output tuning and shared feedback" onActivate={config.onOpenTuning} />
          )}
        </>
      )}
      {config.mode === 'MOUSE_AREA' && (
        <>
          {/* The area is drawn, not typed: the row opens the picker over the
              game, and the thumbnail shows where the last one landed. */}
          <ScreenAreaPreview area={config.mouseArea ?? null} fit={config.mouseAreaFit ?? 'STRETCH'} padAspect={config.padAspect ?? 1} width={220} />
          <SummaryRow label={t('keymap.mouseAreaScreenArea', 'Screen area')} hint={t('keymap.mouseAreaScreenAreaHint', 'Draw it on the screen, over the game')}
            setting={key('TOUCHPAD_AREA')} mono value={describeMouseArea(config.mouseArea)} onActivate={config.onPickMouseArea} />
          <SummaryRow label={t('keymap.mouseAreaFit', 'Pad fit')} hint={t('keymap.mouseAreaFitHint', 'How a pad of a different shape lies over the area')}
            setting={key('TOUCHPAD_AREA_FIT')}
            adjust={{ kind: 'choice', value: config.mouseAreaFit ?? 'STRETCH', options: MOUSE_AREA_FIT_OPTIONS, onChange: value => config.onMouseAreaFitChange?.(value) }} />
        </>
      )}
      {config.mode === 'GRID_AND_STICK' && (
        <>
          <SummaryRow label={t('keymap.gridRequiresClick')} hint={t('keymap.gridRequiresClickHint')}
            setting={key('GRID_REQUIRES_CLICK')}
            toggle={{ on: config.gridRequiresClick ?? false, onChange: next => config.onGridRequiresClickChange?.(next) }} />


        </>
      )}
      {config.onDualStageModeChange && <SummaryRow label={t('keymap.touchpadDualStageMode')}
        hint="Combine this pad’s touch and click bindings" setting={key('TOUCHPAD_DUAL_STAGE_MODE')}
        help={t(touchpadDualStageHelpKey(config.dualStageMode || 'NO_SKIP'))}
        adjust={{ kind: 'choice', value: config.dualStageMode || 'NO_SKIP', options: TOUCHPAD_DUAL_STAGE_OPTIONS.map(option => ({ ...option, help: t(option.helpKey) })), onChange: value => config.onDualStageModeChange?.(value) }} />}

    </div>
  )
}

// Sensor thresholds and mouse smoothing live on their own page: they describe the
// hardware, not what the pads are bound to, and mixing them into the binding
// screen buried them. See TouchpadSensorSection.
export function TouchpadSettingsSection(props: Props) {
  const { t } = useTranslation()
  const { left, right } = props
  return (
    <>
      <KeymapSection title={t('keymap.touchpadSettingsTitle')} description={t('keymap.touchpadSettingsDescription')}>
        <div className={styles.touchpadSettings}>
          {left && right ? (
            <div className={styles.touchpadSettings}>
              <TouchpadModeCard config={{...left, keyPrefix:'LEFT_'}} title={t('keymap.leftTouchpad', 'Left touchpad')} />
              <TouchpadModeCard config={{...right, keyPrefix:'RIGHT_'}} title={t('keymap.rightTouchpad', 'Right touchpad')} />
            </div>
          ) : (
            <TouchpadModeCard
              config={{
                mode: props.touchpadMode,
                dualStageMode: props.touchpadDualStageMode,
                gridColumns: props.gridColumns,
                gridRows: props.gridRows,
                sensitivity: props.touchpadSensitivity,
                sensitivityY: props.touchpadSensitivityY,
                onModeChange: props.onTouchpadModeChange,
                onGridSizeChange: props.onGridSizeChange,
                gridShape: props.gridShape,
                gridDeadzone: props.gridDeadzone,
                onGridShapeChange: props.onGridShapeChange,
                onGridDeadzoneChange: props.onGridDeadzoneChange,
                onSensitivityChange: props.onTouchpadSensitivityChange,
                onSensitivityYChange: props.onTouchpadSensitivityYChange,
                onDualStageModeChange: props.onTouchpadDualStageModeChange,
                gridRequiresClick: props.touchpadGridRequiresClick,
                onGridRequiresClickChange: props.onTouchpadGridRequiresClickChange,
                onOpenTuning: props.onOpenTuning,
                mouseArea: props.touchpadMouseArea,
                mouseAreaFit: props.touchpadMouseAreaFit,
                onMouseAreaFitChange: props.onTouchpadMouseAreaFitChange,
                onPickMouseArea: props.onPickTouchpadMouseArea,
                padAspect: props.padAspect,
              }}
              title={t('keymap.touchpad', 'Touchpad')}
            />
          )}
          {props.warnings?.map((w, i) => (
            <div key={i} className={styles.touchpadWarning}>{w}</div>
          ))}
        </div>
      </KeymapSection>
      <SectionActions
        className={keymapStyles.keymapSectionActions}
        hasPendingChanges={props.hasPendingChanges}
        statusMessage={props.statusMessage}
        onApply={props.onApply}
        onCancel={props.onCancel}
        applyDisabled={props.applyDisabled}
      />
    </>
  )
}

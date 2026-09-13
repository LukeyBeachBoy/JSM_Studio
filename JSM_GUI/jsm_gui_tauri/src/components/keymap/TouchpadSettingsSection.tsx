import { useTranslation } from 'react-i18next'
import { KeymapSection } from '../KeymapSection'
import keymapStyles from '../Keymap.module.css'
import styles from './Touchpad.module.css'
import { SectionActions } from '../SectionActions'
import { NumberField } from '../NumberField'
import { AdvancedDisclosure } from '../AdvancedDisclosure'
import { AppSelect } from '../ui/AppSelect'

export type TouchpadModeCardConfig = {
  mode: string
  dualStageMode: string
  gridColumns: number
  gridRows: number
  /** RECTANGLE (rows x columns) or FOUR_WAY (cardinal wedges). */
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
}

type Props = {
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

const DUAL_STAGE_MODES = ['NO_FULL', 'NO_SKIP', 'NO_SKIP_EXCLUSIVE', 'MUST_SKIP', 'MAY_SKIP', 'MUST_SKIP_R', 'MAY_SKIP_R']

// Reuses the same canonical explanations the trigger help modal shows for
// these modes -- TOUCHPAD_DUAL_STAGE_MODE is the same TriggerMode enum,
// TOUCH standing in for the soft pull and CAPTURE (the click) for the full
// pull. Keeping one accurate source of truth for what NO_SKIP/MAY_SKIP/etc
// actually do rather than re-describing them from scratch here.
const DUAL_STAGE_MODE_DESC_KEYS: Record<string, string> = {
  NO_FULL: 'keymap.touchpadDualStageMode_NO_FULL_desc',
  NO_SKIP: 'keymap.touchpadDualStageMode_NO_SKIP_desc',
  NO_SKIP_EXCLUSIVE: 'keymap.touchpadDualStageMode_NO_SKIP_EXCLUSIVE_desc',
  MUST_SKIP: 'keymap.touchpadDualStageMode_MUST_SKIP_desc',
  MAY_SKIP: 'keymap.touchpadDualStageMode_MAY_SKIP_desc',
  MUST_SKIP_R: 'keymap.touchpadDualStageMode_MUST_SKIP_R_desc',
  MAY_SKIP_R: 'keymap.touchpadDualStageMode_MAY_SKIP_R_desc',
}

// One pad's mode and the settings that only mean anything for that mode. Exported
// so the per-side Trackpads layout can place it inside a Left / Right column.
export function TouchpadModeCard({ config, title }: { config: TouchpadModeCardConfig; title?: string }) {
  const { t } = useTranslation()
  return (
    <div className={styles.touchpadCard}>
      {title && <h4>{title}</h4>}
      <label>
        {t('keymap.mode')}
        <AppSelect className="app-select" value={config.mode} onChange={e => config.onModeChange?.(e.target.value)}>
          <option value="">{t('common.noneSelected')}</option>
          <option value="GRID_AND_STICK">{t('keymap.gridAndStick')}</option>
          <option value="MOUSE">{t('keymap.mouse')}</option>
          <option value="PS_TOUCHPAD">{t('keymap.psTouchpad')}</option>
        </AppSelect>
      </label>
      {config.mode === 'GRID_AND_STICK' && (
        <>
          <label>
            {t('keymap.gridShape', 'Regions')}
            <AppSelect
              className="app-select"
              value={config.gridShape || 'RECTANGLE'}
              onChange={e => config.onGridShapeChange?.(e.target.value)}
            >
              <option value="RECTANGLE">{t('keymap.gridShapeRectangle', 'Grid (rows and columns)')}</option>
              <option value="FOUR_WAY">{t('keymap.gridShapeFourWay', '4-way button pad')}</option>
              <option value="RADIAL">{t('keymap.gridShapeRadial', 'Radial menu (wheel)')}</option>
            </AppSelect>
          </label>
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
          {config.gridShape === 'RADIAL' && (
            <p className={styles.touchpadHint}>
              {t('keymap.gridShapeRadialHint', {
                defaultValue:
                  'A weapon wheel of {{count}} segments, numbered clockwise from the top. Rows multiply by columns, so 8 x 1 and 4 x 2 both give eight. The deadzone is the hole in the middle, where nothing is selected.',
                count: Math.max(0, (config.gridColumns || 0) * (config.gridRows || 0)),
              })}
            </p>
          )}
          {config.gridShape !== 'FOUR_WAY' && (
            <div className={styles.gridSizeInputs}>
              <NumberField
                layout="inline"
                label={t('keymap.columns')}
                value={config.gridColumns}
                onChange={v => config.onGridSizeChange?.(Number(v) || 1, config.gridRows)}
                min={1}
                max={5}
                step={1}
              />
              <NumberField
                layout="inline"
                label={t('keymap.rows')}
                value={config.gridRows}
                onChange={v => config.onGridSizeChange?.(config.gridColumns, Number(v) || 1)}
                min={1}
                max={5}
                step={1}
              />
            </div>
          )}
          {(config.gridShape === 'FOUR_WAY' || config.gridShape === 'RADIAL') && (
            <>
              <div className={styles.gridSizeInputs}>
                <NumberField
                  layout="inline"
                  label={t('keymap.gridDeadzone', 'Centre deadzone')}
                  value={config.gridDeadzone}
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
              value={config.sensitivity}
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
              value={config.sensitivityY}
              onChange={v => config.onSensitivityYChange?.(v)}
              min={0}
              max={10}
              step={0.1}
              coarseStep={0.5}
              placeholder={config.sensitivity !== undefined ? String(config.sensitivity) : '1'}
            />
          </div>
          {/* Acceleration, trackball glide and smoothing are one global set of
              dials shared by both pads, so they live on the tuning page rather
              than being duplicated into each pad's card. This is the signpost. */}
          {config.onOpenTuning && (
            <div className={styles.tuningPointer}>
              <p>
                {t(
                  'keymap.touchpadTuningPointer',
                  'Acceleration, trackball glide and smoothing are tuned for both pads at once on the Trackpad tuning page.'
                )}
              </p>
              <button type="button" className="ghost-btn" onClick={config.onOpenTuning}>
                {t('keymap.touchpadTuningPointerAction', 'Open trackpad tuning')}
              </button>
            </div>
          )}
        </>
      )}
      {config.mode === 'GRID_AND_STICK' && (
        <>
          <label className={styles.touchpadCheckbox}>
            <input
              type="checkbox"
              checked={config.gridRequiresClick ?? false}
              onChange={e => config.onGridRequiresClickChange?.(e.target.checked)}
            />
            {t('keymap.gridRequiresClick')}
          </label>
          <p className={styles.touchpadHint}>{t('keymap.gridRequiresClickHint')}</p>
        <AdvancedDisclosure summary={config.dualStageMode || 'NO_SKIP'}>
          <label>
            {t('keymap.touchpadDualStageMode')}
            <AppSelect
              className="app-select"
              value={config.dualStageMode || 'NO_SKIP'}
              onChange={e => config.onDualStageModeChange?.(e.target.value)}
            >
              {DUAL_STAGE_MODES.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </AppSelect>
          </label>
          <p className={styles.touchpadHint}>
            {t(DUAL_STAGE_MODE_DESC_KEYS[config.dualStageMode || 'NO_SKIP'] ?? DUAL_STAGE_MODE_DESC_KEYS.NO_SKIP)}
          </p>

        </AdvancedDisclosure>
        </>
      )}
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
              <TouchpadModeCard config={left} title={t('keymap.leftTouchpad', 'Left touchpad')} />
              <TouchpadModeCard config={right} title={t('keymap.rightTouchpad', 'Right touchpad')} />
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

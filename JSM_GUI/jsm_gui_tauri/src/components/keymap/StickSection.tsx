import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatStickModeLabel, STICK_MODE_VALUES } from '../../constants/sticks'
import type { ButtonDefinition } from '../../keymap/schema'
import { hitTestRegion, type OverlayMenu } from '../../utils/overlayLayout'
import type { IconName } from '../icons/iconData'
import { NumberField } from '../NumberField'
import { AdvancedDisclosure } from '../AdvancedDisclosure'
import { IconSelect } from './IconSelect'
import { AppSelect } from '../ui/AppSelect'
import { SettingOrigin } from '../SettingOrigin'
import { MenuPreview } from './MenuPreview'
import { MenuAppearance } from './MenuAppearance'
import { StickPlot } from './StickPlot'
import { OriginMarker } from './OriginMarker'
import keymapStyles from '../Keymap.module.css'

const STICK_MODE_ICONS: Record<string, IconName> = {
  '': 'stDirections', NO_MOUSE: 'stDirections', AIM: 'stMouseAim', FLICK: 'stFlick', FLICK_ONLY: 'stFlickOnly', ROTATE_ONLY: 'stRotate',
  MOUSE_AREA: 'stMouseArea', SCROLL_WHEEL: 'stScroll', HYBRID_AIM: 'stHybrid', INNER_RING: 'stLightTilt', OUTER_RING: 'stFullTilt',
  RADIAL_MENU: 'stRadial', LEFT_STICK: 'stVirtual', RIGHT_STICK: 'stVirtual',
}

const STICK_MODE_DESCRIPTIONS: Record<string, string> = {
  '': 'Up, down, left, right bindings', NO_MOUSE: 'Up, down, left, right bindings', AIM: 'Moves the mouse, like the gyro does',
  FLICK: 'Flick to turn, rotate to sweep', FLICK_ONLY: 'Flick to turn', ROTATE_ONLY: 'Rotate to sweep',
  MOUSE_AREA: 'Positions the cursor inside a ring', SCROLL_WHEEL: 'Rotate to scroll', HYBRID_AIM: 'Aim on the rim, directions inside',
  INNER_RING: 'Directions, plus a light-tilt binding', OUTER_RING: 'Directions, plus a full-tilt binding',
  RADIAL_MENU: 'Point to pick a segment', LEFT_STICK: 'Passed through to the virtual pad’s left stick', RIGHT_STICK: 'Passed through to the virtual pad’s right stick',
}

export type StickRadial = {
  menu?: OverlayMenu
  segments: string
  deadzone: string
  buttons: ButtonDefinition[]
  selected: string | null
  onSelect: (command: string) => void
  onSegmentsChange: (value: string) => void
  onDeadzoneChange: (value: string) => void
  describe: (command: string) => { label?: string; binding: string; icon?: string }
  /** Where the wheel's look is written. */
  appearance?: { menuKey: string; onChange: (updater: (previous: string) => string) => void }
}

type Props = {
  side: 'left' | 'right'
  keyPrefix: 'LEFT_' | 'RIGHT_'
  /** "Left stick". */
  title: string
  /** Bind to WASD. */
  action?: ReactNode
  live?: { x: number; y: number } | null
  mode: string
  ring: string
  inner: string
  outer: string
  defaultInner: string
  defaultOuter: string
  onModeChange: (value: string) => void
  onRingChange: (value: string) => void
  onInnerChange: (value: string) => void
  onOuterChange: (value: string) => void
  disabled?: boolean
  /** The directions this mode still sends, in WASD reading order. */
  directionButtons: ButtonDefinition[]
  /** "W · A · S · D": what those directions send. */
  directionSummary: string
  clickButton?: ButtonDefinition
  ringButton?: ButtonDefinition
  touchButton?: ButtonDefinition
  renderButton: (button: ButtonDefinition, options?: { defaultOpen?: boolean; label?: string; subtitle?: string; xAction?: { label: string; run: () => void } }) => ReactNode
  /** The mode's own settings (flick and aim), and their rare half. */
  extras?: ReactNode
  extrasAdvanced?: ReactNode
  radial?: StickRadial
  /** The stick's modeshifts: full width under the stick. */
  modeshifts?: ReactNode
}

/**
 * One stick (Configuration Pages 15b): the live plot beside a column of
 * setting rows -- Mode, Directions, Click, Deadzone -- or, for a radial menu,
 * the wheel beside the selected segment's row, the segment count and the
 * select-past deadzone.
 */
export function StickSection({
  side, keyPrefix, title, action, live, mode, ring, inner, outer, defaultInner, defaultOuter,
  onModeChange, onRingChange, onInnerChange, onOuterChange, disabled,
  directionButtons, directionSummary, clickButton, ringButton, touchButton, renderButton, extras, extrasAdvanced, radial, modeshifts,
}: Props) {
  const { t } = useTranslation()
  const upper = (mode || '').toUpperCase()
  const radialMode = upper === 'RADIAL_MENU' && radial
  const innerValue = Number.parseFloat(inner || defaultInner) || 0
  const outerValue = Number.parseFloat(outer || defaultOuter) || 0
  const short = side === 'left' ? 'L3' : 'R3'
  const [zonesOpen, setZonesOpen] = useState(false)
  const [directionsOpen, setDirectionsOpen] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  // X on a segment row: light that wedge as the overlay would, for a second.
  const [hot, setHot] = useState<string | null>(null)
  useEffect(() => {
    if (!hot) return
    const timer = window.setTimeout(() => setHot(null), 1000)
    return () => window.clearTimeout(timer)
  }, [hot])

  const segmentCount = Math.max(0, Math.floor(Number.parseFloat(radial?.segments ?? '') || 0))
  const detail = radialMode
    ? `${formatStickModeLabel('RADIAL_MENU', t)} · ${segmentCount} ${segmentCount === 1 ? 'segment' : 'segments'}`
    : upper && upper !== 'NO_MOUSE' ? formatStickModeLabel(upper, t) : undefined

  // Where the stick is pointing on the wheel, by the overlay's own hit test.
  // Telemetry reports up as positive; the wheel reads down as positive.
  const liveHot = useMemo(() => {
    if (!radialMode || !radial.menu || !live) return -1
    const magnitude = Math.hypot(live.x, live.y)
    if (magnitude < (Number.parseFloat(radial.deadzone) || 0.35)) return -1
    return hitTestRegion(radial.menu, live.x, -live.y)
  }, [radialMode, radial, live])
  const selectedSegment = radialMode ? radial.buttons.find(button => button.command.toUpperCase() === radial.selected?.toUpperCase()) ?? radial.buttons[0] : undefined
  const selectedIndex = selectedSegment ? radial!.buttons.indexOf(selectedSegment) + 1 : 0
  const segmentLabels = radialMode
    ? radial.buttons.slice(0, 2).map((button, index) => { const info = radial.describe(button.command); return info.label ? `${index + 1} ${info.label}` : '' }).filter(Boolean)
    : []
  const segmentsHint = segmentLabels.length
    ? [...segmentLabels, segmentCount > 2 ? `3–${segmentCount} slots` : ''].filter(Boolean).join(' · ')
    : t('keymap.stickRadialSegmentsHint', 'Numbered clockwise from up')

  const modeOptions = STICK_MODE_VALUES.filter(value => value !== 'NO_MOUSE').map(value => ({ value, label: formatStickModeLabel(value, t) }))

  return (
    <div className={keymapStyles.stickSection}>
      <div className={keymapStyles.stickEyebrow}>
        <span className={keymapStyles.eyebrowHeading}>{title}</span>
        {detail && <span className={keymapStyles.stickEyebrowDetail}>{detail}</span>}
        {action && <span className={keymapStyles.stickEyebrowAction}>{action}</span>}
      </div>
      <div className={`${keymapStyles.stickLayout} ${keymapStyles.padLayout}`}>
        {radialMode ? (
          <div className={keymapStyles.stickWheel} id={`stick-extras-${side}`}>
            {radial.menu
              ? <MenuPreview menu={radial.menu} aspect={1} fill selectedCommand={selectedSegment?.command ?? null} hotCommand={hot} onSelect={radial.onSelect}
                  livePoint={live && Math.hypot(live.x, live.y) > 0.02 ? { x: live.x, y: -live.y } : null} />
              : <div className={keymapStyles.stickWheelEmpty}>{t('keymap.stickRadialNeedsSegments', 'Set at least two segments to draw the wheel.')}</div>}
            <div className={keymapStyles.stickReadout}>
              {t('keymap.stickRadialReadout', 'select past {{deadzone}} · {{hot}} · editing {{editing}}', {
                deadzone: (Number.parseFloat(radial.deadzone) || 0.35).toFixed(2),
                hot: liveHot >= 0 ? `segment ${liveHot + 1} hot` : 'centred',
                editing: selectedIndex || '—',
              })}
            </div>
          </div>
        ) : (
          <div className={keymapStyles.stickPlotCard}>
            {live ? <StickPlot x={live.x} y={live.y} inner={innerValue} outer={outerValue} label={title} /> : <StickPlot x={0} y={0} inner={innerValue} outer={outerValue} label={title} />}
          </div>
        )}
        <div className={keymapStyles.stickRows}>
          <div className={`setting-row setting-row--compact ${keymapStyles.stickRow}`} data-capture-ignore="true" data-hints="A:Choose mode;B:Back">
            <div className={keymapStyles.stickRowText}>
              <span className={keymapStyles.stickRowTitle}>{t('keymap.mode', 'Mode')}</span>
              <span className={keymapStyles.stickRowHint}>{STICK_MODE_DESCRIPTIONS[upper] ?? formatStickModeLabel(upper, t)}</span>
            </div>
            <SettingOrigin setting={`${keyPrefix}STICK_MODE`} />
            <IconSelect
              icon={STICK_MODE_ICONS[upper] ?? 'stDirections'}
              className={keymapStyles.stickModeSelect}
              ariaLabel={`${title} mode`}
              value={upper === 'NO_MOUSE' ? '' : upper}
              disabled={disabled}
              onValueChange={onModeChange}
              placeholder={formatStickModeLabel('NO_MOUSE', t)}
              groups={[
                { options: [{ value: '', label: `${formatStickModeLabel('NO_MOUSE', t)} (default)` }] },
                { options: modeOptions },
              ]}
            />
          </div>

          {radialMode ? (
            <>
              {selectedSegment && (() => {
                const info = radial.describe(selectedSegment.command)
                const iconName = info.icon ? info.icon.split(':').pop() : undefined
                const subtitle = [iconName ? `Icon: ${iconName}` : '', info.binding ? `key ${info.binding}` : t('keymap.unbound', 'Unbound')].filter(Boolean).join(' · ')
                return renderButton(selectedSegment, {
                  label: `${t('keymap.stickSegment', 'Segment')} ${selectedIndex}${info.label ? ` · ${info.label}` : ''}`,
                  subtitle,
                  xAction: { label: t('keymap.testSegment', 'Test segment'), run: () => setHot(selectedSegment.command) },
                })
              })()}
              <NumberField setting={`${keyPrefix}STICK_MENU_SIZE`} layout="inline" label={t('keymap.stickRadialSegments', 'Segments')} value={radial.segments} onChange={radial.onSegmentsChange}
                min={2} max={25} step={1} placeholder="8" disabled={disabled} hint={segmentsHint} />
              <NumberField setting={`${keyPrefix}STICK_MENU_DEADZONE`} layout="inline" label={t('keymap.stickRadialDeadzone', 'Select past')} value={radial.deadzone} onChange={radial.onDeadzoneChange}
                min={0} max={1} step={0.05} placeholder="0.35" disabled={disabled} hint={t('keymap.stickRadialDeadzoneHint', 'Deadzone before a segment is chosen')} />
              {radial.menu && radial.appearance && (
                <MenuAppearance menuKey={radial.appearance.menuKey} menu={radial.menu} onChange={radial.appearance.onChange} open={appearanceOpen} onOpenChange={setAppearanceOpen} />
              )}
            </>
          ) : directionButtons.length > 0 && (
            <details className={`${keymapStyles.stickRowDetails}`} open={directionsOpen} onToggle={event => setDirectionsOpen(event.currentTarget.open)}>
              <summary className={`setting-row setting-row--compact ${keymapStyles.stickRow} ${keymapStyles.stickRowSummary}`} data-hints={directionsOpen ? 'A:Close;B:Back' : 'A:Open;B:Back'}>
                <div className={keymapStyles.stickRowText}>
                  <span className={keymapStyles.stickRowTitle}>{t('keymap.stickDirections', 'Directions')}</span>
                  <span className={keymapStyles.stickRowHint}>{directionSummary}</span>
                </div>
                <OriginMarker setting={directionButtons[0]?.command} />
                <span className={keymapStyles.stickRowChevron} aria-hidden="true" />
              </summary>
              <div className={keymapStyles.stickRowBody}>
                {directionButtons.map(button => <div key={button.command}>{renderButton(button)}</div>)}
              </div>
            </details>
          )}

          {clickButton && renderButton(clickButton, { label: `${t('keymap.stickClick', 'Click')} (${short})` })}

          <details className={keymapStyles.stickRowDetails} open={zonesOpen} onToggle={event => setZonesOpen(event.currentTarget.open)}>
            <summary className={`setting-row setting-row--compact ${keymapStyles.stickRow} ${keymapStyles.stickRowSummary}`} data-hints={zonesOpen ? 'A:Close;B:Back' : 'A:Adjust;B:Back'}>
              <div className={keymapStyles.stickRowText}>
                <span className={keymapStyles.stickRowTitle}>{t('keymap.stickDeadzone', 'Deadzone')}</span>
                <span className={keymapStyles.stickRowHint}>{t('keymap.stickDeadzoneSummary', 'Inner {{inner}} · outer {{outer}}', { inner: innerValue.toFixed(2), outer: outerValue.toFixed(2) })}</span>
              </div>
              <OriginMarker setting={`${keyPrefix}STICK_DEADZONE_INNER`} />
              <span className={keymapStyles.valuePillNumber}>{innerValue.toFixed(2)}</span>
              <span className={keymapStyles.stickRowChevron} aria-hidden="true" />
            </summary>
            <div className={keymapStyles.stickRowBody}>
              <NumberField label={t('stickModes.innerDeadzone')} setting={`${keyPrefix}STICK_DEADZONE_INNER`} value={inner} onChange={onInnerChange} min={0} max={1} step={0.01} placeholder={defaultInner} disabled={disabled} layout="inline" />
              <NumberField label={t('stickModes.outerDeadzone')} setting={`${keyPrefix}STICK_DEADZONE_OUTER`} value={outer} onChange={onOuterChange} min={0} max={1} step={0.01} placeholder={defaultOuter} disabled={disabled} layout="inline" />
              <label className={keymapStyles.stickRingRow}>
                <span>{t('stickModes.ringMode')}</span>
                <AppSelect className="app-select" setting={`${keyPrefix}RING_MODE`} value={ring} onChange={event => onRingChange(event.target.value)} disabled={disabled}>
                  <option value="">{t('common.defaultValue', { value: t('stickModes.outer') })}</option>
                  <option value="INNER">{t('stickModes.inner')}</option>
                  <option value="OUTER">{t('stickModes.outer')}</option>
                </AppSelect>
              </label>
              {ringButton && renderButton(ringButton, { label: t('keymap.stickRingBinding', 'Ring binding') })}
            </div>
          </details>

          {touchButton && renderButton(touchButton)}
        </div>
      </div>
      {(extras || extrasAdvanced) && (
        <section className={keymapStyles.stickExtras} id={`stick-extras-${side}`} aria-label={t('keymap.flickAndAim', 'Flick and aim')}>
          <span className={keymapStyles.eyebrowHeading}>{t('keymap.flickAndAim', 'Flick and aim')}</span>
          {extras}
          {extrasAdvanced && <AdvancedDisclosure>{extrasAdvanced}</AdvancedDisclosure>}
        </section>
      )}
      {modeshifts}
    </div>
  )
}

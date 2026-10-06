import { namedMenuOverlay } from '../../utils/namedMenuOverlay'
import { StickMenuCard, type StickMenuConfig } from './StickMenuCard'
import { stickMenuLinks, isDirectStickMenu } from '../../utils/stickMenus'
import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatStickModeLabel, STICK_MODE_PICKER_VALUES, isFlickStickMode, stickModePickerValue, stickModeTuningLabel } from '../../constants/sticks'
import type { ButtonDefinition } from '../../keymap/schema'
import { hitTestRegion, type OverlayMenu } from '../../utils/overlayLayout'
import type { IconName } from '../icons/iconData'
import { IconSelect } from './IconSelect'
import { SettingOrigin, SettingOrigins } from '../SettingOrigin'
import { Sheet } from '../ui/Sheet'
import { MenuPreview } from './MenuPreview'
import { SummaryRow } from '../ui/SummaryRow'
import { OPTION_HELP } from '../../utils/optionHelp'
import { describeMenuPlacement } from '../../utils/menuDescriptions'
import { StickPlot } from './StickPlot'
import keymapStyles from '../Keymap.module.css'

const STICK_MODE_ICONS: Record<string, IconName> = {
  '': 'stDirections', NO_MOUSE: 'stDirections', AIM: 'stMouseAim', FLICK: 'stFlick', FLICK_ONLY: 'stFlickOnly', ROTATE_ONLY: 'stRotate',
  MOUSE_AREA: 'stMouseArea', SCROLL_WHEEL: 'stScroll', HYBRID_AIM: 'stHybrid', INNER_RING: 'stLightTilt', OUTER_RING: 'stFullTilt',
  RADIAL_MENU: 'stRadial', LEFT_STICK: 'stVirtual', RIGHT_STICK: 'stVirtual',
}

const STICK_MODE_DESCRIPTIONS: Record<string, string> = {
  '': 'Up, down, left, right bindings', NO_MOUSE: 'Up, down, left, right bindings', AIM: 'Tilt to move the mouse continuously',
  FLICK: 'Flick to turn, rotate to sweep', FLICK_ONLY: 'Flick to turn', ROTATE_ONLY: 'Rotate to sweep',
  MOUSE_AREA: 'Stick movement controls mouse displacement', MOUSE_RING: 'Cursor follows a circle around the screen centre', SCROLL_WHEEL: 'Rotate to pulse the left and right bindings', HYBRID_AIM: 'Mouse movement with optional continuous edge turning',
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
  menuConfig?: StickMenuConfig
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
  directionButtons, directionSummary, clickButton, ringButton, touchButton, renderButton, extras, extrasAdvanced, radial, modeshifts, menuConfig,
}: Props) {
  const { t } = useTranslation()
  const [chooseMenu, setChooseMenu] = useState(false)
  const reservedMenu = menuConfig && (stickMenuLinks(menuConfig.text, side).find(link => isDirectStickMenu(link.attachment, menuConfig.trigger)) ?? (menuConfig.trigger ? stickMenuLinks(menuConfig.text, side).find(link => link.attachment.activation === 'ALWAYS') : undefined))
  const upper = (mode || '').toUpperCase()
  const tuningTitle = stickModeTuningLabel(upper, t)
  const number = (raw: string | undefined, fallback: number) => {
    const value = Number.parseFloat(raw ?? '')
    return Number.isFinite(value) ? value : fallback
  }
  const radialMode = upper === 'RADIAL_MENU' && radial
  const innerValue = Number.parseFloat(inner || defaultInner) || 0
  const outerValue = Number.parseFloat(outer || defaultOuter) || 0
  const short = side === 'left' ? 'L3' : 'R3'
  // Directions, deadzone and flick/aim open as sheets from their rows (1d).
  const [sheet, setSheet] = useState<null | 'directions' | 'zones' | 'extras'>(null)
  const configName = useContext(SettingOrigins).config
  const eyebrow = `Joysticks · ${configName ?? 'Configuration'}`
  // X on a segment row: light that wedge as the overlay would, for a second.
  const [hot, setHot] = useState<string | null>(null)
  useEffect(() => {
    if (!hot) return
    const timer = window.setTimeout(() => setHot(null), 1000)
    return () => window.clearTimeout(timer)
  }, [hot])

  const segmentCount = Math.max(2, Math.min(25, Math.floor(number(radial?.segments, 8))))
  const detail = reservedMenu ? `${reservedMenu.menu.name} · Reserved for menu` : radialMode
    ? `${formatStickModeLabel('RADIAL_MENU', t)} · ${segmentCount} ${segmentCount === 1 ? 'segment' : 'segments'}`
    : upper && upper !== 'NO_MOUSE' ? formatStickModeLabel(stickModePickerValue(upper), t) : undefined

  // Where the stick is pointing on the wheel, by the overlay's own hit test.
  // Telemetry reports up as positive; the wheel reads down as positive.
  const liveHot = useMemo(() => {
    if (!radialMode || !radial.menu || !live) return -1
    const magnitude = Math.hypot(live.x, live.y)
    if (magnitude < number(radial.deadzone, 0.35)) return -1
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

  const menuPickerValue = reservedMenu?.menu.type === 'RADIAL' ? 'RADIAL_MENU' : 'VIRTUAL_MENU'
  const modeOptions: { value: string; label: string }[] = STICK_MODE_PICKER_VALUES.filter(value => value !== 'NO_MOUSE').map(value => ({ value, label: formatStickModeLabel(value, t), description: value === 'MOUSE_AREA' ? 'Move the mouse by moving the joystick; holding it still stops movement, and returning to centre moves the mouse back. Radius sets the travel scale. Example: make small cursor adjustments around a starting position. This does not lock the cursor to a screen rectangle.' : OPTION_HELP[value] }))

  if (reservedMenu && menuPickerValue === 'VIRTUAL_MENU') modeOptions.push({ value: 'VIRTUAL_MENU', label: 'Virtual menu' })

  return (
    <div className={keymapStyles.stickSection}>
      <div className={keymapStyles.stickEyebrow}>
        <span className={keymapStyles.eyebrowHeading}>{title}</span>
        {detail && <span className={keymapStyles.stickEyebrowDetail}>{detail}</span>}
        {action && !reservedMenu && <span className={keymapStyles.stickEyebrowAction}>{action}</span>}
      </div>
      <div className={`${keymapStyles.stickLayout} ${keymapStyles.padLayout}`}>
        {reservedMenu ? <div className={keymapStyles.stickWheel}><MenuPreview menu={namedMenuOverlay(reservedMenu.menu)} aspect={1} fill onSelect={() => window.dispatchEvent(new CustomEvent('jsm:virtual-menu', { detail: reservedMenu.menu.id }))} /></div> : radialMode ? (
          <div className={keymapStyles.stickWheel}>
            {radial.menu
              ? <MenuPreview menu={radial.menu} aspect={1} fill selectedCommand={selectedSegment?.command ?? null} hotCommand={hot} onSelect={radial.onSelect}
                  livePoint={live && Math.hypot(live.x, live.y) > 0.02 ? { x: live.x, y: -live.y } : null} />
              : <div className={keymapStyles.stickWheelEmpty}>{t('keymap.stickRadialNeedsSegments', 'Set at least two segments to draw the wheel.')}</div>}
            <div className={keymapStyles.stickReadout}>
              {t('keymap.stickRadialReadout', 'select past {{deadzone}} · {{hot}} · editing {{editing}}', {
                deadzone: number(radial.deadzone, 0.35).toFixed(2),
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
              <span className={keymapStyles.stickRowHint}>{reservedMenu ? 'Reserved for menu · movement and camera unavailable' : STICK_MODE_DESCRIPTIONS[upper] ?? formatStickModeLabel(upper, t)}</span>
            </div>
            <SettingOrigin setting={`${keyPrefix}STICK_MODE`} />
            <IconSelect
              icon={reservedMenu ? 'stRadial' : STICK_MODE_ICONS[stickModePickerValue(upper)] ?? 'stDirections'}
              className={keymapStyles.stickModeSelect}
              ariaLabel={`${title} mode`}
              value={reservedMenu ? menuPickerValue : upper === 'NO_MOUSE' ? '' : stickModePickerValue(upper)}
              disabled={disabled || !!(menuConfig?.trigger && reservedMenu?.attachment.activation === 'ALWAYS')}
              onValueChange={value => { if (value === 'VIRTUAL_MENU' && reservedMenu) window.dispatchEvent(new CustomEvent('jsm:virtual-menu', { detail: reservedMenu.menu.id })); else if (value === 'RADIAL_MENU' && menuConfig) setChooseMenu(true); else onModeChange(value) }}
              placeholder={formatStickModeLabel('NO_MOUSE', t)}
              groups={[
                { options: [{ value: '', label: `${formatStickModeLabel('NO_MOUSE', t)} (default)`, description: OPTION_HELP.NO_MOUSE }] },
                { options: modeOptions },
              ]}
            />
          </div>

          {menuConfig && <StickMenuCard side={side} config={menuConfig} choosing={chooseMenu} onClose={() => setChooseMenu(false)} legacy={!!radialMode && !reservedMenu} />}
          {!reservedMenu && (radialMode ? (
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
              <SummaryRow label={t('keymap.stickRadialSegments', 'Segments')} hint={segmentsHint} setting={`${keyPrefix}STICK_MENU_SIZE`} mono disabled={disabled}
                value={String(segmentCount || 8)}
                adjust={{ kind: 'number', value: segmentCount || 8, min: 2, max: 25, step: 1, onChange: value => radial.onSegmentsChange(String(value)) }} />
              <SummaryRow label={t('keymap.stickRadialDeadzone', 'Select past')} hint={t('keymap.stickRadialDeadzoneHint', 'Deadzone before a segment is chosen')} setting={`${keyPrefix}STICK_MENU_DEADZONE`} mono disabled={disabled}
                value={number(radial.deadzone, 0.35).toFixed(2)}
                adjust={{ kind: 'number', value: number(radial.deadzone, 0.35), min: 0, max: 1, step: 0.05, onChange: value => radial.onDeadzoneChange(String(value)) }} />
              {/* The wheel's look and place on screen: the On-screen menus view (2d). */}
              {radial.menu && radial.appearance && (
                <SummaryRow label="On-screen menu" hint={describeMenuPlacement(radial.menu)} value="Arrange" hints="A:Arrange;B:Back"
                  onActivate={() => window.dispatchEvent(new CustomEvent('jsm:menu-layout', { detail: radial.appearance!.menuKey }))} />
              )}
            </>
          ) : directionButtons.length > 0 && (
            <SummaryRow label={t('keymap.stickDirections', 'Directions')} hint={directionSummary} onActivate={() => setSheet('directions')}
              data={{ 'data-input-command': directionButtons[0]?.command }} />
          ))}

          {clickButton && renderButton(clickButton, { label: `${t('keymap.stickClick', 'Click')} (${short})` })}

          {!reservedMenu && <SummaryRow label={t('keymap.stickDeadzone', 'Deadzone')} setting={`${keyPrefix}STICK_DEADZONE_INNER`}
            hint={t('keymap.stickDeadzoneSummary', 'Inner {{inner}} · outer {{outer}}', { inner: innerValue.toFixed(2), outer: outerValue.toFixed(2) })}
            value={innerValue.toFixed(2)} mono onActivate={() => setSheet('zones')} />}

          {touchButton && renderButton(touchButton)}
        </div>
      </div>
      {!reservedMenu && (isFlickStickMode(upper) || extras || extrasAdvanced) && (
        <div className={keymapStyles.stickExtras}>
          <SummaryRow label={tuningTitle} onActivate={() => setSheet('extras')} />
        </div>
      )}
      {modeshifts}

      <Sheet open={sheet === 'directions'} onClose={() => setSheet(null)} eyebrow={eyebrow} title={`${title} · ${t('keymap.stickDirections', 'Directions')}`}
        description={directionSummary} hints={[{ button: 'A', label: 'Select' }, { button: 'B', label: 'Close' }]}>
        {directionButtons.map(button => <div key={button.command}>{renderButton(button)}</div>)}
      </Sheet>
      <Sheet open={sheet === 'zones'} onClose={() => setSheet(null)} eyebrow={eyebrow} title={`${title} · ${t('keymap.stickDeadzone', 'Deadzone')}`}
        description="How far the stick moves before it counts, and where full tilt starts.">
        <SummaryRow size="sheet" label={t('stickModes.innerDeadzone')} setting={`${keyPrefix}STICK_DEADZONE_INNER`} mono value={innerValue.toFixed(2)}
          adjust={{ kind: 'number', value: innerValue, min: 0, max: 1, step: 0.01, onChange: value => onInnerChange(String(value)) }} />
        <SummaryRow size="sheet" label={t('stickModes.outerDeadzone')} setting={`${keyPrefix}STICK_DEADZONE_OUTER`} mono value={outerValue.toFixed(2)}
          adjust={{ kind: 'number', value: outerValue, min: 0, max: 1, step: 0.01, onChange: value => onOuterChange(String(value)) }} />
        <SummaryRow size="sheet" label={t('stickModes.ringMode')} setting={`${keyPrefix}RING_MODE`}
          adjust={{ kind: 'choice', value: ring || '', options: [{ value: '', label: t('common.defaultValue', { value: t('stickModes.outer') }) }, { value: 'INNER', label: t('stickModes.inner') }, { value: 'OUTER', label: t('stickModes.outer') }], onChange: onRingChange }} />
        {ringButton && renderButton(ringButton, { label: t('keymap.stickRingBinding', 'Ring binding') })}
      </Sheet>
      <Sheet open={sheet === 'extras'} onClose={() => setSheet(null)} eyebrow={eyebrow} title={`${title} · ${tuningTitle}`}
        description={STICK_MODE_DESCRIPTIONS[upper] ?? formatStickModeLabel(upper, t)} hints={[{ button: 'A', label: 'Select' }, { button: 'B', label: 'Close' }]}>
        {isFlickStickMode(upper) && (
          <SummaryRow size="sheet" label={t('keymap.flickBehaviour', 'Behaviour')} setting={`${keyPrefix}STICK_MODE`} disabled={disabled}
            adjust={{ kind: 'choice', value: upper.toUpperCase(), options: [
              { value: 'FLICK', label: t('keymap.flickAndRotate', 'Flick and rotate') },
              { value: 'FLICK_ONLY', label: formatStickModeLabel('FLICK_ONLY', t) },
              { value: 'ROTATE_ONLY', label: formatStickModeLabel('ROTATE_ONLY', t) },
            ], onChange: onModeChange }} />
        )}
        <div className="sheet-embed">{extras}{extrasAdvanced}</div>
      </Sheet>
    </div>
  )
}

import { MenuPreview } from './MenuPreview'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { KeymapSection } from '../KeymapSection'
import { NumberField } from '../NumberField'
import keymapStyles from '../Keymap.module.css'
import { SectionActions } from '../SectionActions'
import {
  resolveOverlayMenus,
  setOverlayPlacement,
  type OverlayPad,
  type OverlayPlacement,
} from '../../utils/overlayLayout'
import { menuBox } from '../../utils/padGeometry'
import styles from './OverlayLayout.module.css'

type Props = {
  /** Import-resolved text, so a menu defined in a shared template still shows. */
  selectedMenu?: string
  readText: string
  onChange: (updater: (previous: string) => string) => void
  /** Real pad shape, so a box here is the shape the overlay will actually draw. */
  padAspect: number
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

const splitKey = (key: string): { pad: OverlayPad; layer: string } => {
  const [pad, layer = ''] = key.split(':')
  return { pad: pad as OverlayPad, layer }
}

/** Menus live on sticks as well as pads, and this panel used to call them all
 *  touchpads -- so a right stick wheel appeared here labelled "Right touchpad". */
const SURFACE_NAMES: Record<OverlayPad, [string, string]> = {
  LEFT: ['keymap.leftTouchpad', 'Left touchpad'],
  RIGHT: ['keymap.rightTouchpad', 'Right touchpad'],
  LSTICK: ['keymap.leftStickWheel', 'Left stick wheel'],
  RSTICK: ['keymap.rightStickWheel', 'Right stick wheel'],
}
const SURFACE_SHORT: Record<OverlayPad, [string, string]> = {
  LEFT: ['keymap.leftPadShort', 'L'],
  RIGHT: ['keymap.rightPadShort', 'R'],
  LSTICK: ['keymap.leftStickShort', 'LS'],
  RSTICK: ['keymap.rightStickShort', 'RS'],
}

export function OverlayLayoutSection(props: Props) {
  const { t } = useTranslation()
  const { readText, onChange, padAspect } = props
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => { setSelected(props.selectedMenu ?? null) }, [props.selectedMenu])
  const screenRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ key: string; mode: 'move' | 'resize' } | null>(null)

  const menus = useMemo(() => resolveOverlayMenus(readText), [readText])
  const keys = useMemo(() => Object.keys(menus).sort(), [menus])
  const activeKey = selected && menus[selected] ? selected : keys[0] ?? null
  const active = activeKey ? menus[activeKey] : null

  // The monitor's own proportions, so a box dragged here lands in the same
  // relative spot on screen. Falls back to 16:9 in a context with no screen.
  const screenAspect = typeof window !== 'undefined' && window.screen?.height
    ? window.screen.width / window.screen.height
    : 16 / 9

  const write = (key: string, next: Partial<OverlayPlacement>) => {
    const menu = menus[key]
    if (!menu) return
    const { pad, layer } = splitKey(key)
    onChange(previous => setOverlayPlacement(previous, pad, layer, { ...menu.placement, ...next }))
  }

  const onPointerDown = (key: string, mode: 'move' | 'resize') => (event: ReactPointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setSelected(key)
    dragRef.current = { key, mode }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current
    const box = screenRef.current?.getBoundingClientRect()
    if (!drag || !box || box.width === 0) return
    const menu = menus[drag.key]
    if (!menu) return
    const fx = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
    const fy = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height))
    if (drag.mode === 'move') {
      write(drag.key, { x: fx, y: fy })
      return
    }
    // Resize from the centre: the distance dragged is half the new width, so a
    // menu grows around where it sits instead of walking across the screen.
    const halfWidth = Math.abs(fx - menu.placement.x) * box.width
    // Convert the on-screen pixels back to the stored logical width, which is
    // expressed against the real screen rather than this scaled-down preview.
    const scale = (typeof window !== 'undefined' ? window.screen?.width : 0) || box.width
    write(drag.key, { size: Math.round((halfWidth * 2 * scale) / box.width) })
  }

  const endDrag = () => { dragRef.current = null }

  return (
    <>
      <KeymapSection
        title={t('keymap.overlayLayoutTitle', 'Overlay layout')}
        description={t(
          'keymap.overlayLayoutDescription',
          'Where each trackpad menu appears on screen while you are touching the pad.'
        )}
      >
        <p className={styles.hint}>
          {t(
            'keymap.overlayLayoutHint',
            'Drag a menu to move it, or drag its corner to resize. Positions are stored as a fraction of the screen, so a layout lands in the same place whatever resolution you play at. Each menu is the real shape of the pad it belongs to.'
          )}
        </p>

        {keys.length === 0 ? (
          <p className={styles.empty}>
            {t(
              'keymap.overlayLayoutEmpty',
              'No trackpad menus yet. Set a pad to Grid and Stick and bind at least one region, and it will appear here.'
            )}
          </p>
        ) : (
          <>
            {/* Menus start at their pad's default position, so a pad and its
                layers sit exactly on top of each other until they are dragged
                apart -- leaving the one underneath impossible to click. */}
            <div className={styles.picker} role="tablist">
              {keys.map(key => {
                const { pad, layer } = splitKey(key)
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={key === activeKey}
                    className={`${styles.chip} ${key === activeKey ? styles.chipActive : ''}`}
                    onClick={() => setSelected(key)}
                  >
                    {t(...SURFACE_NAMES[pad])}
                    {layer ? ` · ${layer}` : ''}
                  </button>
                )
              })}
            </div>
            <div
              className={styles.screen}
              ref={screenRef}
              style={{ ['--screen-aspect' as string]: String(screenAspect) } as CSSProperties}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerLeave={endDrag}
            >
              <span className={styles.screenLabel}>
                {t('keymap.overlayLayoutScreen', 'Your screen')}
              </span>
              {keys.map(key => {
                const menu = menus[key]
                const { pad, layer } = splitKey(key)
                const screenWidth = (typeof window !== 'undefined' ? window.screen?.width : 0) || 1920
                const box = menuBox(menu.placement.size, padAspect)
                // As a percentage of the screen, so the preview scales with the
                // panel it is drawn in rather than assuming any pixel size.
                const widthPct = (box.width / screenWidth) * 100
                const heightPct = (box.height / (screenWidth / screenAspect)) * 100
                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    aria-label={`${pad}${layer ? ` ${layer}` : ''}`}
                    className={`${styles.menu} ${key === activeKey ? styles.menuSelected : ''}`}
                    style={{
                      left: `${menu.placement.x * 100}%`,
                      top: `${menu.placement.y * 100}%`,
                      width: `${widthPct}%`,
                      height: `${heightPct}%`,
                    }}
                    onPointerDown={onPointerDown(key, 'move')}
                    onKeyDown={() => setSelected(key)}
                  >
                    <span className={styles.menuName}>
                      {t(...SURFACE_SHORT[pad])}
                      {layer ? ` · ${layer}` : ''}
                    </span>
                    <span
                      className={styles.handle}
                      onPointerDown={onPointerDown(key, 'resize')}
                      aria-hidden="true"
                    />
                  </div>
                )
              })}
            </div>

            {active && activeKey && (
              <div className={styles.controls}>
                <h4>
                  {t(...SURFACE_NAMES[splitKey(activeKey).pad])}
                  {splitKey(activeKey).layer ? ` · ${splitKey(activeKey).layer}` : ''}
                </h4>
                <div className={styles.controlRow}>
                  <NumberField
                    layout="inline"
                    label={t('keymap.overlaySize', 'Width (px)')}
                    value={active.placement.size}
                    onChange={v => write(activeKey, { size: Number(v) || 280 })}
                    min={120}
                    max={900}
                    step={10}
                  />
                  <NumberField
                    layout="inline"
                    label={t('keymap.overlayFontSize', 'Font size (px)')}
                    value={active.placement.fontSize}
                    onChange={v => write(activeKey, { fontSize: Number(v) || 14 })}
                    min={8}
                    max={48}
                    step={1}
                  />
                </div>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={active.placement.showLabels}
                    onChange={e => write(activeKey, { showLabels: e.target.checked })}
                  />
                  {t('keymap.overlayShowLabels', 'Show action names')}
                </label>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={active.placement.showKeys}
                    onChange={e => write(activeKey, { showKeys: e.target.checked })}
                  />
                  {t('keymap.overlayShowKeys', 'Show the key each region sends')}
                </label>
                {/* Which one you want depends on when the regions fire. A menu
                    that fires on release is a confirmation, and showing it only
                    once something is selected keeps the screen quiet; a menu
                    that fires on touch needs to be up BEFORE you commit, so you
                    can aim at the action you want. */}
                <fieldset className={styles.choice}>
                  <legend>{t('keymap.overlayRevealLegend', 'Show the menu')}</legend>
                  {(['ring', 'touch'] as const).map(mode => (
                    <label key={mode} className={styles.choiceOption}>
                      <input
                        type="radio"
                        name={`reveal-${activeKey}`}
                        checked={active.placement.reveal === mode}
                        onChange={() => write(activeKey, { reveal: mode })}
                      />
                      <span>
                        <strong>
                          {mode === 'ring'
                            ? t('keymap.overlayRevealRing', 'Once a region is selected')
                            : t('keymap.overlayRevealTouch', 'As soon as it is touched')}
                        </strong>
                        <small>
                          {mode === 'ring'
                            ? t(
                                'keymap.overlayRevealRingHint',
                                'Stays hidden until your thumb or the stick reaches the ring where the bindings are. Quieter, and the default for stick wheels.'
                              )
                            : t(
                                'keymap.overlayRevealTouchHint',
                                'Appears on any contact or tilt, before anything is selected, so you can aim at the action you want first. Use this when a region fires the moment it is touched.'
                              )}
                        </small>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <p className={styles.hint}>
                  {t(
                    'keymap.overlayLayoutStored',
                    'Stored in the profile as a comment line, so it travels with the config and JoyShockMapper ignores it.'
                  )}
                </p>
              </div>
            )}
          </>
        )}
      </KeymapSection>
      {active && <MenuPreview menu={active} aspect={padAspect} />}
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

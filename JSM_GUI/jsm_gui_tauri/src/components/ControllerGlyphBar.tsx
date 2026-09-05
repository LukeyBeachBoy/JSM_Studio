import { useTranslation } from 'react-i18next'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { controllerButtonGlyph, controllerVisualFamily } from '../utils/controllerStatus'
import styles from './ControllerGlyphBar.module.css'

type ControllerGlyphBarProps = {
  devices?: TelemetryDevice[]
  /** True while any dialog is open -- the hints change to "close". */
  modalOpen: boolean
  /** Controller navigation rule installed and AutoLoad on. */
  enabled: boolean
}

const TRIGGER_GLYPHS: Record<ReturnType<typeof controllerVisualFamily>, [string, string]> = {
  playstation: ['L2', 'R2'],
  nintendo: ['ZL', 'ZR'],
  xbox: ['LT', 'RT'],
  steam: ['LT', 'RT'],
  generic: ['ZL', 'ZR'],
}

// Steam-style footer: which controller button does what on this screen. Only
// shown while a controller is connected and the built-in navigation rule is
// live, so it never nags someone using a mouse.
export function ControllerGlyphBar({ devices, modalOpen, enabled }: ControllerGlyphBarProps) {
  const { t } = useTranslation()
  const device = devices?.[0]
  if (!enabled || !device) return null

  const type = device.type
  const [lt, rt] = TRIGGER_GLYPHS[controllerVisualFamily(type)]
  const hints: Array<{ glyphs: string[]; label: string }> = modalOpen
    ? [
        { glyphs: [controllerButtonGlyph(type, 'S')], label: t('glyphBar.select') },
        { glyphs: [controllerButtonGlyph(type, 'E')], label: t('glyphBar.close') },
        { glyphs: ['✥'], label: t('glyphBar.move') },
      ]
    : [
        { glyphs: [controllerButtonGlyph(type, 'S')], label: t('glyphBar.select') },
        { glyphs: [controllerButtonGlyph(type, 'E')], label: t('glyphBar.back') },
        { glyphs: ['✥'], label: t('glyphBar.move') },
        { glyphs: [controllerButtonGlyph(type, 'L'), controllerButtonGlyph(type, 'R')], label: t('glyphBar.step') },
        { glyphs: [lt, rt], label: t('glyphBar.page') },
        { glyphs: ['▭'], label: t('glyphBar.cursor') },
      ]

  return (
    <div className={styles.bar} role="status" aria-live="off">
      {hints.map(hint => (
        <span key={hint.label} className={styles.hint}>
          {hint.glyphs.map(glyph => (
            <kbd key={glyph} className={styles.glyph}>
              {glyph}
            </kbd>
          ))}
          <span className={styles.label}>{hint.label}</span>
        </span>
      ))}
    </div>
  )
}

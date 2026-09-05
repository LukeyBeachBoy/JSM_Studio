import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { controllerVisualFamily } from '../utils/controllerStatus'
import { InputGlyph } from './glyphs/InputGlyph'
import styles from './ControllerGlyphBar.module.css'

type ControllerGlyphBarProps = {
  devices?: TelemetryDevice[]
  /** True while any dialog is open -- the hints change to "close". */
  modalOpen: boolean
  /** Controller navigation rule installed and AutoLoad on. */
  enabled: boolean
}

// Steam-style footer: which controller input does what on this screen. Only
// shown while a controller is connected and the built-in navigation rule is
// live, so it never nags someone using a mouse.
export function ControllerGlyphBar({ devices, modalOpen, enabled }: ControllerGlyphBarProps) {
  const { t } = useTranslation()
  const device = devices?.[0]
  if (!enabled || !device) return null

  const family = controllerVisualFamily(device.type)
  const glyph = (command: string) => <InputGlyph key={command} command={command} family={family} size={15} />

  // The d-pad hint is all four directions as one cluster, and the cursor hint
  // is the right pad -- neither is a single button, so both are drawn as sets.
  const dpadCluster: ReactNode = (
    <span className={styles.cluster}>
      {['UP', 'LEFT', 'DOWN', 'RIGHT'].map(command => (
        <InputGlyph key={command} command={command} family={family} size={11} />
      ))}
    </span>
  )

  const hints: Array<{ key: string; glyphs: ReactNode[]; label: string }> = modalOpen
    ? [
        { key: 'select', glyphs: [glyph('S')], label: t('glyphBar.select') },
        { key: 'close', glyphs: [glyph('E')], label: t('glyphBar.close') },
        { key: 'move', glyphs: [dpadCluster], label: t('glyphBar.move') },
      ]
    : [
        { key: 'select', glyphs: [glyph('S')], label: t('glyphBar.select') },
        { key: 'back', glyphs: [glyph('E')], label: t('glyphBar.back') },
        { key: 'move', glyphs: [dpadCluster], label: t('glyphBar.move') },
        { key: 'step', glyphs: [glyph('L'), glyph('R')], label: t('glyphBar.step') },
        { key: 'page', glyphs: [glyph('ZL'), glyph('ZR')], label: t('glyphBar.page') },
        { key: 'cursor', glyphs: [glyph('TOUCH')], label: t('glyphBar.cursor') },
      ]

  return (
    <div className={styles.bar} role="status" aria-live="off">
      {hints.map(hint => (
        <span key={hint.key} className={styles.hint}>
          <span className={styles.glyphGroup}>{hint.glyphs}</span>
          <span className={styles.label}>{hint.label}</span>
        </span>
      ))}
    </div>
  )
}

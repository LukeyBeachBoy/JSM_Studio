import { useEffect, useState, type ReactNode } from 'react'
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
  const [interaction, setInteraction] = useState('')
  useEffect(() => {
    const update = () => setInteraction(document.body.dataset.bindingCapture === 'true' ? 'Capturing input · Esc cancels' : document.activeElement?.closest('[data-adjusting="true"]') ? 'Adjust value · Left / Right · Back finishes' : '')
    document.addEventListener('focusin', update)
    document.addEventListener('keyup', update)
    window.addEventListener('jsm:interaction-hint', update)
    return () => { document.removeEventListener('focusin', update); document.removeEventListener('keyup', update); window.removeEventListener('jsm:interaction-hint', update) }
  }, [])
  const device = devices?.[0]
  if (!enabled || !device) return <div className={styles.bar} aria-label="Navigation hints"><span>{interaction || `↑ ↓ ← → Navigate · Enter Select · Esc ${modalOpen ? 'Close' : 'Back'}`}</span><span className={styles.keyboardHint}>Ctrl+S Save · Ctrl+Shift+A Apply</span></div>

  const family = controllerVisualFamily(device.type)
  const glyph = (command: string) => <InputGlyph key={command} command={command} family={family} size={22} />

  // The d-pad hint is all four directions as one cluster, and the cursor hint
  // is the right pad -- neither is a single button, so both are drawn as sets.
  const dpadCluster: ReactNode = (
    <span key="dpad-cluster" className={styles.cluster}>
      {['UP', 'LEFT', 'DOWN', 'RIGHT'].map(command => (
        <InputGlyph key={command} command={command} family={family} size={16} />
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
      {interaction ? <span>{interaction}</span> : hints.map(hint => (
        <span key={hint.key} className={styles.hint}>
          <span className={styles.glyphGroup}>{hint.glyphs}</span>
          <span className={styles.label}>{hint.label}</span>
        </span>
      ))}
      <span className={styles.keyboardHint}>Esc Back · Ctrl+S Save</span>
    </div>
  )
}

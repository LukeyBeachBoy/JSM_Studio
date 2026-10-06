import { useTranslation } from 'react-i18next'
import type { KeymapControlsProps } from '../components/KeymapControls'
import { StickAimSettings, StickFlickSettings } from '../components/StickModeExtras'
import { NumberField } from '../components/NumberField'
import stickStyles from '../components/Sticks.module.css'
import keymapStyles from '../components/Keymap.module.css'
import { SourceAxisTuning, SourceModeTuning, type SourceModeConfig } from '../components/SourceModeTuning'

type ModeSettings = Pick<KeymapControlsProps, 'stickAimSettings' | 'stickAimHandlers' | 'stickFlickSettings' | 'stickFlickHandlers' | 'mouseRingRadius' | 'onMouseRingRadiusChange' | 'scrollSens' | 'onScrollSensChange' | 'virtualControllerType'> & SourceModeConfig

// Most stick modes have a handful of settings and nothing worth hiding.
const withoutAdvanced = (primary: JSX.Element) => ({ primary, advanced: null })

export function useStickModeExtras(mode: string, settings: ModeSettings, disabled = false) {
  const { t } = useTranslation()
  const withAxes = (result: { primary: JSX.Element | null; advanced: JSX.Element | null }) => settings.sourceAxisKey
    ? { ...result, advanced: <>{result.advanced}<SourceAxisTuning {...settings} disabled={disabled} /></> } : result
  return withAxes(stickModeExtras(mode, settings, disabled, t))
}

function stickModeExtras(mode: string, settings: ModeSettings, disabled: boolean, t: ReturnType<typeof useTranslation>['t']) {
  mode = mode.trim().toUpperCase()
  const { stickAimSettings, stickAimHandlers, stickFlickSettings, stickFlickHandlers, mouseRingRadius, onMouseRingRadiusChange, scrollSens, onScrollSensChange, virtualControllerType } = settings
  const contextual = <SourceModeTuning mode={mode} configText={settings.configText} onConfigTextChange={settings.onConfigTextChange} disabled={disabled} />
  if ((mode === 'AIM' || mode === 'HYBRID_AIM') && stickAimSettings && stickAimHandlers) {
      return {
        primary: <StickAimSettings values={stickAimSettings} handlers={stickAimHandlers} disabled={disabled} part="primary" />,
        advanced: <><StickAimSettings values={stickAimSettings} handlers={stickAimHandlers} disabled={disabled} part="advanced" />{mode === 'HYBRID_AIM' && contextual}</>,
      }
    }
  if ((mode === 'FLICK' || mode === 'FLICK_ONLY' || mode === 'ROTATE_ONLY') && stickFlickSettings && stickFlickHandlers) {
      return {
        primary: <StickFlickSettings values={stickFlickSettings} handlers={stickFlickHandlers} disabled={disabled} part="primary" />,
        advanced: <><StickFlickSettings values={stickFlickSettings} handlers={stickFlickHandlers} disabled={disabled} part="advanced" />{contextual}</>,
      }
    }
    // A radial menu's wheel, segments and select-past deadzone are the
    // stick's own rows (StickSection, 15b), not mode extras.
    if (mode === 'MOUSE_AREA' && mouseRingRadius !== undefined && onMouseRingRadiusChange) {
      return withoutAdvanced(
        <div className={stickStyles.stickFlickSettings} data-capture-ignore="true">
          <small>{t('keymap.mouseAreaRadiusNote')}</small>
          <div className={stickStyles.stickAimGrid}>
            <NumberField setting="MOUSE_RING_RADIUS"
              label={t('keymap.mouseAreaRadius')}
              value={mouseRingRadius}
              onChange={onMouseRingRadiusChange}
              min={0}
              max={2000}
              step={10}
              coarseStep={100}
              unit="px"
              defaultValue={128}
              placeholder={t('common.defaultValue', { value: '128' })}
              disabled={disabled}
            />
          </div>
        </div>
      )
    }
    if (mode === 'SCROLL_WHEEL' && scrollSens !== undefined && onScrollSensChange) {
      return withoutAdvanced(
        <div className={stickStyles.stickFlickSettings} data-capture-ignore="true">
          <small>{t('keymap.scrollBindingsNote')}</small>
          <small>{t('keymap.scrollSensitivityNote')}</small>
          <div className={stickStyles.stickAimGrid}>
            <NumberField setting="SCROLL_SENS"
              label={t('keymap.scrollSensitivity')}
              value={scrollSens}
              onChange={onScrollSensChange}
              min={0}
              max={180}
              step={1}
              coarseStep={10}
              unit="°"
              defaultValue={30}
              placeholder={t('common.defaultValue', { value: '30' })}
              disabled={disabled}
            />
          </div>
        </div>
      )
    }
    if (mode === 'LEFT_STICK' || mode === 'RIGHT_STICK') {
      return withoutAdvanced(
        <div className={stickStyles.stickFlickSettings} data-capture-ignore="true">
          <small>{t('stickModes.virtualStickHint')}</small>
          {contextual}
          {virtualControllerType === 'NONE' && (
            <div className={keymapStyles.virtualControllerWarning}>
              {t('stickModes.virtualStickDisabledWarning')}
            </div>
          )}
        </div>
      )
    }
    if (mode === 'MOUSE_RING' || mode.includes('_ANGLE_TO_') || mode.endsWith('_WIND_X')) return withoutAdvanced(contextual)
    return { primary: null, advanced: null }
}

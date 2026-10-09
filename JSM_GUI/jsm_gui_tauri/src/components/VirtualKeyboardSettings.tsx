import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { keyboard, defaultPreferences, previewFrame, shortcutLabels, type KeyboardPreferences, type ShortcutAction } from '../keyboard/bridge'
import { KeyboardView, ShortcutGlyph } from '../keyboard/KeyboardView'
import { HAPTIC_EFFECT_CHOICES } from '../utils/hapticBindings'
import { controllerVisualFamily } from '../utils/controllerStatus'
import { ModeCards, OpenRow, SegmentedRow, SubPage, ValueRow } from './ui/console'
import { SettingsNote, SettingsSection, SwitchRow, usePadButton } from './settings/SettingsKit'
import { useShell } from '../shell/ShellContext'
import settingsStyles from './settings/Settings.module.css'
import './VirtualKeyboardSettings.css'

// The on-screen keyboard (console v2, Settings ▸ Controller, continued): the
// layout as picture cards, how it looks, four feel sliders, and the
// controller shortcuts as rows. A uses a layout, X opens the keyboard, Y
// resets the focused row. Saved as it changes, in order, so an older save
// never lands after a newer one.

const LAYOUTS = [
  { value: 'standard', label: 'Standard', caption: 'Either pad, the D-pad or the left stick chooses a key' },
  { value: 'split', label: 'Split', caption: 'Each trackpad picks keys on its half; click a pad to type' },
  { value: 'daisywheel', label: 'Daisywheel', caption: 'Left stick and face buttons; triggers for symbols' },
] as const

const LOOKS = [
  { value: 'theme', label: 'Match the app' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
]

// The shortcut legend's names, short as the design writes them.
const SHORT: Record<ShortcutAction, string> = { backspace: 'Backspace', space: 'Space', shift: 'Shift', caps: 'Caps', enter: 'Enter', symbols: 'Symbols', close: 'Close', move: 'Move', scale: 'Resize', reset: 'Reset' }

const BUTTONS: [string, string][] = [['L', 'Left bumper'], ['R', 'Right bumper'], ['ZL', 'Left trigger'], ['ZR', 'Right trigger'], ['L3', 'Left stick click'], ['R3', 'Right stick click'], ['+', 'Menu'], ['-', 'View'], ['W', 'West face button'], ['N', 'North face button'], ['E', 'East face button'], ['UP', 'D-pad up'], ['DOWN', 'D-pad down'], ['LEFT', 'D-pad left'], ['RIGHT', 'D-pad right'], ['LSL', 'Left rear button'], ['RSL', 'Right rear button'], ['L3+R3', 'Both stick clicks'], ['L+R', 'Both bumpers']]

/** A layout card's picture: the keys it shows, drawn flat. */
function LayoutArt({ layout }: { layout: string }) {
  if (layout === 'daisywheel') {
    return <svg viewBox="0 0 160 100" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2
      return <circle key={i} cx={80 + Math.cos(a) * 30} cy={50 + Math.sin(a) * 30} r={11} fill="var(--art-cap)" stroke="var(--art-line)" strokeWidth={1.5} />
    })}<circle cx={80} cy={50} r={8} fill="var(--accent)" /></svg>
  }
  const rows = [10, 10, 9, 7]
  return <svg viewBox="0 0 160 100" aria-hidden="true">{rows.flatMap((count, row) => Array.from({ length: count }, (_, col) => {
    const width = 12, gap = 2, left = 80 - (count * (width + gap)) / 2 + (layout === 'split' && col >= count / 2 ? 8 : layout === 'split' ? -8 : 0)
    return <rect key={`${row}-${col}`} x={left + col * (width + gap)} y={18 + row * 17} width={width} height={13} rx={3} fill={row === 1 && col === 3 ? 'var(--accent)' : 'var(--art-cap)'} stroke="var(--art-line)" strokeWidth={1} />
  }))}</svg>
}

export function VirtualKeyboardSettings({ controllerType }: { controllerType?: number }) {
  const { t } = useTranslation()
  const shell = useShell()
  const family = controllerType !== undefined ? controllerVisualFamily(controllerType) : shell.family
  const [preferences, setPreferences] = useState<KeyboardPreferences | null>(null)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState<ShortcutAction | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve())
  const saveRevision = useRef(0)
  const host = useRef<HTMLElement>(null)
  useEffect(() => { let live = true; keyboard.getPreferences().then(p => { if (live) setPreferences(p) }).catch(e => { if (live) setError(String(e)) }); return () => { live = false } }, [])
  const save = async (next: KeyboardPreferences) => {
    const revision = ++saveRevision.current
    setPreferences(next); setError('')
    const pending = saveQueue.current.then(() => keyboard.savePreferences(next))
    saveQueue.current = pending.catch(() => {})
    try {
      const saved = await pending
      if (revision === saveRevision.current) setPreferences(saved)
    } catch (e) { if (revision === saveRevision.current) setError(String(e)) }
  }
  const openKeyboard = () => { setError(''); void keyboard.setOpen(true).catch(e => setError(String(e))) }
  // X opens the keyboard from anywhere in this section.
  usePadButton('X', () => { openKeyboard() }, host)
  const changeShortcut = (action: ShortcutAction, command: string) => {
    if (!preferences) return
    const bindings = { ...preferences.shortcuts[preferences.layout] }
    const previous = bindings[action]
    // Choosing a button another action has swaps the two.
    const existing = (Object.keys(bindings) as ShortcutAction[]).find(a => a !== action && bindings[a] === command)
    if (existing) bindings[existing] = previous
    bindings[action] = command
    void save({ ...preferences, shortcuts: { ...preferences.shortcuts, [preferences.layout]: bindings } })
  }
  const waiting = preferences ? undefined : 'Reading the keyboard settings…'
  const p = preferences ?? defaultPreferences
  const pct = (value: number) => `${Math.round(value)}%`
  const shortcuts = p.shortcuts[p.layout]
  const choices = BUTTONS.filter(([c]) => p.layout === 'daisywheel' ? !['W', 'N', 'E'].includes(c) : !['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(c))

  return (
    <section ref={host} className="keyboard-settings" aria-label="On-screen keyboard" data-section="keyboard">
      <SettingsSection title="On-screen keyboard" note={<>Hold <ShortcutGlyph command="HOME" family={family} /> then <ShortcutGlyph command="W" family={family} /> to open · X opens it now</>}>
        <ModeCards columns={3} value={p.layout} useLabel={card => `Use ${card.label}`} label={undefined}
          onChange={layout => { if (preferences) void save({ ...preferences, layout: layout as KeyboardPreferences['layout'] }) }}
          options={LAYOUTS.map(layout => ({ ...layout, art: <LayoutArt layout={layout.value} />, unavailable: waiting }))} />
        <p className="keyboard-settings-hint">{LAYOUTS.find(layout => layout.value === p.layout)?.caption}. {p.layout === 'daisywheel' ? 'Character grouping and right stick as D-pad are below.' : 'Daisywheel adds letter grouping and right stick as D-pad.'}</p>
        <SegmentedRow label="Look" value={p.appearance} options={LOOKS} disabled={waiting}
          onChange={appearance => { if (preferences) void save({ ...preferences, appearance: appearance as KeyboardPreferences['appearance'] }) }}
          onReset={() => { if (preferences) void save({ ...preferences, appearance: 'theme' }) }} onX={{ label: 'Open the keyboard', run: openKeyboard }} />
        {p.layout === 'daisywheel' ? <>
          <SegmentedRow label="Character grouping" value={p.daisywheelVariant} disabled={waiting}
            options={[{ value: 'classic', label: 'Classic' }, { value: 'inputlabs', label: 'Input Labs tweaked', caption: 'Keeps vowels on A · design by Input Labs' }]}
            onChange={daisywheelVariant => { if (preferences) void save({ ...preferences, daisywheelVariant: daisywheelVariant as KeyboardPreferences['daisywheelVariant'] }) }} />
          <SwitchRow label="Right stick as D-pad" hint="Keep the left stick on the petals; the right stick does the centre shortcuts" on={preferences ? p.rightStickDpad : null}
            onChange={rightStickDpad => { if (preferences) void save({ ...preferences, rightStickDpad }) }} />
        </> : <div className="keyboard-settings-feel">
          <ValueRow label="Press force" data={{ 'data-keyboard-row': 'press-force' }} hint={p.padPressThreshold === 0.08 ? 'Like Steam' : p.padPressThreshold === 0 ? 'Uses the click' : 'How hard a pad press types'} value={Math.round(p.padPressThreshold * 100)} min={0} max={20} step={1} format={pct}
            onChange={value => { if (preferences) void save({ ...preferences, padPressThreshold: value / 100 }) }} onReset={() => { if (preferences) void save({ ...preferences, padPressThreshold: 0.08 }) }} disabled={waiting}
            caption="8% matches Steam's keyboard; below about 5% a letter can type while your thumb is still sliding onto it. 0 uses the click." />
          <ValueRow label="Smoothing" data={{ 'data-keyboard-row': 'smoothing' }} hint="Steadier aim" value={Math.round(p.touchSmoothing * 100)} min={0} max={100} step={5} fineStep={1} format={pct}
            onChange={value => { if (preferences) void save({ ...preferences, touchSmoothing: value / 100 }) }} onReset={() => { if (preferences) void save({ ...preferences, touchSmoothing: 0.5 }) }} disabled={waiting}
            caption="Steadies the touch cursor while you aim, without slowing fast swipes. 0 shows the raw pad." />
          <ValueRow label="Steadying" data={{ 'data-keyboard-row': 'steadying' }} hint="Up and down" value={Math.round(p.verticalSteadying * 100)} min={0} max={100} step={5} fineStep={1} format={pct}
            onChange={value => { if (preferences) void save({ ...preferences, verticalSteadying: value / 100 }) }} onReset={() => { if (preferences) void save({ ...preferences, verticalSteadying: 0.7 }) }} disabled={waiting}
            caption="How much sideways drift to hold back while you swipe up or down." />
        </div>}
        <ValueRow label="Haptics" data={{ 'data-keyboard-row': 'haptics' }} hint={p.hapticType === 'automatic' ? 'Steam style' : t(`keymap.hapticEffect_${p.hapticType.toUpperCase()}`, p.hapticType)} value={p.hapticIntensity} min={0} max={100} step={5} fineStep={1} format={pct}
          onChange={hapticIntensity => { if (preferences) void save({ ...preferences, hapticIntensity }) }} onReset={() => { if (preferences) void save({ ...preferences, hapticIntensity: 35 }) }}
          disabled={waiting ?? (p.hapticType === 'off' ? 'Feedback is off · Advanced turns it back on' : undefined)}
          caption="Key presses feel stronger than moving between keys. 0% silences the keyboard's feedback." />
        {preferences && <div className="keyboard-settings-preview" aria-label="Selected keyboard layout preview"><KeyboardView frame={{ ...previewFrame(preferences), controllerType: controllerType ?? 0 }} preview /></div>}
        <div className="keyboard-settings-legend" role="group" aria-label="Controller shortcuts">
          {(Object.keys(shortcutLabels) as ShortcutAction[]).map(action => (
            <OpenRow key={action} label={SHORT[action]} hint={shortcutLabels[action]} value={<ShortcutGlyph command={shortcuts[action]} family={family} size={22} />}
              onOpen={() => setPicking(action)} disabled={waiting} hints="A:Change;X:Open the keyboard;B:Back" />
          ))}
        </div>
        <OpenRow label="Advanced" hint="How the keyboard's feedback feels, and resetting the shortcuts" value={p.hapticType === 'automatic' ? 'Steam style' : t(`keymap.hapticEffect_${p.hapticType.toUpperCase()}`, p.hapticType)} onOpen={() => setAdvanced(true)} disabled={waiting} />
        <SettingsNote><span className="keyboard-settings-opening">Hold Move or Resize and drag either trackpad. Move also uses the right stick; Resize also uses the left stick. Reset puts the size and place back.</span></SettingsNote>
        {error && <p role="alert" className="keyboard-settings-error">{error}</p>}
      </SettingsSection>

      <SubPage open={picking !== null} onClose={() => setPicking(null)} crumbRoot="Settings" trail={['Controller', 'On-screen keyboard']} title={picking ? shortcutLabels[picking] : ''} backLabel="Back to Controller">
        <div className={settingsStyles.mainColumn} style={{ maxWidth: 760 }} role="radiogroup" aria-label={picking ? shortcutLabels[picking] : undefined}>
          <SettingsNote>Saved for the {LAYOUTS.find(layout => layout.value === p.layout)?.label} layout. Choosing a button another shortcut has swaps the two.</SettingsNote>
          {picking && choices.map(([command, name]) => {
            const current = shortcuts[picking] === command
            const owner = (Object.keys(shortcuts) as ShortcutAction[]).find(action => action !== picking && shortcuts[action] === command)
            return (
              <button key={command} type="button" role="radio" aria-checked={current} className={settingsStyles.switchRow} data-autofocus={current ? '' : undefined}
                data-hints="A:Choose;B:Back" onClick={() => { changeShortcut(picking, command); setPicking(null) }}>
                <ShortcutGlyph command={command} family={family} size={26} />
                <span className={settingsStyles.rowText}><span className={settingsStyles.rowLabel}>{name}</span>{owner && <span className={settingsStyles.rowHint}>Now {SHORT[owner]} · they swap</span>}</span>
                {current && <span className={settingsStyles.tag} data-tone="accent">Chosen</span>}
              </button>
            )
          })}
        </div>
      </SubPage>

      <SubPage open={advanced} onClose={() => setAdvanced(false)} crumbRoot="Settings" trail={['Controller', 'On-screen keyboard']} title="Advanced" backLabel="Back to Controller">
        <div className={settingsStyles.mainColumn} style={{ maxWidth: 860 }}>
          <SettingsSection title="Feedback" note="When the pads or sticks move between keys, type, and when shortcuts fire">
            <div role="radiogroup" aria-label="Keyboard haptic feedback type" className={settingsStyles.list}>
              {(['automatic', ...HAPTIC_EFFECT_CHOICES.map(effect => effect.toLowerCase())] as KeyboardPreferences['hapticType'][]).map(effect => (
                <button key={effect} type="button" role="radio" aria-checked={p.hapticType === effect} className={settingsStyles.switchRow} data-hints="A:Choose;B:Back"
                  onClick={() => { if (preferences) void save({ ...preferences, hapticType: effect }) }}>
                  <span className={settingsStyles.rowText}><span className={settingsStyles.rowLabel}>{effect === 'automatic' ? 'Steam keyboard' : t(`keymap.hapticEffect_${effect.toUpperCase()}`, effect)}</span>
                    {effect === 'automatic' && <span className={settingsStyles.rowHint}>Steam's own selection and press ticks, and short pulses for touch and shortcuts</span>}</span>
                  {p.hapticType === effect && <span className={settingsStyles.tag} data-tone="accent">Chosen</span>}
                </button>
              ))}
            </div>
          </SettingsSection>
          <button type="button" className={settingsStyles.switchRow} data-hints="A:Reset the shortcuts;B:Back" disabled={!preferences}
            onClick={() => { if (preferences) void save({ ...preferences, shortcuts: { ...preferences.shortcuts, [preferences.layout]: { ...defaultPreferences.shortcuts[preferences.layout] } } }) }}>
            <span className={settingsStyles.rowText}><span className={settingsStyles.rowLabel}>Reset the shortcuts to defaults</span><span className={settingsStyles.rowHint}>For the {LAYOUTS.find(layout => layout.value === p.layout)?.label} layout only</span></span>
          </button>
        </div>
      </SubPage>
    </section>
  )
}

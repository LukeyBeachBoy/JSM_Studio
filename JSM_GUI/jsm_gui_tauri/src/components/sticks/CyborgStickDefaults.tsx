import { useRef, useState } from 'react'
import { desktopBridge } from '../../platform/desktopBridge'
import { patchRuntimePreferences, usePreferences } from '../../platform/preferenceStore'
import { cyborgDefaultsText, readStickGeometry, transformStickGeometry, type StickPoint } from '../../utils/stickGeometry'
import { showToast } from '../../utils/toast'
import { OpenRow, SegmentedRow, SubPage, ValueRow } from '../ui/console'
import { StickGeometryControls } from './StickGeometryControls'
import { VisualPanel, type SetText } from './shared'
import { StickGeometryPreview } from './StickGeometryPreview'
import { StickDiagram } from './visuals'
import { SettingOrigins } from '../SettingOrigin'
import styles from './CyborgStickDefaults.module.css'

export function CyborgStickDefaults({ raw = null }: { raw?: StickPoint | null }) {
  const { runtime } = usePreferences()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const values = runtime?.cyborgStickDefaults ?? {}
  const text = cyborgDefaultsText(values)
  const geometry = readStickGeometry(text, 'LEFT')
  const adjusted = raw ? transformStickGeometry(raw, geometry) : null
  const inner = Number(values.LEFT_STICK_DEADZONE_INNER ?? .15)
  const outer = Number(values.LEFT_STICK_DEADZONE_OUTER ?? .1)
  const width = Number(values.LEFT_STICK_CARDINAL_WIDTH ?? 53.130102)
  const activation = Math.max(inner, Number(values.LEFT_STICK_DIRECTION_DEADZONE ?? 0))
  const release = Math.max(0, activation - Number(values.LEFT_STICK_DIRECTION_RELEASE_MARGIN ?? 0))
  const rays = [0, 90, 180, 270].flatMap(angle => [angle - width / 2, angle + width / 2])
  const save = async (next: Record<string, string>) => {
    if (busy.current) return
    busy.current = true; setPending(true)
    try { patchRuntimePreferences(await desktopBridge.setCyborgStickDefaults(next)) }
    catch (error) { showToast(String(error), 'error') }
    finally { busy.current = false; setPending(false) }
  }
  const update = (key: string, value: string | null) => {
    const next = { ...values }
    if (value === null) delete next[key]; else next[key] = value
    void save(next)
  }
  const setText: SetText = change => {
    const next = typeof change === 'function' ? change(text) : change
    void save(Object.fromEntries(next.split('\n').flatMap(line => {
      const match = line.match(/^\s*(LEFT_STICK_\w+)\s*=\s*([^#]+?)(?:\s*#.*)?$/)
      return match ? [[match[1], match[2].trim()]] : []
    })))
  }
  return <>
    <OpenRow label="Global Cyborg stick defaults" hint="Used by every game unless its layout sets its own value" onOpen={() => setOpen(true)} />
    <SubPage open={open} onClose={() => setOpen(false)} title="Global Cyborg stick defaults" trail={['Sticks']}>
      <SettingOrigins.Provider value={{ text, own: text, base: '', origins: {} }}>
      <div className={styles.page}>
      <p className={styles.intro}>These defaults apply to the Cyborg in every game. A game’s stick settings take precedence. Reset a game setting to inherit its default again.</p>
      <div className={styles.layout}>
      <div className={styles.controls}>
      <section className={styles.section} aria-labelledby="cyborg-defaults-output">
      <h2 id="cyborg-defaults-output" className={styles.heading}>Output</h2>
      <SegmentedRow label="Stick is for" value={values.LEFT_STICK_MODE ?? 'NO_MOUSE'} disabled={pending || !runtime ? 'Saving or loading defaults' : undefined}
        options={[{ value: 'NO_MOUSE', label: 'Keyboard directions' }, { value: 'AIM', label: 'Mouse' }, { value: 'FLICK', label: 'Flick' }, { value: 'LEFT_STICK', label: 'Gamepad' }]}
        onChange={value => update('LEFT_STICK_MODE', value)} onReset={() => update('LEFT_STICK_MODE', null)} />
      </section>
      <section className={styles.section} aria-labelledby="cyborg-defaults-geometry">
      <h2 id="cyborg-defaults-geometry" className={styles.heading}>Physical setup</h2>
      <StickGeometryControls side="LEFT" geometry={geometry} raw={raw} setText={setText} cyborg disabled={pending || !runtime} global />
      </section>
      {[{ id: 'deadzones', title: 'Deadzones', rows: [
        ['DEADZONE_INNER', 'Inner deadzone', .15, 0, .9, 100, 'Ignore movement near the centre. Raise this if input drifts when you let go.'],
        ['DEADZONE_OUTER', 'Outer deadzone', .1, 0, .9, 100, 'Reach full output before the physical edge. Raise this if a full push does not reach maximum output.'],
      ] }, { id: 'directions', title: 'Direction response', rows: [
        ['CARDINAL_WIDTH', 'Cardinal width', 53.130102, 10, 90, 1, 'Wider zones make a single direction easier to hold. Diagonals remain between them; 90° sends only one direction.'],
        ['DIRECTION_HYSTERESIS', 'Direction stability', 0, 0, 15, 1, 'Keep the current direction through small boundary movements. No timed delay; narrow diagonals limit the margin automatically.'],
        ['DIRECTION_DEADZONE', 'Direction activation', 0, 0, .95, 100, `Push at least ${Math.round(activation * 100)}% to start keyboard movement. The inner deadzone is the minimum; analogue output is unchanged.`],
        ['DIRECTION_RELEASE_MARGIN', 'Direction release margin', 0, 0, .5, 100, `Keyboard movement stops below ${Math.round(release * 100)}% travel. A different direction still needs ${Math.round(activation * 100)}%; this prevents rapid on/off chatter near the centre.`],
      ] }].map(group => <section key={group.id} className={styles.section} aria-labelledby={`cyborg-defaults-${group.id}`}>
      <h2 id={`cyborg-defaults-${group.id}`} className={styles.heading}>{group.title}</h2>
      {group.rows.map(([suffix, label, fallback, min, max, scale, caption]) => {
        const key = `LEFT_STICK_${suffix}`, factor = Number(scale)
        return <ValueRow key={key} label={String(label)} caption={String(caption)} value={Number(values[key] ?? fallback) * factor} min={Number(min) * factor} max={Number(max) * factor} step={1} fineStep={.1}
          disabled={pending || !runtime ? 'Saving or loading defaults' : undefined} format={value => `${Math.round(value * 10) / 10}${factor === 100 ? '%' : '°'}`}
          onChange={value => update(key, String(value / factor))} onReset={() => update(key, null)} />
      })}
      </section>)}
      </div>
      <aside className={styles.preview} aria-label="Global stick preview">
        <VisualPanel title="Stick travel" caption="The shaded centre is ignored; the dashed outer circle marks full output. Move the stick to compare physical and adjusted input.">
          <StickGeometryPreview raw={raw} adjusted={adjusted} geometry={geometry} inner={inner} outer={outer} />
        </VisualPanel>
        <VisualPanel title="Keyboard direction zones" caption={`Start at ${Math.round(activation * 100)}% · release below ${Math.round(release * 100)}%. Lines separate single directions from diagonals. Direction settings apply to keyboard output.`}>
          <StickDiagram live={adjusted} inner={activation} outer={0} wedge={<>
            {rays.map((angle, index) => <line key={index} x1={110 + Math.sin(angle * Math.PI / 180) * 90 * activation} y1={110 - Math.cos(angle * Math.PI / 180) * 90 * activation}
              x2={110 + Math.sin(angle * Math.PI / 180) * 90} y2={110 - Math.cos(angle * Math.PI / 180) * 90}
              stroke="var(--text-3)" strokeOpacity=".5" strokeDasharray="3 4" />)}
            <circle cx="110" cy="110" r={release * 90} fill="none" stroke="var(--text-3)" strokeDasharray="3 4" />
          </>} />
        </VisualPanel>
      </aside>
      </div>
      </div>
      </SettingOrigins.Provider>
    </SubPage>
  </>
}

import { memo, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { InputGlyph } from '../components/glyphs/InputGlyph'
import { controllerVisualFamily, type ControllerVisualFamily } from '../utils/controllerStatus'
import { shortcutLabels, type KeyboardFrame, type ShortcutAction } from './bridge'
import './keyboard.css'

export function ShortcutGlyph({ command, family, size = 18 }: { command: string; family: ControllerVisualFamily; size?: number }) {
  const commands = command === '+' ? ['+'] : command.split('+')
  return <span className="vk-glyph" aria-label={command}>{commands.map((c, i) => <span key={c}>{i > 0 && <small>+</small>}{c === 'L3' || c === 'R3' ? <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={`${c === 'L3' ? 'Left' : 'Right'} stick click`}><circle cx="12" cy="11" r="10" fill="currentColor"/><text x="12" y="11" textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="700" fill="var(--glyph-ink)">{c}</text><path d="M7 23h10" stroke="currentColor" strokeWidth="2"/></svg> : <InputGlyph command={c} family={family} size={size} />}</span>)}</span>
}
export function CloseKeyboardIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" aria-label="Close keyboard" role="img" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="3" width="20" height="12" rx="2"/><path d="M5 6h2m2 0h2m2 0h2m2 0h2M5 9h2m2 0h2m2 0h2m2 0h2M7 12h10m-5 5v5m-3-3 3 3 3-3"/></svg>
}
function SymbolsIcon() {
  return <svg className="vk-symbols-icon" width="18" height="18" viewBox="0 0 24 24" role="img" aria-label="Symbols" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10 3 8 21M16 3l-2 18M4 9h16M3 15h16" /></svg>
}
function DpadIcon() {
  return <svg viewBox="0 0 32 32" role="img" aria-label="D-pad" fill="currentColor"><path d="M11 3h10v8h8v10h-8v8H11v-8H3V11h8Z" fillOpacity=".14" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="m16 6-3 3h6Zm10 10-3-3v6ZM16 26l3-3h-6ZM6 16l3 3v-6Z" /></svg>
}
const hubSymbols: Partial<Record<ShortcutAction, ReactNode>> = { caps: '⇪', backspace: '⌫', space: '␣', enter: '↵', shift: '⇧', symbols: <SymbolsIcon />, close: <CloseKeyboardIcon /> }
const keyActions: Record<string, ShortcutAction> ={ '⌫': 'backspace', '↵': 'enter', '⇧': 'shift', Caps: 'caps', Space: 'space', Done: 'close' }
const Key = memo(function Key({ label, left, right, selected, shortcut, family, span = 1 }: { label: string; left: boolean; right: boolean; selected: boolean; shortcut?: string; family: ControllerVisualFamily; span?: number }) {
  const name = label === 'Done' ? 'Close keyboard' : label === 'Caps' ? 'Caps Lock' : label
  return <div className="vk-key" style={{ flex: span }} data-left={left || undefined} data-right={right || undefined} data-selected={selected || undefined} data-action={keyActions[label] || undefined} aria-label={name} title={name}>
    <span className="vk-key-label">{label === 'Done' ? <CloseKeyboardIcon /> : label === 'Caps' ? 'Caps' : label === '⇧' ? 'Shift' : label === '↵' ? 'Enter' : label}</span>
    {shortcut && <span className="vk-key-shortcut"><ShortcutGlyph command={shortcut} family={family} /></span>}
  </div>
})
export function KeyboardView({ frame, preview = false }: { frame: KeyboardFrame; preview?: boolean }) {
  const shell = useRef<HTMLElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const element = shell.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(entry.contentRect.width / 420, entry.contentRect.height / 440)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const family = controllerVisualFamily(frame.controllerType)
  const daisy = frame.layout === 'daisywheel'
  const bindings = frame.preferences.shortcuts[frame.layout]
  const glyph = (action: ShortcutAction, size = 18) => <ShortcutGlyph command={bindings[action]} family={family} size={size} />
  const activeStick = Math.hypot(...frame.stick) > 0.2
  const thumb = (touch: [number, number] | null, right: boolean) => {
    if (!touch) return null
    const x = (Math.max(-1, Math.min(1, touch[0])) + 1) / 2
    // The split gap is 2.5% of the grid width, leaving 48.75% per pad.
    const left = frame.layout === 'split' ? x * 48.75 + (right ? 51.25 : 0) : x * 100
    return <i className={`vk-thumb${right ? ' vk-thumb-right' : ''}`} style={{ left: `${left}%`, top: `${(Math.max(-1, Math.min(1, touch[1])) + 1) * 50}%` }} aria-label={`${right ? 'Right' : 'Left'} touch position`} />
  }
  return <main ref={shell} className="vk-shell" data-layout={frame.layout} data-appearance={frame.preferences.appearance} data-preview={preview || undefined} aria-label={`${frame.layout} virtual keyboard`}>
    <div className="vk-canvas" style={daisy ? { transform: `scale(${scale})` } : undefined}>
    <div className="vk-content" data-paused={!frame.ready || undefined}>
      {daisy ? <div className="vk-wheel" role="group" aria-label="Daisywheel character petals">
        {frame.petals.map((petal, index) => {
          const angle = index * Math.PI / 4
          return <div key={index} className="vk-petal" data-active={frame.petal === index || undefined} style={{ left: `${50 + Math.sin(angle) * 36}%`, top: `${50 - Math.cos(angle) * 36}%` }}>
            {petal.map((char, i) => {
              const presses = frame.daisyPresses?.[index]?.[i] ?? 0
              return <span key={`${i}-${presses}`} className={`vk-char vk-char-${i}`} data-pressed={presses > 0 || undefined}>{char.trim()}</span>
            })}
          </div>
        })}
        <div className="vk-wheel-center">
          {activeStick ? <div className="vk-stick"><i style={{ transform: `translate(${frame.stick[0] * 28}px,${-frame.stick[1] * 28}px)` }} /><span>{frame.secondary ? 'RS · Symbols' : 'LS'}</span></div> : <div className="vk-dpad">
            {(['UP', 'LEFT', 'RIGHT', 'DOWN'] as const).map(direction => {
              // The hub shows whatever each D-pad direction is bound to, so a
              // remapped Backspace or Space does not leave a stale symbol here.
              const action = (Object.keys(bindings) as ShortcutAction[]).find(a => bindings[a] === direction)
              return action && hubSymbols[action] ? <span key={direction} className={`vk-center-${direction.toLowerCase()}`} aria-label={shortcutLabels[action]}>{hubSymbols[action]}</span> : null
            })}
            <span className="vk-center-dot"><DpadIcon /></span>
          </div>}
        </div>
        <div className="vk-wheel-bumper vk-wheel-bumper-left" data-active={frame.shift || undefined}>{glyph('shift')} ⇧</div><div className="vk-wheel-bumper vk-wheel-bumper-right" data-active={frame.symbols || undefined}>{glyph('symbols')} <SymbolsIcon /></div>
      </div> : <div className="vk-grid">
        {frame.rows.map((row, r) => <div key={r} className="vk-row">{row.map((key, c) => {
          if (key === 'Space' && c !== 3 && !(frame.layout === 'split' && c === 6)) return null
          const span = key === 'Space' ? (frame.layout === 'split' ? 3 : 6) : 1
          const cell = r * 12 + c
          const includes = (v: number | null) => v !== null && v >= cell && v < cell + span
          const left = includes(frame.left), right = includes(frame.right)
          return <div key={c} className="vk-cell" style={{ flex: span, marginLeft: c === 6 && frame.layout === 'split' ? '2.5%' : undefined } as CSSProperties}>
            <Key label={key} left={left} right={right} selected={includes(frame.selected) && frame.left == null && frame.right == null} shortcut={keyActions[key] ? bindings[keyActions[key]] : undefined} family={family} span={span} />
          </div>
        })}</div>)}
        {thumb(frame.leftTouch, false)}{thumb(frame.rightTouch, true)}
      </div>}
      {!frame.ready && <div className="vk-paused">Release the chord to continue typing</div>}
    </div>
    <footer className="vk-footer">
      <span>{glyph('move')} Move</span><span>{glyph('scale')} Resize</span><span>{glyph('reset')} Reset</span>
      {!daisy && <span>{glyph('symbols')} Symbols</span>}
      {daisy && <span>{glyph('close')} <CloseKeyboardIcon /></span>}
      <span className="vk-state">{frame.caps && '⇪'}{frame.shift && ' ⇧'}{frame.symbols && <SymbolsIcon />}</span>
    </footer>
    </div>
  </main>
}

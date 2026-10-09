import { useEffect, useState } from 'react'
import { SummaryRow } from '../components/ui/SummaryRow'
import { AdvancedParts, FineTune, ModeCards, OpenRow, SegmentedRow, SubPage, ValueRow, stepGroup } from '../components/ui/console'

// Dev only (?mock): the console v2 kit on one page, for checking it by hand or
// from a test. window.dispatchEvent(new Event('jsm:kit')) opens it.
export default function KitPlayground() {
  const [open, setOpen] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [group, setGroup] = useState('speed')
  const [part, setPart] = useState('curve')
  const [mode, setMode] = useState('move')
  const [speed, setSpeed] = useState(360)
  const [shape, setShape] = useState('even')
  const [press, setPress] = useState('regular')
  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener('jsm:kit', show)
    return () => window.removeEventListener('jsm:kit', show)
  }, [])
  const groups = [
    { id: 'speed', label: 'Speed', status: `Default · ${speed}°/s`, changed: speed !== 360, description: 'How fast the view turns, and how a push becomes speed.',
      content: <>
        <ValueRow hero label="Turn speed" value={speed} min={30} max={1440} step={30} format={v => `${v}°/s`} onChange={setSpeed} onReset={() => setSpeed(360)} caption={`A full push turns you ${speed}° every second.`} />
        <SegmentedRow label="How a push becomes speed" value={shape} onChange={setShape} options={[{ value: 'quick', label: 'Quick start' }, { value: 'even', label: 'Even' }, { value: 'precise', label: 'Precise centre', caption: 'Precise centre slows small pushes so fine aim is easier.' }]} />
        {/* A dropdown whose options carry help of very different lengths: tests/select_help_panel checks the popup does not move. */}
        <SummaryRow label="Press type" hint="Dropdown with described options"
          adjust={{ kind: 'choice', value: press, onChange: setPress, options: [
            { value: 'regular', label: 'Press', help: 'Sent while you hold it.' },
            { value: 'tap', label: 'Tap', help: 'Sent once when you press and let go quickly, so a long hold does nothing here, and it never sticks down in the game.' },
            { value: 'double', label: 'Double press', help: 'Sent when you press twice in a row, inside the double-tap time.' },
          ] }} />
        <OpenRow label="Advanced" hint="Exact curve number, Match a full turn (360°)" onOpen={() => setAdvanced(true)} />
      </>,
      visual: <div style={{ height: 260, display: 'grid', placeItems: 'center', color: '#808c99' }}>live visual</div> },
    { id: 'speedup', label: 'Speed-up', status: 'Off', content: <SegmentedRow label="Speed-up" value="off" onChange={() => {}} options={[{ value: 'off', label: 'Off' }, { value: 'gentle', label: 'Gentle' }, { value: 'strong', label: 'Strong' }]} /> },
    { id: 'deadzone', label: 'Dead zone & edge', status: 'Ignore 15% · full past 90%', content: <ValueRow label="Ignore small movement" value={15} min={0} max={50} step={1} format={v => `${v}%`} onChange={() => {}} /> },
  ]
  return <>
    <SubPage open={open} onClose={() => setOpen(false)} trail={['Sticks', 'Right stick']} title="Fine-tune" stepLabel="Group" backLabel="Back to Sticks"
      onStep={direction => setGroup(current => stepGroup(groups, current, direction))}>
      <ModeCards label="Right stick is for…" note="◂ ▸ to compare · changes are live while you’re here" columns={6} value={mode} onChange={setMode}
        options={[{ value: 'move', label: 'Moving', caption: 'Sends W A S D' }, { value: 'look', label: 'Looking around', caption: 'Moves the mouse' }, { value: 'flick', label: 'Flick to turn', caption: 'Point to face that way' }]}
        more={{ label: 'More', caption: 'Mouse area, mouse ring, scroll wheel…', count: 10, onOpen: () => {} }} />
      <div style={{ height: 24 }} />
      <FineTune groups={groups} active={group} onActive={setGroup} railNote="Speed and speed-up are shared by both sticks and the trackpad sticks." />
    </SubPage>
    <SubPage open={advanced} onClose={() => setAdvanced(false)} trail={['Sticks', 'Right stick', 'Fine-tune']} title="Advanced" stepLabel="Part" backLabel="Back to Fine-tune"
      onStep={direction => setPart(current => current === 'curve' ? (direction > 0 ? 'smooth' : 'curve') : (direction < 0 ? 'curve' : 'smooth'))}>
      <AdvancedParts active={part} onActive={setPart} parts={[
        { id: 'curve', eyebrow: 'LT · Looking around · Speed', title: 'Exact curve', description: 'Type the curve’s shape instead of picking a preset.', content: <ValueRow label="Curve number" value={1} min={0.5} max={3} step={0.1} onChange={() => {}} /> },
        { id: 'smooth', eyebrow: 'RT · Flick to turn · Flick', title: 'Smoothing for tiny turns', content: <SegmentedRow label="Smoothing" value="auto" onChange={() => {}} options={[{ value: 'auto', label: 'Automatic' }, { value: 'off', label: 'Off' }, { value: 'custom', label: 'Custom' }]} /> },
      ]} />
    </SubPage>
  </>
}

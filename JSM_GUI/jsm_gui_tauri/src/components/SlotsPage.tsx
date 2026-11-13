import { useEffect, useState } from 'react'
import { desktopBridge, type ConfigSlots, type ConfigSlot, type SlotHotkey } from '../platform/desktopBridge'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { useSlots, updateSlots } from '../hooks/useSlots'
import { showToast } from '../utils/toast'
import { requestValueEntry } from '../nav/textEntry'
import { controllerModelKey, controllerLayoutModels, controllerVariantLabel, controllerLayoutDevice } from '../utils/controllerLayouts'
import { inputDisplayName } from '../keymap/inputNames'
import { inputDefinitions } from '../utils/layers'
import { SwitchRow } from './settings/SettingsKit'
import { Select } from './ui/Select'
import { Dialog } from './ui/Dialog'
import { SubPage } from './ui/console'
import { HoldInputPicker } from './HoldInputPicker'
import styles from './Slots.module.css'

const hotkeyText = (hotkey: SlotHotkey) => hotkey.buttons.map(button => button === 'MOUSE_BACK' ? 'Mouse Back' : button === 'MOUSE_FORWARD' ? 'Mouse Forward' : inputDisplayName(button, hotkey.controllerModel?.startsWith('type-24') ? 'steam' : 'generic')).join(' + ') || 'No hotkey'
const slotLabel = (slot: ConfigSlot) => slot.name.trim().toLowerCase() === `slot ${slot.id}` ? `Slot ${slot.id}` : `Slot ${slot.id} · ${slot.name}`
const hotkeysOf = (slot: ConfigSlot): SlotHotkey[] => [slot, ...(slot.additionalHotkeys ?? [])]
const controllerName = (model: string | null) => model ? controllerVariantLabel(controllerLayoutDevice(model)) : 'Any controller'
const slotHotkeyText = (slot: ConfigSlot) => {
  const shortcuts = hotkeysOf(slot).filter(hotkey => hotkey.buttons.length)
  return shortcuts.length > 1 ? shortcuts.map(hotkey => `${controllerName(hotkey.controllerModel)}: ${hotkeyText(hotkey)}`).join(' · ') : hotkeyText(shortcuts[0] ?? slot)
}
export function SlotsBar() {
  const config = useSlots()
  const [busy, setBusy] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  if (!config?.enabled) return null
  return <section className={styles.slotSection} aria-label="Configuration slots" data-slots-bar>
    <header className={styles.barHeader}>
      <h2>Slots</h2>
      <button type="button" className={styles.infoButton} aria-label="About slots" aria-haspopup="dialog" onClick={() => setHelpOpen(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><circle cx="12" cy="7.5" r=".8" fill="currentColor" stroke="none" /></svg>
      </button>
    </header>
    <div className={styles.bar} role="group" aria-label="Choose a slot">
    {config.slots.map(slot => <button type="button" key={slot.id} aria-pressed={slot.id === config.activeSlot} disabled={busy || !slot.profileName}
      data-slot={slot.id} data-hints="A:Activate slot" onClick={() => {
        setBusy(true)
        void desktopBridge.activateSlot(slot.id).then(updateSlots).catch(error => showToast(String(error), 'error')).finally(() => setBusy(false))
      }}><strong>{slotLabel(slot)}</strong><span>{slot.profileName ?? 'Empty'}</span><small>{slotHotkeyText(slot)}</small></button>)}
    </div>
    {helpOpen && <Dialog title="About slots" subtitle="Keep configurations ready to switch between." width={560} onClose={() => setHelpOpen(false)}
      hints={[{ button: 'B', label: 'Close' }]} actions={<>
        <button type="button" className="button button--secondary" onClick={() => {
          setHelpOpen(false)
          window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'slots' }))
        }}>Configure slots</button>
        <button type="button" className="button button--primary" onClick={() => setHelpOpen(false)}>Got it</button>
      </>}>
      <div className={styles.help}>
        <section><h3>What are slots?</h3><p>Four places to keep configurations ready. Only the active slot is live. Click a slot above or use its hotkey to switch.</p></section>
        <section><h3>Where do I set the hotkeys?</h3><p>Open Settings → Configuration slots, then choose <strong>Choose hotkey</strong> for a slot. You can also name slots and assign their configurations there. Hold all the hotkey’s inputs together, in any order, to switch.</p></section>
        <section><h3>How does autoload work?</h3><p>In <strong>Auto-switch</strong>, each game’s Auto-apply rule has a destination slot. When the game comes to the front, it updates that slot. It only changes what is live if that slot is active; your other slots keep their configurations.</p><p>For example, a game can update Gaming while you use Desktop. Switch to Gaming when you are ready. Leaving the game keeps its configuration in that slot. The automatic Desktop fallback is paused while slots are on, so switch to your Desktop slot yourself.</p></section>
        <section><h3>Why use them?</h3><p>Keep Desktop one hotkey away, remember your last game in Gaming, or keep different setups ready without finding them in the library each time.</p><p><strong>Slots are optional.</strong> Turn off Configuration slots in Settings if you prefer applying configurations directly or letting Auto-switch switch them automatically.</p></section>
      </div>
    </Dialog>}
  </section>
}

export function SlotAssignment({ profileName }: { profileName: string }) {
  const config = useSlots()
  const [id, setId] = useState('1')
  const [busy, setBusy] = useState(false)
  if (!config?.enabled) return null
  return <div className={styles.assignment} data-slot-assignment>
    <Select ariaLabel="Apply configuration to slot" value={id} onValueChange={setId} disabled={busy}
      options={config.slots.map(slot => ({ value: String(slot.id), label: slotLabel(slot) }))} />
    <button type="button" className="button button--secondary" disabled={busy} onClick={() => {
      setBusy(true)
      void desktopBridge.assignSlot(Number(id), profileName).then(next => { updateSlots(next); showToast(`${profileName} applied to Slot ${id}`) }).catch(error => showToast(String(error), 'error')).finally(() => setBusy(false))
    }}>Apply to Slot {id}</button>
  </div>
}

export function SlotsPage({ devices, currentName }: { devices?: TelemetryDevice[]; currentName?: string | null }) {
  const config = useSlots()
  const [profiles, setProfiles] = useState<string[]>([])
  const [editing, setEditing] = useState<number | null>(null)
  const [controllers, setControllers] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { let live = true; void desktopBridge.listLibraryProfiles().then(profiles => { if (live) setProfiles(profiles) }).catch(error => showToast(String(error), 'error')); return () => { live = false } }, [])
  const commit = async (next: ConfigSlots) => {
    setBusy(true)
    try { updateSlots(await desktopBridge.saveSlots(next)) } catch (error) { showToast(String(error), 'error') } finally { setBusy(false) }
  }
  const change = (id: number, patch: Partial<ConfigSlot>) => { if (config) void commit({ ...config, slots: config.slots.map(slot => slot.id === id ? { ...slot, ...patch } : slot) }) }
  const selectedModel = (slot: ConfigSlot) => controllers[slot.id] ?? slot.controllerModel ?? 'any'
  const selectedHotkey = (slot: ConfigSlot): SlotHotkey => hotkeysOf(slot).find(hotkey => (hotkey.controllerModel ?? 'any') === selectedModel(slot)) ?? { buttons: [], controllerModel: selectedModel(slot) === 'any' ? null : selectedModel(slot) }
  const changeHotkey = (slot: ConfigSlot, buttons: string[]) => {
    const controllerModel = selectedHotkey(slot).controllerModel
    if (controllerModel === slot.controllerModel) change(slot.id, { buttons })
    else change(slot.id, { additionalHotkeys: [...(slot.additionalHotkeys ?? []).filter(hotkey => hotkey.controllerModel !== controllerModel), { controllerModel, buttons }] })
  }
  if (!config) return <p>Reading slots…</p>
  const edited = config.slots.find(slot => slot.id === editing)
  return <div className={styles.page} data-slots-page>
    <SwitchRow label="Configuration slots" hint="Keep several configurations ready and switch between them globally." on={config.enabled} pending={busy} onChange={enabled => void commit({ ...config, enabled })} />
    <SwitchRow label="Show slot-change confirmation" hint="Briefly show the selected slot and configuration in the bottom-right corner of the screen." on={config.showNotifications !== false} pending={busy} onChange={showNotifications => void commit({ ...config, showNotifications })} />
    {!config.enabled && <button type="button" className="button button--primary" disabled={busy || !currentName || !profiles.includes('Desktop')} onClick={() => {
      const model = controllerModelKey(devices?.find(device => device.type === 25) ?? devices?.[0]) || null
      void commit({ ...config, enabled: true, activeSlot: 1, slots: config.slots.map(slot => slot.id === 1
        ? { ...slot, name: 'Gaming', profileName: currentName ?? null, buttons: ['MOUSE_BACK', 'UP'], controllerModel: model }
        : slot.id === 2 ? { ...slot, name: 'Desktop', profileName: 'Desktop', buttons: ['MOUSE_BACK', 'DOWN'], controllerModel: model } : slot) })
    }}>Set up Gaming + Desktop · Mouse Back + Up / Down</button>}
    <div className={styles.cards}>
      {config.slots.map(slot => <section className={styles.card} key={slot.id} data-slot-card={slot.id} data-active={config.enabled && config.activeSlot === slot.id}>
        <h2>{slotLabel(slot)}{config.enabled && config.activeSlot === slot.id ? ' · active' : ''}</h2>
        <label>Configuration<Select ariaLabel={`Slot ${slot.id} configuration`} value={slot.profileName ?? '__empty__'} disabled={busy} onValueChange={value => change(slot.id, { profileName: value === '__empty__' ? null : value })}
          options={[{ value: '__empty__', label: 'Empty' }, ...[...new Set([...profiles, ...(slot.profileName ? [slot.profileName] : [])])].map(name => ({ value: name, label: `${name}${profiles.includes(name) ? '' : ' (missing)'}` }))]} /></label>
        <label>Hotkey controller<Select ariaLabel={`Slot ${slot.id} hotkey controller`} value={selectedModel(slot)} disabled={busy} onValueChange={value => setControllers(previous => ({ ...previous, [slot.id]: value }))}
          options={[{ value: 'any', label: 'Any controller' }, ...[...new Set([...controllerLayoutModels, ...hotkeysOf(slot).flatMap(hotkey => hotkey.controllerModel ? [hotkey.controllerModel] : [])])].map(value => ({ value, label: controllerVariantLabel(controllerLayoutDevice(value)) }))]} /></label>
        <p>{hotkeyText(selectedHotkey(slot))}</p>
        {hotkeysOf(slot).filter(hotkey => hotkey.buttons.length && hotkey.controllerModel !== selectedHotkey(slot).controllerModel).map(hotkey => <p key={hotkey.controllerModel ?? 'any'} className={styles.savedHotkey}>{controllerName(hotkey.controllerModel)} · {hotkeyText(hotkey)}</p>)}
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={() => setEditing(slot.id)}>Choose hotkey</button>
          <button type="button" disabled={busy} onClick={() => requestValueEntry({ title: `Name Slot ${slot.id}`, value: slot.name, onDone: name => { if (name.trim()) change(slot.id, { name: name.trim() }) } })}>Rename</button>
          <button type="button" disabled={busy || !config.enabled || !slot.profileName} onClick={() => { setBusy(true); void desktopBridge.activateSlot(slot.id).then(updateSlots).catch(error => showToast(String(error), 'error')).finally(() => setBusy(false)) }}>Activate Slot {slot.id}</button>
        </div>
      </section>)}
    </div>
    <details className={styles.explanation}><summary>How hotkeys and automatic switching work</summary>
    <p className={styles.note}>A hotkey fires once when all its inputs are held. Press them in any order and take as long as you need. Holding just the first input keeps its normal bindings and Hold to swap available.</p>
    <p className={styles.note}>Each controller can have its own hotkey for the same slot. Choose a controller below, then choose its inputs. Your other controllers’ hotkeys stay saved.</p>
    <p className={styles.note}>Auto-apply updates its chosen slot. It switches the live configuration only when that slot is active. Other slots keep their configurations, so Desktop stays available and Gaming remembers the last game.</p>
    </details>
    <p className={styles.note}>Hold to swap can share a slot hotkey’s first input. For example, hold Quick Access for your tools, then add D-pad Up or Down to switch slots. The full slot hotkey takes priority.</p>
    {edited && <SubPage open onClose={() => setEditing(null)} trail={['Settings', 'Slots']} title={`Slot ${edited.id} hotkey`} where={`Slot ${edited.id} · ${controllerName(selectedHotkey(edited).controllerModel)} · ${hotkeyText(selectedHotkey(edited))}`}>
      <HoldInputPicker devices={devices} controllerModel={selectedHotkey(edited).controllerModel} selected={selectedHotkey(edited).buttons} definitions={inputDefinitions}
        purpose="Select every input in this slot hotkey. They can be pressed in any order."
        onToggle={button => { const buttons = selectedHotkey(edited).buttons; if (!busy) changeHotkey(edited, buttons.includes(button) ? buttons.filter(b => b !== button) : [...buttons, button]) }} />
      <button type="button" className="button button--secondary" onClick={() => setEditing(null)}>Done</button>
    </SubPage>}
  </div>
}

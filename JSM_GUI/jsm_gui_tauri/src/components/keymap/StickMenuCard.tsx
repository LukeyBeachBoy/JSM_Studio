import { useState, type Dispatch, type SetStateAction } from 'react'
import { Sheet } from '../ui/Sheet'
import { SummaryRow } from '../ui/SummaryRow'
import { readVirtualMenus, writeVirtualMenus, MENU_SELECTIONS } from '../../utils/virtualMenus'
import { connectStickMenu, isDirectStickMenu, stickMenuLinks, type StickSide } from '../../utils/stickMenus'
import { updateKeymapEntry } from '../../utils/keymap'

export type StickMenuConfig = { text: string; onChange: Dispatch<SetStateAction<string>>; trigger?: string }
export function StickMenuCard({ side, config, choosing, onClose, legacy }: { side: StickSide; config: StickMenuConfig; choosing: boolean; onClose: () => void; legacy: boolean }) {
  const [problem, setProblem] = useState<string | null>(null)
  const links = stickMenuLinks(config.text, side)
  const catalog = readVirtualMenus(config.text)
  const relevant = config.trigger ? links.filter(link => isDirectStickMenu(link.attachment, config.trigger) || link.attachment.activation === 'ALWAYS') : links
  const connect = (id?: string) => {
    const result = connectStickMenu(config.text, side, id, config.trigger)
    setProblem(result.problem ?? null)
    if (!result.id) return
    config.onChange(previous => writeVirtualMenus(updateKeymapEntry(previous, `${config.trigger ? config.trigger + ',' : ''}${side.toUpperCase()}_STICK_MODE`, ['NO_MOUSE']), readVirtualMenus(result.text).menus))
    onClose()
    window.dispatchEvent(new CustomEvent('jsm:virtual-menu', { detail: result.id }))
  }
  return <>
    {relevant.map(({ menu, attachment }, index) => <div key={`${menu.id}:${index}`} className="stick-menu-card">
      <strong>{(attachment.activation === 'ALWAYS' || isDirectStickMenu(attachment, config.trigger)) ? 'Reserved for menu' : 'Menu takes over while active'} · {menu.name}</strong>
      <p>{attachment.activation === 'ALWAYS' ? 'This stick cannot control movement or camera while this menu is always available. No activation button is required.' : 'While this menu is active, this stick cannot control movement or camera. Its normal mode resumes when the menu closes.'}</p>
      {config.trigger && attachment.activation === 'ALWAYS' && <p>Change this menu's always-available activation to use movement or camera in a modeshift.</p>}
      <SummaryRow label="Virtual menu" value="Edit menu" hint={`${MENU_SELECTIONS.find(s => s.value === attachment.selection)?.label} · ${menu.placement.reveal === 'never' ? 'Hidden in game' : 'Overlay enabled'}`} onActivate={() => window.dispatchEvent(new CustomEvent('jsm:virtual-menu', { detail: menu.id }))} />
    </div>)}
    {legacy && <SummaryRow label="Use the virtual menu editor" hint="Convert this wheel, preserving its actions, labels, icons and appearance." onActivate={() => connect()} />}
    {problem && <p role="alert">{problem}</p>}
    <Sheet eyebrow="Joysticks · Virtual menus" open={choosing} onClose={onClose} title={`${side === 'left' ? 'Left' : 'Right'} stick · Radial menu`} description="Use directly with the stick — no activation button required. This reserves the stick for menu navigation instead of movement or camera control.">
      {catalog.problem ? <p role="alert">{catalog.problem}</p> : <>
        <SummaryRow label={legacy ? 'Convert existing wheel' : 'Create radial menu'} hint="Hidden in game. Hold an action by pointing the stick; release it by returning to centre." onActivate={() => connect()} />
        {catalog.menus.filter(menu => menu.type === 'RADIAL').map(menu => <SummaryRow key={menu.id} label={`Use ${menu.name}`} hint="Use this existing menu directly with the stick." onActivate={() => connect(menu.id)} />)}
      </>}
      {problem && <p role="alert">{problem}</p>}
    </Sheet>
  </>
}

import { useState } from 'react'
import { OpenRow, SubPage } from '../ui/console'
import { readVirtualMenus, writeVirtualMenus } from '../../utils/virtualMenus'
import { connectStickMenu, type StickSide } from '../../utils/stickMenus'
import { updateKeymapEntry } from '../../utils/keymap'
import type { SetText } from './shared'
import styles from './P4.module.css'

// "Picking from a wheel" (console v2, Sticks): the sub-page the Wheel card opens
// when the stick has no wheel yet. One terse question: a new wheel (opens it in
// Menus to fill the slices) or one of the wheels this configuration already
// has (the stick is reserved for it and you stay on Sticks). B goes back to the
// Sticks front with the Wheel card focused.

type Props = {
  open: boolean
  onClose: () => void
  side: StickSide
  text: string
  setText: SetText
  /** A RADIAL_MENU wheel from an older file: "New wheel" converts it, keeping its slices. */
  legacy: boolean
}

export function WheelChooser({ open, onClose, side, text, setText, legacy }: Props) {
  const [problem, setProblem] = useState<string | null>(null)
  const name = side === 'left' ? 'Left stick' : 'Right stick'
  const catalog = readVirtualMenus(text)
  const wheels = catalog.menus.filter(menu => menu.type === 'RADIAL')
  const connect = (id?: string) => {
    const result = connectStickMenu(text, side, id)
    setProblem(result.problem ?? null)
    if (!result.id) return
    const menuId = result.id
    setText(previous => writeVirtualMenus(updateKeymapEntry(previous, `${side.toUpperCase()}_STICK_MODE`, ['NO_MOUSE']), readVirtualMenus(result.text).menus))
    onClose()
    // A new wheel has empty slices: open it in Menus to fill them. An existing
    // one is ready, so you stay on Sticks with the stick reserved for it.
    if (!id) window.dispatchEvent(new CustomEvent('jsm:virtual-menu', { detail: menuId }))
  }
  return (
    <SubPage open={open} onClose={onClose} trail={['Sticks', name]} title="Wheel" backLabel="Back to Sticks">
      <div className={styles.whileHolding} data-wheel-chooser="">
        <p className={styles.lede}>Point the stick at a slice to pick it. The stick is reserved for the wheel; it doesn’t move or look around.</p>
        {catalog.problem && <p role="alert" className={styles.note} data-tone="warn">{catalog.problem}</p>}
        {!catalog.problem && (
          <>
            <OpenRow label={legacy ? 'Convert this wheel' : 'New wheel'} hint={legacy ? 'Keeps its slices, names and icons; opens it in Menus' : 'Up to 8 slices · opens in Menus to fill them'} value="Menus"
              data={{ 'data-wheel-new': '' }} hints="A:Create" onOpen={() => connect()} />
            {wheels.map(menu => (
              <OpenRow key={menu.id} label={`Use ${menu.name}`} hint={`${menu.actions.length} slices · already in this configuration`} value="Use"
                data={{ 'data-wheel-use': menu.id }} hints="A:Use" onOpen={() => connect(menu.id)} />
            ))}
          </>
        )}
        {problem && <p role="alert" className={styles.note} data-tone="warn">{problem}</p>}
      </div>
    </SubPage>
  )
}

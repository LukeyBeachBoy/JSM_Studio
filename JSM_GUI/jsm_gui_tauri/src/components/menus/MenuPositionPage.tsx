import { useState } from 'react'
import { SubPage, OpenRow, SegmentedRow } from '../ui/console'
import { MenuPositionFields, MenuPositionScreen, MenuPositionWorkspace } from '../keymap/VirtualMenuLibrary'
import type { VirtualMenu } from '../../utils/virtualMenus'
import { REVEAL_CAPTION, REVEAL_LABEL } from './menuText'
import styles from './Menus.module.css'

// Position on screen (MenuEditor ▸ Position on screen): the screen with this
// menu to scale -- drag it, or the arrow keys -- its across / down values and
// when it shows; "Position all menus" shows every menu at once, their
// overlaps, and Match position with.

type Props = {
  menu: VirtualMenu
  menus: VirtualMenu[]
  all: boolean
  onAll: () => void
  onChange: (id: string, patch: Partial<VirtualMenu['placement']>) => void
  onClose: () => void
}

export function MenuPositionPage({ menu, menus, all, onAll, onChange, onClose }: Props) {
  const [moving, setMoving] = useState(menu.id)
  return (
    <SubPage open onClose={onClose} trail={['Menus', menu.name]} title={all ? 'Position all menus' : 'Position on screen'} badge={null} backLabel="Back to the menu"
      hints={[{ button: 'MOVE', label: 'Move' }]}>
      {all ? <div className={styles.positionAll} role="region" aria-label="Position virtual menus">
        <p className={styles.note}>Every menu is drawn to scale, hidden ones too. Pick one to move it. Menus opened separately may overlap; check the buttons of menus that can open together.</p>
        <MenuPositionWorkspace menus={menus} selectedId={moving} onSelect={setMoving} onChange={onChange} />
      </div> : <div className={styles.position}>
        <section className={styles.positionScreen} aria-label="Overlay screen preview">
          <p className={styles.note}>Drag the menu to where it should show, or move it with the D-pad.</p>
          <MenuPositionScreen menu={menu} onChange={patch => onChange(menu.id, patch)} />
        </section>
        <section className={styles.positionSide} aria-label="Where it shows">
          <MenuPositionFields menu={menu} onChange={patch => onChange(menu.id, patch)} />
          <SegmentedRow label="Appears" value={menu.placement.reveal}
            options={(Object.keys(REVEAL_LABEL) as VirtualMenu['placement']['reveal'][]).map(value => ({ value, label: REVEAL_LABEL[value], caption: REVEAL_CAPTION[value] }))}
            onChange={reveal => onChange(menu.id, { reveal: reveal as VirtualMenu['placement']['reveal'] })} />
          <OpenRow label="Position all menus" hint="See overlaps, match positions" onOpen={onAll} hints="A:Open;B:Back to the menu" />
        </section>
      </div>}
    </SubPage>
  )
}

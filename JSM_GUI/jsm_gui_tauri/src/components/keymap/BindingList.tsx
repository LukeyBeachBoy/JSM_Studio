import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import keymapStyles from '../Keymap.module.css'

/** A list of collapsed binding rows under their column header (3b): the rows'
 *  Extras and Output columns are named once, above the list, on the same grid. */
export function BindingList({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className={keymapStyles.bindingColumnsWrap}>
      <div className={keymapStyles.bindingColumns} aria-hidden="true">
        <span /><span />
        <span>{t('keymap.rowExtras', 'Extras')}</span>
        <span>{t('keymap.rowOutput', 'Output')}</span>
      </div>
      <div className={keymapStyles.keymapGrid}>{children}</div>
    </div>
  )
}

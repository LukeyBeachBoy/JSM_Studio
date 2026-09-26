import type { ComponentProps } from 'react'
import { Icon } from '../icons/Icon'
import type { IconName } from '../icons/iconData'
import { Select } from '../ui/Select'
import keymapStyles from '../Keymap.module.css'

type Props = ComponentProps<typeof Select> & { icon: IconName }

/**
 * A select whose trigger carries the chosen mode's icon (15a/15b/15c "mode
 * picker"). The icon sits on the trigger only: putting one on every option
 * widened the list past the width the help panel is placed against.
 */
export function IconSelect({ icon, className = '', ...rest }: Props) {
  return (
    <span className={keymapStyles.iconSelect}>
      <Icon name={icon} size={20} className={keymapStyles.iconSelectIcon} />
      <Select {...rest} className={`${keymapStyles.iconSelectTrigger} ${className}`.trim()} />
    </span>
  )
}

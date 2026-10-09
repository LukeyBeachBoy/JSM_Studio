import { createContext, useContext, type ReactNode } from 'react'
import type { ControllerVisualFamily } from '../utils/controllerStatus'
import type { ShellWidth } from './useShellWidth'

// What a full-screen sub-page (ui/SubPage) needs from the shell to look like the
// rest of the app (console v2): the controller family for glyphs, the window
// width for the footer, the configuration and mode being edited for the
// breadcrumb, and the one status chip (V3), which every header shows.
export type ShellInfo = {
  width: ShellWidth
  family: ControllerVisualFamily
  /** A controller is connected. */
  controller: boolean
  /** The configuration being edited ("Wardogs"). */
  configName: string | null
  /** The mode being edited, when it is not Default ("Vehicles"). */
  modeName: string | null
  /** The header's status chip, as the title bar draws it. */
  statusChip: ReactNode
}

export const ShellContext = createContext<ShellInfo>({
  width: 'wide',
  family: 'generic',
  controller: false,
  configName: null,
  modeName: null,
  statusChip: null,
})

export const useShell = () => useContext(ShellContext)

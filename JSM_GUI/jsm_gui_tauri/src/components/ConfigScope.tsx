import type { ReactNode } from 'react'
import { DirtyScope } from '../hooks/configContext'
export function ConfigScope({ match, children }: { match: RegExp; children: ReactNode }) {
  return <DirtyScope.Provider value={match}>{children}</DirtyScope.Provider>
}

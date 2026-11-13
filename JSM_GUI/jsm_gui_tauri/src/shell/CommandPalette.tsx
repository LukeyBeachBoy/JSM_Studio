import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '../components/ui/Dialog'
import { Icon } from '../components/icons/Icon'
import { ALL_PAGES, type PrimaryTab } from './pages'
import type { TitleBarProfile } from './TitleBar'
import styles from './CommandPalette.module.css'

type Props = {
  open: boolean
  configurationsOnly?: boolean
  profiles: TitleBarProfile[]
  onClose: () => void
  onNavigate: (page: PrimaryTab) => void
  onProfile: (name: string) => void
  onFind: () => void
}

export function CommandPalette({ open, configurationsOnly = false, profiles, onClose, onNavigate, onProfile, onFind }: Props) {
  const [query, setQuery] = useState('')
  useEffect(() => { if (!open) setQuery('') }, [open])
  const commands = useMemo(() => [
    { id: 'find', label: 'Find a button', group: 'Actions', description: 'Press a controller input · Ctrl+Shift+F', run: onFind },
    ...ALL_PAGES.filter(page => page.tab !== 'dpad').map(page => ({ id: page.tab, label: page.label, group: page.hub === 'settings' ? 'Settings' : page.hub === 'library' ? 'Library' : 'Pages', description: page.purpose, run: () => onNavigate(page.tab) })),
    ...profiles.map(profile => ({ id: `profile:${profile.name}`, label: profile.name, group: profile.template ? 'Bases' : 'Configurations', description: profile.description ?? 'Open for editing', run: () => onProfile(profile.name) })),
  ], [profiles, onNavigate, onProfile, onFind])
  const matches = commands.filter(command => (!configurationsOnly || command.group === 'Configurations') && `${command.label} ${command.group} ${command.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  if (!open) return null
  return <Dialog title={configurationsOnly ? 'Switch game' : 'Go to…'} subtitle={configurationsOnly ? 'Choose a configuration to edit' : 'Pages, settings and configurations'} width={720} onClose={onClose}
    footerNote="Ctrl+K opens search · Esc closes" hints={[{ button: 'A', label: 'Open' }, { button: 'B', label: 'Close' }]}>
    <div className={styles.body}>
      <label className={styles.search}><Icon name="search" size={20} />
        <input type="search" autoFocus aria-label="Search pages, settings and configurations" placeholder="Search pages, settings or configurations…"
          autoComplete="off" spellCheck={false} value={query} onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && matches[0]) { event.preventDefault(); onClose(); matches[0].run() } }} />
      </label>
      <div className={styles.results} aria-label="Search results">
        {matches.map((command, index) => <div key={command.id}>
          {(index === 0 || command.group !== matches[index - 1].group) && <h3 className={styles.group}>{command.group}</h3>}
          <button type="button" className={styles.result} onClick={() => { onClose(); command.run() }}>
            <b>{command.label}</b><span>{command.description}</span>
          </button>
        </div>)}
        {!matches.length && <p role="status">No results. Try a page name, setting or configuration.</p>}
      </div>
    </div>
  </Dialog>
}

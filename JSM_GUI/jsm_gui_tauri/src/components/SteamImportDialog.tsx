import { useEffect, useMemo, useRef, useState } from 'react'
import { desktopBridge, type SteamLayoutFile } from '../platform/desktopBridge'
import { convertSteamLayout, steamControllerName, type ReportItem, type SteamConversion } from '../utils/steamLayout'
import { PAD_EVENT, type PadEventDetail } from '../nav/useControllerNavigation'
import { requestValueEntry } from '../nav/textEntry'
import { SubPage } from './ui/console'
import { Sheet } from './ui/Sheet'
import { Icon } from './icons/Icon'
import { InputGlyph } from './glyphs/InputGlyph'
import { ButtonGlyph } from './glyphs/ButtonGlyph'
import { useShell } from '../shell/ShellContext'
import { steamArt } from './library/gameArt'
import styles from './SteamImport.module.css'

// Import from Steam (console v2: SteamImport): a full page, not a dialog. Pick
// a layout Steam has on this PC (or any .vdf), then review it before anything
// is created: what was brought over, what is close enough, and what had no
// match here -- each with its input's glyph -- and the configurations it
// creates, one per action set, each renamed with Y.

type Props = {
  onClose: () => void
  /** Planned names (ConvertedSet.name) to the names chosen in the review. */
  onImport: (conversion: SteamConversion, renames: Record<string, string>) => void
  /** For "Your own Wardogs is untouched". */
  libraryProfiles?: string[]
}

type Picked = { text: string; fileName: string; game?: string; source?: SteamLayoutFile['source']; appId?: string | null }

const SOURCE_LABEL: Record<SteamLayoutFile['source'], string> = { personal: 'Saved on this PC', cloud: 'Steam Cloud', template: 'Steam template' }
const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path
const edited = (ms: number) => ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export function SteamImportDialog({ onClose, onImport, libraryProfiles = [] }: Props) {
  const [layouts, setLayouts] = useState<SteamLayoutFile[] | null>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let live = true
    void desktopBridge.listSteamLayouts().then(found => { if (live) setLayouts(found) })
    return () => { live = false }
  }, [])

  // The list arrives after the page opened on its last button: land on the first layout.
  useEffect(() => {
    if (!layouts?.length || picked) return
    window.requestAnimationFrame(() => {
      const active = document.activeElement as HTMLElement | null
      if (!active || active === document.body || active.matches('[data-vdf-button]')) document.querySelector<HTMLElement>('[data-steam-layouts] [data-autofocus]')?.focus({ preventScroll: true })
    })
  }, [layouts, picked])

  const conversion = useMemo(() => {
    if (!picked) return null
    try {
      return { result: convertSteamLayout(picked.text, { fileName: picked.fileName, date: new Date().toISOString().slice(0, 10) }) }
    } catch (failure) {
      return { error: failure instanceof Error ? failure.message : String(failure) }
    }
  }, [picked])

  const choose = async (layout: SteamLayoutFile) => {
    setError(null)
    try {
      const text = await desktopBridge.readSteamLayout(layout.path)
      setPicked({ text, fileName: fileName(layout.path), game: layout.game, source: layout.source, appId: layout.appId })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  const yours = (layouts ?? []).filter(layout => layout.source !== 'template')
  const templates = (layouts ?? []).filter(layout => layout.source === 'template')
  const row = (layout: SteamLayoutFile, first: boolean) => (
    <li key={layout.path}>
      <button type="button" className={styles.row} onClick={() => void choose(layout)} data-hints="A:Review;B:Back" data-caption={`${layout.title} · ${layout.path}`} data-autofocus={first ? '' : undefined}>
        <Icon name="library" size={24} />
        <span>
          <span className={styles.rowName}>{layout.title}</span>
          <span className={styles.rowSub}>{[layout.source === 'template' ? null : layout.game, steamControllerName(layout.controllerType), layout.source === 'template' ? null : edited(layout.modifiedMs)].filter(Boolean).join(' · ')}</span>
        </span>
        {layout.source === 'cloud' ? <span className={styles.tag}>{SOURCE_LABEL.cloud}</span> : <span />}
        <Icon name="chevronRight" size={20} />
      </button>
    </li>
  )

  if (picked && conversion?.result) {
    return <Review conversion={conversion.result} picked={picked} libraryProfiles={libraryProfiles} onBack={() => setPicked(null)} onImport={onImport} onClose={onClose} />
  }

  return (
    <SubPage open onClose={picked ? () => setPicked(null) : onClose} trail={[]} title="Choose a Steam layout" bare backLabel="Back" where="Library · Import from Steam">
      <header className={styles.head}><span>Library · Import from Steam</span><span aria-hidden="true">▸</span><b>Choose a Steam layout</b><span className={styles.chip}>Nothing is created until you import</span></header>
      <div className={styles.list} data-steam-layouts="">
        {picked && conversion?.error && <p className={styles.error} role="alert">{picked.fileName} couldn’t be read: {conversion.error}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <p className={styles.empty}>Layouts Steam keeps on this PC. Pick one to see what comes across before anything is created.</p>
        {layouts === null && <p className={styles.empty}>Looking for Steam layouts…</p>}
        {layouts !== null && layouts.length === 0 && <p className={styles.empty}>No Steam layouts were found on this PC. Choose a .vdf file instead; Steam keeps them under Steam\steamapps\common\Steam Controller Configs.</p>}
        {yours.length > 0 && <><p className={styles.eyebrow}>Your layouts · {yours.length}</p><ul className={styles.rows}>{yours.map((layout, index) => row(layout, index === 0))}</ul></>}
        {templates.length > 0 && <><p className={styles.eyebrow}>Steam templates · {templates.length}</p><ul className={styles.rows}>{templates.map((layout, index) => row(layout, !yours.length && index === 0))}</ul></>}
        <input ref={fileRef} type="file" accept=".vdf" hidden onChange={async event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          setError(null)
          setPicked({ text: await file.text(), fileName: file.name })
        }} />
        <button type="button" className={styles.back} data-vdf-button="" data-autofocus={layouts?.length ? undefined : ''} data-hints="A:Choose a file;B:Back" onClick={() => fileRef.current?.click()}>
          <Icon name="folder" size={20} />Choose a .vdf file…
        </button>
      </div>
    </SubPage>
  )
}

function Review({ conversion, picked, libraryProfiles, onBack, onImport, onClose }: { conversion: SteamConversion; picked: Picked; libraryProfiles: string[]; onBack: () => void; onImport: Props['onImport']; onClose: () => void }) {
  const { family } = useShell()
  const { counts, report, sets } = conversion
  // Your own "Wardogs" stays: a set named like a configuration you have gets
  // the next free number, as the library would give it.
  const taken = new Set(libraryProfiles.map(name => name.toLowerCase()))
  const [names, setNames] = useState<Record<string, string>>(() => {
    const used = new Set(taken)
    return Object.fromEntries(sets.map(set => {
      const display = set.displayName ?? set.name
      let name = display
      for (let n = 2; used.has(name.toLowerCase()) || used.has(name.replace(/\s*·\s*/g, ' - ').toLowerCase()); n++) name = `${display} ${n}`
      used.add(name.toLowerCase())
      return [set.name, name]
    }))
  })
  const [showAll, setShowAll] = useState(false)
  const [art, setArt] = useState<string | null>(null)
  useEffect(() => { if (picked.appId) void steamArt(picked.appId, 'header').then(setArt) }, [picked.appId])

  const skipped = report.filter(item => item.status === 'skipped')
  const approximated = report.filter(item => item.status === 'approximated')
  const converted = report.filter(item => item.status === 'converted')
  const layers = sets.flatMap(set => set.layers)
  const summary = [...new Set(converted.map(item => (item.where.match(/^(Left |Right )?(stick|trackpad|trigger|bumper|grip)/i) ? item.where.split(' ').slice(0, 2).join(' ') : /button|L4|L5|R4|R5|D-pad/i.test(item.where) ? 'Buttons' : item.where).replace(/^(Left|Right) /, '')))]
  const summaryText = `${summary.slice(0, 4).join(', ').replace(/^./, c => c.toUpperCase())}${layers.length ? ` and the ${layers.join(', ')} ${layers.length === 1 ? 'layer' : 'layers'}` : ''}`
  const own = sets.map(set => set.displayName ?? set.name).filter(name => taken.has(name.toLowerCase()))

  const rename = (setName: string) => {
    requestValueEntry({
      title: 'Rename', eyebrow: `Import from Steam · ${sets.find(set => set.name === setName)?.setTitle ?? ''}`, value: names[setName] ?? setName,
      hint: 'The configuration this action set becomes.',
      onDone: value => { const trimmed = value.trim(); if (trimmed) setNames(current => ({ ...current, [setName]: trimmed })) },
    })
  }
  const doImport = () => {
    const renames = Object.fromEntries(sets.map(set => [set.name, (names[set.name] ?? set.name).replace(/\s*·\s*/g, ' - ')]))
    onImport(conversion, renames)
  }

  // Y renames the focused set (or the first); A imports from anywhere but a set.
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = rootRef.current?.closest('[data-subpage]')
    if (!host) return
    const onPad = (event: Event) => {
      if ((event as CustomEvent<PadEventDetail>).detail.button !== 'Y') return
      const set = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-set]')?.dataset.set ?? sets[0]?.name
      if (!set) return
      event.preventDefault()
      rename(set)
    }
    host.addEventListener(PAD_EVENT, onPad)
    return () => host.removeEventListener(PAD_EVENT, onPad)
  })

  const item = (entry: ReportItem, index: number) => (
    <li key={index}>
      <button type="button" className={styles.item} data-hints="Y:Rename;B:Back" data-caption={`${entry.where} · ${entry.detail}`}
        aria-label={`${entry.where}: ${entry.detail}`}>
        <span className={styles.glyph} aria-hidden="true">{entry.input ? <InputGlyph command={entry.input === 'GYRO' ? 'GY' : entry.input} family={family} size={26} /> : <Icon name="info" size={20} />}</span>
        <span className={styles.where}>{entry.where}{entry.scope && <small>{entry.scope}</small>}</span>
        <span className={styles.detail}>{entry.detail.replace(/^./, c => c.toUpperCase())}</span>
      </button>
    </li>
  )

  return (
    <SubPage open onClose={onBack} trail={[]} title={conversion.title} bare backLabel="Back" where="Library · Import from Steam · Review"
      hints={[{ button: 'A', label: 'Import' }, { button: 'Y', label: 'Rename' }]}>
      <div ref={rootRef}>
        <header className={styles.head}><span>Library · Import from Steam</span><span aria-hidden="true">▸</span><b>Review</b><span className={styles.chip}>Nothing is created until you import</span></header>
        <div className={styles.layout}>
          <section className={styles.main} aria-label="What comes across">
            <div className={styles.title}>
              {art ? <img className={styles.art} src={art} alt="" /> : <span className={styles.art} aria-hidden="true" />}
              <span>
                <h2>{conversion.title}</h2>
                <p>{[picked.source ? SOURCE_LABEL[picked.source] : 'A .vdf file', picked.game && picked.source !== 'template' ? picked.game : null, `made for ${steamControllerName(conversion.controllerType)}`].filter(Boolean).join(' · ')} · <span className={styles.mono}>{picked.fileName}</span></p>
              </span>
            </div>
            <div className={styles.pills} role="status">
              <span className={`${styles.pill} ${styles.pillOk}`}><Icon name="success" size={18} />{counts.converted} brought over</span>
              <span className={`${styles.pill} ${styles.pillWarn}`}><Icon name="warning" size={18} />{counts.approximated} close enough</span>
              <span className={`${styles.pill} ${styles.pillError}`}><Icon name="error" size={18} />{counts.skipped} not brought over</span>
            </div>
            {skipped.length > 0 && <>
              <h3 className={styles.section} data-tone="error">Not brought over · {skipped.length}<small>Nothing like it here. Also listed at the end of the new file.</small></h3>
              <ul className={styles.items}>{skipped.map(item)}</ul>
            </>}
            {approximated.length > 0 && <>
              <h3 className={styles.section} data-tone="warn">Close enough · {approximated.length}<small>Brought over, but worth a look once it’s open.</small></h3>
              <ul className={styles.items}>{approximated.map(item)}</ul>
            </>}
            {converted.length > 0 && (
              <button type="button" className={styles.broughtOver} data-hints="A:Show all;B:Back" onClick={() => setShowAll(true)}>
                <Icon name="success" size={20} /><span><b>Brought over · {converted.length}</b> &nbsp;{summaryText}</span><span>Show all ▸</span>
              </button>
            )}
          </section>

          <aside className={styles.aside} aria-label={`Creates ${sets.length} ${sets.length === 1 ? 'configuration' : 'configurations'}`}>
            <p className={styles.eyebrow}>Creates {sets.length} {sets.length === 1 ? 'configuration' : 'configurations'}</p>
            {sets.length > 1 && <p>Each Steam action set becomes its own configuration. Buttons that switched sets now swap to it.</p>}
            <div className={styles.diagram} aria-hidden="true">
              <span className={styles.vdf}>.vdf</span><span className={styles.fan} />
              <span className={styles.targets}>{sets.map(set => <span key={set.name}>{set.setTitle}{set.isDefault && sets.length > 1 ? ' · main' : ''}</span>)}</span>
            </div>
            {sets.map(set => (
              <button key={set.name} type="button" className={styles.set} data-set={set.name} data-hints="A:Rename;Y:Rename;B:Back" onClick={() => rename(set.name)}>
                <i aria-hidden="true" />
                <span><b>{names[set.name]}</b><small>From “{set.setTitle}”{set.layers.length ? ` · ${set.layers.length} ${set.layers.length === 1 ? 'layer' : 'layers'}: ${set.layers.join(', ')}` : ''}</small></span>
                <span><ButtonGlyph button="Y" size={20} family={family} pad /> rename</span>
              </button>
            ))}
            <button type="button" className={styles.import} data-autofocus="" data-hints="A:Import;Y:Rename;B:Back" onClick={doImport}>
              <ButtonGlyph button="A" size={26} family={family} pad />
              <b>Import {sets.length > 1 ? `${sets.length} configurations` : 'configuration'}</b>
              <small>Opens {names[sets[0]?.name] ?? conversion.title}.{own.length ? ` Your own ${own.join(', ')} ${own.length === 1 ? 'is' : 'are'} untouched.` : ''}</small>
            </button>
            <button type="button" className={styles.back} data-hints="A:Back;B:Back" onClick={onBack}><ButtonGlyph button="B" size={22} family={family} pad />Back to Steam layouts</button>
            <button type="button" className={styles.back} data-hints="A:Close;B:Back" onClick={onClose} style={{ background: 'transparent' }}>Close</button>
          </aside>
        </div>
      </div>
      <Sheet open={showAll} onClose={() => setShowAll(false)} eyebrow="Import from Steam · Review" title={`Brought over · ${converted.length}`} hints={[{ button: 'B', label: 'Back' }]} width={720}>
        <ul className={styles.items}>{converted.map(item)}</ul>
      </Sheet>
    </SubPage>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { desktopBridge, type SteamLayoutFile } from '../platform/desktopBridge'
import { convertSteamLayout, steamControllerName, type ReportItem, type SteamConversion } from '../utils/steamLayout'
import { Icon } from './icons/Icon'
import styles from './SteamImport.module.css'

type Props = {
  onClose: () => void
  onImport: (conversion: SteamConversion) => void
}

type Picked = { text: string; fileName: string; game?: string }

const SOURCE_LABEL: Record<SteamLayoutFile['source'], string> = { personal: 'Saved', cloud: 'Steam Cloud', template: 'Template' }

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path
const edited = (ms: number) => ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''

// Import from Steam: pick a layout Steam already has on this PC (or any .vdf),
// then see exactly what carries over before a configuration is created. The
// review step is the point -- nothing Steam could do that Studio cannot is
// allowed to disappear without being named here.
export function SteamImportDialog({ onClose, onImport }: Props) {
  const [layouts, setLayouts] = useState<SteamLayoutFile[] | null>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const firstRef = useRef<HTMLButtonElement | null>(null)
  const importRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    let live = true
    void desktopBridge.listSteamLayouts().then(found => { if (live) setLayouts(found) })
    return () => { live = false }
  }, [])
  // Controller-first: land on something actionable at each step.
  useEffect(() => { if (!picked) firstRef.current?.focus() }, [picked, layouts])
  useEffect(() => { if (picked) importRef.current?.focus() }, [picked])

  const conversion = useMemo(() => {
    if (!picked) return null
    try {
      return { result: convertSteamLayout(picked.text, { fileName: picked.fileName, title: name, date: new Date().toISOString().slice(0, 10) }) }
    } catch (failure) {
      return { error: failure instanceof Error ? failure.message : String(failure) }
    }
  }, [picked, name])

  const choose = async (layout: SteamLayoutFile) => {
    setError(null)
    try {
      const text = await desktopBridge.readSteamLayout(layout.path)
      setName('')
      setPicked({ text, fileName: fileName(layout.path), game: layout.game })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  const yours = (layouts ?? []).filter(layout => layout.source !== 'template')
  const templates = (layouts ?? []).filter(layout => layout.source === 'template')
  let first = true
  const row = (layout: SteamLayoutFile) => {
    const ref = first ? firstRef : undefined
    first = false
    return (
      <li key={layout.path}>
        <button ref={ref} type="button" className={styles.row} onClick={() => void choose(layout)} data-hints="A:Review;B:Back" title={layout.path}>
          <span className={styles.rowIcon} aria-hidden="true"><Icon name="library" size={24} /></span>
          <span className={styles.rowText}>
            <span className={styles.rowName}>{layout.title}</span>
            <span className={styles.rowSub}>{[layout.source === 'template' ? null : layout.game, steamControllerName(layout.controllerType), layout.source === 'template' ? null : edited(layout.modifiedMs)].filter(Boolean).join(' · ')}</span>
          </span>
          {layout.source === 'cloud' && <span className={styles.tag}>{SOURCE_LABEL.cloud}</span>}
          <Icon name="chevronRight" size={20} />
        </button>
      </li>
    )
  }

  const close = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    if (picked) setPicked(null)
    else onClose()
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose} onKeyDown={close}>
      <section className={`modal-card ${styles.dialog}`} role="dialog" aria-modal="true" aria-labelledby="steam-import-title" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className={styles.eyebrow}>{picked ? 'Review' : 'Import from Steam'}</span>
            <h3 id="steam-import-title">{picked ? conversion?.result?.title ?? picked.fileName : 'Choose a Steam layout'}</h3>
          </div>
          <button type="button" className="ghost-btn" data-modal-close onClick={onClose}>Close</button>
        </div>

        {!picked && (
          <>
            <p className="modal-description">
              Layouts Steam has saved on this PC. Pick one to see what carries over before anything is created.
            </p>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <div className={styles.scroll}>
              {layouts === null && <p className={styles.empty}>Looking for Steam layouts…</p>}
              {layouts !== null && layouts.length === 0 && (
                <p className={styles.empty}>No Steam layouts were found on this PC. Choose a .vdf file instead; Steam keeps them under Steam\steamapps\common\Steam Controller Configs.</p>
              )}
              {yours.length > 0 && <>
                <h4 className={styles.eyebrow}>Your layouts · {yours.length}</h4>
                <ul className={styles.rows}>{yours.map(row)}</ul>
              </>}
              {templates.length > 0 && <>
                <h4 className={styles.eyebrow}>Steam templates · {templates.length}</h4>
                <ul className={styles.rows}>{templates.map(row)}</ul>
              </>}
            </div>
            <input ref={fileRef} type="file" accept=".vdf" hidden onChange={async event => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              setError(null)
              setName('')
              setPicked({ text: await file.text(), fileName: file.name })
            }} />
            <div className={styles.footer}>
              <button type="button" className="button button--secondary" ref={layouts?.length ? undefined : firstRef} onClick={() => fileRef.current?.click()}>
                Choose a .vdf file…
              </button>
            </div>
          </>
        )}

        {picked && conversion?.error && (
          <>
            <p className={styles.error} role="alert">{picked.fileName} could not be read: {conversion.error}</p>
            <div className={styles.footer}>
              <button type="button" className="button button--secondary" ref={importRef} onClick={() => setPicked(null)}>Back</button>
            </div>
          </>
        )}

        {picked && conversion?.result && <Review
          conversion={conversion.result}
          picked={picked}
          name={name}
          onName={setName}
          onBack={() => setPicked(null)}
          onImport={() => onImport(conversion.result!)}
          importRef={importRef}
        />}
      </section>
    </div>
  )
}

type ReviewProps = {
  conversion: SteamConversion
  picked: Picked
  name: string
  onName: (name: string) => void
  onBack: () => void
  onImport: () => void
  importRef: React.MutableRefObject<HTMLButtonElement | null>
}

function Review({ conversion, picked, name, onName, onBack, onImport, importRef }: ReviewProps) {
  const { counts, report, sets } = conversion
  const approximated = report.filter(item => item.status === 'approximated')
  const skipped = report.filter(item => item.status === 'skipped')
  const converted = report.filter(item => item.status === 'converted')
  const layers = sets.flatMap(set => set.layers)
  const item = (entry: ReportItem, index: number) => (
    <li key={index} className={styles.item}>
      <span className={styles.itemWhere}>{entry.where}{entry.scope && <span className={styles.scope}>{entry.scope}</span>}</span>
      <span className={styles.itemDetail}>{entry.detail}</span>
    </li>
  )

  return (
    <>
      <div className={styles.summary} role="status">
        <span className={`${styles.pill} ${styles.pillOk}`}><Icon name="success" size={16} />{counts.converted} converted</span>
        <span className={`${styles.pill} ${counts.approximated ? styles.pillWarn : ''}`}><Icon name="warning" size={16} />{counts.approximated} approximated</span>
        <span className={`${styles.pill} ${counts.skipped ? styles.pillError : ''}`}><Icon name="error" size={16} />{counts.skipped} not converted</span>
      </div>

      <div className={styles.scroll}>
        <dl className={styles.facts}>
          {picked.game && <div><dt>Game</dt><dd>{picked.game}</dd></div>}
          <div><dt>Made for</dt><dd>{steamControllerName(conversion.controllerType)}</dd></div>
          <div><dt>Creates</dt><dd>{sets.map(set => <span key={set.name} className={styles.created}>{set.name}.txt{!set.isDefault && <small> · action set {set.setTitle}</small>}</span>)}</dd></div>
          {layers.length > 0 && <div><dt>Layers</dt><dd>{layers.join(', ')}</dd></div>}
          <div><dt>File</dt><dd className={styles.mono}>{picked.fileName}</dd></div>
        </dl>

        {skipped.length > 0 && <section aria-labelledby="steam-skipped">
          <h4 id="steam-skipped" className={styles.sectionTitle}><Icon name="error" size={16} />Not converted · {skipped.length}</h4>
          <p className={styles.sectionHint}>Studio has nothing equivalent. These are also listed at the end of the new file.</p>
          <ul className={styles.items}>{skipped.map(item)}</ul>
        </section>}
        {approximated.length > 0 && <section aria-labelledby="steam-approx">
          <h4 id="steam-approx" className={styles.sectionTitle}><Icon name="warning" size={16} />Approximated · {approximated.length}</h4>
          <p className={styles.sectionHint}>Converted, but worth checking once it is open.</p>
          <ul className={styles.items}>{approximated.map(item)}</ul>
        </section>}
        {converted.length > 0 && <details className={styles.convertedList}>
          <summary className={styles.sectionTitle}><Icon name="success" size={16} />Converted · {converted.length}</summary>
          <ul className={styles.items}>{converted.map(item)}</ul>
        </details>}
      </div>

      <label className={styles.name}>
        <span>Configuration name</span>
        <input className="text-field" maxLength={80} value={name} placeholder={conversion.title} onChange={event => onName(event.target.value)} />
      </label>

      <div className={styles.footer}>
        <button type="button" className="button button--secondary" onClick={onBack}>Back</button>
        <button type="button" className="button button--primary" ref={importRef} onClick={onImport} data-hints="A:Import;B:Back">
          Import {sets.length > 1 ? `${sets.length} configurations` : 'configuration'}
        </button>
      </div>
    </>
  )
}

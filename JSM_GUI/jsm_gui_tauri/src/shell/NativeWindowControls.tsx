import { useEffect, useState } from 'react'
import { windowControls } from './windowControls'

export function WindowControls() {
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    let dispose: (() => void) | undefined
    let cancelled = false
    const refresh = () => { void windowControls.isMaximized().then(value => { if (!cancelled) setMaximized(value) }) }
    refresh()
    void windowControls.onResized(refresh).then(unlisten => { if (cancelled) unlisten(); else dispose = unlisten })
    return () => { cancelled = true; dispose?.() }
  }, [])
  // Mouse-only (HANDOFF.md, "Focus model"): out of the tab order and the pad's.
  return (
    <div className="window-controls" data-focusable="false">
      <button type="button" tabIndex={-1} aria-label="Minimise" onClick={() => void windowControls.minimize()}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5.5h10" stroke="currentColor" /></svg>
      </button>
      <button type="button" tabIndex={-1} aria-label={maximized ? 'Restore' : 'Maximise'} onClick={() => void windowControls.toggleMaximize()}>
        {maximized
          ? <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor"><rect x=".5" y="2.5" width="7" height="7" rx="1" /><path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" /></svg>
          : <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor"><rect x=".5" y=".5" width="9" height="9" rx="1" /></svg>}
      </button>
      <button type="button" tabIndex={-1} className="window-controls__close" aria-label="Close" onClick={() => void windowControls.close()}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M.5.5l9 9M9.5.5l-9 9" stroke="currentColor" /></svg>
      </button>
    </div>
  )
}


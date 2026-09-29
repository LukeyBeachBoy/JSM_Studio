import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

// A render error anywhere under App used to unmount the whole tree and leave
// the window blank, with no way back but killing the process. The mapper keeps
// running underneath; only the UI is gone. This catches the error, says what
// happened and offers a reload, which re-attaches to the running mapper.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('JSM Evolved failed to render', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="boot-shell" role="alert">
        <div className="boot-card error-card">
          <div className="boot-copy">
            <div className="boot-title">JSM Evolved hit a problem</div>
            <div className="boot-subtitle">The interface stopped drawing. The mapper is still running with the last applied configuration.</div>
            <pre className="error-card__detail">{error.message}</pre>
            <div className="error-card__actions">
              <button type="button" className="button button--primary" onClick={() => window.location.reload()}>Reload Studio</button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

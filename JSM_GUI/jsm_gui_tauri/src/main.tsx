import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { initI18n } from './i18n'
import appIcon from './assets/app-icon.svg'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

const root = ReactDOM.createRoot(rootElement)

const App = React.lazy(async () => {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('mock')) {
    ;(await import('./dev/mockDesktop')).installMockDesktop()
  }
  const [appModule] = await Promise.all([
    import('./App.tsx'),
    initI18n().catch((error) => {
      console.error('Failed to initialize i18n', error)
    }),
  ])
  return appModule
})

const bootFallback = (
  <div className="boot-shell" data-capture-ignore="true">
    <div className="boot-card">
      <img className="boot-mark" src={appIcon} alt="" />
      <div className="boot-copy">
        <div className="boot-title">JSM Studio</div>
        <div className="boot-subtitle">Loading interface...</div>
      </div>
    </div>
  </div>
)

root.render(
  <React.StrictMode>
    <React.Suspense fallback={bootFallback}>
      <App />
    </React.Suspense>
  </React.StrictMode>,
)

import { lazy, type ComponentType } from 'react'

/**
 * React.lazy that can be fetched ahead of time, and that renders at once when
 * it has been. A plain lazy component suspends on its first render even when
 * its module is already loaded, so the first visit to a page drew its loading
 * panel for a frame and the pad's landing on the page's first control waited
 * for the real page (the row "expanded" after the slide-in). Once `preload()`
 * has resolved, the component renders synchronously, like an eager import.
 */
export type PreloadedLazy<P> = ComponentType<P> & { preload: () => Promise<void> }

export function preloadedLazy<P extends object>(load: () => Promise<ComponentType<P>>): PreloadedLazy<P> {
  let loaded: ComponentType<P> | null = null
  let pending: Promise<void> | null = null
  const preload = () => (pending ??= load().then(component => { loaded = component }))
  const Lazy = lazy(async () => { await preload(); return { default: loaded as ComponentType<P> } }) as unknown as ComponentType<P>
  const Preloaded = (props: P) => {
    const Component = loaded
    return Component ? <Component {...props} /> : <Lazy {...props} />
  }
  return Object.assign(Preloaded, { preload })
}

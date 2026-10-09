import { useSyncExternalStore } from 'react'

// Whether button hints are drawn as the controller's buttons or as keyboard
// keys. The pad's glyphs only while it is the input in use: the moment the
// keyboard or mouse moves focus (useControllerNavigation marks the body with
// data-input-source), or with no controller connected (data-pad-connected,
// set by App), hints name the keys that do the same thing -- and each of those
// keys works (the keyboard bridge in useControllerNavigation).

const read = () => {
  const { inputSource, padConnected } = document.body.dataset
  return padConnected !== 'true' || inputSource === 'keyboard' || inputSource === 'mouse'
}

const subscribe = (notify: () => void) => {
  const observer = new MutationObserver(notify)
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-input-source', 'data-pad-connected'] })
  return () => observer.disconnect()
}

/** True when hints should name keyboard keys rather than draw pad buttons. */
export const useShowsKeys = () => useSyncExternalStore(subscribe, read)

/** The key that does what each pad button does, as the hints name it. */
export const KEY_FOR_BUTTON = {
  // LB/RB change tabs and LT/RT change sections (console v2, V1), so the keys
  // follow the job: PgUp/PgDn page, [ / ] step sections.
  A: 'Enter', B: 'Esc', X: 'X', Y: 'Y', LB: 'PgUp', RB: 'PgDn', LT: '[', RT: ']', VIEW: 'Home', MENU: 'M', DPAD: '↑↓←→',
} as const

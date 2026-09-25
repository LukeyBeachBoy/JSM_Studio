// The frameless title bar (HANDOFF.md, "Shell decisions") draws its own
// minimise / maximise / close. In a plain browser there is no window to drive,
// so the controls are simply not rendered and the bar sits under the OS
// caption: the "native-chrome fallback" the spec describes.
export const isFramelessWindow = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const currentWindow = async () => (await import('@tauri-apps/api/window')).getCurrentWindow()

export const windowControls = {
  minimize: async () => { try { await (await currentWindow()).minimize() } catch (error) { console.error('minimize failed', error) } },
  toggleMaximize: async () => { try { await (await currentWindow()).toggleMaximize() } catch (error) { console.error('maximize failed', error) } },
  // Goes through CloseRequested like the OS button did, so the app's
  // hide-to-tray handling in lib.rs still applies.
  close: async () => { try { await (await currentWindow()).close() } catch (error) { console.error('close failed', error) } },
  isMaximized: async () => { try { return await (await currentWindow()).isMaximized() } catch { return false } },
  onResized: async (listener: () => void) => { try { return await (await currentWindow()).onResized(listener) } catch { return () => {} } },
}

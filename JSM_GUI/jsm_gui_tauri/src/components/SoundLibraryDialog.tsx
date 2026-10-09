import { SoundLibraryPage } from './sounds/SoundLibraryPage'

// Settings ▸ Controller ▸ Your sounds opens the sound library. It used to be a
// dialog with nested trim dialogs; it is now a full page (console v2,
// SoundLibrary.dc.html: components/sounds/SoundLibraryPage.tsx). Kept under
// this name so the Settings page needs no change.
export function SoundLibraryDialog({ onClose }: { onClose: () => void }) {
  return <SoundLibraryPage onClose={onClose} crumbRoot="Settings" trail={['Controller']} />
}

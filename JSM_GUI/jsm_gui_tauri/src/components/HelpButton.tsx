import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'

/** Shared, keyboard-accessible progressive help. Radix restores focus on close. */
export function HelpButton({ title, children }: { title: string; children: ReactNode }) {
  return <Dialog.Root>
    <Dialog.Trigger asChild><button type="button" className="help-button" aria-label={`Help: ${title}`} title={`Help: ${title}`}>?</button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="help-overlay" />
      <Dialog.Content className="help-dialog">
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description asChild><div className="help-description">{children}</div></Dialog.Description>
        <Dialog.Close asChild><button type="button" className="primary-btn">Got it</button></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

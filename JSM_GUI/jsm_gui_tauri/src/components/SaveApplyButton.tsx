import * as Menu from '@radix-ui/react-dropdown-menu'

export function SaveApplyButton({ disabled, onAction }: { disabled?: boolean; onAction: (action: 'both' | 'save' | 'apply') => void }) {
  return <div className="save-split">
    <button className="primary-btn" disabled={disabled} onClick={() => onAction('both')}>Save and apply</button>
    <Menu.Root>
      <Menu.Trigger asChild><button className="primary-btn" disabled={disabled} aria-label="Save and apply options">▾</button></Menu.Trigger>
      <Menu.Portal><Menu.Content className="save-menu" sideOffset={6} align="end">
        <Menu.Item onSelect={() => onAction('save')}>Save <kbd>Ctrl+S</kbd></Menu.Item>
        <Menu.Item onSelect={() => onAction('apply')}>Apply <kbd>Ctrl+Shift+A</kbd></Menu.Item>
      </Menu.Content></Menu.Portal>
    </Menu.Root>
  </div>
}

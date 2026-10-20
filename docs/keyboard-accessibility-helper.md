# Keyboard above Windows Start

Ordinary always-on-top windows cannot rise above Windows shell surfaces such as
Start. Studio's existing topmost recovery remains useful for games, but cannot
cross that boundary. A separate, signed UIAccess helper displays the controller
keyboard in the accessibility layer.

The helper hosts the same keyboard renderer in a separate WebView2. Its browser
host is click-through and visually suppressed; it is not the visible overlay.
Windows Graphics Capture supplies raw GPU frames from that browser's own HWND,
with the capture interval derived from the monitor refresh rate. A bounded
readback pipeline presents premultiplied pixels through a native layered
UIAccess window, without PNG encoding or a fixed 30/60 FPS presentation limit.
Browser-owned surfaces are not used as the visible overlay: they can remain
behind app windows even when their UIAccess host reports itself as topmost.
Studio sends
JSON frames on a separate display thread, leaving input reduction and haptics
independent of the display process. It does not handle input or load profiles.
It accepts a single native keyboard-window handle, validates its title and
owning executable, and exits when that window disappears. Frame messages must
identify that source window. Navigation is restricted to installed local assets;
new windows, permissions, developer tools and native host objects are disabled.
The display follows visibility, position and size without activating or accepting
mouse input. The original surface stops drawing after the helper presents pixels
and resumes if delivery fails. Controller bindings, layouts and haptics stay in
Studio. A missing or stalled frame stream hides the helper after one second.
Position and visibility follow native window events immediately; a 250 ms timer
only watches lifecycle health. Moving the window does not reapply WebView bounds.
Resizing immediately scales the complete cached image. The browser keeps a
stable, high-resolution backing viewport during the gesture, so changing window
bounds cannot crop an older image while waiting for a browser resize.

## Local opt-in installation

Run from an **elevated PowerShell** in the repository:

```powershell
& .\JSM_GUI\jsm_gui_tauri\scripts\install-keyboard-accessibility.ps1 -Install
```

Requires Visual Studio C++ tools, CMake and Windows SDK SignTool. The script
downloads a pinned Microsoft WebView2 SDK with a SHA256 check, builds the helper,
signs it with a dedicated, non-exportable local code-signing
key, trusts the public certificate in the machine Root and TrustedPublisher
stores, and installs the executable under
`C:\Program Files\JSM Evolved\Accessibility`. It verifies the installed signature.
Re-running replaces the helper and stops only the installed helper process.
Reopen the keyboard afterwards. Studio starts the installed helper automatically;
if it is absent, the ordinary controller keyboard continues to work.
Run `npm run build:web` in `JSM_GUI/jsm_gui_tauri` first; installation copies
those renderer assets to the protected helper directory. An updated Studio
binary is required to send frames. Older Studio binaries cannot feed this helper.
After building Studio with `cargo build --release --features tauri/custom-protocol`,
the companion `scripts/apply-keyboard-accessibility-update.ps1` can update the
existing local per-user installation from an elevated PowerShell. It backs up
the installed executable, restarts only that Studio process and its mapper, and
verifies the copied executable. `-WhatIf` previews the operation.

The local certificate is not a public release certificate. This opt-in helper
is not automatically installed or trusted by the general Studio installer.
Distribution requires a suitable trusted Authenticode certificate and a secure
machine-wide installation. Do not disable Windows UIAccess security policy.

To remove the local installation, close Studio, remove the protected
`Accessibility` directory, and remove the certificate named
`JSM Evolved Local Keyboard Accessibility` from machine Root/TrustedPublisher
and the user's Personal certificate store. Record and match its thumbprint;
leave unrelated certificates untouched.

## Validation

Build the native helper and run Studio's native keyboard and stacking tests.
On the installed application, open the keyboard before and after opening Start;
check typing into Start search, transparency, animated cursors, all layouts,
move/resize, closing the keyboard, and repeated Start transitions. Confirm the
keyboard never takes focus and disappears when Studio exits.

References: [Microsoft UIAccess requirements](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-securityoverview),
[Microsoft WebView2 SDK](https://www.nuget.org/packages/Microsoft.Web.WebView2).

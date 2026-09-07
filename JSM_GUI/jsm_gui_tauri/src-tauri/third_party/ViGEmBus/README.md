# ViGEmBus prerequisite

`npm run prepare:drivers` downloads the official signed ViGEmBus 1.22.0
bootstrapper and checks its pinned SHA-256 before packaging. This runs in the
normal Tauri build, including CI. The NSIS installer runs it without restarting
Windows automatically, reports failures, and propagates a required reboot.

Release installers use NSIS so every distributed installer installs the driver;
a plain MSI cannot chain the vendor installer during its own MSI transaction.
Studio uninstall leaves this shared driver installed for other applications.

Source and license: https://github.com/nefarius/ViGEmBus/tree/v1.22.0

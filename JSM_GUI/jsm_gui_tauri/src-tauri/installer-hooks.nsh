; ViGEm is a shared prerequisite. Do not remove it when uninstalling Studio.
; The signed vendor bootstrapper handles existing installations and elevation.
;
; Studio installs per-user, so this hook runs unelevated. A kernel driver
; install needs admin, so we launch the vendor bootstrapper with the "runas"
; verb to raise a single UAC prompt. ExecShellWait cannot return the child's
; exit code (and the WiX "burn" bootstrapper re-launches a copy of itself, so
; even ExecWait only sees a handoff artifact), so success is decided by probing
; for the ViGEmBus service afterwards rather than by an exit code.
!macro NSIS_HOOK_POSTINSTALL
  ; Already present (fresh box, reinstall, or upgrade)? Skip the UAC prompt.
  ClearErrors
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Services\ViGEmBus" "ImagePath"
  ${IfNot} ${Errors}
    DetailPrint "Virtual controller driver (ViGEmBus) already installed."
    Goto vigem_done
  ${EndIf}

  DetailPrint "Installing virtual controller driver (ViGEmBus)..."
  ClearErrors
  ExecShellWait "runas" "$INSTDIR\third_party\ViGEmBus\ViGEmBus_1.22.0_x64_x86_arm64.exe" \
    '/install /quiet /norestart /log "$INSTDIR\third_party\ViGEmBus\install.log"'
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONEXCLAMATION "The virtual controller driver (ViGEmBus) was not installed$\n\
because the elevation prompt was dismissed or blocked. Xbox and PlayStation$\n\
output requires this driver. Re-run this installer as administrator, or run$\n\
$INSTDIR\third_party\ViGEmBus\ViGEmBus_1.22.0_x64_x86_arm64.exe manually." /SD IDOK
    SetErrorLevel 1
    Goto vigem_done
  ${EndIf}

  ; The bootstrapper returned. Confirm the driver actually landed.
  ClearErrors
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Services\ViGEmBus" "ImagePath"
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONEXCLAMATION "Virtual controller driver setup did not complete.$\n\
Xbox and PlayStation output requires this driver. See$\n\
$INSTDIR\third_party\ViGEmBus\install.log, or run$\n\
$INSTDIR\third_party\ViGEmBus\ViGEmBus_1.22.0_x64_x86_arm64.exe to retry." /SD IDOK
    SetErrorLevel 1
  ${Else}
    DetailPrint "Virtual controller driver (ViGEmBus) installed."
  ${EndIf}

  vigem_done:
!macroend

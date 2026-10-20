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

  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Install virtual gamepad output?$\n$\nViGEmBus creates an Xbox 360 or DualShock 4 controller for games. Keyboard and mouse mapping works without it. This shared driver stays installed if you uninstall JSM Evolved.$\n$\nYes opens the driver's administrator approval prompt. No skips it; the installer is included in third_party\ViGEmBus for later." /SD IDNO IDYES vigem_install IDNO vigem_done
  vigem_install:
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
  ; Shared signed virtual keyboard/mouse driver. Keep it across app uninstall.
  ClearErrors
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{17AA3E01-1012-4BF7-B908-1C499909B259}" "DisplayName"
  ${If} ${Errors}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Install advanced keyboard and mouse output?$\n$\nFakerInput lets controller input reach some elevated windows and enables the optional Windows Sign-in configuration. Ordinary keyboard and mouse mapping can use Windows SendInput without it. This shared driver stays installed if you uninstall JSM Evolved.$\n$\nYes opens Windows administrator approval. No skips it; the installer is included in third_party\FakerInput for later." /SD IDNO IDYES fakerinput_install IDNO fakerinput_done
    fakerinput_install:
    DetailPrint "Installing virtual keyboard and mouse (FakerInput)..."
    ClearErrors
    ExecShellWait "runas" "$SYSDIR\msiexec.exe" \
      '/i "$INSTDIR\third_party\FakerInput\FakerInput_Setup_0.1.1_x64.msi" /qn /norestart /L*v "$INSTDIR\third_party\FakerInput\install.log"'
    ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{17AA3E01-1012-4BF7-B908-1C499909B259}" "DisplayName"
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONEXCLAMATION "The virtual keyboard/mouse driver was not installed. Controller input to SYSTEM windows and Windows sign-in requires it. Run the bundled FakerInput installer to retry." /SD IDOK
      SetErrorLevel 1
    ${EndIf}
  ${EndIf}
  fakerinput_done:
!macroend

; Remove only this installation's normal-user startup entry. Shared drivers
; and the user's configurations are deliberately not removed here.
!macro NSIS_HOOK_PREUNINSTALL
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "JSM Evolved"
  ${If} $0 == '"$INSTDIR\JSM Evolved.exe" --autostart'
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "JSM Evolved"
  ${EndIf}
!macroend

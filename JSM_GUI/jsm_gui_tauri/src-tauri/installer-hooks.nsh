; ViGEm is a shared prerequisite. Do not remove it when uninstalling Studio.
; The signed vendor bootstrapper handles existing installations and elevation.
!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Installing virtual controller driver (ViGEmBus)..."
  ExecWait '"$INSTDIR\third_party\ViGEmBus\ViGEmBus_1.22.0_x64_x86_arm64.exe" /install /passive /norestart' $0
  ${If} $0 == 3010
    SetRebootFlag true
  ${ElseIf} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "Virtual controller driver setup did not complete (code $0). Xbox and PlayStation output requires this driver. Run the ViGEmBus installer in $INSTDIR\third_party\ViGEmBus to retry." /SD IDOK
    SetErrorLevel $0
  ${EndIf}
!macroend

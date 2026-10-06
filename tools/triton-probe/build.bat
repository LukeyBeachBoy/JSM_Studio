@echo off
rem Builds scprobe.exe (Win32 HID probe for the Steam Controller 2026's vendor collection).
rem Needs the VS 2022 Build Tools; adjust the vcvars path if yours differs.
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
cd /d "%~dp0"
cl /nologo /EHsc /O2 /std:c++17 scprobe.cpp /link hid.lib setupapi.lib

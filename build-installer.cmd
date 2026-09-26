@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js LTS and reopen this window.
  pause
  exit /b 1
)
node "%~dp0scripts\build-installer.mjs" %*
set "BUILD_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %BUILD_EXIT%

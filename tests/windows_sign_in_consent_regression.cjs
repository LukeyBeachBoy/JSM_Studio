// Exercise the production capture function with fake Windows/session and HID
// boundaries. This never locks Windows or sends real keyboard input.
const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const native = path.join(root, 'JoyShockMapper/JoyShockMapper')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-consent-'))
const forward = p => p.replace(/\\/g, '/')
const cpp = path.join(work, 'test.cpp'), exe = path.join(work, 'test.exe')
fs.writeFileSync(cpp, `
#include <windows.h>
#include <wtsapi32.h>
#include <cassert>
#include <filesystem>
#include <fstream>
#include <iostream>
#include "VirtualHidInput.h"
ULONGLONG clockMs=1000;
ULONGLONG fakeTick(){return clockMs;}
ATOM fakeRegister(const WNDCLASSW*){return 0;}
BOOL fakeQuery(HANDLE,DWORD,WTS_INFO_CLASS,LPWSTR*,DWORD*){return FALSE;}
int typed=0,released=0,normalReleased=0,poweredOff=0;
bool driverAvailable=true;
VirtualHidInput &VirtualHidInput::instance(){static VirtualHidInput hid;return hid;}
VirtualHidInput::~VirtualHidInput(){}
bool VirtualHidInput::available(){return driverAvailable;}
bool VirtualHidInput::character(wchar_t){++typed;return true;}
bool VirtualHidInput::key(WORD,bool down){if(down)++typed;return true;}
void VirtualHidInput::releaseAll(){++released;}
#define GetTickCount64 fakeTick
#define RegisterClassW fakeRegister
#define WTSQuerySessionInformationW fakeQuery
#include "${forward(native)}/src/win32/WindowsSessionInput.cpp"
#undef GetTickCount64
#undef RegisterClassW
#undef WTSQuerySessionInformationW
int main(){
 const std::string base="${forward(work)}";
 const auto consent=base+"/windows-sign-in-consent";
 const auto profile=base+"/profiles-library/Windows Sign-in.txt";
 std::filesystem::create_directory(base+"/profiles-library");
 std::ofstream(profile)<<"S = 1\\nN = 2\\n";
 auto write=[&](const std::string &value){std::ofstream(consent,std::ios::binary)<<value;};
 auto step=[&](bool locked,uint64_t buttons,int handle=1){
   clockMs+=150;sessionLocked=locked;
   return captureWindowsSignIn(handle,buttons,profile,[]{++normalReleased;},[]{++poweredOff;});
 };
 const uint64_t south=uint64_t(1)<<12;
 assert(!readWindowsSignInConsent(consent)); // missing on fresh install/upgrade
 assert(!step(false,0));
 assert(step(true,0));step(true,south);step(true,0);
 assert(typed==0); // even with the driver already installed
 for(auto value:{"", "enabled-v1", "enabled-v1\\nextra", "true", "disabled-v1\\n"}){
   write(value);assert(!readWindowsSignInConsent(consent));
   step(true,south);step(true,0);assert(typed==0);
 }
 write("enabled-v1\\n");assert(readWindowsSignInConsent(consent));
 step(true,south);step(true,south);assert(typed==0); // held when enabling
 step(true,0);step(true,south);step(true,south);assert(typed==1);
 step(true,0);
 step(true,LockScreenPowerShortcut::quickAccess);
 step(true,LockScreenPowerShortcut::mask);
 const int before=released;
 write("disabled-v1\\n");step(true,0);step(true,south);
 assert(typed==1 && poweredOff==0 && released>before); // revoke armed shortcut
 assert(step(false,south));assert(step(false,0));assert(!step(false,0));
 write("enabled-v1\\n");driverAvailable=false;
 step(true,0);step(true,south);assert(typed==1);
 driverAvailable=true;
 forgetWindowsSignInController(1);
 step(true,south);step(true,0);step(true,south);assert(typed==2); // reconnect held guard
 step(false,0);
 std::filesystem::remove(consent);
 step(true,0);step(true,south);assert(typed==2); // deletion fails closed
 assert(normalReleased>0);
 std::cout<<"PASS: default/upgrade off, malformed consent, existing/missing driver, enable/disable, held buttons, reconnect, unlock and shortcut cancellation\\n";
}
`)
const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft Visual Studio/Installer/vswhere.exe')
const vs = spawnSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8' }).stdout?.trim()
assert.ok(vs, 'Visual Studio C++ build tools are required')
const bat = path.join(work, 'build.cmd')
fs.writeFileSync(bat, `@echo off\r\ncall "${path.join(vs, 'VC/Auxiliary/Build/vcvars64.bat')}" >nul\r\ncl /nologo /EHsc /std:c++17 /I "${path.join(native, 'include')}" "${cpp}" /Fe:"${exe}" /link user32.lib wtsapi32.lib\r\n`)
const build = spawnSync('cmd.exe', ['/d', '/c', bat], { cwd: work, encoding: 'utf8' })
assert.equal(build.status, 0, build.stdout + build.stderr)
const run = spawnSync(exe, { cwd: work, encoding: 'utf8', timeout: 30000 })
assert.equal(run.status, 0, run.stdout + run.stderr)
process.stdout.write(run.stdout)

const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.join(__dirname,'..'), native = path.join(root,'JoyShockMapper/JoyShockMapper')
const forward = p => p.replace(/\\/g,'/')
const work = fs.mkdtempSync(path.join(os.tmpdir(),'jsm-hid-tests-'))
const cpp = path.join(work,'test.cpp'), exe = path.join(work,'test.exe'), bat = path.join(work,'test.cmd')
fs.writeFileSync(cpp, `
#include <windows.h>
#include <array>
#include <cassert>
#include <fstream>
#include <iostream>
#include <vector>
#include "${forward(native)}/include/VirtualHidInput.h"
#include "${forward(native)}/include/LockScreenBindings.h"
std::vector<std::array<unsigned char,65>> reports;
BOOL fakeWriteFile(HANDLE,const void* bytes,DWORD size,DWORD* written,OVERLAPPED*) {
 assert(size==65);std::array<unsigned char,65> report{};memcpy(report.data(),bytes,size);
 reports.push_back(report);*written=size;return TRUE;
}
#define WriteFile fakeWriteFile
#include "${forward(native)}/src/win32/VirtualHidInput.cpp"
#undef WriteFile
struct VirtualHidInputTest {
 static void run() {
  auto &hid=VirtualHidInput::instance();hid.control=reinterpret_cast<HANDLE>(1);
  assert(hid.key('A',true));assert(reports.back()[0]==0x40 && reports.back()[1]==9 && reports.back()[2]==1 && reports.back()[5]==4);
  assert(hid.key(VK_LSHIFT,true));assert(reports.back()[3]==2);
  assert(hid.key('A',false));assert(reports.back()[5]==0 && reports.back()[3]==2);
  hid.releaseAll();assert(hid.modifiers==0 && hid.keys.empty());
  for(WORD k='A';k<='G';++k)hid.key(k,true);
  for(int i=5;i<11;++i)assert(reports.back()[i]==1); // 6-key rollover
  hid.key('G',false);assert(reports.back()[5]==4);
  hid.releaseAll();
  assert(hid.mouseButton(VK_LBUTTON,true));assert(reports.back()[2]==3 && reports.back()[3]==1);
  const auto before=reports.size();assert(hid.relative(40000,-40000,-2));assert(reports.size()==before+2);
  short x,y;memcpy(&x,reports[before].data()+4,2);memcpy(&y,reports[before].data()+6,2);
  assert(x==32767 && y==-32767 && reports[before][8]==254 && reports[before][3]==1);
  hid.mouseButton(VK_LBUTTON,false);assert(reports.back()[3]==0);
  hid.key(VK_VOLUME_UP,true);assert(reports.back()[2]==2 && reports.back()[3]==64);
  hid.key(VK_VOLUME_UP,false);assert(reports.back()[3]==0);
  const auto old=reports.size();assert(!hid.key(0xffff,true));assert(reports.size()==old);
  hid.absolute(65535,0);assert(reports.back()[2]==4);unsigned short absoluteX;memcpy(&absoluteX,reports.back().data()+4,2);assert(absoluteX==32767);
  hid.releaseAll();hid.control=INVALID_HANDLE_VALUE;
 }
};
int main() {
 VirtualHidInputTest::run();
 LockScreenBindings bindings;
 std::ifstream file("${forward(path.join(root,'JoyShockMapper/dist/WindowsSignIn.txt'))}");
 std::string text((std::istreambuf_iterator<char>(file)),{});bindings.read(text);
 for(int i=0;i<10;++i){bool found=false;for(auto [bit,key]:bindings.keys)found|=key=='0'+i;assert(found);}
 assert(bindings.keys.at(4)==0x0d && bindings.keys.at(5)==0x08);
 bindings.read("S = 1\\nE = \\\"TURN_OFF_CONTROLLER\\\"\\nN = 1234\\nW = ENTER\\nHOME = LWINDOWS\\n");
 assert(bindings.keys.size()==2 && bindings.keys.at(12)=='1' && bindings.keys.at(14)==0x0d);
 LockScreenCapture state;
 auto step=state.update(false,0);assert(!step.capture);
 step=state.update(true,1);assert(step.capture && step.entering && !step.pressed);
 step=state.update(true,1);assert(!step.pressed);
 step=state.update(true,0);assert(step.capture && !step.pressed);
 step=state.update(true,1);assert(step.pressed==1);
 step=state.update(true,1);assert(!step.pressed); // never repeat a held PIN digit
 step=state.update(false,1);assert(step.capture && step.leaving);
 step=state.update(false,1);assert(step.capture && !step.pressed);
 step=state.update(false,0);assert(step.capture);
 step=state.update(false,0);assert(!step.capture); // restore only after release
 LockScreenPowerShortcut power;
 auto action=power.update(true,0);assert(!action.powerOff);
 action=power.update(true,LockScreenPowerShortcut::quickAccess);assert(action.suppressKeys && !action.powerOff);
 action=power.update(true,LockScreenPowerShortcut::mask);assert(action.suppressKeys && !action.powerOff);
 action=power.update(true,LockScreenPowerShortcut::quickAccess);assert(action.suppressKeys && !action.powerOff);
 action=power.update(true,0);assert(action.suppressKeys && action.powerOff);
 action=power.update(true,0);assert(!action.powerOff); // exactly once
 power.update(false,0);
 action=power.update(true,LockScreenPowerShortcut::mask);assert(!action.powerOff);
 action=power.update(true,0);assert(!action.powerOff); // held when locking is ignored
 action=power.update(true,LockScreenPowerShortcut::north);assert(!action.suppressKeys);
 power.update(false,0);power.update(true,0);
 power.update(true,LockScreenPowerShortcut::mask);
 action=power.update(false,0);assert(!action.powerOff); // unlock cancels pending power off
 power.update(true,0);
 power.update(true,LockScreenPowerShortcut::mask);
 action=power.update(true,LockScreenPowerShortcut::north);assert(action.suppressKeys && !action.powerOff);
 action=power.update(true,0);assert(action.powerOff); // either release order works
 // Feed the same raw buttons into PIN edge detection, then suppress keys while
 // the shortcut is active. Y must never type a PIN digit, even if QAM goes up first.
 power={};state={};uint64_t typed=0;
 for(auto buttons:{uint64_t(0),LockScreenPowerShortcut::quickAccess,LockScreenPowerShortcut::mask,LockScreenPowerShortcut::north,uint64_t(0)}) {
   action=power.update(true,buttons);step=state.update(true,buttons);
   if(!action.suppressKeys)typed|=step.pressed;
 }
 assert(typed==0);
 std::cout<<"PASS: HID reports; strict numeric profile; lock/unlock edges; power off on release only; held/unlock guards; no PIN digit from shutdown shortcut\\n";
}
`)
fs.writeFileSync(bat,`@echo off\r\ncall "C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat" >nul\r\ncl /nologo /EHsc /std:c++17 /I "${path.join(native,'include')}" "${cpp}" /Fe:"${exe}" /link hid.lib setupapi.lib user32.lib\r\n`)
const build=spawnSync('cmd.exe',['/d','/c',bat],{cwd:work,encoding:'utf8'})
assert.equal(build.status,0,build.stdout+build.stderr)
const run=spawnSync(exe,{encoding:'utf8',timeout:30000})
assert.equal(run.status,0,run.stdout+run.stderr)
console.log(run.stdout.trim())

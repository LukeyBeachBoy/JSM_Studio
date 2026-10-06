"""Compare production SDL encoding with captured Steam keyboard packets."""
from pathlib import Path
import subprocess, tempfile
ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'JoyShockMapper/JoyShockMapper/src/SDLWrapper.cpp').read_text(encoding='utf-8')
def extract(signature):
 start=source.index(signature);opening=source.index('{',start);depth=1;end=opening+1
 while depth:
  depth+=(source[end]=='{')-(source[end]=='}');end+=1
 return source[start:end]
stub=r'''
#include <cassert>
#include <algorithm>
#include <cstdint>
#include <map>
#include <vector>
#include <iostream>
struct SDL_Gamepad {};
std::vector<std::vector<uint8_t>> reports;
bool SDL_SendGamepadEffect(SDL_Gamepad*,const void *data,int size) {
 const auto *bytes=static_cast<const uint8_t*>(data);reports.emplace_back(bytes,bytes+size);return true;
}
constexpr int JS_TYPE_STEAM_CONTROLLER_2026=24;
constexpr uint8_t TRITON_ID_OUT_REPORT_HAPTIC_COMMAND=0x82;
constexpr int TRITON_HAPTIC_COMMAND_BYTES=4;
struct ControllerDevice {SDL_Gamepad *_sdlController;int _ctrlr_type=24;};
'''
tests=r'''
int main() {
 SDL_Gamepad pad;ControllerDevice device{&pad};Backend backend;backend._controllerMap[7]=&device;
 backend.SetSteamKeyboardHaptic(7,1,1,1);
 assert(reports.back()==std::vector<uint8_t>({0x82,0,1,1}));
 backend.SetSteamKeyboardHaptic(7,2,1,5);
 assert(reports.back()==std::vector<uint8_t>({0x82,1,1,5}));
 reports.clear();backend.SetSteamKeyboardHaptic(7,3,1,5);assert(reports.size()==2);
 assert(reports[0]==std::vector<uint8_t>({0x82,0,1,5}));assert(reports[1]==std::vector<uint8_t>({0x82,1,1,5}));
 reports.clear();backend.SetSteamKeyboardHaptic(7,3,8,0);assert(reports.size()==2);
 assert(reports[0]==std::vector<uint8_t>({0x81,1,0x90,1,0,0,1,0}));
 assert(reports[1]==std::vector<uint8_t>({0x81,0,0x90,1,0,0,1,0}));
 reports.clear();assert(!sendHapticCommand(nullptr,3,1,5));assert(reports.empty());
 std::cout<<"PASS: production packets match Steam Tick +1/+5 and 400us pulse; reversed target schemes and both-pad fanout\n";
}
'''
with tempfile.TemporaryDirectory(prefix='steam-keyboard-packets-') as directory:
 folder=Path(directory);cpp=folder/'packets.cpp';binary=folder/'packets.exe'
 method=extract('void SetSteamKeyboardHaptic(').replace(' override','')
 cpp.write_text(stub+extract('static bool sendHapticCommand(')+'\nstruct Backend {std::map<int,ControllerDevice*> _controllerMap;'+method+'};\n'+tests,encoding='utf-8')
 harness=ROOT/'JoyShockMapper/tests/studio_feedback_harness.cpp'
 vcvars=Path('C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat')
 batch=folder/'build.cmd';feedback=folder/'feedback.exe'
 batch.write_text(f'@echo off\ncall "{vcvars}" >nul\ncl /nologo /utf-8 /EHsc /std:c++20 "{cpp}" /Fe:"{binary}"\nif errorlevel 1 exit /b 1\ncl /nologo /utf-8 /EHsc /std:c++20 /I"{ROOT / "JoyShockMapper/JoyShockMapper/include"}" "{harness}" "{ROOT / "JoyShockMapper/JoyShockMapper/src/StudioFeedback.cpp"}" /Fe:"{feedback}"\n',encoding='utf-8')
 result=subprocess.run(['cmd.exe','/d','/c',str(batch)],cwd=folder,capture_output=True,text=True)
 if result.returncode:print(result.stdout,result.stderr);raise SystemExit(result.returncode)
 for exe in [binary,feedback]:
  result=subprocess.run([str(exe)])
  if result.returncode:raise SystemExit(result.returncode)

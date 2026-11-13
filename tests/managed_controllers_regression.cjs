// Compile and execute the real policy parser and AutoConnect polling body.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const include = path.join(root, 'JoyShockMapper/JoyShockMapper/include');
const source = fs.readFileSync(path.join(root, 'JoyShockMapper/JoyShockMapper/src/AutoConnect.cpp'), 'utf8');
const poll = source.slice(source.indexOf('bool AutoConnect::AutoConnectPoll'), source.lastIndexOf('\n}'));
const sdl = fs.readFileSync(path.join(root, 'JoyShockMapper/JoyShockMapper/src/SDLWrapper.cpp'), 'utf8');
const censusBody = sdl.slice(sdl.indexOf('DeviceCensus TakeDeviceCensus() override'), sdl.indexOf('std::vector<ControllerInfo> ListAvailableDevices() override')).replace(' override', '');
assert.ok(poll.startsWith('bool AutoConnect::AutoConnectPoll'));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-controller-tests-'));
const cpp = path.join(work, 'test.cpp');
fs.writeFileSync(cpp, `
#include "ManagedControllers.h"
#include "AutoConnectRetry.h"
#include <cassert>
#include <iostream>
#include <mutex>
#include <vector>
#include <map>
using namespace std;
#define COUT_INFO cout
struct DeviceCensus { int listed=0, opened=0, failedToOpen=0, disconnected=0, managedListed=-1; };
using SDL_JoystickID = int;
vector<int> listedIds;
SDL_JoystickID* SDL_GetJoysticks(int* count) { *count=int(listedIds.size()); return listedIds.data(); }
void SDL_free(void*) {}
bool SDL_JoystickConnected(void*) { return true; }
bool SDL_GamepadConnected(void*) { return true; }
struct ProbeController {
  void *_azeronJoystick=nullptr, *_sdlController=nullptr;
  bool isValid() { return true; }
};
struct CensusProbe {
  mutex controller_lock;
  map<int, ProbeController*> _controllerMap;
  int _failedToOpen=0;
  ManagedControllers policy;
  const ManagedControllers& managedControllers() { return policy; }
  bool manages(int id) { return policy.allows(id==1 ? 0x28de : 0x045e, id==1 ? 0x1304 : 0x028e); }
  void RefreshDeviceList() {}
  ${censusBody}
};
struct FakeJsl {
  DeviceCensus census;
  DeviceCensus TakeDeviceCensus() { return census; }
  void RescanDevices() {}
} backend;
struct Gamepad { static inline int outputs=1; static int getCount() { return outputs; } };
class AutoConnect {
public:
  FakeJsl* jsl=&backend;
  int lastSize=0, settleTicks=0, idleTicks=0, reconnects=0;
  bool caughtUp=false;
  static constexpr int SETTLE_TICKS=5, IDLE_RESCAN_TICKS=3;
  AutoConnectRetry retry;
  void reconnect(const char*) { ++reconnects; settleTicks=SETTLE_TICKS; }
  bool AutoConnectPoll(void*);
};
${poll}
int main() {
  ManagedControllers legacy;
  assert(legacy.allows(0x16d0,0x12f7));
  istringstream config("# Steam only\\n28de:1302\\n28DE:1303 # Bluetooth\\n28de:1304\\n28de:1305\\n");
  auto policy=ManagedControllers::parse(config);
  for(unsigned pid=0x1302;pid<=0x1305;++pid) assert(policy.allows(0x28de,pid));
  assert(!policy.allows(0x16d0,0x12f7)); // Azeron
  assert(!policy.allows(0x045e,0x028e)); // reWASD/ViGEm Xbox output
  assert(!policy.allows(0x054c,0x0ce6)); // unconfigured DualSense
  CensusProbe probe;
  listedIds={1,2}; // Physical Steam and the slot's virtual Xbox output.
  assert(probe.TakeDeviceCensus().managedListed==-1); // Unrestricted: discount outputs.
  probe.policy=policy;
  assert(probe.TakeDeviceCensus().managedListed==1); // Explicit policy already excludes outputs.
  istringstream empty("# no enrollment\\n");
  assert(!ManagedControllers::parse(empty).allows(0x28de,0x1304));
  for (auto bad : {"28de:1304 extra", "28de:zzzz", "*:1304", "28de:13040"}) {
    bool rejected=false; try { istringstream input(bad); ManagedControllers::parse(input); }
    catch(const exception&) { rejected=true; } assert(rejected);
  }
  AutoConnect ac;
  backend.census={4,1,0,0,1}; // Steam + Azeron + reWASD + JSM virtual output
  ac.AutoConnectPoll(nullptr);
  assert(ac.reconnects==1);
  for(int i=0;i<100;++i) { backend.census.listed=4+i%3; ac.AutoConnectPoll(nullptr); }
  assert(ac.reconnects==1); // unrelated devices never trigger reconnect
  backend.census.managedListed=0; backend.census.opened=0;
  ac.AutoConnectPoll(nullptr); assert(ac.reconnects==2);
  for(int i=0;i<10;++i) ac.AutoConnectPoll(nullptr);
  backend.census.managedListed=1; backend.census.opened=1;
  ac.AutoConnectPoll(nullptr); assert(ac.reconnects==3); // Steam reconnect works
  AutoConnect standalone;
  backend.census={1,1,0,0,-1}; Gamepad::outputs=0;
  standalone.AutoConnectPoll(nullptr);
  for(int i=0;i<12;++i) standalone.AutoConnectPoll(nullptr);
  assert(standalone.reconnects==1);
  // Gaming creates an Xbox output, Desktop removes it. Neither operation
  // changes the physical controller count when no policy file exists.
  for(int i=0;i<40;++i) {
    Gamepad::outputs=i%2;
    backend.census.listed=1+Gamepad::outputs;
    standalone.AutoConnectPoll(nullptr);
  }
  assert(standalone.reconnects==1);
  backend.census.listed=Gamepad::outputs; backend.census.opened=0;
  standalone.AutoConnectPoll(nullptr);
  assert(standalone.reconnects==2); // A real unplug still reconnects.
  cout << "PASS: real SDL census with and without policy; slot virtual-output churn ignored; physical unplug detected; explicit enrollment and invalid-policy handling\\n";
}
`);
const vcvars = 'C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat'
assert.ok(fs.existsSync(vcvars), 'MSVC required to run the AutoLoad behavior regression')
const exe = path.join(work, 'test.exe')
const bat = path.join(work, 'test.bat')
fs.writeFileSync(bat, `@echo off\r\nset "PATH=C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer;%PATH%"\r\ncall "${vcvars}" >nul\r\ncl /nologo /EHsc /std:c++17 /I "${include}" "${cpp}" /Fe:"${exe}"\r\n`)
const build = spawnSync('cmd.exe', ['/d', '/c', bat], { cwd: work, encoding: 'utf8' })
assert.equal(build.status, 0, build.stdout + build.stderr)
const run = spawnSync(exe, { encoding: 'utf8', timeout: 30000 })
assert.equal(run.status, 0, run.stdout + run.stderr)
console.log(run.stdout.trim().split('\n').at(-1))

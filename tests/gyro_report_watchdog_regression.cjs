// Run the real SDL report observer, freshness gate and recovery service.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.join(__dirname, '..')
const sdl = fs.readFileSync(path.join(root, 'JoyShockMapper/JoyShockMapper/src/SDLWrapper.cpp'), 'utf8').replace(/\r\n/g, '\n')
const main = fs.readFileSync(path.join(root, 'JoyShockMapper/JoyShockMapper/src/main.cpp'), 'utf8').replace(/\r\n/g, '\n')
function body(signature) {
  const start = sdl.indexOf(signature)
  assert.ok(start >= 0, signature)
  let end = sdl.indexOf('{', start), depth = 1
  for (++end; depth; ++end) depth += (sdl[end] === '{') - (sdl[end] === '}')
  return sdl.slice(start, end).replace(' override', '')
}
assert.match(main, /if \(imuFresh\)\s+motion.ProcessMotion/)
assert.match(main, /if \(imuFresh\)\s+motion.GetCalibratedGyro/)
assert.match(main, /if \(!imuFresh\)\s+blockGyro = true;/)
assert.ok(sdl.indexOf('serviceGyroReports(iter->first, iter->second)') < sdl.indexOf('g_callback(iter->first'))
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gyro-report-tests-'))
const cpp = path.join(work, 'test.cpp')
const include = path.join(root, 'JoyShockMapper/JoyShockMapper/include').replace(/\\/g, '/')
fs.writeFileSync(cpp, `
#include <cassert>
#include <iostream>
#include <map>
#include <vector>
#include <utility>
#include "${include}/GyroReportWatchdog.h"
using namespace std;
#define CERR cerr
#define COUT cout
#define SDLCALL
constexpr int SDL_EVENT_GAMEPAD_SENSOR_UPDATE = 1, SDL_SENSOR_GYRO = 2, SDL_SENSOR_ACCEL = 1;
constexpr int JS_TYPE_STEAM_CONTROLLER_2026 = 24;
uint64_t ticks = 0;
uint64_t SDL_GetTicks() { return ticks; }
struct SDL_Event { int type; struct { int which, sensor; float data[3]; } gsensor; };
static GyroReportWatchdog gyroReports;
${body('static bool SDLCALL watchGyroReports(')}
vector<pair<int,bool>> writes;
bool SDL_SetGamepadSensorEnabled(void*, int sensor, bool enabled) {
  writes.emplace_back(sensor,enabled); return true;
}
struct ControllerDevice {
  int _ctrlr_type = 24;
  int _sensorHandle = 1; // SDL instance ID, distinct from the JSM map key
  bool _has_gyro = true, _has_accel = true, _imuReadValid = true, _gyroReportingStalled = false;
  void* _sdlController = nullptr;
};
struct Wrapper {
  map<int, ControllerDevice*> _controllerMap;
  ${body('void serviceGyroReports(')}
  ${body('bool HasFreshIMUState(')}
};
int main() {
  ControllerDevice device; Wrapper w; w._controllerMap[1] = &device;
  gyroReports.connect(1,0);
  assert(!w.HasFreshIMUState(1)); // no sample, even if SDL's cache contains data
  SDL_Event e{SDL_EVENT_GAMEPAD_SENSOR_UPDATE,{1,SDL_SENSOR_GYRO,{1,2,3}}};
  for (ticks = 1; ticks <= 2000; ++ticks) {
    watchGyroReports(nullptr,&e); // identical values are still fresh reports
    assert(w.HasFreshIMUState(1));
    w.serviceGyroReports(1,&device);
  }
  assert(writes.empty());
  assert(gyroReports.fresh(1,1999)); // event published between sampling the clock and taking the lock
  assert(!gyroReports.shouldRetry(1,1999));
  ticks = 2100; assert(w.HasFreshIMUState(1));
  ticks = 2101; assert(!w.HasFreshIMUState(1));
  w.serviceGyroReports(1,&device);
  assert((writes == vector<pair<int,bool>>{{2,false},{1,false},{2,true},{1,true}}));
  assert(device._gyroReportingStalled);
  assert(!w.HasFreshIMUState(1)); // retry alone never makes cached data fresh
  ticks = 2500; w.serviceGyroReports(1,&device); assert(writes.size() == 4);
  ticks = 3101; w.serviceGyroReports(1,&device); assert(writes.size() == 8);
  watchGyroReports(nullptr,&e); w.serviceGyroReports(1,&device);
  assert(w.HasFreshIMUState(1)); assert(!device._gyroReportingStalled);
  device._imuReadValid = false; assert(!w.HasFreshIMUState(1));
  device._imuReadValid = true;
  gyroReports.disconnect(1); assert(!w.HasFreshIMUState(1));
  watchGyroReports(nullptr,&e); assert(!w.HasFreshIMUState(1)); // late report after close
  gyroReports.connect(1,ticks); assert(!w.HasFreshIMUState(1)); // reconnect cannot inherit freshness
  ticks += 999; w.serviceGyroReports(1,&device); assert(writes.size() == 8);
  ticks += 1; w.serviceGyroReports(1,&device); assert(writes.size() == 12);
  gyroReports.disconnect(1);
  device._sensorHandle = 47; // SDL assigns a new ID after wireless power cycling
  gyroReports.connect(47,ticks);
  assert(!w.HasFreshIMUState(1)); // JSM's logical handle is still 1
  e.gsensor.which = 47;
  watchGyroReports(nullptr,&e);
  assert(w.HasFreshIMUState(1)); // fresh report belongs to this device's SDL ID
  ticks += 101;
  assert(!w.HasFreshIMUState(1));
  e.gsensor.which = 1;watchGyroReports(nullptr,&e); // old device reports cannot freshen it
  assert(!w.HasFreshIMUState(1));
  ControllerDevice other;other._sensorHandle=1;w._controllerMap[2]=&other;
  gyroReports.connect(1,ticks);watchGyroReports(nullptr,&e);
  assert(w.HasFreshIMUState(2)); // SDL ID 1 now belongs to another logical device
  assert(!w.HasFreshIMUState(1)); // that device cannot freshen SDL ID 47
  ticks += 899;w.serviceGyroReports(1,&device);assert(writes.size() == 16);
  e.gsensor.which = 47;watchGyroReports(nullptr,&e);
  w.serviceGyroReports(1,&device);assert(w.HasFreshIMUState(1));
  assert(!device._gyroReportingStalled);
  device._ctrlr_type = 4; ticks += 2000;
  w.serviceGyroReports(1,&device); assert(writes.size() == 16); // recovery scoped to Triton
  device._has_gyro = false; assert(w.HasFreshIMUState(1)); // gamepads without IMUs retain stick behavior
  cout << "PASS: stale gyro suppressed; stationary reports accepted; throttled recovery; read failures; reconnect with different SDL and JSM IDs\\n";
}
`)
const vcvars = 'C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat'
const exe = path.join(work, 'test.exe'), bat = path.join(work, 'test.bat')
fs.writeFileSync(bat, `@echo off\r\ncall "${vcvars}" >nul\r\ncl /nologo /EHsc /std:c++17 "${cpp}" /Fe:"${exe}"\r\n`)
const build = spawnSync('cmd.exe', ['/d', '/c', bat], { cwd: work, encoding: 'utf8' })
assert.equal(build.status, 0, build.stdout + build.stderr)
const run = spawnSync(exe, { encoding: 'utf8', timeout: 30000 })
assert.equal(run.status, 0, run.stdout + run.stderr)
console.log(run.stdout.trim())

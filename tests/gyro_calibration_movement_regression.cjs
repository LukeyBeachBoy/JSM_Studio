// Execute the real sensor reader and movement guard with controlled readings.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.join(__dirname, '..')
function body(source, signature) {
  const start = source.indexOf(signature)
  assert.ok(start >= 0, signature)
  let end = source.indexOf('{', start), depth = 1
  for (++end; depth; ++end) depth += (source[end] === '{') - (source[end] === '}')
  return source.slice(start, end)
}
const main = fs.readFileSync(path.join(root, 'JoyShockMapper/JoyShockMapper/src/main.cpp'), 'utf8').replace(/\r\n/g, '\n')
const sdl = fs.readFileSync(path.join(root, 'JoyShockMapper/JoyShockMapper/src/SDLWrapper.cpp'), 'utf8').replace(/\r\n/g, '\n')
const watch = body(main, 'void watchForMovement(int handle, const IMU_STATE &imu, float deltaTime)\n{')
assert.ok(main.includes('movementOffsets = previous;'), 'use the pre-run offsets')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gyro-calibration-tests-'))
const cpp = path.join(work, 'test.cpp')
fs.writeFileSync(cpp, `
#include <algorithm>
#include <array>
#include <atomic>
#include <cassert>
#include <cmath>
#include <cstring>
#include <iostream>
#include <mutex>
#include <unordered_map>
using namespace std;
#define CERR cerr
struct IMU_STATE { float gyroX, gyroY, gyroZ, accelX, accelY, accelZ; };
enum { CALIBRATING = 2 };
atomic<int> phase{CALIBRATING};
atomic<bool> moved{false};
constexpr float kMovedDegreesPerSecond = 10.f, kMovedForSeconds = .05f;
mutex movementMutex;
unordered_map<int, float> movingFor;
unordered_map<int, array<float, 3>> movementOffsets;
${watch}
enum { SDL_SENSOR_GYRO, SDL_SENSOR_ACCEL };
constexpr float SDL_STANDARD_GRAVITY = 9.80665f;
bool failRead = false;
bool SDL_GetGamepadSensorData(void*, int, float* data, int) {
  data[0] = 1.f; // failure can leave a partial result
  if (failRead) return false;
  data[1] = 2.f; data[2] = 3.f; return true;
}
struct Device { bool _has_gyro = true, _has_accel = true, _imuReadValid = true; void* _sdlController = nullptr; };
struct Reader {
  unordered_map<int, Device*> _controllerMap;
  ${body(sdl, 'IMU_STATE GetIMUState(int deviceId)').replace(' override', '')}
};
int main() {
  Device device; Reader reader; reader._controllerMap[1] = &device;
  auto imu = reader.GetIMUState(1);
  assert(abs(imu.gyroX - 180.f / float(M_PI)) < .001f);
  assert(abs(imu.accelZ - 3.f / SDL_STANDARD_GRAVITY) < .001f);
  failRead = true; imu = reader.GetIMUState(1);
  assert(imu.gyroX == 0 && imu.gyroY == 0 && imu.gyroZ == 0);
  assert(imu.accelX == 0 && imu.accelY == 0 && imu.accelZ == 0);
  movementOffsets[1] = {18.f, -12.f, 4.f};
  for (int i = 0; i < 2000; ++i) {
    float noise = (i % 2 ? .1f : -.1f);
    watchForMovement(1, {18.f + noise, -12.f, 4.f}, .004f);
  }
  assert(!moved); // a resting gyro's bias must not cancel calibration
  watchForMovement(1, {50, 0, 0}, 2.f);
  assert(!moved); // a single delayed poll cannot prove 50 ms of motion
  watchForMovement(1, {18, -12, 4}, .004f);
  for (int i = 0; i < 10; ++i) watchForMovement(1, {50, 0, 0}, .004f);
  assert(!moved); // short tap
  watchForMovement(1, {18, -12, 4}, .004f);
  for (int i = 0; i < 20; ++i) watchForMovement(1, {50, 0, 0}, .004f);
  assert(moved); // sustained actual rotation still cancels
  moved = false; movingFor.clear();
  for (int i = 0; i < 20; ++i) {
    watchForMovement(1, {}, .004f); // failed read with nonzero saved offset
    watchForMovement(1, {NAN, 0, 0}, .004f);
    watchForMovement(1, {50, 0, 0}, NAN);
    watchForMovement(2, {50, 0, 0}, .004f); // not in this run
  }
  assert(!moved);
  phase = 0;
  for (int i = 0; i < 20; ++i) watchForMovement(1, {50, 0, 0}, .004f);
  assert(!moved);
  cout << "PASS: sensor failures, stationary bias, noise, poll gaps, taps and sustained movement\\n";
}
`)
const vcvars = 'C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat'
const exe = path.join(work, 'test.exe')
const bat = path.join(work, 'test.bat')
fs.writeFileSync(bat, `@echo off\r\ncall "${vcvars}" >nul\r\ncl /nologo /EHsc /std:c++17 /D_USE_MATH_DEFINES "${cpp}" /Fe:"${exe}"\r\n`)
const build = spawnSync('cmd.exe', ['/d', '/c', bat], { cwd: work, encoding: 'utf8' })
assert.equal(build.status, 0, build.stdout + build.stderr)
const run = spawnSync(exe, { encoding: 'utf8', timeout: 30000 })
assert.equal(run.status, 0, run.stdout + run.stderr)
console.log(run.stdout.trim())

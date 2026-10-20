// Execute the mapper's real AutoLoad polling body with a simulated foreground
// and console. No controller or foreground window changes are needed.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.join(__dirname, '..')
const include = path.join(root, 'JoyShockMapper/JoyShockMapper/include')
const source = fs.readFileSync(path.join(root, 'JoyShockMapper/JoyShockMapper/src/AutoLoad.cpp'), 'utf8')
const start = source.indexOf('bool AutoLoad::AutoLoadPoll(void* param)')
const end = source.lastIndexOf('} // namespace JSM')
assert.ok(start >= 0 && end > start)
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'autoload-chord-tests-'))
const cpp = path.join(work, 'test.cpp')
fs.writeFileSync(cpp, `
#include <algorithm>
#include <cassert>
#include <cctype>
#include <iostream>
#include <string>
#include <tuple>
#include <vector>
#include "DeferredAutoLoad.h"
using namespace std;
string foreground;
vector<string> loaded;
bool held = false;
int titleLookups = 0;
class CmdRegistry {
public:
  DeferredAutoLoad pending;
  bool takeAutoLoadRetry() { return pending.takeRetry(); }
} registry;
bool iequals(const string& a, const string& b) {
  return a.size() == b.size() && equal(a.begin(), a.end(), b.begin(),
    [](char a, char b) { return tolower(a) == tolower(b); });
}
string GetActiveWindowModule() { return foreground; }
pair<string, string> GetActiveWindowName() { ++titleLookups; return {foreground, foreground}; }
string AUTOLOAD_FOLDER() { return "AutoLoad/"; }
vector<string> ListDirectory(const string&) { return {"Studio.txt", "Game.txt", "Other.txt", "Paused.txt.paused"}; }
void WriteToConsole(string line) {
  if (held) registry.pending.defer();
  else loaded.push_back(line);
}
#define COUT_INFO cout
#define COUT cout
class AutoLoad { public: bool AutoLoadPoll(void*); };
${source.slice(start, end)}
int main() {
  AutoLoad poll;
  foreground = "Studio.exe";
  poll.AutoLoadPoll(&registry);
  assert(loaded.back() == "STUDIO_AUTOLOAD AutoLoad/Studio.txt");
  held = true;
  foreground = "Game.exe";
  poll.AutoLoadPoll(&registry); // suppressed, but Game is remembered
  assert(loaded.size() == 1);
  int before = titleLookups;
  poll.AutoLoadPoll(&registry);
  assert(titleLookups == before); // no per-second title lookup during hold
  registry.pending.release(true); // another controller still holds
  poll.AutoLoadPoll(&registry);
  assert(loaded.size() == 1);
  held = false;
  registry.pending.release(false);
  foreground = "";
  poll.AutoLoadPoll(&registry); // transient desktop/secure window keeps the retry
  foreground = "Game.exe";
  poll.AutoLoadPoll(&registry); // SAME foreground must now get its mapping
  assert(loaded.back() == "STUDIO_AUTOLOAD AutoLoad/Game.txt");
  assert(loaded.size() == 2);
  poll.AutoLoadPoll(&registry);
  assert(loaded.size() == 2); // one retry only
  held = true;
  foreground = "Other.exe";
  poll.AutoLoadPoll(&registry);
  foreground = "Game.exe";
  held = false;
  registry.pending.release(false);
  poll.AutoLoadPoll(&registry);
  assert(loaded.back() == "STUDIO_AUTOLOAD AutoLoad/Game.txt"); // latest app wins
  held = true;
  foreground = "Other.exe";
  poll.AutoLoadPoll(&registry);
  held = false;
  foreground = "Paused.exe";
  registry.pending.release(false);
  poll.AutoLoadPoll(&registry);
  assert(loaded.size() == 3); // stale rule and paused rules never load
  cout << "PASS: held Alt+Tab retries same app, latest app wins, no stale or repeated loads\\n";
}
`)
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

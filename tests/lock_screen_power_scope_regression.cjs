// Run the actual shutdown implementation with two fake controllers. A shortcut
// belongs to its originating controller; a console command still addresses all.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { spawnSync } = require('node:child_process')
const source = fs.readFileSync(path.join(__dirname, '../JoyShockMapper/JoyShockMapper/src/main.cpp'), 'utf8')
const start = source.indexOf('bool do_TURN_OFF_CONTROLLER()')
const end = source.indexOf('bool do_SET_MOTION_STICK_NEUTRAL()', start)
assert.ok(start > 0 && end > start)
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-power-scope-'))
const cpp = path.join(work, 'scope.cpp'), exe = path.join(work, 'scope.exe'), bat = path.join(work, 'build.cmd')
fs.writeFileSync(cpp, `
#include <algorithm>
#include <cassert>
#include <iostream>
#include <map>
#include <memory>
#include <string>
#include <thread>
#include <vector>
using namespace std;
using PathString=string;
namespace ControllerContext {int handle=0;}
enum class SettingID {SHUTDOWN_SOUND_FILE,SOUND_GAIN,SHUTDOWN_SOUND};
namespace SettingsManager {
template<class T>struct Setting {T data;T value(){return data;}};
Setting<string> file{"NONE"};Setting<int> sound{7},gain{-12};
template<class T>Setting<T>*get(SettingID);
template<>Setting<string>*get<string>(SettingID){return &file;}
template<>Setting<int>*get<int>(SettingID id){return id==SettingID::SOUND_GAIN?&gain:&sound;}
}
namespace tone_sequence {bool isNoToneFile(string s){return s=="NONE";}string trimmed(string s){return s;}constexpr int kMaxTotalMs=8000;}
struct ToneFile {string error;vector<int> tones{1};};
string BASE_JSM_CONFIG_FOLDER(){return {};}
ToneFile readToneFile(string,string){return {};}
struct FakeJsl {
 vector<int> scripts,tones,off;
 bool PlayHapticScript(int id,int,int){scripts.push_back(id);return true;}
 int PlayToneSequence(int id,const vector<int>&,int){tones.push_back(id);return 1;}
 bool TurnOffController(int id){off.push_back(id);return true;}
 void clear(){scripts.clear();tones.clear();off.clear();}
};
auto jsl=make_shared<FakeJsl>();map<int,int> handle_to_joyshock{{1,0},{2,0}};
#define COUT_INFO cout
#define COUT cout
#define CERR cerr
${source.slice(start, end)}
int main(){
 ControllerContext::handle=2;
 assert(do_TURN_OFF_CONTROLLER());assert(jsl->off==vector<int>{2});assert(jsl->scripts==vector<int>{2});
 jsl->clear();ControllerContext::handle=0;
 assert(do_TURN_OFF_CONTROLLER());assert((jsl->off==vector<int>{1,2}));assert((jsl->scripts==vector<int>{1,2}));
 jsl->clear();ControllerContext::handle=1;SettingsManager::file.data="tones/custom.txt";
 assert(do_TURN_OFF_CONTROLLER());assert(jsl->off==vector<int>{1});assert(jsl->tones==vector<int>{1});assert(jsl->scripts.empty());
 jsl->clear();ControllerContext::handle=99;
 assert(!do_TURN_OFF_CONTROLLER());assert(jsl->off.empty() && jsl->tones.empty());
 cout<<"PASS: shutdown and sound target the originating controller; console still addresses all; missing target is harmless\\n";
}
`)
fs.writeFileSync(bat, `@echo off\r\ncall "C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat" >nul\r\ncl /nologo /EHsc /std:c++17 "${cpp}" /Fe:"${exe}"\r\n`)
const build = spawnSync('cmd.exe', ['/d', '/c', bat], { cwd: work, encoding: 'utf8' })
assert.equal(build.status, 0, build.stdout + build.stderr)
const result = spawnSync(exe, { encoding: 'utf8', timeout: 30000 })
assert.equal(result.status, 0, result.stdout + result.stderr)
console.log(result.stdout.trim())

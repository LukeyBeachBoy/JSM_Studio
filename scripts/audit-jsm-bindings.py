"""Inventory platform key parsers and verify GUI tokens with actual native code.

No mapper is launched. OS output is stubbed; key and Mapping parsing are real.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT / 'JoyShockMapper/JoyShockMapper'
INTENT = ROOT / 'docs/jsm-binding-coverage-intent.json'


def coverage_issues(rows, intent):
    """New native outputs must have a picker choice or an explicit reviewed owner."""
    issues = []
    actual = {row['token'] for row in rows}
    for row in rows:
        if row['guiCatalog']:
            continue
        declaration = intent.get(row['token'])
        if not declaration:
            issues.append(f"{row['token']}: no declared graphical output handling")
        elif not declaration.get('reason') or declaration.get('classification') not in {'ALIAS', 'LEGACY', 'EMPTY', 'PARTIAL', 'FAMILY'}:
            issues.append(f"{row['token']}: invalid output coverage declaration")
        elif not (ROOT / 'JSM_GUI/jsm_gui_tauri/src' / declaration.get('editor', '')).is_file():
            issues.append(f"{row['token']}: graphical owner does not exist")
    for token in set(intent) - actual:
        issues.append(f'{token}: output was removed from the inventory')
    return issues


def function(source, signature):
    start = source.index(signature)
    opening = source.index('{', start)
    depth, end = 1, opening + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]


def inventory():
    result = {}
    for platform in ('win32', 'linux'):
        path = NATIVE / f'src/{platform}/PlatformDefinitions.cpp'
        source = path.read_text(encoding='utf-8')
        parser = function(source, 'WORD nameToKey(')
        result[platform] = {
            'source': path.relative_to(ROOT).as_posix(),
            'namedTokens': sorted(set(re.findall(r'name\.compare\("([A-Z][A-Z0-9_]*)"\)', parser))),
            'singleCharacters': sorted(set(re.findall(r"character == '((?:\\.|[^'\\])*)'", parser))),
            'hasRumbleHexParser': 'RUMBLE' in parser,
            'specialFamilies': ['quoted command', 'HAPTIC side/effect/gain', 'SMALL_RUMBLE', 'BIG_RUMBLE'],
        }
    header = (NATIVE / 'include/Mapping.h').read_text(encoding='utf-8')
    for name in ('ActionModifier', 'EventModifier'):
        body = re.search(r'enum class ' + name + r'\s*\{([^}]+)\}', header)[1]
        result[name] = re.findall(r'^\s*(\w+)\s*,?\s*$', body, re.M)
    return result


def verify():
    gui = json.loads(subprocess.check_output(['node', str(ROOT / 'scripts/export-gui-binding-tokens.cjs')], cwd=ROOT, text=True))
    evidence = inventory()
    tokens = sorted(set(gui + evidence['win32']['namedTokens'] + list('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') + [f'F{i}' for i in range(1, 25)] + [f'N{i}' for i in range(10)] + ['+', '=', "'", '\\', ',', '.', ';', '/', '`', '[', ']', '-', 'SMALL_RUMBLE', 'BIG_RUMBLE', 'RFF80', 'HAPTIC_BOTH_CLICK_0']))
    source = (NATIVE / 'src/win32/PlatformDefinitions.cpp').read_text(encoding='utf-8')
    key_parser = function(source, 'WORD nameToKey(')
    haptic = function(source, 'std::string parseHapticName(')
    mapping = (NATIVE / 'src/Mapping.cpp').read_text(encoding='utf-8')
    mapping = re.sub(r'^#include "InputHelpers.h"\s*$', '', mapping, flags=re.M)
    literals = ','.join(json.dumps(token) for token in tokens)
    gui_literals = ','.join(json.dumps(token) for token in gui)
    program = r'''
#define NOMINMAX
#include <Windows.h>
#include "JoyShockMapper.h"
#include "PlatformDefinitions.h"
#include <cassert>
#include <iomanip>
#include <iostream>
#undef COUT
#define COUT std::cout
std::atomic<bool> g_hasGyroOnAllBinding{false};
std::string NONAME = "__native_internal_noname";
void WriteToConsole(std::string) { assert(false && "Parser test must never emit commands"); }
std::ostream &operator<<(std::ostream &out, const KeyCode &key) { return out << key.name; }
'''+key_parser+'\n'+haptic+'\n'+mapping+r'''
int main() {
  Mapping::_isCommandValid = [](string_view) { return true; };
  for (const string &token : vector<string>{GUI_TOKENS}) {
    assert(KeyCode(token).isValid());
    Mapping mapping(token + "\\");
    if (!mapping.isValid()) { cerr << "Graphical output cannot form a native Mapping: " << token << '\n'; return 1; }
  }
  assert(nameToKey("=") == VK_OEM_PLUS);
  for (int i=1;i<=24;++i) assert(nameToKey("F"+to_string(i)) == VK_F1+i-1);
  for (const char *bad : {"F0","F00","F01","F09","F25","F29","F30","F99"}) assert(nameToKey(bad)==0);
  // A non-null-terminated view must inspect precisely its five payload bytes.
  const char bounded[] = {'R','F','F','8','0','Z'};
  assert(nameToKey(string_view(bounded,5)) == RUMBLE);
  assert(nameToKey("RIGHT") == VK_RIGHT);
  assert(nameToKey("RFG00") == 0);
  for (const string &token : vector<string>{ALL_TOKENS}) {
    cout << quoted(token) << '\t' << KeyCode(token).code << '\n';
  }
}
'''
    program = program.replace('GUI_TOKENS', gui_literals).replace('ALL_TOKENS', literals)
    with tempfile.TemporaryDirectory(prefix='jsm-binding-audit-') as temporary:
        folder = Path(temporary)
        cpp, binary = folder / 'bindings.cpp', folder / 'bindings.exe'
        cpp.write_text(program, encoding='utf-8')
        vcvars = Path('C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat')
        deps = ROOT / 'build-jsm-sdl/_deps'
        batch = folder / 'build.cmd'
        batch.write_text(f'@echo off\ncall "{vcvars}" >nul\ncl /nologo /utf-8 /EHsc /std:c++20 /I"{NATIVE / "include"}" /I"{deps / "magic_enum-src/include"}" "{cpp}" /Fe:"{binary}"\n', encoding='utf-8')
        compiled = subprocess.run(['cmd.exe', '/d', '/c', str(batch)], cwd=folder, capture_output=True, text=True)
        if compiled.returncode:
            raise RuntimeError(compiled.stdout + compiled.stderr)
        checked = subprocess.run([str(binary)], capture_output=True, text=True)
        if checked.returncode:
            raise RuntimeError('Native key/Mapping assertion failed: ' + checked.stdout + checked.stderr)
        rows = []
        for line in checked.stdout.splitlines():
            token, code = line.rsplit('\t', 1)
            token = json.loads(token)
            rows.append({'token': token, 'code': int(code), 'guiCatalog': token in gui})
    evidence['verifiedWindowsOutputs'] = rows
    intent = json.loads(INTENT.read_text(encoding='utf-8'))
    issues = coverage_issues(rows, intent)
    if issues:
        raise RuntimeError('\n'.join(issues))
    evidence['graphicalIntent'] = intent
    evidence['note'] = 'Native Windows KeyCode/Mapping parsing verified; no OS/gamepad output emitted. Linux is static inventory, not a Linux runtime claim. Alias coverage still needs semantic review.'
    return evidence


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    result = verify()
    if args.write:
        (ROOT / 'docs/jsm-binding-inventory.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(f"PASS: actual Windows key/Mapping parser accepts {sum(row['guiCatalog'] for row in result['verifiedWindowsOutputs'])} GUI outputs; {len(result['verifiedWindowsOutputs'])} native tokens inventoried; bounded rumble and function-key validation verified")

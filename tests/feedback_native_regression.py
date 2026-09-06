"""Compile the real configuration-loading/chord transition code in isolation.
The parser tail is stubbed to record assignments, so no controller is touched.
"""
from pathlib import Path
import os, subprocess, tempfile
ROOT=Path(__file__).resolve().parents[1]
src=(ROOT/'JoyShockMapper/JoyShockMapper/src/CmdRegistry.cpp').read_text(encoding='utf-8')
load=src[src.index('bool CmdRegistry::loadConfigFile'):src.index('string_view CmdRegistry::strtrim')]
process=src[src.index('void CmdRegistry::processLine'):src.index('\t\tsmatch results;',src.index('void CmdRegistry::processLine'))]
pre=r"""
#include <string>
#include <vector>
#include <map>
#include <fstream>
#include <sstream>
#include <iostream>
#include <mutex>
#include <cassert>
using namespace std;
#define BASE_JSM_CONFIG_FOLDER() string()
#define COUT cout
#define COUT_INFO cout
#define CERR cerr
namespace { mutex profileMutex; string liveProfile; }
class CmdRegistry {
 string _chordRestore;
 vector<string> _profileLines, _restoreLines, _loadingFiles;
 bool _chordLoading=false;
 public:
 map<string,string> assignments;
 static string activeProfile(){lock_guard<mutex> lock(profileMutex);return liveProfile;}
 static string_view strtrim(const string& s) {return s;}
 bool loadConfigFile(string);
 void processLine(const string&);
};
"""
post=r"""
        if (trimmedLine == "RESET_MAPPINGS") assignments.clear();
        const auto equals=trimmedLine.find('=');
        if(equals!=string::npos) assignments[trimmedLine.substr(0,equals)]=trimmedLine.substr(equals+1);
    }
}
int main() {
 ofstream("base.txt") << "RESET_MAPPINGS\nN=A\ninclude.txt\n";
 ofstream("include.txt") << "E=B\n";
 ofstream("chord.txt") << "RESET_MAPPINGS\nR=SPACE\n";
 ofstream("other.txt") << "RESET_MAPPINGS\nN=C\n";
 CmdRegistry registry;
 registry.loadConfigFile("base.txt");
 registry.processLine("STUDIO_CHORD_BEGIN chord.txt");
 assert(registry.assignments.count("N")==0);
 assert(registry.assignments.at("R")=="SPACE");
 assert(CmdRegistry::activeProfile()=="chord.txt");
 ofstream("base.txt") << "RESET_MAPPINGS\nN=EDITED_WITHOUT_APPLYING\n";
 registry.loadConfigFile("other.txt");
 assert(registry.assignments.at("R")=="SPACE");
 registry.processLine("STUDIO_CHORD_END");
 assert(registry.assignments.at("N")=="A");
 assert(registry.assignments.at("E")=="B");
 assert(registry.assignments.count("R")==0);
 assert(CmdRegistry::activeProfile()=="base.txt");
 registry.processLine("STUDIO_CHORD_BEGIN missing.txt");
 assert(registry.assignments.at("N")=="A");
 registry.processLine("STUDIO_CHORD_END");
 assert(registry.assignments.at("N")=="A");
 registry.processLine("STUDIO_CHORD_BEGIN chord.txt");
 registry.processLine("RESET_MAPPINGS");
 registry.processLine("STUDIO_CHORD_END");
 assert(registry.assignments.empty());
 cout << "PASS: full reset, nested settings snapshot, autoload suppression, save-without-apply, missing target, repeated release and pause.\n";
}
"""
with tempfile.TemporaryDirectory(prefix='jsm-chord-test-') as tmp:
 tmp=Path(tmp); cpp=tmp/'harness.cpp';cpp.write_text(pre+load+process+post,encoding='utf-8')
 (tmp/'steam_tests.cpp').write_text((ROOT/'JoyShockMapper/JoyShockMapper/tests/steam_controller_2026_tests.cpp').read_text(encoding='utf-8'),encoding='utf-8')
 (tmp/'SteamController2026.h').write_text((ROOT/'JoyShockMapper/JoyShockMapper/include/SteamController2026.h').read_text(encoding='utf-8'),encoding='utf-8')
 vcvars=Path(os.environ.get('ProgramFiles(x86)','C:/Program Files (x86)'))/'Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat'
 (tmp/'build.bat').write_text(f'@echo off\ncall "{vcvars}" >nul\ncl /nologo /EHsc /std:c++17 harness.cpp /Fe:harness.exe\nif errorlevel 1 exit /b 1\nharness.exe\nif errorlevel 1 exit /b 1\ncl /nologo /EHsc /std:c++17 steam_tests.cpp /Fe:steam_tests.exe\nif errorlevel 1 exit /b 1\nsteam_tests.exe\n',encoding='utf-8')
 result=subprocess.run(['cmd.exe','/d','/c','build.bat'],cwd=tmp)
 raise SystemExit(result.returncode)

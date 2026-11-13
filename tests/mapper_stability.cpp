// Runs the actual parser and button FSM with recorded output and no devices.
#include "CmdRegistry.h"
#include "JSMAssignment.hpp"
#include "DigitalButton.h"
#include "InputHelpers.h"
#include "SettingsManager.h"
#include "ProfileOutputTransaction.h"
#include "VirtualControllerLifecycle.h"
#include <cassert>
#include <filesystem>
#include <fstream>
#include <iostream>

std::atomic<int> g_gyroGlobalOffCount{0}, g_gyroGlobalOnCount{0};
std::atomic_bool g_hasGyroOnAllBinding{false};
string NONAME;
string GetCWD() { return std::filesystem::current_path().string(); }
void updateSimPressPartner(ButtonID,ButtonID,const Mapping&) {}
void updateDiagPressPartner(ButtonID,ButtonID,const Mapping&) {}
static std::vector<std::pair<uint16_t,bool>> keys;
int pressKey(KeyCode key, bool down) { keys.emplace_back(key.code,down); return 1; }
BOOL WriteToConsole(string_view) { return TRUE; }
static std::mutex* lifecycleLock = nullptr;
static int created = 0, destroyed = 0;
static int neutralized = 0;
static bool failTarget = false;
static void checkCallbackLock() { if (lifecycleLock) { assert(lifecycleLock->try_lock()); lifecycleLock->unlock(); } }
Gamepad::Gamepad() { ++_count; }
Gamepad::~Gamepad() { --_count; }
size_t Gamepad::_count = 0;
struct FakeGamepad : Gamepad {
    ControllerScheme scheme;
    bool healthy;
    FakeGamepad(ControllerScheme type):scheme(type),healthy(!failTarget) {checkCallbackLock();++created;}
    ~FakeGamepad() {checkCallbackLock();++destroyed;}
    bool isInitialized(string* error=nullptr) const override {if(!healthy && error)*error="simulated failure";return healthy;}
    ControllerScheme getType() const override {return scheme;}
    void setButton(KeyCode,bool) override {}
    void setLeftStick(float,float) override {}
    void setRightStick(float,float) override {}
    void setStick(float,float,bool) override {}
    void setLeftTrigger(float) override {}
    void setRightTrigger(float) override {}
    void setGyro(TimePoint,float,float,float,float,float,float) override {}
    void setTouchState(optional<FloatXY>,optional<FloatXY>) override {}
    void update() override {}
    void neutralize() override { ++neutralized; }
};
Gamepad* Gamepad::getNew(ControllerScheme type, Callback) {return new FakeGamepad(type);}
static bool modifiers = false;
bool mappedModifiersHeld() { return modifiers; }
static int commits = 0, preparations = 0;
void refreshAllControllerOutputs() { ++commits; }
void refreshControllerOutput(int) { ProfileOutput::defer(); }
void prepareControllerProfile(int) { ++preparations; }
string controllerModelForHandle(int handle) { return handle == 1 ? "type-25" : ""; }
string virtualControllerAssignment(int) { return "VIRTUAL_CONTROLLER = NONE"; }

int main() {
    const auto directory = std::filesystem::temp_directory_path() / ("jsm-stability-" + std::to_string(GetCurrentProcessId()));
    std::filesystem::create_directories(directory);
    const auto before = std::filesystem::current_path();
    std::filesystem::current_path(directory);
    std::ofstream log(directory/"run.log");
    auto *console = std::cout.rdbuf(log.rdbuf());
    JSMVariable<int> marker(0);
    auto *scheme = new JSMVariable<ControllerScheme>(ControllerScheme::NONE);
    SettingsManager::add(SettingID::VIRTUAL_CONTROLLER, scheme);
    scheme->setFilter([](ControllerScheme,ControllerScheme next){ ProfileOutput::defer(); return next; });
    CmdRegistry registry;
    registry.add(new JSMAssignment<int>("MARKER", marker));
    registry.add(new JSMAssignment<ControllerScheme>("VIRTUAL_CONTROLLER", *scheme));
    registry.add((new JSMMacro("RESET_MAPPINGS"))->SetMacro([](JSMMacro*,string_view){return true;}));
    std::ofstream("desktop.txt") << "RESET_MAPPINGS\nMARKER = 1\nVIRTUAL_CONTROLLER = NONE\n";
    std::ofstream("game.txt") << "RESET_MAPPINGS\nMARKER = 2\nVIRTUAL_CONTROLLER = NONE\nVIRTUAL_CONTROLLER = XBOX\n# @controller type-25 VIRTUAL_CONTROLLER = XBOX\n";
    std::ofstream("navigation.txt") << "RESET_MAPPINGS\nMARKER = 3\n";
    commits=0;
    assert(registry.loadConfigFile("game.txt"));
    assert(marker.value()==2 && scheme->value()==ControllerScheme::XBOX && commits==1);
    // Repeated profile assignments make one final bus update, even with variants.
    for(int i=0;i<100;++i) assert(registry.loadConfigFile("game.txt"));
    assert(commits==101);
    modifiers=true;
    registry.processLine("STUDIO_FOCUS_PROFILE desktop.txt");
    for(int i=0;i<100;++i) registry.serviceFocusProfile();
    assert(marker.value()==2 && registry.hasPendingFocusProfile());
    // The most recent focus destination wins while Alt remains held.
    registry.processLine("STUDIO_FOCUS_PROFILE navigation.txt");
    modifiers=false; registry.serviceFocusProfile();
    assert(marker.value()==3 && !registry.hasPendingFocusProfile());
    // A deliberate slot/config choice cancels a pending automatic handover.
    modifiers=true; registry.processLine("STUDIO_FOCUS_PROFILE desktop.txt");
    registry.loadConfigFile("game.txt");
    modifiers=false; registry.serviceFocusProfile();
    assert(marker.value()==2 && !registry.hasPendingFocusProfile());
    modifiers=true;registry.processLine("STUDIO_AUTOLOAD desktop.txt");
    assert(marker.value()==2 && registry.hasPendingFocusProfile());
    modifiers=false;registry.serviceFocusProfile();assert(marker.value()==1);
    registry.processLine("STUDIO_DEVICE_CHORD_END 1");
    assert(preparations==0); // Ending an absent swap cannot release normal Alt.
    assert(!registry.loadConfigFile("# comment"));
    assert(registry.loadConfigFile("desktop.txt#comment"));
    assert(marker.value()==1);

    scheme->set(ControllerScheme::NONE);
    auto context=std::make_shared<DigitalButton::Context>(nullptr,nullptr);
    context->_getMatchingSimBtn=[](ButtonID){ return static_cast<DigitalButton*>(nullptr); };
    context->_getMatchingDiagBtn=[](ButtonID,optional<MapIterator>&){ return static_cast<DigitalButton*>(nullptr); };
    JSMButton altMap(ButtonID::S,Mapping("LALT")), tabMap(ButtonID::E,Mapping("TAB"));
    DigitalButton alt(context,altMap),tab(context,tabMap);
    const auto start=std::chrono::steady_clock::now();
    auto press=[&](DigitalButton& button,int ms){ Pressed p{start+std::chrono::milliseconds(ms),80,150,0};button.sendEvent(p); };
    auto release=[&](DigitalButton& button,int ms){ Released r{start+std::chrono::milliseconds(ms),80,150,0};button.sendEvent(r); };
    press(alt,0);press(alt,1);press(tab,2);press(tab,3);
    assert(alt.hasHeldModifier() && !tab.hasHeldModifier());
    release(tab,10); assert(alt.hasHeldModifier());
    release(alt,11); assert(!alt.hasHeldModifier());
    press(alt,20);press(alt,21); assert(alt.hasHeldModifier());
    alt.cancelForKeyboard();assert(!alt.hasHeldModifier());

    JSMButton repeatMap(ButtonID::W,Mapping("A+"));
    DigitalButton repeat(context,repeatMap);
    keys.clear();press(repeat,0);press(repeat,1);press(repeat,151);
    assert(!keys.empty());
    const auto countDown=[] {return std::count_if(keys.begin(),keys.end(),[](const auto& key){return key.second;});};
    const auto initial=countDown();
    press(repeat,4151); // Four-second scheduling stall.
    const auto resumed=countDown();assert(resumed==initial+1);
    for(int ms=4152;ms<4160;++ms) press(repeat,ms);
    assert(countDown()==resumed); // No burst of overdue repeats.
    release(repeat,4160);

    std::mutex callbackLock;
    lifecycleLock=&callbackLock;
    std::unique_ptr<Gamepad> target;
    string error;
    assert(setVirtualController(target,callbackLock,ControllerScheme::XBOX,nullptr,error));
    auto *original=target.get();
    for(int i=0;i<100;++i) assert(setVirtualController(target,callbackLock,ControllerScheme::XBOX,nullptr,error));
    assert(target.get()==original && created==1 && destroyed==0);
    failTarget=true;
    assert(!setVirtualController(target,callbackLock,ControllerScheme::DS4,nullptr,error));
    assert(target.get()==original && created==2 && destroyed==1 && Gamepad::getCount()==1);
    failTarget=false;
    assert(setVirtualController(target,callbackLock,ControllerScheme::DS4,nullptr,error));
    assert(created==3 && destroyed==2 && Gamepad::getCount()==1);
    assert(setVirtualController(target,callbackLock,ControllerScheme::NONE,nullptr,error));
    assert(!target && created==3 && destroyed==3 && Gamepad::getCount()==0);
    std::unique_ptr<Gamepad> parked;
    assert(setVirtualController(target,callbackLock,ControllerScheme::XBOX,nullptr,error,&parked));
    original=target.get();
    const auto started=created, ended=destroyed;
    for(int i=0;i<100;++i) {
        assert(setVirtualController(target,callbackLock,ControllerScheme::NONE,nullptr,error,&parked));
        assert(!target && parked.get()==original && Gamepad::getCount()==1);
        assert(neutralized==i+1); // No held buttons, triggers or axes survive KBM.
        assert(setVirtualController(target,callbackLock,ControllerScheme::NONE,nullptr,error,&parked));
        assert(neutralized==i+1); // Already inactive: no repeated driver work.
        assert(setVirtualController(target,callbackLock,ControllerScheme::XBOX,nullptr,error,&parked));
        assert(target.get()==original && !parked);
    }
    assert(created==started && destroyed==ended); // No virtual hotplug per slot.
    assert(setVirtualController(target,callbackLock,ControllerScheme::NONE,nullptr,error,&parked));
    parked.reset(); // Closing the mapping session really detaches the output.
    assert(Gamepad::getCount()==0 && destroyed==ended+1);
    lifecycleLock=nullptr;
    std::cout.rdbuf(console);log.close();
    std::filesystem::current_path(before);
    std::filesystem::remove_all(directory);
    std::cout << "PASS: real parser transactions; held Alt focus handover and cancellation; absent swaps; stalled turbo; virtual target reuse, failure rollback, cleanup and callback lock discipline\n";
}

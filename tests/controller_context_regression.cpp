#include "JSMVariable.hpp"
#include "ControllerCompatibility.h"
#include <cassert>
#include <iostream>
int main() {
 JSMVariable<int> sensitivity(1); ChordedVariable<int> binding(10);
 sensitivity.set(2);binding.atChord(ButtonID::L)->set(30);
 {ControllerContext::Guard model("type-5",0,"type-5");sensitivity.set(3);binding.atChord(ButtonID::R)->set(40);}
 {ControllerContext::Guard steam("type-24",1);assert(sensitivity.value()==2);assert(binding.chordedValue(ButtonID::L)==30);assert(!binding.chordedValue(ButtonID::R));}
 {ControllerContext::Guard ds("type-5",2);assert(sensitivity.value()==3);assert(binding.chordedValue(ButtonID::R)==40);}
 {ControllerContext::Guard chord("type-5",2,ControllerContext::deviceKey(2));ControllerContext::isolatedScopes.insert(ControllerContext::deviceKey(2));sensitivity.reset();binding.reset();assert(sensitivity.value()==1);assert(!binding.chordedValue(ButtonID::L));binding.atChord(ButtonID::L)->set(99);assert(binding.chordedValue(ButtonID::L)==99);}
 {ControllerContext::Guard steam("type-24",1);assert(sensitivity.value()==2);assert(binding.chordedValue(ButtonID::L)==30);}
 {ControllerContext::Guard otherDs("type-5",3);assert(sensitivity.value()==3);assert(binding.chordedValue(ButtonID::L)==30);}
 JSMVariableBase::clearScope(ControllerContext::deviceKey(2));ControllerContext::isolatedScopes.erase(ControllerContext::deviceKey(2));
 {ControllerContext::Guard ds("type-5",2);assert(sensitivity.value()==3);assert(binding.chordedValue(ButtonID::L)==30);}
 auto fallback=ControllerCompatibility::fallback({"RIGHT_TOUCHPAD_MODE = MOUSE","RT1 = J","LEFT_TOUCHPAD_MODE = GRID_AND_STICK","TOUCHPAD_SENS = 2"},false);
 assert(fallback.size()==2);assert(fallback[0].find("TOUCHPAD_MODE") == 0);assert(fallback[1].find("T1") == 0);
 assert(ControllerCompatibility::translateKey("MISC3,LEFT_GRID_REQUIRES_CLICK",true)=="CAPTURE,TOUCHPAD_GRID_REQUIRES_CLICK");
 std::cout << "PASS: native model/device isolation, chord masking, reset/release, and pad fallback\n";
}

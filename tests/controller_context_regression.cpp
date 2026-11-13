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
 // Pad rotation stays global: a one-pad controller has no TOUCHPAD_ROTATION to translate it to.
 assert(ControllerCompatibility::fallback({"LEFT_TOUCHPAD_ROTATION = -4","RIGHT_TOUCHPAD_ROTATION = 4"},false).empty());
 assert(ControllerCompatibility::fallback({"LEFT_TOUCHPAD_ROTATION = -4","RIGHT_TOUCHPAD_ROTATION = 4"},true,true).empty());
 std::cout << "PASS: native model/device isolation, chord masking, reset/release, and pad fallback\n";
 // Two identical controllers retain their own settings when enumeration changes.
 const auto mine = ControllerContext::layoutKey("type-24", "serial-one:receiver-one");
 const auto hers = ControllerContext::layoutKey("type-24", "serial-two:receiver-two");
 assert(mine != hers);
 ControllerContext::instanceScopes[11] = mine; ControllerContext::instanceScopes[12] = hers;
 {ControllerContext::Guard write("type-24",0,mine); sensitivity.set(8); binding.atChord(ButtonID::R)->set(61);}
 {ControllerContext::Guard write("type-24",0,hers); sensitivity.set(0); binding.atChord(ButtonID::R)->set(62);}
 {ControllerContext::Guard read("type-24",11); assert(sensitivity.value()==8);assert(binding.chordedValue(ButtonID::R)==61);}
 {ControllerContext::Guard read("type-24",12); assert(sensitivity.value()==0);assert(binding.chordedValue(ButtonID::R)==62);}
 ControllerContext::instanceScopes[77] = mine;
 {ControllerContext::Guard reconnected("type-24",77); assert(sensitivity.value()==8);}
 {ControllerContext::Guard write("type-24",0,mine); assert(ControllerContext::matches(24,77));assert(!ControllerContext::matches(24,12));}
 // Allocation-free scopes must still react to nested guards, profile switches,
 // isolation changes, and reconnect identities without stale cached settings.
 {ControllerContext::Guard read("type-24",11);
  assert(sensitivity.value()==8);
  {ControllerContext::Guard nested("type-24",12); assert(sensitivity.value()==0);}
  assert(sensitivity.value()==8);
  ControllerContext::isolatedScopes.insert(ControllerContext::baseKey(11));
  assert(sensitivity.value()==1);
  {ControllerContext::Guard write("type-24",11,ControllerContext::baseKey(11)); sensitivity.set(6);}
  assert(sensitivity.value()==6);
  JSMVariableBase::clearScope(ControllerContext::baseKey(11));
  ControllerContext::isolatedScopes.erase(ControllerContext::baseKey(11));
  assert(sensitivity.value()==8);
  ControllerContext::instanceScopes[11]=hers; assert(sensitivity.value()==0);
  ControllerContext::instanceScopes.erase(11); assert(sensitivity.value()==2);
 }
 assert(sensitivity.value()==2);
}

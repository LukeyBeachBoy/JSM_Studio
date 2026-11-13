#include "StudioSlotFilter.h"
#include <cassert>
#include <iostream>
int main() {
    using namespace StudioSlotFilter;
    const uint64_t up=1ULL<<32, down=1ULL<<34, weapon=1ULL<<7;
    assert(configure("25 4294967296 1;25 17179869184 1"));
    assert(filter(25,weapon,1)==weapon); // root alone never claims game inputs
    assert(filter(25,up|weapon,0)==(up|weapon)); // direction first still ordinary
    assert(filter(25,up|weapon,1)==weapon); // full hotkey consumes direction only
    assert(filter(25,down|weapon,1)==weapon);
    assert(filter(24,up|weapon,1)==(up|weapon)); // another controller is untouched
    assert(!configure("25 0 1"));
    assert(filter(25,up,1)==0); // invalid changes never partly replace rules
    assert(configure(""));
    assert(filter(25,up,1)==up);
    std::cout<<"PASS: slot hotkeys consume complete combinations only, preserve roots and unrelated inputs, isolate controllers and reset safely\n";
}

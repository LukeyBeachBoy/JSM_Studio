#include "TritonGripSettings.h"
#include <cassert>
#include <iostream>
int main() {
    triton_grip::WriteGate gate;
    assert(gate.ready(false, 0)); // Startup with no contact can configure hardware.
    int applied = 306, desired = 306, writes = 0;
    for (uint64_t now = 1; now < 1000; ++now) {
        desired = (now / 100) % 2 ? 318 : 306; // Chord and slot changes mid-circle.
        if (gate.ready(true, now) && !triton_grip::pending(desired,96,applied,96).empty()) { applied=desired; ++writes; }
    }
    assert(writes == 0 && applied == 306);
    assert(!gate.ready(false, 1020)); // A short touch dropout must not recalibrate.
    assert(!gate.ready(true, 1021));
    assert(!gate.ready(false, 1120));
    desired=318;
    assert(gate.ready(false, 1121));
    assert(triton_grip::pending(desired,96,applied,96).size()==1);
    applied=desired; ++writes;
    assert(triton_grip::pending(desired,96,applied,96).empty());
    assert(gate.ready(false, 1122) && writes==1);
    // A chord pressed and released during contact leaves no obsolete write.
    assert(!gate.ready(true, 1200)); desired=306; desired=318;
    assert(gate.ready(false, 1300));
    assert(triton_grip::pending(desired,96,applied,96).empty());
    std::cout << "PASS: active touch blocks calibration; dropout debounce; final profile wins; unchanged settings do not write\n";
}

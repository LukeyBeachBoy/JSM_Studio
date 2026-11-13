#include "../JoyShockMapper/JoyShockMapper/include/AzeronCyborg.h"
#include <cstdlib>
#include <iostream>
static void check(bool value) { if (!value) std::abort(); }
int main() {
    for (int i = 0; i < 32; ++i)
        check(AzeronCyborg::buttons(32, 0, false, [=](int button) { return button == i; }) == (uint64_t(1) << i));
    check(AzeronCyborg::buttons(32, 15, true, [](int) { return false; }) == ((uint64_t(1) << 36) - 1));
    check(AzeronCyborg::buttons(2, 0, true, [](int) { return false; }) == 3);
    check(AzeronCyborg::buttons(99, 0, true, [](int) { return false; }) == 0xffffffffULL);
    check(AzeronCyborg::buttons(32, 3, false, [](int) { return false; }) == (3ULL << 32));
    check(AzeronCyborg::buttons(0, 0, false, [](int) { return true; }) == 0);
    check(AzeronCyborg::axis(-32768) == -1.f);
    check(AzeronCyborg::axis(32767) == 1.f);
    check(AzeronCyborg::axis(0) == 0.f);
    std::cout << "Azeron buttons, hats, capability bounds and axis endpoints passed\n";
}

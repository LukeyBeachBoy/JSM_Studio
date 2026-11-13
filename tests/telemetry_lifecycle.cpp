#include "Telemetry.h"
#include <cassert>
#include <iostream>
#include <thread>

bool windowsSessionLocked() { return false; }

int main() {
    using namespace std::chrono_literals;
    // Before any controller has polled, the idle worker must be allowed to send.
    assert(!Telemetry::SentWithin(400ms));
    Telemetry::Configure(true,18980);
    assert(Telemetry::IsDue());
    TelemetrySample idle;
    idle.activeProfile="idle-regression";
    Telemetry::MaybeSend(idle);
    assert(Telemetry::SentWithin(400ms));
    Telemetry::Configure(false,18980);
    assert(!Telemetry::IsDue());
    // The console may reconfigure telemetry while the idle worker is sending.
    // All socket lifetime, rate and enable state must use the same lock.
    std::thread configure([] {
        for(int i=0;i<1000;++i) Telemetry::Configure(i%3!=0,static_cast<uint16_t>(18980+i%2));
    });
    std::thread sender([&] {
        for(int i=0;i<1000;++i) {
            (void)Telemetry::IsDue();
            (void)Telemetry::SentWithin(400ms);
            Telemetry::MaybeSend(idle);
        }
    });
    configure.join();sender.join();
    Telemetry::Shutdown();assert(!Telemetry::IsDue());
    Telemetry::Configure(true,18980);assert(Telemetry::IsDue());
    Telemetry::MaybeSend(idle);assert(Telemetry::SentWithin(400ms));
    Telemetry::Shutdown();
    std::cout<<"PASS: first idle heartbeat, concurrent reconfiguration/send, shutdown and restart\n";
}

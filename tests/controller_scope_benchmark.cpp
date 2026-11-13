#include "ControllerContext.h"
#include <atomic>
#include <cstdlib>
#include <iostream>
#include <new>

// Repeatable settings-lookup benchmark; run optimized, before and after changes.
static std::atomic<size_t> allocations{0};
void* operator new(size_t n) {
    allocations.fetch_add(1, std::memory_order_relaxed);
    if (auto p = std::malloc(n ? n : 1)) return p;
    throw std::bad_alloc();
}
void operator delete(void* p) noexcept { std::free(p); }
void operator delete(void* p, size_t) noexcept { std::free(p); }
int main() {
    using namespace ControllerContext;
    instanceScopes[123] = layoutKey("type-25", "benchmark-cyborg");
    std::map<std::string, int> settings{{"type-25", 17}, {baseKey(123), 19}};
    Guard guard("type-25", 123);
    constexpr size_t iterations = 1000000;
    for (bool isolatedProfile : {false, true}) {
        if (isolatedProfile) isolatedScopes.insert(baseKey(123));
        // Warm thread-local storage outside the measurement.
        for (const auto& scope : readScopes()) (void)settings.find(scope);
        const auto before = allocations.load();
        const auto start = std::chrono::steady_clock::now();
        size_t checksum = 0;
        for (size_t i = 0; i < iterations; ++i) {
            for (const auto& scope : readScopes()) {
                const auto found = settings.find(scope);
                if (found != settings.end()) { checksum += found->second; break; }
            }
        }
        const auto elapsed = std::chrono::duration<double, std::micro>(std::chrono::steady_clock::now()-start).count();
        const auto allocationCount = allocations.load()-before;
        std::cout << (isolatedProfile ? "isolated" : "inherited") << ": "
                  << elapsed / iterations << " us/lookup, " << allocationCount
                  << " allocations / " << iterations << " lookups, checksum=" << checksum << '\n';
        if (checksum != iterations * 19) return 1;
    }
}

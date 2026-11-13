#include "AzeronInputQueue.h"
#include "AzeronNativeProtocol.h"
#include <cassert>
#include <atomic>
#include <iostream>
#include <thread>
using namespace AzeronNative;
int main() {
    Input input;
    input.software=true; input.rawSeen=true;
    input.calibration={0,1023,0,1023,0,0,true};
    InputQueue queue;
    InputQueue::Batch batch;
    const auto report=[&](std::string_view text) {
        input.report(std::span(reinterpret_cast<const uint8_t*>(text.data()),text.size()),
            [&](const Input& state,std::string_view) {
                queue.publish({state.buttons,state.x,state.y,"active"},state.software && state.rawSeen);
            });
    };
    // Complete taps within one HID report and overlapping/chorded presses must
    // reach the mapper separately, including both side thumb buttons.
    report("BP_1\r\nBP_41\nBR_1\nBP_20\nBR_41\nBR_20\n");
    assert(queue.take(batch)==6);
    const uint64_t expected[]={1,1|(1ULL<<24),1ULL<<24,(1ULL<<24)|(1ULL<<21),1ULL<<21,0};
    for(size_t i=0;i<6;++i) assert(batch[i].buttons==expected[i]);
    assert(queue.take(batch)==1 && batch[0].buttons==0);
    // Analog updates do not create a backlog or overwrite a button transition.
    report("PJOY_24_0_0\nBP_1\nPJOY_24_1023_1023\nBR_1\nPJOY_24_0_0\n");
    assert(queue.take(batch)==2);
    assert(batch[0].buttons==1 && batch[0].x==1 && batch[0].y==-1);
    assert(batch[1].buttons==0 && batch[1].x==-1 && batch[1].y==1);
    for(int i=0;i<100000;++i) report("PJOY_24_1023_0\n");
    assert(queue.take(batch)==1 && batch[0].x==1 && batch[0].y==1);
    assert(queue.overflows()==0);
    report("BP_1\n");
    queue.publish({0,0,0,"connection-lost"},false);
    assert(queue.take(batch)==1 && batch[0].buttons==0 && batch[0].x==0);
    // A stalled mapper discards historical presses and analog positions. The
    // latest state still follows a neutral report so old held keys are released.
    const auto time = InputQueue::Clock::now();
    queue.publish({1,-1,0,"active"},true,time);
    queue.publish({3,0,1,"active"},true,time + std::chrono::milliseconds(5));
    queue.publish({2,1,0,"active"},true,time + std::chrono::milliseconds(60));
    assert(queue.take(batch,time + std::chrono::milliseconds(61))==2);
    assert(batch[0].buttons==0 && batch[0].x==0 && batch[0].y==0);
    assert(batch[1].buttons==2 && batch[1].x==1 && batch[1].y==0);
    assert(queue.staleBatches()==1);
    queue.publish({0,0,0,"released"},false); queue.take(batch);
    // Mode acknowledgements clear held keys as well as the physical input state.
    report("BR_1\nBP_1\n");
    const uint8_t onboard[]={1,0,6,2,1,1,1,1};
    input.report(onboard,[&](const Input& state,std::string_view) {
        queue.publish({state.buttons,state.x,state.y,"connecting"},false);
    });
    assert(queue.take(batch)==1 && batch[0].buttons==0);
    // Even a consumer stalled beyond the fixed capacity releases everything
    // before restoring the latest state; never unbounded memory or stuck keys.
    for(size_t i=0;i<=InputQueue::capacity;++i) queue.publish({i%2 ? 0ULL:1ULL,0,0,"active"},true);
    assert(queue.overflows()==1);
    assert(queue.take(batch)==2 && batch[0].buttons==0 && batch[1].buttons==1);
    queue.publish({0,0,0,"released"},false); queue.take(batch);
    // Producer/consumer hand-off under contention preserves all ordered edges.
    std::atomic<int> consumed{0};
    std::thread producer([&] {
        for(int group=0;group<1000;++group) {
            while(consumed.load()!=group) std::this_thread::yield();
            for(int edge=0;edge<100;++edge) queue.publish({edge%2 ? 0ULL:1ULL,0,0,"active"},true);
        }
    });
    for(int group=0;group<1000;++group) {
        int edges=0; uint64_t previous=0;
        while(edges<100) {
            const auto count=queue.take(batch);
            for(size_t i=0;i<count;++i) if(batch[i].buttons!=previous) {
                previous=batch[i].buttons; ++edges;
            }
        }
        assert(previous==0); consumed.store(group+1);
    }
    producer.join();
    assert(queue.overflows()==1);
    std::cout<<"PASS: batched/rapid/chorded taps, analog coalescing, disconnect and mode releases, bounded overflow, 100000 concurrent edges\n";
}

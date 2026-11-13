#include "../JoyShockMapper/JoyShockMapper/include/AzeronNativeProtocol.h"
#include <cstdlib>
#include <iostream>
#include <set>
#include <string>
using namespace AzeronNative;
void check(bool b) { if(!b) std::abort(); }
int main() {
    const uint8_t sw[]={0}; auto packet=command(6,9,sw);
    check(packet[0]==0 && packet[2]==1 && packet[3]==6 && packet[4]==9 && packet[7]==1 && packet[8]==0);
    // Captured firmware-100 calibration response, without report padding.
    const uint8_t details[]={31,0,2,166,1,1,31,1,50,1,10,0,1,8,3,248,255,237,255,52,0,39,0,0,124,110,88,1,149,2,79,1,124,2,0,0,22,0};
    Input input; input.report(details); check(input.calibration.valid);
    check(input.calibration.xmin==344 && input.calibration.xmax==661 && input.calibration.xoffset==-8);
    check(input.line("PJOY_24_344_335\r\n")); check(input.x==-1 && input.y==1);
    input.line("PJOY_24_661_636"); check(input.x==1 && input.y==-1);
    input.line("PJOY_24_492_468"); check(std::abs(input.x)<.03f && std::abs(input.y)<.03f);
    auto x=input.x; check(!input.line("PJOY_24_1024_512")); check(input.x==x);
    check(!input.line("PJOY_24_1junk_2")); check(!input.line("JOY_24_1023_0"));
    std::set<int> bits;
    for(int id=0;id<256;++id) if(auto bit=physicalBit(id);bit>=0) {
        check(bits.insert(bit).second);
        input.line("BP_"+std::to_string(id)); check(input.buttons==(1ULL<<bit));
        input.line("BR_"+std::to_string(id)); check(input.buttons==0);
    }
    check(bits.size()==30); check(physicalBit(20)==21 && physicalBit(41)==24 && physicalBit(38)==25);
    const std::string burst="BP_1\r\nBP_41\r\nBR_1\r\n";
    input.report(std::span(reinterpret_cast<const uint8_t*>(burst.data()),burst.size())); check(input.buttons==(1ULL<<24));
    const uint8_t hw[]={1,0,6,2,1,1,1,1}; input.report(hw); check(!input.software && !input.rawSeen && input.buttons==0);
    for(size_t n=0;n<sizeof(details);++n) { Input truncated; truncated.report(std::span(details,n)); check(!truncated.calibration.valid); }
    auto malformed=std::to_array(details); malformed[6]=255; Input bad; bad.report(malformed); check(!bad.calibration.valid);
    check(supported==0xf03ffffffULL);
    std::cout<<"Native Cyborg protocol: calibration, stable physical buttons, framing, malformed reports and release passed\n";
}

#include "StickDirections.h"
#include "StickGeometry.h"
#include <cassert>
#include <fstream>
#include <iostream>
#include <limits>
#include <sstream>
#include <string>
using namespace StickDirections;
static uint8_t at(State& state, float angle, float radius, Options options) {
    const float radians=angle*.01745329252f;
    return state.update(std::sin(radians)*radius,std::cos(radians)*radius,options);
}
static std::string pressed(uint8_t previous,uint8_t next) {
    std::string result;
    for(int i=0;i<4;++i) if((next & (1<<i)) && !(previous & (1<<i))) result += "WDSA"[i];
    return result;
}
int main() {
    const Options stable{70,5,.35f,.17f};
    State state;
    assert(at(state,0,.34f,stable)==0);
    assert(at(state,0,.36f,stable)==1);
    assert(at(state,0,.25f,stable)==1);
    assert(at(state,180,.30f,stable)==0); // rebound can cross centre between reports
    assert(at(state,0,.27f,stable)==0); // secondary oscillation cannot re-arm
    assert(at(state,180,.36f,stable)==4); // deliberate reversal is immediate
    assert(at(state,180,.1799f,stable)==0);
    assert(at(state,0,1,stable)==1);
    for(int i=0;i<10000;++i) assert(at(state,i%2 ? 36:34,1,stable)==1);
    assert(at(state,41,1,stable)==3);
    for(int i=0;i<10000;++i) assert(at(state,i%2 ? 36:34,1,stable)==3);
    assert(at(state,29,1,stable)==1);
    // All 8 directions remain reachable, including narrow diagonal zones.
    for(float width : {10.f,53.130102f,70.f,89.f}) for(int i=0;i<8;++i) {
        Options o=stable;o.width=width;
        state.reset(); const auto mask=at(state,float(i*45),1,o);
        assert(mask==(i%2 ? (uint8_t(1<<(i/2)) | uint8_t(1<<((i/2+1)%4))) : uint8_t(1<<(i/2))));
    }
    Options four=stable;four.width=90;
    for(int angle=0;angle<360;++angle) { auto mask=at(state,float(angle),1,four);assert(mask && !(mask&(mask-1))); }
    // Legacy defaults reproduce the original 0.5 ratio away from exact borders.
    Options legacy;legacy.activation=.12f;
    for(int i=-1799;i<1800;++i) {
        const float a=i*.1f*.01745329252f,x=std::sin(a),y=std::cos(a);
        const uint8_t expected=(y>.5f*std::abs(x)?1:0)|(x>.5f*std::abs(y)?2:0)|
            (y<-.5f*std::abs(x)?4:0)|(x<-.5f*std::abs(y)?8:0);
        assert(state.update(x,y,legacy)==expected);
    }
    assert(state.update(-1e-15f,1,stable)==1); // rounded 360 degrees wraps safely
    assert(state.update(std::numeric_limits<float>::quiet_NaN(),1,stable)==0);
    assert(state.update(0,0,stable)==0);
    // State is per-stick/device; changing configuration never inherits a latch.
    State second;
    assert(at(state,34,1,stable)==1);
    assert(at(second,41,1,stable)==3);
    assert(at(state,36,1,stable)==1);
    auto changed=stable;changed.width=40;
    assert(at(state,36,1,changed)==3);
    // Ring scaling/rotation happen first, without changing analog geometry.
    auto transformed=transformStickGeometry(0,.4f,90,true,.7f);
    state.reset();assert(state.update(transformed.first,transformed.second,stable)==2);
    // Replay the user's real return-bounce trace. Preserve intentional diagonals
    // during the later sweep, but emit just W S A D for the first four pushes.
    std::ifstream input("tests/fixtures/cyborg-wasd-return.csv");assert(input);
    State fixed,old;uint8_t beforeFixed=0,beforeOld=0;
    std::string fixedCardinals,oldCardinals,held;int frames=0,diagonals=0;
    for(std::string line;std::getline(input,line);) {
        if(line.empty() || line[0]=='#') continue;
        std::replace(line.begin(),line.end(),',',' ');
        std::istringstream row(line);float time,x,y;row>>time>>x>>y;assert(row);
        // The four intentional cardinals were all about 15 degrees anticlockwise
        // of the sensor axes. Use the existing per-layout rotation to align them.
        const auto aligned=transformStickGeometry(x,y,15,false,.7f);
        const auto nowFixed=fixed.update(aligned.first,aligned.second,stable),nowOld=old.update(x,y,legacy);
        if(time<34.2f) {fixedCardinals+=pressed(beforeFixed,nowFixed);oldCardinals+=pressed(beforeOld,nowOld);}
        if(time>=35.2f && time<38.5f) held+=pressed(beforeFixed,nowFixed);
        if(time>=39 && nowFixed && (nowFixed&(nowFixed-1))) ++diagonals;
        beforeFixed=nowFixed;beforeOld=nowOld;++frames;
    }
    assert(frames>1000);assert(oldCardinals!="WSAD");assert(fixedCardinals=="WSAD");
    assert(held=="W");assert(diagonals>20);assert(beforeFixed==0);
    std::cout<<"PASS: captured trace legacy="<<oldCardinals<<", fixed="<<fixedCardinals
             <<"; held forward="<<held<<"; intentional diagonal samples="<<diagonals
             <<"; spatial hysteresis, return bounce, immediate reversals, 4/8-way, legacy compatibility and device isolation\n";
}

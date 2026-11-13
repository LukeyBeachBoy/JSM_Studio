#include "../JoyShockMapper/JoyShockMapper/include/StickGeometry.h"
#include "../JoyShockMapper/JoyShockMapper/include/StickDirections.h"
#include <cstdlib>
#include <iostream>
#include <limits>
void check(bool value) { if (!value) std::abort(); }
void near(std::pair<float,float> p, float x, float y) {
  check(std::abs(p.first-x)<.00001f && std::abs(p.second-y)<.00001f);
}
int main() {
  near(transformStickGeometry(.9f,.9f,0,false,.7f),.9f,.9f);
  near(transformStickGeometry(0,.7f,0,true,.7f),0,1);
  near(transformStickGeometry(0,.35f,0,true,.7f),0,.5f);
  near(transformStickGeometry(0,.7f,0,false,.7f),0,.7f);
  near(transformStickGeometry(0,1,90,false,.7f),1,0);
  near(transformStickGeometry(1,0,-90,false,.7f),0,1);
  const float d=std::sqrt(.5f);
  near(transformStickGeometry(.7f,.7f,0,true,.7f),d,d);
  near(transformStickGeometry(d*.7f,d*.7f,-45,true,.7f),0,1);
  near(transformStickGeometry(0,0,30,true,.7f),0,0);
  near(transformStickGeometry(std::numeric_limits<float>::quiet_NaN(),1,0,true,.7f),0,0);
  // Angles remain stable through saturation; no axis clipping distorts flicks.
  for(int deg=-180;deg<=180;++deg) {
    auto p=transformStickGeometry(.4f,.8f,float(deg),true,.5f);
    check(std::abs(std::hypot(p.first,p.second)-1)<.00001f);
  }
  StickCalibration calibration;
  // Forward keeps the existing 15-degree rotation; right adds another 15.
  calibration.enabled = true;
  calibration.angles = {0, 15, -12, 8};
  for (int i=0;i<4;++i) {
    const float physical = (i*90.f - calibration.angles[i] - 15.f)*.017453292519943295f;
    const float expected = i*1.570796326795f;
    near(transformStickGeometry(std::sin(physical)*.6f,std::cos(physical)*.6f,15,false,.7f,calibration),
      std::sin(expected)*.6f,std::cos(expected)*.6f);
    const auto corrected = transformStickGeometry(std::sin(physical)*.6f,std::cos(physical)*.6f,15,false,.7f,calibration);
    StickDirections::State direction;
    check(direction.update(corrected.first, corrected.second, {80,5,.35f,.17f}) == (1 << i));
  }
  calibration.ranges = {.8f,.6f,1.f,.7f};
  // Ring and per-direction reach compose once; half travel stays half output.
  near(transformStickGeometry(0,.28f,0,true,.7f,calibration),0,.5f);
  near(transformStickGeometry(0,.56f,0,true,.7f,calibration),0,1);
  // Walk the complete circle, including the wrap seam and tightest anchors.
  calibration.angles = {40,-40,40,-40};
  float previous=-1;
  for(int step=0;step<=36000;++step) {
    const float angle=(-40.f+step*.01f)*.017453292519943295f;
    const auto p=calibrateStick(std::sin(angle)*.05f,std::cos(angle)*.05f,calibration);
    float mapped=std::atan2(p.first,p.second)*57.295779513f;
    if(mapped<-.001f) mapped+=360;
    if(step<36000) {check(mapped+0.001f>=previous);previous=mapped;}
    check(std::isfinite(p.first)&&std::isfinite(p.second)&&std::hypot(p.first,p.second)<=1.00001f);
  }
  near(transformStickGeometry(0,0,15,false,.7f,calibration),0,0);
  calibration.enabled=false;
  near(transformStickGeometry(.9f,.9f,0,false,.7f,calibration),.9f,.9f);
  calibration.enabled=true;
  calibration.angles[0]=std::numeric_limits<float>::quiet_NaN();
  calibration.ranges[0]=std::numeric_limits<float>::quiet_NaN();
  near(calibrateStick(0,.5f,calibration),0,.5f);
  std::cout << "PASS: stick geometry rotation, ring scaling, diagonal saturation and safe defaults\n";
}

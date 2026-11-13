#include "../JoyShockMapper/JoyShockMapper/include/ControllerCompatibility.h"
#include <cassert>
int main() {
 const std::vector<std::string> defaultsAndGame = {"# @controller-default type-25 LEFT_STICK_ROTATION = 15", "LEFT_STICK_MODE = AIM", "STICK_DEADZONE_INNER = 0.2", "# @controller type-24 LEFT_STICK_ROTATION = -5", "JOY1,LEFT_STICK_ROTATION = 45"};
 assert(ControllerCompatibility::hasSharedSetting(defaultsAndGame, "LEFT_STICK_MODE"));
 assert(ControllerCompatibility::hasSharedSetting(defaultsAndGame, "LEFT_STICK_DEADZONE_INNER"));
 assert(!ControllerCompatibility::hasSharedSetting(defaultsAndGame, "LEFT_STICK_ROTATION"));
 assert(!ControllerCompatibility::hasSharedSetting(defaultsAndGame, "LEFT_STICK_RESTRICTOR_RING"));
}

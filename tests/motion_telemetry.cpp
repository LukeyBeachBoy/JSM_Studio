#include <winsock2.h>
#include <ws2tcpip.h>
#include "Telemetry.h"
#include <cassert>
#include <iostream>
#include <string>

bool windowsSessionLocked() { return false; }

int main() {
    WSADATA data{};
    assert(WSAStartup(MAKEWORD(2, 2), &data) == 0);
    const SOCKET receiver = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    assert(receiver != INVALID_SOCKET);
    sockaddr_in address{};
    address.sin_family = AF_INET; address.sin_port = htons(18982);
    inet_pton(AF_INET, "127.0.0.1", &address.sin_addr);
    assert(bind(receiver, reinterpret_cast<sockaddr*>(&address), sizeof(address)) == 0);
    const DWORD timeout = 2000;
    setsockopt(receiver, SOL_SOCKET, SO_RCVTIMEO, reinterpret_cast<const char*>(&timeout), sizeof(timeout));
    TelemetrySample sample;
    sample.omega = 999; // Must not replace either controller's local measurement.
    for (int index = 0; index < 2; ++index) {
        TelemetryDevice device;
        device.handle = index + 1;
        TelemetryDeviceStatus status;
        TelemetryMotionPreview motion;
        motion.timestampMs = 1234 + index;
        motion.input = { 10.f + index, 20.f + index };
        motion.filtered = { 3.f + index, 4.f + index };
        motion.derivative = { 100.f + index, 200.f + index };
        motion.snapInput = { 5.f + index, 6.f + index };
        motion.omega = 12.f + index;
        motion.sensX = 2.f + index; motion.sensY = 4.f + index;
        motion.tiltAngle = 25.f + index;
        motion.sampleHz = 250.f + 250.f * index;
        status.motion = motion; device.status = status; sample.devices.push_back(device);
    }
    Telemetry::Configure(true, 18982);
    Telemetry::MaybeSend(sample);
    char buffer[16384];
    const int size = recv(receiver, buffer, sizeof(buffer), 0);
    assert(size > 0);
    const std::string packet(buffer, size);
    assert(packet.find("\"timestampMs\":1234") != std::string::npos);
    assert(packet.find("\"timestampMs\":1235") != std::string::npos);
    assert(packet.find("\"derivative\":{") != std::string::npos);
    assert(packet.find("\"snapInput\":{") != std::string::npos);
    assert(packet.find("\"tiltAngle\":25") != std::string::npos);
    assert(packet.find("\"tiltAngle\":26") != std::string::npos);
    assert(packet.find("\"sampleHz\":250") != std::string::npos);
    assert(packet.find("\"sampleHz\":500") != std::string::npos);
    Telemetry::Shutdown(); closesocket(receiver); WSACleanup();
    std::cout << packet << '\n';
}

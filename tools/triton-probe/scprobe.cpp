// scprobe: talk to a Steam Controller 2026 (Triton) vendor HID collection.
//
//   scprobe list
//   scprobe cmd <hex cmd> [hex payload bytes...]      send feature [1][cmd][len][payload], print reply
//   scprobe settings                                  dump settings 0..85 via 0x89
//   scprobe defaults                                  dump defaults via 0x8C (may be unhandled)
//   scprobe store-get <key>                           0xED with a NUL-terminated key
//   scprobe store-set <key> <hex value bytes...>      0xEE  "key\0value"  (WRITES FLASH - use deliberately)
//   scprobe out <hex bytes...>                        output report (haptics 0x80..0x85)
//
// Env: SCPROBE_PID=1302|1304 to force a product id; default: first vendor collection found.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <setupapi.h>
#include <hidsdi.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#pragma comment(lib, "hid.lib")
#pragma comment(lib, "setupapi.lib")

struct Dev { std::wstring path; USHORT vid, pid, usagePage, usage, featLen, outLen, inLen; };

static std::vector<Dev> enumerate()
{
	std::vector<Dev> out;
	GUID guid; HidD_GetHidGuid(&guid);
	HDEVINFO set = SetupDiGetClassDevsW(&guid, nullptr, nullptr, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
	if (set == INVALID_HANDLE_VALUE) return out;
	SP_DEVICE_INTERFACE_DATA ifd; ifd.cbSize = sizeof(ifd);
	for (DWORD i = 0; SetupDiEnumDeviceInterfaces(set, nullptr, &guid, i, &ifd); ++i)
	{
		DWORD need = 0;
		SetupDiGetDeviceInterfaceDetailW(set, &ifd, nullptr, 0, &need, nullptr);
		std::vector<BYTE> buf(need);
		auto *det = reinterpret_cast<SP_DEVICE_INTERFACE_DETAIL_DATA_W *>(buf.data());
		det->cbSize = sizeof(SP_DEVICE_INTERFACE_DETAIL_DATA_W);
		if (!SetupDiGetDeviceInterfaceDetailW(set, &ifd, det, need, nullptr, nullptr)) continue;
		HANDLE h = CreateFileW(det->DevicePath, 0, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING, 0, nullptr);
		if (h == INVALID_HANDLE_VALUE) continue;
		HIDD_ATTRIBUTES attr; attr.Size = sizeof(attr);
		if (HidD_GetAttributes(h, &attr) && attr.VendorID == 0x28DE)
		{
			PHIDP_PREPARSED_DATA pp = nullptr; HIDP_CAPS caps{};
			if (HidD_GetPreparsedData(h, &pp)) { HidP_GetCaps(pp, &caps); HidD_FreePreparsedData(pp); }
			out.push_back({ det->DevicePath, attr.VendorID, attr.ProductID, caps.UsagePage, caps.Usage, caps.FeatureReportByteLength, caps.OutputReportByteLength, caps.InputReportByteLength });
		}
		CloseHandle(h);
	}
	SetupDiDestroyDeviceInfoList(set);
	return out;
}

static void hexdump(const char *tag, const BYTE *p, int n)
{
	printf("%s", tag);
	for (int i = 0; i < n; ++i) printf(" %02x", p[i]);
	printf("\n");
}

static HANDLE openVendor(const std::vector<Dev> &devs, Dev &chosen)
{
	const char *force = getenv("SCPROBE_PID");
	USHORT wantPid = force ? (USHORT)strtoul(force, nullptr, 16) : 0;
	for (const auto &d : devs)
	{
		if (d.usagePage < 0xFF00) continue;
		if (wantPid && d.pid != wantPid) continue;
		HANDLE h = CreateFileW(d.path.c_str(), GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING, 0, nullptr);
		if (h == INVALID_HANDLE_VALUE) { printf("# open failed (%lu) for pid %04x\n", GetLastError(), d.pid); continue; }
		chosen = d;
		return h;
	}
	return INVALID_HANDLE_VALUE;
}

// Sends [1][cmd][len][payload] as a feature report and reads back the reply.
static bool transact(HANDLE h, const Dev &d, BYTE cmd, const std::vector<BYTE> &payload, std::vector<BYTE> &reply, bool quiet = false)
{
	std::vector<BYTE> buf(d.featLen, 0);
	buf[0] = 1; buf[1] = cmd; buf[2] = (BYTE)payload.size();
	for (size_t i = 0; i < payload.size() && 3 + i < buf.size(); ++i) buf[3 + i] = payload[i];
	if (!HidD_SetFeature(h, buf.data(), (ULONG)buf.size()))
	{
		printf("# SetFeature failed: %lu\n", GetLastError());
		return false;
	}
	for (int attempt = 0; attempt < 20; ++attempt)
	{
		std::vector<BYTE> rsp(d.featLen, 0);
		rsp[0] = 1;
		if (HidD_GetFeature(h, rsp.data(), (ULONG)rsp.size()) && rsp[1] == cmd)
		{
			reply = rsp;
			if (!quiet) hexdump("reply:", rsp.data(), (int)std::min<size_t>(rsp.size(), 3 + rsp[2] > 64 ? 64 : 3 + rsp[2]));
			return true;
		}
		Sleep(5);
	}
	if (!quiet) printf("# no matching reply for cmd %02x\n", cmd);
	return false;
}

int main(int argc, char **argv)
{
	if (argc < 2) { printf("usage: see source\n"); return 1; }
	auto devs = enumerate();
	std::string verb = argv[1];
	if (verb == "list")
	{
		for (const auto &d : devs)
			wprintf(L"vid %04x pid %04x usagePage %04x usage %04x feat %u out %u in %u  %s\n", d.vid, d.pid, d.usagePage, d.usage, d.featLen, d.outLen, d.inLen, d.path.c_str());
		return 0;
	}
	Dev d{};
	HANDLE h = openVendor(devs, d);
	if (h == INVALID_HANDLE_VALUE) { printf("# no vendor collection opened\n"); return 2; }
	printf("# using pid %04x feat %u out %u\n", d.pid, d.featLen, d.outLen);
	std::vector<BYTE> reply;
	if (verb == "cmd" && argc >= 3)
	{
		BYTE cmd = (BYTE)strtoul(argv[2], nullptr, 16);
		std::vector<BYTE> payload;
		for (int i = 3; i < argc; ++i) payload.push_back((BYTE)strtoul(argv[i], nullptr, 16));
		transact(h, d, cmd, payload, reply);
	}
	else if (verb == "settings" || verb == "defaults" || verb == "maxs")
	{
		BYTE cmd = verb == "settings" ? 0x89 : verb == "defaults" ? 0x8C : 0x8B;
		// Ask in batches of 16 ids (3 bytes each = 48 bytes payload).
		for (int first = 0; first < 96; first += 1)
		{
			std::vector<BYTE> payload;
			payload.push_back((BYTE)first); payload.push_back(0); payload.push_back(0);
			if (!transact(h, d, cmd, payload, reply, true)) { printf("# batch %d: no reply\n", first); continue; }
			int len = reply[2];
			for (int off = 0; off + 3 <= len && 3 + off + 2 < (int)reply.size(); off += 3)
			{
				int id = reply[3 + off];
				int val = (short)(reply[4 + off] | (reply[5 + off] << 8));
				printf("setting %3d (0x%02x) = %d\n", id, id, val);
			}
		}
	}
	else if (verb == "store-get" && argc >= 3)
	{
		std::vector<BYTE> payload(argv[2], argv[2] + strlen(argv[2]));
		payload.push_back(0);
		if (transact(h, d, 0xED, payload, reply, true))
		{
			int len = reply[2];
			printf("key %s -> len %d:", argv[2], len);
			for (int i = 0; i < len && 3 + i < (int)reply.size(); ++i) printf(" %02x", reply[3 + i]);
			printf("\n");
		}
	}
	else if (verb == "store-set" && argc >= 4)
	{
		std::vector<BYTE> payload(argv[2], argv[2] + strlen(argv[2]));
		payload.push_back(0);
		for (int i = 3; i < argc; ++i) payload.push_back((BYTE)strtoul(argv[i], nullptr, 16));
		transact(h, d, 0xEE, payload, reply);
	}
	else if (verb == "out" && argc >= 3)
	{
		std::vector<BYTE> buf(d.outLen ? d.outLen : 64, 0);
		for (int i = 2; i < argc && (size_t)(i - 2) < buf.size(); ++i) buf[i - 2] = (BYTE)strtoul(argv[i], nullptr, 16);
		DWORD written = 0;
		BOOL ok = WriteFile(h, buf.data(), (DWORD)buf.size(), &written, nullptr);
		printf("write ok=%d written=%lu err=%lu\n", ok, written, ok ? 0 : GetLastError());
	}
	else printf("unknown verb\n");
	CloseHandle(h);
	return 0;
}


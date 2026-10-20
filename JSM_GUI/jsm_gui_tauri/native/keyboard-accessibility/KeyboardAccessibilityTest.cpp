#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <cstdio>
#include <string>
#include <vector>
#include <algorithm>
#include <chrono>

int main() {
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    HWND source = CreateWindowExW(WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW,
        L"STATIC", L"JSM Evolved Keyboard", WS_POPUP,
        50, 50, 320, 160, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
    if (!source) return 1;
    const std::wstring argument = std::to_wstring(reinterpret_cast<size_t>(source)) + L" 1246973259";
    wchar_t programFiles[MAX_PATH]{};
    GetEnvironmentVariableW(L"ProgramFiles", programFiles, MAX_PATH);
    const std::wstring path = std::wstring(programFiles) + L"\\JSM Evolved\\Accessibility\\jsm-keyboard-accessibility.exe";
    SHELLEXECUTEINFOW launch{};
    launch.cbSize = sizeof(launch);
    launch.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_FLAG_NO_UI;
    launch.lpFile = path.c_str();
    launch.lpParameters = argument.c_str();
    launch.nShow = SW_SHOWNOACTIVATE;
    if (!ShellExecuteExW(&launch) || !launch.hProcess) { DestroyWindow(source); return 2; }
    const DWORD pid = GetProcessId(launch.hProcess);
    HWND mirror = nullptr;
    for (int i = 0; i < 100 && !mirror; ++i) {
        struct Search { DWORD pid; HWND found; } search{pid, nullptr};
        EnumWindows([](HWND h, LPARAM data) -> BOOL {
            auto& state = *reinterpret_cast<Search*>(data);
            DWORD owner = 0; GetWindowThreadProcessId(h, &owner);
            wchar_t cls[128]{}; GetClassNameW(h, cls, 128);
            if (owner == state.pid && wcscmp(cls, L"JSMKeyboardAccessibility") == 0) { state.found = h; return FALSE; }
            return TRUE;
        }, reinterpret_cast<LPARAM>(&search));
        mirror = search.found;
        Sleep(20);
    }
    int failures = 0;
    auto check = [&](bool result, const char* label) {
        std::printf("%s: %s\n", result ? "PASS" : "FAIL", label);
        if (!result) ++failures;
    };
    check(mirror != nullptr, "signed helper launches through Windows shell");
    if (mirror) {
        const auto style = GetWindowLongPtrW(mirror, GWL_EXSTYLE);
        check((style & (WS_EX_TRANSPARENT | WS_EX_NOACTIVATE)) == (WS_EX_TRANSPARENT | WS_EX_NOACTIVATE), "display is click-through and never activates");
        check((style & WS_EX_LAYERED) != 0, "native layered window owns the displayed pixels");
        check((style & WS_EX_TOPMOST) == 0, "display initializes outside the UIAccess topmost band");
        check(!IsWindowVisible(mirror), "hidden source keeps display hidden");
        HWND focus = GetForegroundWindow();
        ShowWindow(source, SW_SHOWNOACTIVATE);
        Sleep(120);
        check(!IsWindowVisible(mirror), "display waits for a live frame instead of showing a blank surface");
        const wchar_t json[] = LR"({"theme":"dark","accent":"cyan","frame":{"open":true,"ready":true,"layout":"standard","preferences":{"appearance":"dark","shortcuts":{"standard":{"move":"R3","scale":"R","reset":"L+R","symbols":"L"}}},"controllerType":0,"stick":[0,0],"rows":[["a","b","c"]],"petals":[],"left":0,"right":null,"selected":0,"leftTouch":null,"rightTouch":null}})";
        COPYDATASTRUCT data{1246973259, sizeof(json), const_cast<wchar_t*>(json)};
        for (int i = 0; i < 250 && !IsWindowVisible(mirror); ++i) {
            DWORD_PTR received = 0;
            SetLastError(0);
            auto delivered = SendMessageTimeoutW(mirror, WM_COPYDATA, reinterpret_cast<WPARAM>(source), reinterpret_cast<LPARAM>(&data), SMTO_ABORTIFHUNG, 50, &received);
            if (i == 249) std::printf("Frame delivery=%lld accepted=%llu error=%lu\n", static_cast<long long>(delivered), static_cast<unsigned long long>(received), GetLastError());
            MSG message{};
            while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&message); DispatchMessageW(&message); }
            Sleep(20);
        }
        check(IsWindowVisible(mirror) != FALSE, "visible keyboard shows display");
        for (int i = 0; i < 100 && !GetPropW(mirror, L"JSM.Keyboard.PresentedFrames"); ++i) {
            DWORD_PTR received = 0;
            SendMessageTimeoutW(mirror, WM_COPYDATA, reinterpret_cast<WPARAM>(source), reinterpret_cast<LPARAM>(&data), SMTO_ABORTIFHUNG, 50, &received);
            Sleep(20);
        }
        check(GetPropW(mirror, L"JSM.Keyboard.PresentedFrames") != nullptr, "nontransparent keyboard pixels reach the native display");
        struct RendererSearch { std::wstring title; HWND found; } rendererSearch{
            L"JSM Keyboard Renderer " + std::to_wstring(reinterpret_cast<size_t>(source)), nullptr};
        EnumWindows([](HWND window, LPARAM context) -> BOOL {
            auto& search = *reinterpret_cast<RendererSearch*>(context);
            wchar_t title[128]{}; GetWindowTextW(window, title, 128);
            if (search.title == title) { search.found = window; return FALSE; }
            return TRUE;
        }, reinterpret_cast<LPARAM>(&rendererSearch));
        check(rendererSearch.found &&
            !(GetWindowLongPtrW(rendererSearch.found, GWL_STYLE) & (WS_CAPTION | WS_THICKFRAME)) &&
            !(GetWindowLongPtrW(rendererSearch.found, GWL_EXSTYLE) &
                (WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE | WS_EX_DLGMODALFRAME | WS_EX_STATICEDGE)),
            "captured renderer has no native rectangular frame");
        auto initialPresentations = reinterpret_cast<ULONG_PTR>(GetPropW(mirror, L"JSM.Keyboard.PresentedFrames"));
        ULONG_PTR initialCaptured = 0, initialCopied = 0;
        const auto redrawStart = GetTickCount64();
        unsigned animationStep = 0;
        HANDLE redrawPacing = CreateWaitableTimerExW(nullptr, nullptr, CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS);
        bool warmed = false;
        while (GetTickCount64() - redrawStart < 1500) {
            if (!warmed && GetTickCount64() - redrawStart >= 500) {
                initialPresentations = reinterpret_cast<ULONG_PTR>(GetPropW(mirror, L"JSM.Keyboard.PresentedFrames"));
                warmed = true;
                initialCaptured = reinterpret_cast<ULONG_PTR>(GetPropW(mirror, L"JSM.Keyboard.CapturedFrames"));
                initialCopied = reinterpret_cast<ULONG_PTR>(GetPropW(mirror, L"JSM.Keyboard.CopiedFrames"));
            }
            std::wstring animated = json;
            const auto selection = animated.find(L"\"left\":0");
            animated.replace(selection, 8, L"\"left\":" + std::to_wstring(animationStep++ % 3));
            const auto touch = animated.find(L"\"leftTouch\":null");
            animated.replace(touch, 16, L"\"leftTouch\":[" + std::to_wstring((animationStep % 1000) / 500.0 - 1.0) + L",0]");
            COPYDATASTRUCT animatedData{1246973259, static_cast<DWORD>((animated.size() + 1) * sizeof(wchar_t)), animated.data()};
            DWORD_PTR received = 0;
            SendMessageTimeoutW(mirror, WM_COPYDATA, reinterpret_cast<WPARAM>(source), reinterpret_cast<LPARAM>(&animatedData), SMTO_ABORTIFHUNG, 50, &received);
            MSG message{};
            while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&message); DispatchMessageW(&message); }
            if (redrawPacing) {
                LARGE_INTEGER due{}; due.QuadPart = -30000;
                SetWaitableTimer(redrawPacing, &due, 0, nullptr, nullptr, FALSE);
                WaitForSingleObject(redrawPacing, 20);
            } else Sleep(1);
        }
        if (redrawPacing) CloseHandle(redrawPacing);
        const auto redraws = reinterpret_cast<ULONG_PTR>(GetPropW(mirror, L"JSM.Keyboard.PresentedFrames")) - initialPresentations;
        MONITORINFOEXW monitor{}; monitor.cbSize = sizeof(monitor);
        GetMonitorInfoW(MonitorFromWindow(source, MONITOR_DEFAULTTONEAREST), &monitor);
        DEVMODEW mode{}; mode.dmSize = sizeof(mode);
        EnumDisplaySettingsW(monitor.szDevice, ENUM_CURRENT_SETTINGS, &mode);
        std::printf("Native presentations in 1 second: %llu; monitor refresh: %lu Hz\n", static_cast<unsigned long long>(redraws), mode.dmDisplayFrequency);
        std::printf("Browser animation rate: %llu FPS\n", static_cast<unsigned long long>(reinterpret_cast<ULONG_PTR>(GetPropW(mirror, L"JSM.Keyboard.AnimationRate"))));
        std::printf("Captured/copied in 1 second: %llu/%llu\n", static_cast<unsigned long long>(reinterpret_cast<ULONG_PTR>(GetPropW(mirror, L"JSM.Keyboard.CapturedFrames")) - initialCaptured), static_cast<unsigned long long>(reinterpret_cast<ULONG_PTR>(GetPropW(mirror, L"JSM.Keyboard.CopiedFrames")) - initialCopied));
        check(redraws >= mode.dmDisplayFrequency * 0.8, "animated display follows the monitor refresh rate");
        check(reinterpret_cast<ULONG_PTR>(GetPropW(mirror, L"JSM.Keyboard.MaximumAlpha")) >= 128, "hiding the browser host does not fade the captured keyboard");
        check((GetWindowLongPtrW(mirror, GWL_EXSTYLE) & WS_EX_TOPMOST) != 0, "ready display is promoted above applications");
        check(GetForegroundWindow() == focus, "showing display preserves foreground focus");
        // Measure native movement independently of HTML drawing. The original
        // polling helper can pass geometry checks while visibly trailing input.
        std::vector<double> latency;
        bool followed = true;
        HANDLE pacing = CreateWaitableTimerExW(nullptr, nullptr, CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS);
        for (int i = 0; i < 40; ++i) {
            DWORD_PTR received = 0;
            SendMessageTimeoutW(mirror, WM_COPYDATA, reinterpret_cast<WPARAM>(source), reinterpret_cast<LPARAM>(&data), SMTO_ABORTIFHUNG, 50, &received);
            const int x = 50 + i * 3;
            const auto begin = std::chrono::steady_clock::now();
            SetWindowPos(source, nullptr, x, 60, 0, 0, SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOSIZE);
            RECT actual{};
            do {
                MSG message{};
                while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&message); DispatchMessageW(&message); }
                GetWindowRect(mirror, &actual);
                if (actual.left == x && actual.top == 60) break;
                if (pacing) {
                    LARGE_INTEGER due{}; due.QuadPart = -5000;
                    SetWaitableTimer(pacing, &due, 0, nullptr, nullptr, FALSE);
                    WaitForSingleObject(pacing, 5);
                } else Sleep(1);
            } while (std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - begin).count() < 150);
            latency.push_back(std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - begin).count());
            followed = followed && actual.left == x && actual.top == 60;
        }
        if (pacing) CloseHandle(pacing);
        std::sort(latency.begin(), latency.end());
        check(followed, "all 40 movement samples reach requested position");
        std::printf("Movement latency: median %.2f ms, p95 %.2f ms, max %.2f ms\n", latency[20], latency[37], latency.back());
        bool scaled = true;
        for (int i = 0; i < 30; ++i) {
            const int width = i < 15 ? 320 - i * 10 : 180 + (i - 15) * 20;
            SetWindowPos(source, nullptr, 80, 90, width, width / 2, SWP_NOACTIVATE | SWP_NOZORDER);
            for (int retry = 0; retry < 30 && reinterpret_cast<ULONG_PTR>(GetPropW(mirror, L"JSM.Keyboard.PresentedWidth")) != static_cast<ULONG_PTR>(width); ++retry) {
                MSG message{};
                while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&message); DispatchMessageW(&message); }
                Sleep(1);
            }
            scaled = scaled && reinterpret_cast<ULONG_PTR>(GetPropW(mirror, L"JSM.Keyboard.PresentedWidth")) == static_cast<ULONG_PTR>(width)
                && reinterpret_cast<ULONG_PTR>(GetPropW(mirror, L"JSM.Keyboard.PresentedHeight")) == static_cast<ULONG_PTR>(width / 2);
        }
        check(scaled, "every shrink and grow sample redraws the complete image immediately");
        SetWindowPos(source, nullptr, 80, 90, 400, 180, SWP_NOACTIVATE | SWP_NOZORDER);
        Sleep(120);
        RECT bounds{}; GetWindowRect(mirror, &bounds);
        check(bounds.left == 80 && bounds.top == 90 && bounds.right == 480 && bounds.bottom == 270, "display follows keyboard move and resize");
        ShowWindow(source, SW_HIDE);
        Sleep(120);
        check(!IsWindowVisible(mirror), "closing keyboard hides display");
    }
    DestroyWindow(source);
    check(WaitForSingleObject(launch.hProcess, 2000) == WAIT_OBJECT_0, "display exits when source is destroyed");
    CloseHandle(launch.hProcess);
    return failures ? 3 : 0;
}

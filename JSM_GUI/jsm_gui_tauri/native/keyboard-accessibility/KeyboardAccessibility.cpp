// A display-only UIAccess host. Studio owns keyboard input and sends JSON frames.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <dwmapi.h>
#include <dcomp.h>
#include <shellapi.h>
#include <shlobj.h>
#include <wrl.h>
#include "RawKeyboardCapture.h"
#include <WebView2EnvironmentOptions.h>
#include <WebView2.h>
#include <cwchar>
#include <string>
#include <fstream>
using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Callback;
namespace {
HWND source = nullptr;
HWND displayWindow = nullptr;
HWND rendererWindow = nullptr;
DWORD sourcePid = 0;
ComPtr<ICoreWebView2Controller> controller;
ComPtr<ICoreWebView2> webview;
ComPtr<ICoreWebView2CompositionController> composition;
ComPtr<IDCompositionDevice> device;
ComPtr<IDCompositionTarget> target;
ComPtr<IDCompositionVisual> visual;
RECT previous{};
bool showing = false, loaded = false;
ULONGLONG lastFrame = 0;
ULONG_PTR frameTag = 0;
ULONGLONG lastPaint = 0;
ULONG_PTR presentedFrames = 0;
RawKeyboardCapture capture;
constexpr UINT RAW_FRAME = WM_APP + 1;
std::vector<BYTE> renderedPixels;
UINT renderedWidth = 0, renderedHeight = 0;
int backingWidth = 0, backingHeight = 0;
void presentDisplay();
HWND rendererCaptureWindow() {
    if (!webview) return nullptr;
    UINT32 browserPid = 0;
    if (FAILED(webview->get_BrowserProcessId(&browserPid))) return nullptr;
    RECT expected{}; GetWindowRect(rendererWindow, &expected);
    const auto identifier = L"JSM Keyboard Renderer " + std::to_wstring(reinterpret_cast<size_t>(source));
    struct Search { DWORD pid; RECT expected; const wchar_t* title; HWND found; } search{browserPid, expected, identifier.c_str(), nullptr};
    EnumWindows([](HWND hwnd, LPARAM context) -> BOOL {
        auto& item = *reinterpret_cast<Search*>(context);
        DWORD pid = 0; GetWindowThreadProcessId(hwnd, &pid);
        if (pid != item.pid) return TRUE;
        wchar_t title[128]{}; GetWindowTextW(hwnd, title, 128);
        RECT bounds{}; GetWindowRect(hwnd, &bounds);
        if (wcscmp(title, item.title) == 0 && EqualRect(&bounds, &item.expected)) {
            // The browser's detached host must neither accept clicks nor show
            // a second keyboard underneath the native accessibility surface.
            // WebView2's detached top-level host retains a native caption/frame.
            // WGC includes that frame in its pixels, even when the host itself
            // is almost invisible. Remove it before starting capture.
            auto windowStyle = GetWindowLongPtrW(hwnd, GWL_STYLE);
            SetWindowLongPtrW(hwnd, GWL_STYLE, windowStyle & ~(WS_CAPTION | WS_THICKFRAME));
            auto style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, (style | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW) &
                ~(WS_EX_APPWINDOW | WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE | WS_EX_DLGMODALFRAME | WS_EX_STATICEDGE));
            SetWindowPos(hwnd, nullptr, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
            SetLayeredWindowAttributes(hwnd, 0, 1, LWA_ALPHA);
            item.found = hwnd; return FALSE;
        }
        return TRUE;
    }, reinterpret_cast<LPARAM>(&search));
    return search.found;
}
std::wstring origin = L"https://keyboard.jsm.invalid/";
void diagnostic(const char* stage, HRESULT result) {
    wchar_t local[MAX_PATH]{};
    if (SUCCEEDED(SHGetFolderPathW(nullptr, CSIDL_LOCAL_APPDATA, nullptr, 0, local))) {
        std::wofstream log(std::wstring(local) + L"\\JSM Evolved\\keyboard-accessibility.log", std::ios::app);
        log << stage << L" 0x" << std::hex << static_cast<unsigned long>(result) << L"\n";
    }
}
void transparentSurface(HWND window) {
    HRGN region = CreateRectRgn(0, 0, -1, -1);
    DWM_BLURBEHIND blur{};
    blur.dwFlags = DWM_BB_ENABLE | DWM_BB_BLURREGION;
    blur.fEnable = TRUE; blur.hRgnBlur = region;
    DwmEnableBlurBehindWindow(window, &blur);
    DeleteObject(region);
}
bool validSource(HWND window) {
    DWORD pid = 0; GetWindowThreadProcessId(window, &pid);
    if (!pid || (sourcePid && pid != sourcePid)) return false;
    wchar_t title[128]{}; GetWindowTextW(window, title, 128);
    if (wcscmp(title, L"JSM Evolved Keyboard") != 0) return false;
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!process) return false;
    wchar_t path[32768]{}; DWORD length = 32768;
    bool valid = QueryFullProcessImageNameW(process, 0, path, &length) != FALSE;
    CloseHandle(process);
    const wchar_t* name = wcsrchr(path, L'\\');
    valid = valid && name && _wcsicmp(name + 1, L"JSM Evolved.exe") == 0;
    if (valid) sourcePid = pid;
    return valid;
}

void syncGeometry(HWND window) {
    DWORD pid = 0; GetWindowThreadProcessId(source, &pid);
    if (!IsWindow(source) || pid != sourcePid) { DestroyWindow(window); return; }
    if (!controller || !lastFrame || GetTickCount64() - lastFrame > 1000 ||
        !IsWindowVisible(source) || IsIconic(source)) {
        if (showing) {
            ShowWindow(window, SW_HIDE);
            controller->put_IsVisible(FALSE);
        }
        showing = false; return;
    }
    RECT bounds{};
    if (!GetWindowRect(source, &bounds)) { DestroyWindow(window); return; }
    const bool resized = bounds.right - bounds.left != previous.right - previous.left ||
        bounds.bottom - bounds.top != previous.bottom - previous.top;
    const bool moved = bounds.left != previous.left || bounds.top != previous.top;
    if (!showing || moved || resized) {
        RECT client{0, 0, bounds.right - bounds.left, bounds.bottom - bounds.top};
        // Translation is a native window move. Reapplying WebView bounds on
        // every input sample forces needless browser/compositor layout work.
        const bool layoutChanged = backingHeight &&
            std::abs(static_cast<double>(client.right) / client.bottom - static_cast<double>(backingWidth) / backingHeight) > 0.1;
        if (!backingWidth || layoutChanged) {
            capture.stop();
            // Render once at the largest supported scale. Continuous resizing
            // changes only the native presentation transform, never the HTML viewport.
            backingWidth = static_cast<int>(client.right * 1.8);
            backingHeight = static_cast<int>(client.bottom * 1.8);
            RECT backing{0, 0, backingWidth, backingHeight};
            SetWindowPos(rendererWindow, HWND_BOTTOM, bounds.left, bounds.top, backingWidth, backingHeight,
                SWP_NOACTIVATE);
            controller->put_Bounds(backing);
            device->Commit();
        }
        if (!showing) controller->put_IsVisible(TRUE);
        UINT flags = SWP_NOACTIVATE;
        if (!resized) flags |= SWP_NOSIZE;
        if (showing) flags |= SWP_NOZORDER;
        else flags |= SWP_SHOWWINDOW;
        SetWindowPos(window, HWND_TOPMOST, bounds.left, bounds.top,
            client.right, client.bottom, flags);
        if (moved) controller->NotifyParentWindowPositionChanged();
        if (resized) device->Commit();
        previous = bounds; showing = true;
        if (resized) presentDisplay();
    }
    if (!capture.active()) {
        if (auto browserWindow = rendererCaptureWindow())
            diagnostic("raw-capture", capture.start(browserWindow, window, RAW_FRAME));
    }
}

// Keep the complete most recent frame while the native window scales. Raw
// frames replace it as they arrive; window geometry never crops an old bitmap.
void presentDisplay() {
    if (!showing || renderedPixels.empty() || !displayWindow) return;
    RECT bounds{}; if (!GetWindowRect(displayWindow, &bounds)) return;
    const LONG width = bounds.right - bounds.left, height = bounds.bottom - bounds.top;
    if (width <= 0 || height <= 0) return;
    BITMAPINFO input{};
    input.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    input.bmiHeader.biWidth = static_cast<LONG>(renderedWidth);
    input.bmiHeader.biHeight = -static_cast<LONG>(renderedHeight);
    input.bmiHeader.biPlanes = 1; input.bmiHeader.biBitCount = 32;
    BITMAPINFO output = input;
    output.bmiHeader.biWidth = width; output.bmiHeader.biHeight = -height;
    HDC screen = GetDC(nullptr), memory = CreateCompatibleDC(screen);
    void* bits = nullptr;
    HBITMAP bitmap = CreateDIBSection(screen, &output, DIB_RGB_COLORS, &bits, nullptr, 0);
    if (memory && bitmap && bits) {
        HGDIOBJ old = SelectObject(memory, bitmap);
        SetStretchBltMode(memory, COLORONCOLOR);
        StretchDIBits(memory, 0, 0, width, height, 0, 0, renderedWidth, renderedHeight,
            renderedPixels.data(), &input, DIB_RGB_COLORS, SRCCOPY);
        POINT destination{bounds.left, bounds.top}, originPoint{};
        SIZE size{width, height};
        BLENDFUNCTION blend{AC_SRC_OVER, 0, 255, AC_SRC_ALPHA};
        if (UpdateLayeredWindow(displayWindow, screen, &destination, &size, memory, &originPoint, 0, &blend, ULW_ALPHA)) {
            lastPaint = GetTickCount64();
            SetPropW(displayWindow, L"JSM.Keyboard.PresentedFrames", reinterpret_cast<HANDLE>(++presentedFrames));
            SetPropW(displayWindow, L"JSM.Keyboard.RenderWidth", reinterpret_cast<HANDLE>(static_cast<ULONG_PTR>(renderedWidth)));
            SetPropW(displayWindow, L"JSM.Keyboard.RenderHeight", reinterpret_cast<HANDLE>(static_cast<ULONG_PTR>(renderedHeight)));
            SetPropW(displayWindow, L"JSM.Keyboard.PresentedWidth", reinterpret_cast<HANDLE>(static_cast<ULONG_PTR>(width)));
            SetPropW(displayWindow, L"JSM.Keyboard.PresentedHeight", reinterpret_cast<HANDLE>(static_cast<ULONG_PTR>(height)));
        } else diagnostic("present", HRESULT_FROM_WIN32(GetLastError()));
        SelectObject(memory, old);
    }
    if (bitmap) DeleteObject(bitmap);
    if (memory) DeleteDC(memory);
    if (screen) ReleaseDC(nullptr, screen);
}

void CALLBACK sourceChanged(HWINEVENTHOOK, DWORD event, HWND window, LONG object, LONG child, DWORD, DWORD) {
    if (window != source || object != OBJID_WINDOW || child != CHILDID_SELF || !displayWindow) return;
    if (event == EVENT_OBJECT_LOCATIONCHANGE || event == EVENT_OBJECT_SHOW ||
        event == EVENT_OBJECT_HIDE || event == EVENT_OBJECT_DESTROY) {
        syncGeometry(displayWindow);
    }
}

LRESULT CALLBACK procedure(HWND window, UINT message, WPARAM wp, LPARAM lp) {
    switch (message) {
    case RAW_FRAME: {
        static std::vector<BYTE> incoming;
        UINT width = 0, height = 0;
        if (capture.take(incoming, width, height)) {
            BYTE maximumAlpha = 0;
            for (size_t i = 3; i < incoming.size(); i += 4) maximumAlpha = (std::max)(maximumAlpha, incoming[i]);
            SetPropW(window, L"JSM.Keyboard.MaximumAlpha", reinterpret_cast<HANDLE>(static_cast<ULONG_PTR>(maximumAlpha)));
            SetPropW(window, L"JSM.Keyboard.CapturedFrames", reinterpret_cast<HANDLE>(static_cast<ULONG_PTR>(capture.capturedFrames())));
            SetPropW(window, L"JSM.Keyboard.CopiedFrames", reinterpret_cast<HANDLE>(static_cast<ULONG_PTR>(capture.copiedFrames())));
            if (maximumAlpha >= 16) {
                renderedPixels.swap(incoming); renderedWidth = width; renderedHeight = height;
                presentDisplay();
            }
        }
        return 0;
    }
    case WM_MOUSEACTIVATE: return MA_NOACTIVATE;
    case WM_NCHITTEST: return HTTRANSPARENT;
    case WM_ERASEBKGND: return 1;
    case WM_DWMCOMPOSITIONCHANGED: return 0;
    case WM_COPYDATA: {
        auto data = reinterpret_cast<COPYDATASTRUCT*>(lp);
        if (reinterpret_cast<HWND>(wp) != source || !data || data->dwData != frameTag ||
            !data->lpData || data->cbData < sizeof(wchar_t) || data->cbData > 131072 ||
            data->cbData % sizeof(wchar_t) != 0 || !loaded) return FALSE;
        auto json = static_cast<const wchar_t*>(data->lpData);
        if (json[data->cbData / sizeof(wchar_t) - 1] != 0) return FALSE;
        if (FAILED(webview->PostWebMessageAsJson(json))) return FALSE;
        lastFrame = GetTickCount64();
        syncGeometry(window);
        // Transport acceptance is not proof of a working display. Studio must
        // keep drawing its fallback until native pixels have been presented.
        return lastPaint && capture.active();
    }
    case WM_TIMER: {
        // Low-frequency lifecycle watchdog only. Movement follows native
        // location events rather than a quantized WM_TIMER polling cadence.
        syncGeometry(window);
        return 0;
    }
    case WM_DESTROY: PostQuitMessage(0); return 0;
    }
    return DefWindowProcW(window, message, wp, lp);
}
bool startRenderer(HWND window) {
    wchar_t executable[32768]{}; GetModuleFileNameW(nullptr, executable, 32768);
    std::wstring assets(executable);
    assets = assets.substr(0, assets.find_last_of(L'\\')) + L"\\web";
    wchar_t local[MAX_PATH]{};
    if (FAILED(SHGetFolderPathW(nullptr, CSIDL_LOCAL_APPDATA, nullptr, 0, local))) return false;
    std::wstring data = std::wstring(local) + L"\\JSM Evolved\\AccessibilityWebView";
    auto options = Microsoft::WRL::Make<CoreWebView2EnvironmentOptions>();
    options->put_AdditionalBrowserArguments(L"--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion");
    return SUCCEEDED(CreateCoreWebView2EnvironmentWithOptions(nullptr, data.c_str(), options.Get(),
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>([window, assets](HRESULT result, ICoreWebView2Environment* environment) -> HRESULT {
            diagnostic("environment", result);
            if (FAILED(result) || !environment) { DestroyWindow(window); return S_OK; }
            ComPtr<ICoreWebView2Environment3> environment3;
            if (FAILED(environment->QueryInterface(IID_PPV_ARGS(&environment3)))) { DestroyWindow(window); return S_OK; }
            return environment3->CreateCoreWebView2CompositionController(rendererWindow,
                Callback<ICoreWebView2CreateCoreWebView2CompositionControllerCompletedHandler>([window, assets](HRESULT result, ICoreWebView2CompositionController* view) -> HRESULT {
                    diagnostic("controller", result);
                    if (FAILED(result) || !view) { DestroyWindow(window); return S_OK; }
                    composition = view;
                    if (FAILED(view->QueryInterface(IID_PPV_ARGS(&controller))) ||
                        FAILED(DCompositionCreateDevice(nullptr, IID_PPV_ARGS(&device))) ||
                        FAILED(device->CreateTargetForHwnd(rendererWindow, TRUE, &target)) ||
                        FAILED(device->CreateVisual(&visual)) || FAILED(target->SetRoot(visual.Get())) ||
                        FAILED(view->put_RootVisualTarget(visual.Get()))) {
                        DestroyWindow(window); return S_OK;
                    }
                    device->Commit();
                    controller->get_CoreWebView2(&webview);
                    ComPtr<ICoreWebView2Controller2> alpha;
                    if (FAILED(controller.As(&alpha))) { DestroyWindow(window); return S_OK; }
                    alpha->put_DefaultBackgroundColor({0, 0, 0, 0});
                    controller->put_IsVisible(FALSE);
                    ComPtr<ICoreWebView2_3> mapping;
                    if (FAILED(webview.As(&mapping)) || FAILED(mapping->SetVirtualHostNameToFolderMapping(
                        L"keyboard.jsm.invalid", assets.c_str(), COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY_CORS))) {
                        DestroyWindow(window); return S_OK;
                    }
                    ComPtr<ICoreWebView2Settings> settings; webview->get_Settings(&settings);
                    settings->put_AreDevToolsEnabled(FALSE);
                    settings->put_AreDefaultContextMenusEnabled(FALSE);
                    settings->put_AreHostObjectsAllowed(FALSE);
                    settings->put_IsStatusBarEnabled(FALSE);
                    EventRegistrationToken event{};
                    webview->add_WebMessageReceived(Callback<ICoreWebView2WebMessageReceivedEventHandler>(
                        [window](ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* args) -> HRESULT {
                            LPWSTR message = nullptr;
                            if (SUCCEEDED(args->TryGetWebMessageAsString(&message)) && message && wcsncmp(message, L"jsm-raf:", 8) == 0) {
                                SetPropW(window, L"JSM.Keyboard.AnimationRate", reinterpret_cast<HANDLE>(static_cast<ULONG_PTR>(wcstoul(message + 8, nullptr, 10))));
                            }
                            CoTaskMemFree(message); return S_OK;
                        }).Get(), &event);
                    webview->add_NavigationStarting(Callback<ICoreWebView2NavigationStartingEventHandler>(
                        [](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* args) -> HRESULT {
                            LPWSTR uri = nullptr; args->get_Uri(&uri);
                            if (!uri || std::wstring(uri).rfind(origin, 0) != 0) args->put_Cancel(TRUE);
                            CoTaskMemFree(uri); return S_OK;
                        }).Get(), &event);
                    webview->add_NewWindowRequested(Callback<ICoreWebView2NewWindowRequestedEventHandler>(
                        [](ICoreWebView2*, ICoreWebView2NewWindowRequestedEventArgs* args) -> HRESULT {
                            args->put_Handled(TRUE); return S_OK;
                        }).Get(), &event);
                    webview->add_PermissionRequested(Callback<ICoreWebView2PermissionRequestedEventHandler>(
                        [](ICoreWebView2*, ICoreWebView2PermissionRequestedEventArgs* args) -> HRESULT {
                            args->put_State(COREWEBVIEW2_PERMISSION_STATE_DENY); return S_OK;
                        }).Get(), &event);
                    webview->add_NavigationCompleted(Callback<ICoreWebView2NavigationCompletedEventHandler>(
                        [](ICoreWebView2*, ICoreWebView2NavigationCompletedEventArgs* args) -> HRESULT {
                            BOOL success = FALSE; args->get_IsSuccess(&success); loaded = success != FALSE;
                            COREWEBVIEW2_WEB_ERROR_STATUS error{}; args->get_WebErrorStatus(&error);
                            diagnostic("navigation", static_cast<HRESULT>(error));
                            if (loaded) {
                                const auto script = L"document.title='JSM Keyboard Renderer " + std::to_wstring(reinterpret_cast<size_t>(source)) +
                                    L"';(()=>{let begin=performance.now(),frames=0;function tick(now){frames++;if(now-begin>=1000){chrome.webview.postMessage('jsm-raf:'+Math.round(frames*1000/(now-begin)));frames=0;begin=now}requestAnimationFrame(tick)}requestAnimationFrame(tick)})()";
                                webview->ExecuteScript(script.c_str(), nullptr);
                            }
                            return S_OK;
                        }).Get(), &event);
                    return webview->Navigate((origin + L"keyboard.html?accessibility").c_str());
                }).Get());
        }).Get()));
}
}
int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int) {
    SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32);
    HANDLE token = nullptr; DWORD access = 0, bytes = 0;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return 2;
    const bool trusted = GetTokenInformation(token, TokenUIAccess, &access, sizeof(access), &bytes) && access;
    CloseHandle(token); if (!trusted) return 3;
    int count = 0; wchar_t** args = CommandLineToArgvW(GetCommandLineW(), &count);
    if (!args || count != 3) { if (args) LocalFree(args); return 4; }
    wchar_t* end = nullptr; const auto value = _wcstoui64(args[1], &end, 10);
    bool parsed = end && *end == 0 && value != 0;
    frameTag = static_cast<ULONG_PTR>(_wcstoui64(args[2], &end, 10));
    parsed = parsed && end && *end == 0 && frameTag != 0;
    source = reinterpret_cast<HWND>(value); LocalFree(args);
    if (!parsed || !validSource(source)) return 5;
    std::wstring mutexName = L"Local\\JSM.KeyboardAccessibility." + std::to_wstring(value);
    HANDLE singleton = CreateMutexW(nullptr, FALSE, mutexName.c_str());
    if (!singleton || GetLastError() == ERROR_ALREADY_EXISTS) { if (singleton) CloseHandle(singleton); return 6; }
    if (FAILED(RoInitialize(RO_INIT_SINGLETHREADED))) { CloseHandle(singleton); return 7; }
    rendererWindow = CreateWindowExW(WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW,
        L"STATIC", L"JSM Keyboard Offscreen Renderer", WS_POPUP,
        -30000, -30000, 1, 1, nullptr, nullptr, instance, nullptr);
    struct RendererLifetime { ~RendererLifetime() { if (rendererWindow) DestroyWindow(rendererWindow); rendererWindow = nullptr; } } rendererLifetime;
    if (!rendererWindow) { RoUninitialize(); CloseHandle(singleton); return 12; }
    SetLayeredWindowAttributes(rendererWindow, 0, 1, LWA_ALPHA);
    transparentSurface(rendererWindow);
    ShowWindow(rendererWindow, SW_SHOWNOACTIVATE);
    WNDCLASSW cls{}; cls.hInstance = instance; cls.lpfnWndProc = procedure;
    cls.lpszClassName = L"JSMKeyboardAccessibility";
    if (!RegisterClassW(&cls)) { RoUninitialize(); CloseHandle(singleton); return 8; }
    std::wstring title = L"JSM Evolved Accessible Keyboard " + std::to_wstring(value);
    // This native surface owns the displayed pixels and the UIAccess band.
    // The browser renders off screen and never supplies a visible HWND.
    HWND window = CreateWindowExW(WS_EX_LAYERED | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT,
        cls.lpszClassName, title.c_str(), WS_POPUP, 0, 0, 1, 1, nullptr, nullptr, instance, nullptr);
    displayWindow = window;
    // UIAccess may be high-plus while Studio is high. Open just the read-only
    // frame message, authenticated with a random session tag and source HWND.
    if (window && !ChangeWindowMessageFilterEx(window, WM_COPYDATA, MSGFLT_ALLOW, nullptr)) {
        DestroyWindow(window); RoUninitialize(); CloseHandle(singleton); return 10;
    }
    HWINEVENTHOOK hook = SetWinEventHook(EVENT_OBJECT_DESTROY, EVENT_OBJECT_LOCATIONCHANGE,
        nullptr, sourceChanged, sourcePid, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
    if (!window || !hook || !startRenderer(window) || !SetTimer(window, 1, 250, nullptr)) {
        if (hook) UnhookWinEvent(hook);
        if (window) DestroyWindow(window); RoUninitialize(); CloseHandle(singleton); return 9;
    }
    MSG message{};
    while (GetMessageW(&message, nullptr, 0, 0) > 0) { TranslateMessage(&message); DispatchMessageW(&message); }
    UnhookWinEvent(hook); displayWindow = nullptr;
    capture.stop();
    if (controller) controller->Close();
    webview.Reset(); controller.Reset(); composition.Reset(); visual.Reset(); target.Reset(); device.Reset();
    RoUninitialize(); CloseHandle(singleton); return 0;
}

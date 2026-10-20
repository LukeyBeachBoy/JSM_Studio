#pragma once
#include <d3d11.h>
#include <dxgi.h>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <atomic>
#include <memory>
#include <mutex>
#include <vector>
#include <array>
#include <thread>
#include <condition_variable>
#include <algorithm>

// Capture the helper's own renderer. No desktop/game capture, PNG encoding,
// polling timer, or fixed presentation-rate limit is involved.
class RawKeyboardCapture {
    struct State {
        Microsoft::WRL::ComPtr<ID3D11Device> device;
        Microsoft::WRL::ComPtr<ID3D11DeviceContext> context;
        struct Readback {
            Microsoft::WRL::ComPtr<ID3D11Texture2D> texture;
            UINT width = 0, height = 0;
            unsigned long long generation = 0;
            bool pending = false;
        };
        std::array<Readback, 3> readbacks;
        unsigned long long generation = 0;
        winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool pool{nullptr};
        winrt::Windows::Graphics::Capture::GraphicsCaptureSession session{nullptr};
        winrt::event_token token{};
        std::mutex captureMutex, pixelsMutex;
        std::condition_variable ready;
        std::thread worker;
        std::vector<BYTE> pixels;
        UINT width = 0, height = 0;
        bool pending = false;
        std::atomic<bool> running{true};
        std::atomic<unsigned long long> captured{0}, copied{0};
        HWND destination = nullptr;
        UINT message = 0;
    };
    std::shared_ptr<State> state;
public:
    HRESULT start(HWND renderer, HWND destination, UINT message) {
        stop();
        try {
            auto next = std::make_shared<State>();
            next->destination = destination; next->message = message;
            winrt::check_hresult(D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr,
                D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0, D3D11_SDK_VERSION,
                &next->device, nullptr, &next->context));
            Microsoft::WRL::ComPtr<IDXGIDevice> dxgi;
            winrt::check_hresult(next->device.As(&dxgi));
            winrt::com_ptr<IInspectable> inspectable;
            winrt::check_hresult(CreateDirect3D11DeviceFromDXGIDevice(dxgi.Get(), inspectable.put()));
            auto direct = inspectable.as<winrt::Windows::Graphics::DirectX::Direct3D11::IDirect3DDevice>();
            auto interop = winrt::get_activation_factory<winrt::Windows::Graphics::Capture::GraphicsCaptureItem, IGraphicsCaptureItemInterop>();
            winrt::Windows::Graphics::Capture::GraphicsCaptureItem item{nullptr};
            winrt::check_hresult(interop->CreateForWindow(renderer, winrt::guid_of<decltype(item)>(), winrt::put_abi(item)));
            next->pool = winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool::CreateFreeThreaded(
                direct, winrt::Windows::Graphics::DirectX::DirectXPixelFormat::B8G8R8A8UIntNormalized, 2, item.Size());
            next->session = next->pool.CreateCaptureSession(item);
            next->session.IsCursorCaptureEnabled(false);
            MONITORINFOEXW monitor{}; monitor.cbSize = sizeof(monitor);
            DEVMODEW mode{}; mode.dmSize = sizeof(mode);
            if (GetMonitorInfoW(MonitorFromWindow(renderer, MONITOR_DEFAULTTONEAREST), &monitor) &&
                EnumDisplaySettingsW(monitor.szDevice, ENUM_CURRENT_SETTINGS, &mode) && mode.dmDisplayFrequency > 1) {
                // Leave half a refresh period of scheduling margin. Requesting
                // exactly one period can skip alternate compositor frames.
                try { next->session.MinUpdateInterval(winrt::Windows::Foundation::TimeSpan{5000000LL / mode.dmDisplayFrequency}); }
                catch (const winrt::hresult_error&) { /* Older Windows uses its compositor's default cadence. */ }
            }
            try { next->session.IsBorderRequired(false); } catch (const winrt::hresult_error&) { /* Renderer is off screen. */ }
            next->token = next->pool.FrameArrived([next](auto const& pool, auto const&) {
                std::lock_guard captureLock(next->captureMutex);
                if (!next->running) return;
                try {
                    auto frame = pool.TryGetNextFrame();
                    if (!frame) return;
                    ++next->captured;
                    auto access = frame.Surface().as<::Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess>();
                    Microsoft::WRL::ComPtr<ID3D11Texture2D> texture;
                    winrt::check_hresult(access->GetInterface(IID_PPV_ARGS(&texture)));
                    D3D11_TEXTURE2D_DESC desc{}; texture->GetDesc(&desc);
                    auto slot = &next->readbacks[0];
                    for (auto& candidate : next->readbacks)
                        if (!candidate.pending || candidate.generation < slot->generation) slot = &candidate;
                    if (!slot->texture || slot->width != desc.Width || slot->height != desc.Height) {
                        desc.BindFlags = 0; desc.MiscFlags = 0;
                        desc.Usage = D3D11_USAGE_STAGING; desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
                        slot->texture.Reset();
                        winrt::check_hresult(next->device->CreateTexture2D(&desc, nullptr, &slot->texture));
                        slot->width = desc.Width; slot->height = desc.Height;
                    }
                    next->context->CopyResource(slot->texture.Get(), texture.Get());
                    slot->generation = ++next->generation; slot->pending = true;
                    frame.Close();
                    next->ready.notify_one();
                } catch (const winrt::hresult_error&) { /* Studio retains its fallback if frames stop. */ }
            });
            state = next;
            next->worker = std::thread([next] {
                HANDLE pacing = CreateWaitableTimerExW(nullptr, nullptr, CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS);
                while (next->running) {
                    std::unique_lock captureLock(next->captureMutex);
                    next->ready.wait(captureLock, [&] {
                        return !next->running || std::any_of(next->readbacks.begin(), next->readbacks.end(), [](auto const& slot) { return slot.pending; });
                    });
                    if (!next->running) break;
                    State::Readback* slot = nullptr;
                    for (auto& candidate : next->readbacks)
                        if (candidate.pending && (!slot || candidate.generation < slot->generation)) slot = &candidate;
                    D3D11_MAPPED_SUBRESOURCE mapped{};
                    const HRESULT result = next->context->Map(slot->texture.Get(), 0, D3D11_MAP_READ, D3D11_MAP_FLAG_DO_NOT_WAIT, &mapped);
                    if (result == DXGI_ERROR_WAS_STILL_DRAWING) {
                        captureLock.unlock();
                        if (pacing) {
                            LARGE_INTEGER due{}; due.QuadPart = -10000;
                            SetWaitableTimer(pacing, &due, 0, nullptr, nullptr, FALSE);
                            WaitForSingleObject(pacing, 5);
                        } else Sleep(1);
                        continue;
                    }
                    slot->pending = false;
                    if (FAILED(result)) continue;
                    {
                        std::lock_guard pixelLock(next->pixelsMutex);
                        next->width = slot->width; next->height = slot->height;
                        next->pixels.resize(static_cast<size_t>(slot->width) * slot->height * 4);
                        for (UINT row = 0; row < slot->height; ++row)
                            memcpy(next->pixels.data() + static_cast<size_t>(row) * slot->width * 4,
                                static_cast<const BYTE*>(mapped.pData) + static_cast<size_t>(row) * mapped.RowPitch, slot->width * 4);
                        if (!next->pending) next->pending = PostMessageW(next->destination, next->message, 0, 0) != FALSE;
                    }
                    next->context->Unmap(slot->texture.Get(), 0);
                    ++next->copied;
                }
                if (pacing) CloseHandle(pacing);
            });
            next->session.StartCapture();
            return S_OK;
        } catch (const winrt::hresult_error& error) { stop(); return error.code(); }
    }
    bool take(std::vector<BYTE>& pixels, UINT& width, UINT& height) {
        if (!state) return false;
        std::lock_guard lock(state->pixelsMutex);
        state->pending = false;
        if (state->pixels.empty()) return false;
        pixels.swap(state->pixels); width = state->width; height = state->height;
        return true;
    }
    bool active() const { return state != nullptr; }
    unsigned long long capturedFrames() const { return state ? state->captured.load() : 0; }
    unsigned long long copiedFrames() const { return state ? state->copied.load() : 0; }
    void stop() {
        if (!state) return;
        auto previous = std::move(state);
        previous->running = false;
        previous->ready.notify_all();
        previous->pool.FrameArrived(previous->token);
        previous->session.Close(); previous->pool.Close();
        if (previous->worker.joinable()) previous->worker.join();
    }
    ~RawKeyboardCapture() { stop(); }
};

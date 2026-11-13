"""Opt-in Windows measurement against the installed mapper; emits no game input.

Temporarily redirects telemetry, restores its port in finally, and never changes
the active profile or mappings. Run with the editor unfocused, no build in progress:
  python tests/azeron_runtime_performance.py --output build-jsm-sdl/perf.json
  python tests/azeron_runtime_performance.py --workers 8 --output build-jsm-sdl/perf-load.json
CPU is reported in ms/second (1000 = one fully occupied logical processor).
Applied sampleHz is the mapper's rolling loop rate, NOT physical input latency.
"""
import argparse
import ctypes
import json
import pathlib
import socket
import statistics
import subprocess
import time
import sys
from ctypes import wintypes

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--workers', type=int, default=0)
args = parser.parse_args()
assert 0 <= args.workers <= 16
install = pathlib.Path(r'C:\Users\luker\AppData\Local\JSM Evolved')
creation = subprocess.CREATE_NO_WINDOW
processes = json.loads(subprocess.check_output([
    'powershell', '-NoProfile', '-Command',
    "Get-Process -Name 'JoyShockMapper','JSM Evolved','AzeronRecovery' | Select-Object Id,ProcessName,Path | ConvertTo-Json"
], creationflags=creation, text=True))
processes = [p for p in processes if pathlib.Path(p['Path']).is_relative_to(install)]
mapper = next(p for p in processes if p['ProcessName'] == 'JoyShockMapper')
kernel = ctypes.WinDLL('kernel32', use_last_error=True)
kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
kernel.OpenProcess.restype = wintypes.HANDLE
kernel.GetProcessTimes.argtypes = [wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)]*4
kernel.GetProcessTimes.restype = wintypes.BOOL
kernel.CloseHandle.argtypes = [wintypes.HANDLE]
handles = {}
for process in processes:
    handles[process['ProcessName']] = kernel.OpenProcess(0x1000, False, process['Id'])
assert all(handles.values())

def cpu():
    values = {}
    for name, handle in handles.items():
        fields = [wintypes.FILETIME() for _ in range(4)]
        assert kernel.GetProcessTimes(handle, *(ctypes.byref(f) for f in fields))
        values[name] = sum((f.dwHighDateTime << 32) + f.dwLowDateTime for f in fields[2:]) / 10000
    return values

def command(text):
    subprocess.run([str(install/'bin/SDL/jsm-console-injector.exe'), str(mapper['Id']), text],
                   creationflags=creation, check=True, stdout=subprocess.DEVNULL)

workers = []
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind(('127.0.0.1', 18976))
sock.settimeout(.5)
frames = []
try:
    for _ in range(args.workers):
        workers.append(subprocess.Popen([sys.executable, '-c',
            'import time,hashlib; end=time.monotonic()+12; data=b"load"*256\n'
            'while time.monotonic()<end: data=hashlib.sha256(data).digest()'], creationflags=creation))
    command('TELEMETRY_PORT = 18976')
    warmup = time.monotonic()+2
    while time.monotonic()<warmup:
        try: sock.recv(65535)
        except socket.timeout: pass
    before = cpu()
    start = time.monotonic()
    while time.monotonic()-start < 6:
        try: frames.append(json.loads(sock.recv(65535)))
        except socket.timeout: pass
    elapsed = time.monotonic()-start
    after = cpu()
finally:
    command('TELEMETRY_PORT = 8974')
    sock.close()
    for worker in workers:
        if worker.poll() is None: worker.terminate()
        worker.wait()
    for handle in handles.values(): kernel.CloseHandle(handle)

assert len(frames)>100, f'Only {len(frames)} telemetry packets'
devices = [d for frame in frames for d in frame.get('devices',[]) if d['type']==25]
assert devices and all(d.get('nativeInputStatus')=='active' for d in devices)
assert all(not frame.get('configErrors') for frame in frames)
rates = sorted(float(frame.get('sampleHz',0)) for frame in frames if frame.get('sampleHz',0)>0)
results = {
    'workers':args.workers, 'seconds':round(elapsed,3), 'telemetryFrames':len(frames),
    'cpuMillisecondsPerSecond':{name:round((after[name]-before[name])/elapsed,3) for name in before},
    'appliedLoopRateHz':{'min':min(rates), 'median':statistics.median(rates), 'max':max(rates)},
    'nativeStatus':'active', 'deviceTypes':sorted({d['type'] for f in frames for d in f.get('devices',[])}),
    'profiles':sorted({d.get('activeProfile','') for d in devices}), 'configErrors':[],
    'measurementLimit':'Software CPU and rolling mapper loop rate, not physical button-to-game latency.'
}
args.output.write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))

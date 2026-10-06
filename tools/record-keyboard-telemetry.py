"""Timestamp and forward mapper telemetry for a video comparison.

Uses a private UDP port, preserving the app's receiver on 8974. A stop file or
the 15-minute limit restores the mapper's normal telemetry destination.
"""
import argparse
import datetime as dt
import json
import pathlib
import socket
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True, type=pathlib.Path)
parser.add_argument('--injector', required=True, type=pathlib.Path)
parser.add_argument('--minutes', type=float, default=15)
args = parser.parse_args()
args.injector = args.injector.resolve()
args.output = args.output.resolve()
args.output.mkdir(parents=True, exist_ok=True)
flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)

def utc_now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds')

def mapper():
    command = "Get-Process JoyShockMapper -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Id"
    p = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', command],
                       capture_output=True, text=True, creationflags=flags, timeout=5)
    value = p.stdout.strip()
    return int(value) if value.isdigit() else None

def redirect(pid, port):
    p = subprocess.run([str(args.injector), str(pid), f'TELEMETRY_PORT = {port}'],
                       cwd=args.injector.parent, capture_output=True, text=True,
                       creationflags=flags, timeout=5)
    return p.returncode == 0

status = {'state': 'waiting-for-mapper', 'listenerStartedUtc': utc_now(),
          'firstPacketUtc': None, 'lastPacketUtc': None, 'packets': 0,
          'devicesSeen': [], 'activeProfile': None, 'privatePort': 18974,
          'forwardPort': 8974, 'maxMinutes': args.minutes}
def save_status():
    temp = args.output / 'status.tmp'
    temp.write_text(json.dumps(status, indent=2), encoding='utf-8')
    temp.replace(args.output / 'status.json')

receiver = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
receiver.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4 * 1024 * 1024)
receiver.bind(('127.0.0.1', 18974))
receiver.settimeout(0.1)
forward = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
started = time.perf_counter()
last_packet = 0.0
last_probe = 0.0
last_status = 0.0
owner = None
save_status()
print(json.dumps(status), flush=True)
try:
    with (args.output / 'controller-telemetry.jsonl').open('a', encoding='utf-8', buffering=1) as log:
        while time.perf_counter() - started < args.minutes * 60 and not (args.output / 'STOP').exists():
            now = time.perf_counter()
            if now - last_probe >= 1.5 and (owner is None or now - last_packet > 0.8):
                last_probe = now
                found = mapper()
                if found:
                    owner = found
                    if redirect(owner, 18974):
                        status['state'] = 'waiting-for-packets'
                        status['mapperPid'] = owner
                else:
                    owner = None
                    status['state'] = 'waiting-for-mapper'
            try:
                data, source = receiver.recvfrom(65535)
            except socket.timeout:
                data = None
            if data:
                # Forward immediately, before parsing or writing to disk.
                forward.sendto(data, ('127.0.0.1', 8974))
                received = utc_now()
                last_packet = time.perf_counter()
                packet = json.loads(data)
                log.write(json.dumps({'receivedUtc': received,
                                      'elapsedMs': round((last_packet - started) * 1000, 3),
                                      'packet': packet}, separators=(',', ':')) + '\n')
                status['packets'] += 1
                status['firstPacketUtc'] = status['firstPacketUtc'] or received
                status['lastPacketUtc'] = received
                status['activeProfile'] = packet.get('activeProfile')
                status['devicesSeen'] = sorted(set(status['devicesSeen']) |
                                              {d['handle'] for d in packet.get('devices', []) if 'handle' in d})
                status['state'] = 'recording'
            if now - last_status >= 0.5:
                last_status = now
                save_status()
finally:
    # Restore the setting before closing the forwarding socket.
    if owner:
        status['normalPortRestored'] = redirect(owner, 8974)
    receiver.close()
    forward.close()
    status['state'] = 'stopped'
    status['stoppedUtc'] = utc_now()
    save_status()

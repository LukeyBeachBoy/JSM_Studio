"""Exercise slot transactions in the real mapper, with no managed hardware."""
import pathlib
import re
import subprocess
import tempfile
import time

root = pathlib.Path(__file__).resolve().parents[1]
mapper = root / 'JSM_GUI/jsm_gui_tauri/src-tauri/bin/SDL/JoyShockMapper.exe'
injector = root / 'JSM_GUI/jsm_gui_tauri/src-tauri/bin/SDL/jsm-console-injector.exe'
flags = subprocess.CREATE_NO_WINDOW

with tempfile.TemporaryDirectory(prefix='jsm-slot-native-') as directory:
    work = pathlib.Path(directory)
    (work / 'ManagedControllers.txt').write_text('fffe:fffe\n')
    (work / 'StudioDefaults.txt').write_text('TICK_TIME = 1\n')
    # A visible sentinel lets the test detect the reset hook without opening
    # controllers, playing sounds, or relying on wall-clock timing thresholds.
    (work / 'OnReset.txt').write_text('LEFT_STICK_DEADZONE_INNER = 0.78\n')
    (work / 'OnReconnect.txt').write_text('')
    (work / 'OnStartUp.txt').write_text('AUTOLOAD = OFF\nAUTOCONNECT = OFF\nRESET_MAPPINGS\n')
    (work / 'slot.txt').write_text('RESET_MAPPINGS\nS = SPACE\n')
    (work / 'navigation.txt').write_text('RESET_MAPPINGS\nGYRO_ON = NONE\n')
    child = subprocess.Popen([str(mapper), str(work), '--no-tray'],
                             cwd=mapper.parent, creationflags=flags)
    def command(text, capture=False):
        result = subprocess.run([str(injector), str(child.pid), text] + (['--capture'] if capture else []),
                                creationflags=flags, capture_output=True, text=True, timeout=5)
        assert result.returncode == 0, result.stderr
        return result.stdout
    def value():
        output = command('LEFT_STICK_DEADZONE_INNER', True)
        matches = re.findall(r'LEFT_STICK_DEADZONE_INNER\s*=\s*([0-9.]+)', output)
        assert matches, output
        return float(matches[-1])
    try:
        deadline = time.monotonic() + 8
        while True:
            try:
                if abs(value() - .78) < .001:
                    break
            except (AssertionError, subprocess.TimeoutExpired):
                pass
            assert time.monotonic() < deadline, 'Mapper did not initialize'
            time.sleep(.1)
        command('STUDIO_SLOT_PROFILE missing.txt')
        assert abs(value() - .78) < .001, 'Invalid slot must leave the loaded configuration untouched'
        command('STUDIO_SLOT_PROFILE slot.txt')
        assert value() != .78, 'A slot must not run the physical reset hook'
        assert child.poll() is None, 'Slot switch must retain the mapper process'
        command('RESET_MAPPINGS')
        assert abs(value() - .78) < .001, 'Ordinary reset must retain the user-authored hook'
        command('STUDIO_SLOT_PROFILE slot.txt\tnavigation.txt')
        assert value() != .78, 'The navigation handover belongs to the same slot transaction'
        assert child.poll() is None
        history = command('# READ_SLOT_TEST_HISTORY', True)
        assert '[MANAGED] Loaded ' + str(work / 'ManagedControllers.txt') in history, 'The managed policy must come from the requested runtime directory, before AutoConnect starts'
        assert 'standalone controller selection' not in history, 'The launcher working directory must not supply an unrestricted policy'
        print('PASS: native slot load, invalid-path preservation, reset-hook isolation, navigation handover and unchanged mapper process')
    finally:
        try:
            command('QUIT')
            child.wait(timeout=3)
        except Exception:
            child.kill()
            child.wait(timeout=3)

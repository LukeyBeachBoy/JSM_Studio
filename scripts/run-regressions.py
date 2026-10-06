"""Run the existing node/browser regressions with isolated renderer services.

Mapper startup tests that auto-connect hardware are deliberately listed as
pending unless --include-live is passed. Never stop the user's running mapper.
"""
import argparse
import json
import os
import re
from pathlib import Path
import subprocess
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
LIVE = {'app_navigation_profile_regression.cjs', 'mapper_startup_crash_regression.cjs', 'mapper_config_errors_regression.cjs', 'inverted_chord_mapper_regression.cjs'}
parser = argparse.ArgumentParser()
parser.add_argument('--include-live', action='store_true')
parser.add_argument('--only', nargs='*')
args = parser.parse_args()
if args.only:
    available = {test.name for test in (ROOT / 'tests').glob('*.cjs')}
    unknown = sorted(set(args.only) - available)
    if unknown:
        parser.error('Unknown regression names: ' + ', '.join(unknown))

base_url = os.environ.get('JSM_TEST_URL', 'http://127.0.0.1:1421')
env = dict(os.environ, JSM_TEST_URL=base_url)
report = []
out = ROOT / 'tmp/parity-verification'
out.mkdir(parents=True, exist_ok=True)
for test in sorted((ROOT / 'tests').glob('*.cjs')):
    if args.only and test.name not in args.only:
        continue
    if test.name in LIVE and not args.include_live:
        report.append({'test': test.name, 'status': 'PENDING', 'reason': 'Starts a mapper that auto-connects physical devices; isolate hardware before running.'})
        continue
    try:
        # A server override must retain the test's intended renderer mode.
        # Tests that append /?mock themselves continue to receive the bare base.
        test_source = test.read_text(encoding='utf-8')
        default_url = re.search(r"process\.env\.JSM_TEST_URL\s*\|\|\s*['\"]([^'\"]+)['\"]", test_source)
        parts = urlsplit(base_url)
        env['JSM_TEST_URL'] = urlunsplit(parts._replace(query='mock')) if default_url and '?mock' in default_url[1] and not parts.query else base_url
        owns_onboarding = re.search(r"getByRole\(['\"]button['\"],\s*\{\s*name:\s*['\"]Keep them['\"]", test_source)
        env['JSM_DISMISS_FIRST_CONNECTION'] = '0' if owns_onboarding or test.name in {'controller_sounds_browser_regression.cjs', 'triton_customisation_regression.cjs'} else '1'
        fixture = (ROOT / 'scripts/playwright-regression-fixture.cjs').as_posix()
        env['NODE_OPTIONS'] = os.environ.get('NODE_OPTIONS', '') + f' --require "{fixture}"'
        # The exhaustive focus walk visits every page at two sizes and includes
        # real animation/pad timing. Its full scope legitimately exceeds 4 min.
        timeout = 3600 if test.name == 'pad_axis_audit_regression.cjs' else 240
        result = subprocess.run(['node', str(test)], cwd=ROOT, env=env, capture_output=True, text=True, timeout=timeout)
        status = 'PASS' if result.returncode == 0 else 'FAIL'
        (out / (test.stem + '.log')).write_text(result.stdout + result.stderr, encoding='utf-8')
    except subprocess.TimeoutExpired as error:
        status = 'TIMEOUT'
        (out / (test.stem + '.log')).write_text(str(error), encoding='utf-8')
    report.append({'test': test.name, 'status': status})
    report_name = 'node-report-focused.json' if args.only else 'node-report.json'
    (out / report_name).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f'{status}: {test.name}', flush=True)
print(json.dumps({status: sum(t['status'] == status for t in report) for status in ('PASS', 'FAIL', 'TIMEOUT', 'PENDING')}))
raise SystemExit(1 if any(t['status'] in ('FAIL', 'TIMEOUT') for t in report) else 0)

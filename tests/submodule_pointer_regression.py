#!/usr/bin/env python3
"""The JoyShockMapper submodule must point at a JoyShockMapper commit.

Nothing here catches a wrong one on its own: the submodule is not checked out
in this working tree, so the gitlink is just forty hex characters until a
builder tries to fetch it. A 0.7.1 release build died on

    fatal: remote error: upload-pack: not our ref bab98d2...
    Fetched in submodule path 'JoyShockMapper', but it did not contain bab98d2

because the pointer had been set from a rev-parse that ran in the wrong
working directory and captured a commit from THIS repository instead.

So: the pointer must be a commit that exists in JoyShockMapper and must not be
one that exists here. Checked against a sibling clone or the checked-out
submodule when one is reachable, and against this repository always -- the
second half needs nothing but this repo and is what actually failed.

Run: python3 tests/submodule_pointer_regression.py
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parents[1]


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


def git(repo, *args):
    return subprocess.run(['git', '-C', str(repo), *args], capture_output=True, text=True)


def pointers():
    """What HEAD records and what is staged. They agree right after a commit; the
    index is checked as well so a mistake is caught before it is committed."""
    found = {}
    head = git(ROOT, 'ls-tree', 'HEAD', 'JoyShockMapper')
    check(head.returncode == 0 and head.stdout.strip(), 'no JoyShockMapper entry in HEAD')
    fields = head.stdout.split()
    check(fields[0] == '160000', f'JoyShockMapper is not a submodule entry: {head.stdout.strip()}')
    found['HEAD'] = fields[2]

    index = git(ROOT, 'ls-files', '-s', 'JoyShockMapper')
    if index.returncode == 0 and index.stdout.strip():
        staged = index.stdout.split()
        if staged[0] == '160000':
            found['the index'] = staged[1]
    return found


def joyshockmapper_repo():
    # An uninitialised submodule directory is an ordinary empty folder, and git
    # run inside one walks up and answers about THIS repository -- which would
    # have every pointer look wrong. Only accept a candidate that is its own
    # working tree.
    for candidate in (ROOT / 'JoyShockMapper', ROOT.parent / 'JoyShockMapper'):
        top = git(candidate, 'rev-parse', '--show-toplevel')
        if top.returncode == 0 and Path(top.stdout.strip()).resolve() == candidate.resolve():
            return candidate
    return None


def test_the_pointer_is_not_a_commit_from_this_repository():
    """This is the failure that shipped: a SHA from JSM_Studio in the gitlink.
    It needs no other checkout to detect, so it always runs."""
    for where, sha in pointers().items():
        found = git(ROOT, 'cat-file', '-t', sha)
        check(found.returncode != 0 or found.stdout.strip() != 'commit',
              f'the submodule pointer in {where} is {sha[:8]}, which is a commit in '
              'THIS repository. A builder will fail with "not our ref" when it tries '
              'to fetch it from JoyShockMapper.')


def test_the_pointer_exists_in_joyshockmapper():
    repo = joyshockmapper_repo()
    if repo is None:
        print('SKIP test_the_pointer_exists_in_joyshockmapper (no JoyShockMapper checkout reachable)')
        return
    for where, sha in pointers().items():
        found = git(repo, 'cat-file', '-t', sha)
        check(found.returncode == 0 and found.stdout.strip() == 'commit',
              f'the submodule pointer in {where} is {sha[:8]}, which is not a commit in {repo}')


def test_the_pointer_is_pushed():
    """A pointer at a commit that exists only locally fails the same way on a
    builder as one from the wrong repo."""
    repo = joyshockmapper_repo()
    if repo is None:
        print('SKIP test_the_pointer_is_pushed (no JoyShockMapper checkout reachable)')
        return
    for where, sha in pointers().items():
        if git(repo, 'cat-file', '-t', sha).stdout.strip() != 'commit':
            continue  # the previous test reports this
        contained = git(repo, 'branch', '-r', '--contains', sha)
        check(contained.returncode == 0 and contained.stdout.strip(),
              f'the pointer in {where}, {sha[:8]}, is on no remote branch of '
              'JoyShockMapper; push it before releasing or the build cannot fetch it')


def main():
    tests = [value for name, value in sorted(globals().items()) if name.startswith('test_')]
    failures = 0
    for test in tests:
        try:
            test()
        except AssertionError as exc:
            print(f'FAIL {test.__name__}: {exc}')
            failures += 1
        else:
            print(f'PASS {test.__name__}')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())

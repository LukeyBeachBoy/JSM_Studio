#!/usr/bin/env node
// Windows installer entry point; uses only Node's standard library.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'JSM_GUI', 'jsm_gui_tauri');
const args = process.argv.slice(2);
const HELP = `Usage: node scripts/build-installer.mjs [--patch | --minor | --major | --version X.Y.Z | --no-bump] [--skip-install]

Builds the current local frontend, Rust backend, SDL JoyShockMapper and console
helper into a Windows x64 NSIS installer. Includes uncommitted changes.
Restores npm dependencies by default. Does not pull, commit, install or publish.

Version (all five version files are updated before building):
  (default)        bump the patch version: 0.7.76 -> 0.7.77
  --patch          the same, said explicitly
  --minor          bump the minor version: 0.7.76 -> 0.8.0
  --major          bump the major version: 0.7.76 -> 1.0.0
  --version X.Y.Z  build exactly this version
  --no-bump        rebuild the current version (replaces that version's installer)
If a bumped build fails, the version files are put back, so the next attempt
bumps from the same number. A --version X.Y.Z stays written either way.

  --skip-install   reuse node_modules; use only when the lockfile is unchanged.`;

const bumpVersion = (current, part) => {
  const [major, minor, patch] = current.split('.').map(Number);
  if (part === 'major') return `${major + 1}.0.0`;
  if (part === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

let versionFilesChanged = null;

try {
  // ---- Arguments. One way of choosing the version at most.
  let explicitVersion;
  let bump = 'patch';
  let versionChoices = 0;
  let skipInstall = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h' || arg === '/?') {
      console.log(HELP);
      process.exit(0);
    } else if (arg === '--version') {
      explicitVersion = args[++i];
      if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(explicitVersion ?? '')) {
        throw new Error('--version requires X.Y.Z, for example 0.7.76.');
      }
      bump = null;
      versionChoices++;
    } else if (arg === '--patch' || arg === '--minor' || arg === '--major') {
      bump = arg.slice(2);
      versionChoices++;
    } else if (arg === '--no-bump') {
      bump = null;
      versionChoices++;
    } else if (arg === '--skip-install') {
      skipInstall = true;
    } else {
      throw new Error(`Unknown argument: ${arg}. Use --help.`);
    }
  }
  if (versionChoices > 1) {
    throw new Error('Choose one of --patch, --minor, --major, --version X.Y.Z or --no-bump.');
  }
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('Run this script with Windows x64 Node.js.');
  }

  // Windows tools can fail if both Path and PATH reach MSBuild. Normalize once
  // for the entire process tree, and restore the standard PowerShell modules.
  const env = Object.fromEntries(Object.entries(process.env).map(([key, value]) => [key.toUpperCase(), value]));
  const windows = env.SYSTEMROOT || 'C:\\Windows';
  const nodeDir = path.dirname(realpathSync(process.execPath));
  const npmCandidates = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ...(env.PATH || '').split(';').filter(Boolean).map(dir => path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js')),
  ];
  const npmCli = npmCandidates.find(existsSync);
  if (!npmCli) throw new Error('npm was not found beside Node.js or on PATH. Install Node.js LTS with npm.');
  env.PATH = [nodeDir, path.dirname(npmCli), path.join(windows, 'System32'), path.join(windows, 'System32', 'WindowsPowerShell', 'v1.0'), env.PATH].filter(Boolean).join(';');
  env.PSMODULEPATH = [path.join(windows, 'System32', 'WindowsPowerShell', 'v1.0', 'Modules'), env.PSMODULEPATH].filter(Boolean).join(';');
  const gitLocation = spawnSync('where.exe', ['git.exe'], { env, encoding: 'utf8' });
  const gitPath = gitLocation.stdout?.trim().split(/\r?\n/)[0];
  if (gitPath) {
    const gitUnixTools = path.resolve(path.dirname(gitPath), '..', 'usr', 'bin');
    if (existsSync(gitUnixTools)) env.PATH += `;${gitUnixTools}`;
  }
  // Keep the artifact location deterministic even in a customized Cargo shell.
  env.CARGO_TARGET_DIR = path.join(app, 'src-tauri', 'target');
  delete env.CARGO_BUILD_TARGET;

  function run(command, commandArgs, cwd = app) {
    const result = spawnSync(command, commandArgs, { cwd, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${path.basename(command)} failed (exit ${result.status ?? result.signal}).`);
  }
  for (const command of ['git', 'cargo', 'rustc']) run(command, ['--version']);
  if (!existsSync(path.join(root, 'JoyShockMapper', '.git'))) {
    throw new Error('Initialize the source first: git submodule update --init --recursive');
  }
  // npm ci deletes node_modules first, and Windows will not delete a running
  // executable: a dev server's esbuild made it fail with EPERM halfway through.
  // Name what is running from there and stop before anything is touched.
  if (!skipInstall) {
    const modules = path.join(app, 'node_modules');
    const probe = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `$m = '${modules.replace(/'/g, "''")}'; Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne ${process.pid} -and $_.ProcessId -ne $PID -and (($_.ExecutablePath -and $_.ExecutablePath.StartsWith($m, 'OrdinalIgnoreCase')) -or ($_.CommandLine -and $_.CommandLine.IndexOf($m, [StringComparison]::OrdinalIgnoreCase) -ge 0)) } | ForEach-Object { '{0} {1}' -f $_.ProcessId, $_.Name }`,
    ], { env, encoding: 'utf8' });
    const holders = (probe.stdout ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (holders.length) {
      throw new Error(`These processes are running from node_modules, so npm cannot replace it:\n  ${holders.join('\n  ')}\nStop them first (usually a dev server: npm run dev, tauri dev or vite), then run this again.`);
    }
  }

  // ---- The five version files.
  const packagePath = path.join(app, 'package.json');
  const lockPath = path.join(app, 'package-lock.json');
  const configPath = path.join(app, 'src-tauri', 'tauri.conf.json');
  const cargoPath = path.join(app, 'src-tauri', 'Cargo.toml');
  const cargoLockPath = path.join(app, 'src-tauri', 'Cargo.lock');
  const cargoPattern = /(\[package\][\s\S]*?\bversion\s*=\s*")([^"]+)(")/;
  const cargoLockPattern = /(name = "jsm-gui-app-tauri"\r?\nversion = ")([^"]+)(")/;
  const readVersions = () => {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    const cargo = readFileSync(cargoPath, 'utf8');
    const cargoLock = readFileSync(cargoLockPath, 'utf8');
    if (!cargoPattern.test(cargo) || !cargoLockPattern.test(cargoLock)) throw new Error('App version was not found in the Cargo files.');
    return [
      JSON.parse(readFileSync(packagePath, 'utf8')).version,
      lock.version,
      lock.packages?.['']?.version,
      JSON.parse(readFileSync(configPath, 'utf8')).version,
      cargo.match(cargoPattern)[2],
      cargoLock.match(cargoLockPattern)[2],
    ];
  };
  // Replace only version fields; preserve unrelated edits and formatting.
  const writeVersion = next => {
    const replaceJsonVersion = file => {
      const source = readFileSync(file, 'utf8');
      writeFileSync(file, source.replace(/("version"\s*:\s*")[^"]+(")/, (_, before, after) => `${before}${next}${after}`));
    };
    replaceJsonVersion(packagePath);
    replaceJsonVersion(configPath);
    // The root package occurs before all dependency entries in npm's lockfile.
    const lockSource = readFileSync(lockPath, 'utf8');
    let replaced = 0;
    writeFileSync(lockPath, lockSource.replace(/("version"\s*:\s*")[^"]+(")/g, (match, before, after) => ++replaced <= 2 ? `${before}${next}${after}` : match));
    writeFileSync(cargoPath, readFileSync(cargoPath, 'utf8').replace(cargoPattern, (_, before, old, after) => `${before}${next}${after}`));
    writeFileSync(cargoLockPath, readFileSync(cargoLockPath, 'utf8').replace(cargoLockPattern, (_, before, old, after) => `${before}${next}${after}`));
  };

  const versions = readVersions();
  const current = versions[0];
  const agree = versions.every(value => value === current);
  let version;
  if (explicitVersion) {
    // An exact version also repairs files that disagree.
    version = explicitVersion;
  } else {
    if (!agree) throw new Error(`Version files disagree (${[...new Set(versions)].join(', ')}). Rerun with --version X.Y.Z to synchronize them.`);
    if (!/^\d+\.\d+\.\d+$/.test(current ?? '')) throw new Error(`The current version "${current}" is not X.Y.Z. Rerun with --version X.Y.Z.`);
    version = bump ? bumpVersion(current, bump) : current;
  }
  if (version !== current || !agree) {
    writeVersion(version);
    // Only a bump is rolled back on failure. An exact --version is also how
    // files that disagree get repaired, and that repair should stay.
    if (!explicitVersion) versionFilesChanged = { from: current, to: version, restore: writeVersion };
  }

  const how = explicitVersion ? 'set with --version' : bump ? `${bump} bump from ${current}` : 'no bump';
  console.log(`\nBuilding JSM Evolved ${version} (${how}) from ${root}\nLocal changes are included. Keep source files unchanged until the build finishes.`);
  if (!skipInstall) run(process.execPath, [npmCli, 'ci', '--no-audit', '--no-fund']);
  if (!existsSync(path.join(app, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'))) {
    throw new Error('Tauri dependencies are missing. Rerun without --skip-install.');
  }
  const started = Date.now();
  run(process.execPath, [npmCli, 'run', 'tauri', '--', 'build', '--bundles', 'nsis']);
  const installer = path.join(env.CARGO_TARGET_DIR, 'release', 'bundle', 'nsis', `JSM Evolved_${version}_x64-setup.exe`);
  if (!existsSync(installer) || statSync(installer).mtimeMs < started - 2000) {
    throw new Error(`The build did not produce a fresh installer at ${installer}`);
  }
  const hash = createHash('sha256').update(readFileSync(installer)).digest('hex').toUpperCase();
  writeFileSync(`${installer}.sha256`, `${hash}  ${path.basename(installer)}\n`);
  versionFilesChanged = null;
  console.log(`\nInstaller ready: ${installer}\nSize: ${(statSync(installer).size / 1024 / 1024).toFixed(1)} MiB\nSHA-256: ${hash}\nChecksum file: ${installer}.sha256`);
} catch (error) {
  console.error(`\nInstaller build failed: ${error.message}`);
  // A failed build must not use up a version number: put the version files
  // back, so the next attempt bumps from the same place.
  if (versionFilesChanged) {
    try {
      versionFilesChanged.restore(versionFilesChanged.from);
      console.error(`Version files restored to ${versionFilesChanged.from}.`);
    } catch (restoreError) {
      console.error(`Could not restore the version files to ${versionFilesChanged.from}: ${restoreError.message}`);
    }
  }
  process.exitCode = 1;
}

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../scripts/stop-installer-blockers.ps1', import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), 'jsm-installer-blockers-'));
const children = [];
const descendants = [];
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function holder(app, tree = false) {
  const modules = path.join(app, 'node_modules');
  mkdirSync(modules, { recursive: true });
  const script = path.join(modules, 'holder.cjs');
  writeFileSync(script, tree
    ? `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); console.log(child.pid); setInterval(()=>{},1000);`
    : `console.log(process.pid); setInterval(()=>{},1000);`);
  const child = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  const pid = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Fixture did not start')), 5000);
    child.stdout.once('data', data => { clearTimeout(timer); resolve(Number(String(data).trim())); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
  });
  if (tree) descendants.push(pid);
  return { child, pid };
}
function cleanup(app, skip = false) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', helper, '-AppRoot', app, '-BuilderProcessId', String(process.pid), ...(skip ? ['-SkipInstall'] : [])],
  { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
  return result.stdout;
}
try {
  const app = path.join(temporary, 'app');
  const blocked = await holder(app, true);
  const unrelated = await holder(path.join(temporary, 'other-app'));
  const outputDir = path.join(app, 'src-tauri', 'target', 'debug');
  mkdirSync(outputDir, { recursive: true });
  const outputExe = path.join(outputDir, 'test-blocker.exe');
  copyFileSync(process.env.ComSpec, outputExe);
  const outputProcess = spawn(outputExe, ['/d', '/c', 'ping -t 127.0.0.1 >nul'], { stdio: 'ignore' });
  children.push(outputProcess);
  await new Promise((resolve, reject) => { outputProcess.once('spawn', resolve); outputProcess.once('error', reject); });
  cleanup(app, true);
  assert(!alive(outputProcess.pid), '--skip-install still stops build output executables');
  assert(alive(blocked.child.pid) && alive(blocked.pid), '--skip-install preserves module processes');
  const output = cleanup(app);
  assert.match(output, /Stopping installer blocker/);
  assert(!alive(blocked.child.pid), 'module holder exited');
  assert(!alive(blocked.pid), 'its child exited');
  assert(alive(unrelated.child.pid), 'unrelated project stays running');
  assert(alive(process.pid), 'cleanup caller stays running');
  cleanup(app); // Repeated cleanup with no blockers succeeds.
  console.log('PASS: real Windows process cleanup, descendants, skip-install and unrelated process protection');
} finally {
  for (const child of children) { if (alive(child.pid)) child.kill(); }
  for (const pid of descendants) { if (alive(pid)) process.kill(pid); }
  // Only remove the exact directory created for this test.
  rmSync(temporary, { recursive: true, force: true });
}

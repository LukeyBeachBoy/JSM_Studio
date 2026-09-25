// The Quick Access Chord got slower with every press until it stopped
// responding at all.
//
// CmdRegistry records any line containing '=' into _profileLines. The chord
// handlers then did this:
//
//   BEGIN: _restoreLines = _profileLines      (snapshot the live profile)
//          RESET_MAPPINGS                     (clears _profileLines)
//          load the chord config              (records its lines)
//          TELEMETRY_ENABLED = ON             (APPENDED to the record)
//          TELEMETRY_PORT = 8974              (APPENDED to the record)
//
//   END:   RESET_MAPPINGS                     (clears _profileLines)
//          replay _restoreLines               (re-records them)
//          TELEMETRY_ENABLED = ON             (APPENDED again)
//          TELEMETRY_PORT = 8974              (APPENDED again)
//
// Those two lines are Studio's, not the profile's, but they joined the record
// -- so the next BEGIN snapshotted a set two lines longer than last time, and
// the next END replayed and re-appended them. Unbounded growth, two lines per
// press/release. A real session's console showed the restore replaying 1, then
// 2, then 3 ... up to 7 copies of the same assignments, and by that point
// MISC1 presses were producing no STUDIO_CHORD_BEGIN at all.
//
// The fix: both handlers put _profileLines back to what the profile actually
// is, after the telemetry top-ups. This asserts the growth cannot return, and
// simulates the accumulation to prove the model.
//
// Run: node tests/chord_restore_growth_regression.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'JoyShockMapper/JoyShockMapper/src/CmdRegistry.cpp'), 'utf8');

/** The body of the `if` block handling one STUDIO_CHORD_* command. */
function handlerBody(marker) {
  const at = SRC.indexOf(marker);
  assert.notEqual(at, -1, `handler not found: ${marker}`);
  const start = SRC.indexOf('{', at);
  let depth = 0;
  for (let i = start; i < SRC.length; i += 1) {
    if (SRC[i] === '{') depth += 1;
    else if (SRC[i] === '}') {
      depth -= 1;
      if (depth === 0) return SRC.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces for ${marker}`);
}

const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check('the model: appending the telemetry lines grows the restore set forever', () => {
  // A faithful simulation of the old handlers, to show the growth is real and
  // not an artefact of reading the log.
  const cycle = (profileLines, appendTopUps) => {
    // BEGIN
    const restoreLines = [...profileLines];
    let record = ['CHORD_BINDING = X'];           // the chord config's own line
    if (appendTopUps) record.push('TELEMETRY_ENABLED = ON', 'TELEMETRY_PORT = 8974');
    else record = ['CHORD_BINDING = X'];
    // END
    let restored = [...restoreLines];
    if (appendTopUps) restored.push('TELEMETRY_ENABLED = ON', 'TELEMETRY_PORT = 8974');
    else restored = [...restoreLines];
    return restored;
  };

  let broken = ['PROFILE_BINDING = A'];
  for (let i = 0; i < 6; i += 1) broken = cycle(broken, true);
  assert.equal(broken.length, 1 + 6 * 2, 'the old behaviour should grow by two lines a cycle');
  assert.equal(broken.filter(l => l.startsWith('TELEMETRY_ENABLED')).length, 6);

  let fixed = ['PROFILE_BINDING = A'];
  for (let i = 0; i < 6; i += 1) fixed = cycle(fixed, false);
  assert.deepEqual(fixed, ['PROFILE_BINDING = A'], 'the fix must be idempotent across cycles');
});

check('STUDIO_CHORD_END restores the record to exactly the saved lines', () => {
  const body = handlerBody('if (trimmedLine == "STUDIO_CHORD_END")');
  assert.ok(body.includes('_profileLines = lines;'),
    'STUDIO_CHORD_END leaves its own TELEMETRY_ENABLED / TELEMETRY_PORT lines in ' +
    '_profileLines, so the next STUDIO_CHORD_BEGIN snapshots a longer restore set ' +
    'than last time and every chord press gets permanently more expensive');
  assert.ok(body.lastIndexOf('_profileLines = lines;') > body.lastIndexOf('TELEMETRY_PORT'),
    'the record is reset before the telemetry top-ups are applied, so they are ' +
    'still appended afterwards and the growth is unchanged');
});

check('STUDIO_CHORD_BEGIN keeps its telemetry top-ups out of the record too', () => {
  const body = handlerBody('const string begin = "STUDIO_CHORD_BEGIN ";');
  assert.ok(body.includes('_profileLines = chordLines;'),
    'STUDIO_CHORD_BEGIN appends its telemetry lines to the chord config record; ' +
    'they are Studio\'s, not the configuration\'s, and they accumulate');
  assert.ok(body.lastIndexOf('_profileLines = chordLines;') > body.lastIndexOf('TELEMETRY_PORT'),
    'the chord record is restored before the top-ups, so they still leak in');
});

check('the release detector is still forced on for a chord', () => {
  // The top-ups exist for a reason: a chord config that turns telemetry off
  // would strand the chord held, because the release is detected from
  // telemetry. Keeping them OUT of the record must not mean not sending them.
  for (const marker of ['const string begin = "STUDIO_CHORD_BEGIN ";',
                        'if (trimmedLine == "STUDIO_CHORD_END")']) {
    const body = handlerBody(marker);
    assert.ok(body.includes('TELEMETRY_ENABLED = ON') && body.includes('TELEMETRY_PORT = 8974'),
      `${marker} no longer forces telemetry on; a chord config that disables it would ` +
      'never be seen to release');
  }
});

let failures = 0;
for (const [name, fn] of checks) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL ${name}: ${error.message}`); }
}
process.exit(failures ? 1 : 0);

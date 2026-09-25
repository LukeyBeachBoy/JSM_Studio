const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'JSM_GUI/jsm_gui_tauri');
const ts = require(path.join(root, 'node_modules/typescript'));
const cache = new Map();

function load(relative) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const localRequire = specifier => {
    if (!specifier.startsWith('.')) return require(specifier);
    const base = path.resolve(path.dirname(file), specifier);
    const resolved = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(fs.existsSync);
    if (!resolved) throw new Error(`Cannot resolve ${specifier} from ${relative}`);
    return load(path.relative(root, resolved));
  };
  new Function('module', 'exports', 'require', source)(module, module.exports, localRequire);
  cache.set(file, module.exports);
  return module.exports;
}

const { parseConfigText, serializeConfig } = load('src/utils/configSerializer.ts');
const save = text => serializeConfig(parseConfigText(text));

const source = [
  '# Wardogs calibration notes',
  '# Keep this value matched to the real controller.',
  'RESET_MAPPINGS',
  '# Gyro settings',
  'GYRO_SENS = 1.25',
  '# The crouch binding is intentionally below the gyro block.',
  'E = C',
  '# A banner before a later canonical section.',
  'RIGHT_TOUCHPAD_MODE = MOUSE',
  '# final note',
].join('\n');

const saved = save(source);
assert.match(saved, /# Wardogs calibration notes\n# Keep this value matched to the real controller\.\nRESET_MAPPINGS/);
assert.match(saved, /# Gyro settings\nGYRO_SENS = 1\.25/);
assert.match(saved, /# The crouch binding is intentionally below the gyro block\.\nE = C/);
assert.match(saved, /# A banner before a later canonical section\.\nRIGHT_TOUCHPAD_MODE = MOUSE/);
assert.match(saved, /# final note/);

const twice = save(saved);
assert.equal(twice, saved, 'comment placement must remain stable across repeated saves');
assert.ok(saved.indexOf('# Gyro settings') < saved.indexOf('GYRO_SENS = 1.25'));
assert.ok(saved.indexOf('# A banner before a later canonical section.') < saved.indexOf('RIGHT_TOUCHPAD_MODE = MOUSE'));

console.log('comment round-trip regression passed');

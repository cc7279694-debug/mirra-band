const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const scriptPath = path.join(root, 'scripts/build-rpk.cjs');
const source = fs.readFileSync(scriptPath, 'utf8');
const staging = path.join(root, '.local/build-project');
const lock = path.join(root, '.local/build.lock');
const artifactName = 'com.guanyi.mirra.band.demo.release.0.2.0.rpk';
const deliveryPath = path.join(root, 'dist', artifactName);
const stagedArtifact = path.join(staging, 'dist', artifactName);

// Only external file/build/signature boundaries are substituted. The actual
// wrapper decides what to delete, launch, validate, deliver, and unlock.
async function runBuilder({ compilerStatus = 0, produceArtifact = true, locked = false, mode = 'demo', themeStatus = 'PASS' } = {}) {
  const profile = require('../scripts/build-profiles.cjs').identity(mode);
  const artifactName = profile.package + '.release.' + profile.versionName + '.rpk';
  const deliveryPath = path.join(root, 'dist', artifactName);
  const stagedArtifact = path.join(staging, 'dist', artifactName);
  const manifest = fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8');
  const files = new Map([
    [path.join(root, 'src/manifest.json'), manifest],
    [path.join(root, 'src/app.ux'), 'phone companion entry'],
    [path.join(root, 'src/probe-app.ux'), 'isolated probe entry'],
    [path.join(root, 'src/local-app.ux'), 'isolated local session entry'],
    [path.join(root, 'src/click-probe-app.ux'), 'isolated native click entry'],
    [path.join(root, 'src/pages/ClickProbe/index.ux'), 'isolated native click page'],
    [path.join(root, 'src/common/click-probe.css'), 'isolated native click styles'],
    [path.join(root, 'src/pages/Home/index.ux'), 'phone page'],
    [path.join(root, 'src/pages/StorageProbe/index.ux'), 'isolated page'],
    [path.join(root, 'src/pages/LocalSession/index.ux'), 'isolated local session page'],
    [path.join(root, 'src/lib/local-owner.js'), 'local owner'],
    [path.join(root, 'src/platform/local-storage.js'), 'local storage'],
    [path.join(root, 'src/secret/private.pem'), 'must not be staged'],
    [path.join(root, 'src/lib/probe-controller.js'), 'isolated controller'],
    [path.join(root, 'src/platform/interconnect-transport.js'), 'phone transport'],
    [path.join(root, 'package.json'), '{"private":true}'],
    [path.join(root, 'sign/private.pem'), 'test signing input'],
    [path.join(root, 'sign/certificate.pem'), 'test public identity'],
    [deliveryPath, 'previous delivery'],
    [stagedArtifact, 'previous staged artifact'],
    [path.join(root, 'node_modules/keep.txt'), 'dependencies stay intact'],
  ]);
  if (mode === 'live') {
    for (const relative of ['formal-app.ux', 'common/formal-theme.css', 'common/local-theme.css',
      ...require('../scripts/formal-theme.cjs').PAGES.map(page => 'pages/' + page + '/index.ux')])
      files.set(path.join(root, 'src', relative), fs.readFileSync(path.join(root, 'src', relative), 'utf8'));
    files.set(path.join(root, 'sign/live/private.pem'), 'test signing input');
    files.set(path.join(root, 'sign/live/certificate.pem'), 'test public identity');
  }
  if (locked) files.set(lock, 'another builder owns this lock');
  const removed = [];
  const launched = [];
  const inspected = [];
  const output = [];
  const errors = [];

  function readFile(file) {
    if (!files.has(file)) throw new Error('Missing fresh file: ' + file);
    return files.get(file);
  }

  const memoryFs = {
    mkdirSync() {},
    openSync(file, flags) {
      assert.equal(flags, 'wx');
      if (files.has(file)) {
        const error = new Error('Build lock already exists');
        error.code = 'EEXIST';
        throw error;
      }
      files.set(file, 'this builder owns this lock');
      return 7;
    },
    closeSync(handle) {
      assert.equal(handle, 7);
    },
    unlinkSync(file) {
      assert(files.has(file), 'Cannot release an absent lock');
      files.delete(file);
    },
    rmSync(directory, options) {
      assert.equal(options.recursive, true);
      assert.equal(options.force, true);
      removed.push(directory);
      for (const file of files.keys()) {
        if (file === directory || file.startsWith(directory + path.sep)) files.delete(file);
      }
    },
    cpSync(from, to, options) {
      if (options && options.filter && !options.filter(from, to)) return;
      for (const [file, value] of [...files]) {
        if (!file.startsWith(from + path.sep)) continue;
        const destination = path.join(to, path.relative(from, file));
        const ancestors = [];
        for (let directory = path.dirname(file); directory !== from; directory = path.dirname(directory)) ancestors.push(directory);
        if (options && options.filter && ![...ancestors, file].every(input => options.filter(input, path.join(to, path.relative(from, input))))) continue;
        files.set(destination, value);
      }
    },
    copyFileSync(from, to) {
      files.set(to, readFile(from));
    },
    existsSync(file) {
      return files.has(file);
    },
    readFileSync: readFile,
    writeFileSync(file, content) { files.set(file, content); },
    symlinkSync(from, to, type) {
      assert.equal(type, 'junction');
      files.set(to, { junction: from });
    },
  };
  const processBoundary = {
    argv: ['node', scriptPath, 'release', mode],
    execPath: process.execPath,
    stdout: { write: (value) => output.push(value) },
    stderr: { write: (value) => errors.push(value) },
    exitCode: 0,
  };
  const requireBoundary = (name) => {
    if (name === 'node:fs') return memoryFs;
    if (name === 'node:path') return path;
    if (name === './build-profiles.cjs') return require('../scripts/build-profiles.cjs');
    if (name === './source-profile.cjs') return require('../scripts/source-profile.cjs');
    if (name === './formal-theme.cjs') return require('../scripts/formal-theme.cjs');
    if (name === './check-formal-theme.cjs') return { async checkRpk(file) {
      assert.equal(file, stagedArtifact);
      assert.equal(readFile(file), 'fresh verified package');
      assert.equal(mode, 'live', 'Theme validation is formal-only');
      return { status: themeStatus };
    } };
    if (name === 'node:child_process') {
      return {
        spawnSync(command, args, options) {
          launched.push({ command, args, cwd: options.cwd });
          if (compilerStatus === 0 && produceArtifact) {
            files.set(path.join(options.cwd, 'dist', artifactName), 'fresh verified package');
            files.set(path.join(options.cwd, 'build/app.js'), 'fresh compiled runtime');
          }
          return { status: compilerStatus };
        },
      };
    }
    if (name === './inspect-rpk.cjs') {
      return {
        async inspect(file, certificate) {
          inspected.push({ file, certificate });
          assert.equal(file, stagedArtifact, 'Previous root delivery must never satisfy fresh build validation');
          assert.equal(certificate, path.join(root, profile.signDirectory, 'certificate.pem'));
          assert.equal(readFile(file), 'fresh verified package');
          return { bytes: 22, sha256: 'fresh-verified-digest', signature: 'verified demo signature' };
        },
      };
    }
    throw new Error('Unexpected dependency: ' + name);
  };
  requireBoundary.resolve = () => path.join(root, 'node_modules/aiot-toolkit/lib/bin.js');

  await vm.runInNewContext(source, {
    require: requireBoundary,
    __dirname: path.dirname(scriptPath),
    process: processBoundary,
  }, { filename: scriptPath });
  return { files, removed, launched, inspected, output, errors, exitCode: processBoundary.exitCode };
}

test('builder delivers a fresh validated staged package without scanning the whole workspace', async () => {
  const result = await runBuilder();
  assert.equal(result.exitCode, 0);
  assert.equal(result.files.get(deliveryPath), 'fresh verified package');
  assert.equal(result.files.get(path.join(root, 'build/runtime/demo/app.js')), 'fresh compiled runtime');
  assert.equal(result.files.get(path.join(root, 'node_modules/keep.txt')), 'dependencies stay intact');
  assert.deepEqual(result.removed, [staging]);
  assert.equal(result.launched.length, 1);
  assert.equal(result.launched[0].cwd, staging);
  assert.equal(result.inspected.length, 1);
  assert.equal(result.files.has(lock), false);
  assert.equal(result.errors.length, 0);
  assert.equal(JSON.parse(result.output[0]).sha256, 'fresh-verified-digest');
});

test('compiler failure preserves the previous delivery and releases this builder lock', async () => {
  const result = await runBuilder({ compilerStatus: 1 });
  assert.equal(result.exitCode, 1);
  assert.equal(result.files.get(deliveryPath), 'previous delivery');
  assert.equal(result.files.has(stagedArtifact), false);
  assert.equal(result.inspected.length, 0);
  assert.equal(result.files.has(lock), false);
  assert.equal(result.output.length, 0);
  assert.match(result.errors[0], /status 1/);
});

test('zero compiler exit cannot deliver an old root or staged package when fresh output is missing', async () => {
  const result = await runBuilder({ produceArtifact: false });
  assert.equal(result.exitCode, 1);
  assert.equal(result.files.get(deliveryPath), 'previous delivery');
  assert.equal(result.files.has(stagedArtifact), false);
  assert.equal(result.inspected.length, 1);
  assert.equal(result.files.has(lock), false);
  assert.equal(result.output.length, 0);
  assert.match(result.errors[0], /Missing fresh file/);
});

test('a competing builder preserves the owner lock and staging without launching the compiler', async () => {
  const result = await runBuilder({ locked: true });
  assert.equal(result.exitCode, 1);
  assert.equal(result.files.get(lock), 'another builder owns this lock');
  assert.equal(result.files.get(stagedArtifact), 'previous staged artifact');
  assert.equal(result.files.get(deliveryPath), 'previous delivery');
  assert.equal(result.removed.length, 0);
  assert.equal(result.launched.length, 0);
  assert.equal(result.inspected.length, 0);
  assert.equal(result.output.length, 0);
  assert.match(result.errors[0], /lock already exists/);
});

test('actual wrapper stages the isolated entry and no phone transport in a probe build', async () => {
  const result = await runBuilder({ mode: 'probe' });
  assert.equal(result.exitCode, 0);
  assert.equal(result.files.get(path.join(staging, 'src/app.ux')), 'isolated probe entry');
  assert.equal(result.files.has(path.join(staging, 'src/probe-app.ux')), false);
  assert.equal(result.files.has(path.join(staging, 'src/pages/Home/index.ux')), false);
  assert.equal(result.files.has(path.join(staging, 'src/platform/interconnect-transport.js')), false);
  assert.equal(result.files.get(path.join(staging, 'src/pages/StorageProbe/index.ux')), 'isolated page');
  assert.equal(result.files.get(path.join(root, 'src/app.ux')), 'phone companion entry');
  assert.equal(result.files.has(lock), false);
});

test('actual wrapper stages the local entry and explicitly qualified file storage without companion or probe page inputs', async () => {
  const result = await runBuilder({ mode: 'local-session' });
  assert.equal(result.exitCode, 0);
  assert.equal(result.files.get(path.join(staging, 'src/app.ux')), 'isolated local session entry');
  assert.equal(result.files.has(path.join(staging, 'src/local-app.ux')), false);
  assert.equal(result.files.get(path.join(staging, 'src/pages/LocalSession/index.ux')), 'isolated local session page');
  assert.equal(result.files.get(path.join(staging, 'src/lib/local-owner.js')), 'local owner');
  assert.equal(result.files.get(path.join(staging, 'src/platform/local-storage.js')), 'local storage');
  for (const file of ['probe-app.ux', 'pages/Home/index.ux', 'pages/StorageProbe/index.ux', 'lib/probe-controller.js',
    'platform/interconnect-transport.js', 'secret/private.pem']) assert.equal(result.files.has(path.join(staging, 'src', file)), false, file);
  const runtime = JSON.parse(result.files.get(path.join(staging, 'src/profile.js')).replace(/^module.exports = /, '').trim().replace(/;$/, ''));
  assert.deepEqual(runtime, { mode: 'local-session', versionName: '0.1.4', versionCode: 5, storageQualified: true, storageBackend: 'file' });
  const manifest = JSON.parse(result.files.get(path.join(staging, 'src/manifest.json')));
  assert.equal(manifest.router.entry, 'pages/LocalSession');
  assert.equal(result.files.get(path.join(root, 'src/app.ux')), 'phone companion entry');
  assert.equal(result.files.get(path.join(root, 'src/local-app.ux')), 'isolated local session entry');
  assert.equal(result.files.has(lock), false);
});

test('companion and probe builders never stage local session inputs or its runtime qualification flag', async () => {
  for (const mode of ['demo', 'probe', 'probe-upgrade']) {
    const result = await runBuilder({ mode });
    assert.equal(result.exitCode, 0);
    for (const file of ['local-app.ux', 'pages/LocalSession/index.ux', 'lib/local-owner.js', 'platform/local-storage.js'])
      assert.equal(result.files.has(path.join(staging, 'src', file)), false, mode + ': ' + file);
    const runtime = JSON.parse(result.files.get(path.join(staging, 'src/profile.js')).replace(/^module.exports = /, '').trim().replace(/;$/, ''));
    assert.equal(runtime.storageQualified, undefined);
    assert.equal(runtime.storageBackend, undefined);
  }
});

test('actual click builder stages only the click entry without owners or file adapters', async () => {
  const result = await runBuilder({ mode: 'click-probe' });
  assert.equal(result.exitCode, 0);
  assert.equal(result.files.get(path.join(staging, 'src/app.ux')), 'isolated native click entry');
  assert.equal(result.files.get(path.join(staging, 'src/pages/ClickProbe/index.ux')), 'isolated native click page');
  assert.equal(result.files.get(path.join(staging, 'src/common/click-probe.css')), 'isolated native click styles');
  for (const file of ['click-probe-app.ux', 'local-app.ux', 'probe-app.ux', 'lib/local-owner.js',
    'platform/local-storage.js', 'platform/probe-storage.js', 'pages/Home/index.ux', 'pages/LocalSession/index.ux']) {
    assert.equal(result.files.has(path.join(staging, 'src', file)), false, file);
  }
  const manifest = JSON.parse(result.files.get(path.join(staging, 'src/manifest.json')));
  assert.deepEqual(manifest.features, [{ name: 'system.router' }]);
  assert.equal(manifest.router.entry, 'pages/ClickProbe');
  const runtime = JSON.parse(result.files.get(path.join(staging, 'src/profile.js')).replace(/^module.exports = /, '').trim().replace(/;$/, ''));
  assert.deepEqual(runtime, { mode: 'click-probe', versionName: '0.1.0', versionCode: 1 });
  assert.equal(result.files.has(lock), false);
});

test('generated local runtime profile enables the actual app owner and selects only native file test slots', async () => {
  const result = await runBuilder({ mode: 'local-session' });
  assert.equal(result.exitCode, 0);
  const runtimeModule = { exports: {} };
  vm.runInNewContext(result.files.get(path.join(staging, 'src/profile.js')), { module: runtimeModule });
  const appPath = path.join(root, 'src/local-app.ux');
  const appScript = fs.readFileSync(appPath, 'utf8').match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .+$/gm, '').replace(/\bexport\s+default\s+/, 'module.exports = ');
  const values = new Map(), nativeCalls = [];
  const nativeFile = {
    readText(request) {
      nativeCalls.push({ kind: 'read', uri: request.uri });
      if (values.has(request.uri)) request.success({ text: values.get(request.uri) }); else request.fail('', 301);
    },
    writeText(request) {
      nativeCalls.push({ kind: 'write', uri: request.uri });
      values.set(request.uri, request.text); request.success();
    }
  };
  const moduleBoundary = { exports: {} };
  vm.runInNewContext(appScript, { module: moduleBoundary,
    ownerLib: require('../src/lib/local-owner'), storageLib: require('../src/platform/local-storage'),
    profile: runtimeModule.exports, Date, Math, Number, String,
    require(name) { assert.equal(name, '@system.file'); return nativeFile; }
  }, { filename: appPath });
  const app = moduleBoundary.exports;
  try {
    app.onCreate(); const owner = app.getLocalOwner(); const opened = await owner.open();
    assert.equal(opened.storageQualified, true);
    assert.equal(opened.canWrite, true);
    assert.equal(nativeCalls.filter(call => call.kind === 'write').length, 0);
    const prepared = await owner.dispatch({ type: 'SELECT_BOOK', bookId: 'test-reading-1' });
    assert.equal(prepared.document.state, 'PREPARING');
    assert.equal(nativeCalls.filter(call => call.kind === 'write').length, 1);
    assert.ok(nativeCalls.every(call => /^internal:\/\/files\/mirra_05b_test_sessions_[ab]\.json$/.test(call.uri)));
    assert.equal(values.size, 1);
  } finally { app.onDestroy(); }
});

test('actual formal builder transforms all six staged pages while preserving original shared pages and experiment styles', async () => {
  const result = await runBuilder({ mode: 'live' });
  assert.equal(result.exitCode, 0, result.errors.join('\n'));
  for (const page of require('../scripts/formal-theme.cjs').PAGES) {
    const file = path.join(staging, 'src/pages', page, 'index.ux');
    const original = fs.readFileSync(path.join(root, 'src/pages', page, 'index.ux'), 'utf8');
    const staged = result.files.get(file);
    assert.equal(result.files.get(path.join(root, 'src/pages', page, 'index.ux')), original);
    assert.equal(require('../scripts/check-formal-theme.cjs').checkSourcePage(staged, page).status, 'PASS', page);
    assert.equal(staged.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1], original.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1]);
  }
  assert.equal(result.files.has(path.join(staging, 'src/common/theme.css')), false);
  assert.equal(result.files.has(path.join(staging, 'src/common/formal-theme.css')), true);
  assert.equal(result.files.has(path.join(staging, 'src/local-app.ux')), false);
});

test('a signed formal build with unreadable compiled theme cannot replace a prior delivery', async () => {
  const result = await runBuilder({ mode: 'live', themeStatus: 'FAIL' });
  assert.equal(result.exitCode, 1);
  const target = path.join(root, 'dist', 'com.guanyi.mirra.release.' + require('../scripts/build-profiles.cjs').identity('live').versionName + '.rpk');
  assert.equal(result.files.get(target), 'previous delivery');
  assert.equal(result.files.has(lock), false);
});

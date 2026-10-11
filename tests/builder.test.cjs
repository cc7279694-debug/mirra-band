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
const artifactName = 'com.guanyi.mirra.band.demo.release.0.1.0.rpk';
const deliveryPath = path.join(root, 'dist', artifactName);
const stagedArtifact = path.join(staging, 'dist', artifactName);

// Only external file/build/signature boundaries are substituted. The actual
// wrapper decides what to delete, launch, validate, deliver, and unlock.
async function runBuilder({ compilerStatus = 0, produceArtifact = true, locked = false } = {}) {
  const manifest = JSON.stringify({ package: 'com.guanyi.mirra.band.demo', versionName: '0.1.0' });
  const files = new Map([
    [path.join(root, 'src/manifest.json'), manifest],
    [path.join(root, 'package.json'), '{"private":true}'],
    [path.join(root, 'sign/private.pem'), 'test signing input'],
    [path.join(root, 'sign/certificate.pem'), 'test public identity'],
    [deliveryPath, 'previous delivery'],
    [stagedArtifact, 'previous staged artifact'],
    [path.join(root, 'node_modules/keep.txt'), 'dependencies stay intact'],
  ]);
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
    cpSync(from, to) {
      for (const [file, value] of [...files]) {
        if (file.startsWith(from + path.sep)) files.set(path.join(to, path.relative(from, file)), value);
      }
    },
    copyFileSync(from, to) {
      files.set(to, readFile(from));
    },
    existsSync(file) {
      return files.has(file);
    },
    readFileSync: readFile,
    symlinkSync(from, to, type) {
      assert.equal(type, 'junction');
      files.set(to, { junction: from });
    },
  };
  const processBoundary = {
    argv: ['node', scriptPath, 'release'],
    execPath: process.execPath,
    stdout: { write: (value) => output.push(value) },
    stderr: { write: (value) => errors.push(value) },
    exitCode: 0,
  };
  const requireBoundary = (name) => {
    if (name === 'node:fs') return memoryFs;
    if (name === 'node:path') return path;
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
          assert.equal(certificate, path.join(root, 'sign/certificate.pem'));
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
  assert.equal(result.files.get(path.join(root, 'build/runtime/app.js')), 'fresh compiled runtime');
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

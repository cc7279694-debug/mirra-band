const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { configureManifest, identity } = require('../scripts/build-profiles.cjs');
const { sourceFilter } = require('../scripts/source-profile.cjs');
const base = require('../src/manifest.json');
const root = path.resolve(__dirname, '../src');

test('local session manifest has a separate identity and only bounded local storage capabilities', () => {
  const source = JSON.parse(JSON.stringify(base));
  source.config.background = { features: ['system.interconnect'] };
  source.permissions = [{ origin: '*' }];
  const before = JSON.stringify(source);
  const selected = configureManifest(source, 'local-session');
  const profile = identity('local-session');
  assert.equal(selected.package, 'com.guanyi.mirra.band.localsessiontest');
  assert.equal(selected.name, 'Mirra独立实验');
  assert.equal(selected.versionName, '0.1.4');
  assert.equal(selected.versionCode, 5);
  assert.equal(selected.icon, '/common/local-brand/icon-pending.png');
  for (const mode of ['live', 'demo', 'probe']) assert.notEqual(selected.package, identity(mode).package);
  assert.equal(profile.localSession, true);
  assert.equal(profile.storageQualified, true);
  assert.equal(profile.storageBackend, 'file');
  assert.equal(profile.signDirectory, 'sign');
  assert.equal(profile.fingerprint, identity('probe').fingerprint);
  assert.equal(selected.router.entry, 'pages/LocalSession');
  assert.deepEqual(Object.keys(selected.router.pages), ['pages/LocalSession']);
  assert.deepEqual(selected.router.pages['pages/LocalSession'], { component: 'index', launchMode: 'singleTask' });
  assert.deepEqual(selected.features.map(feature => feature.name).sort(), ['system.file', 'system.router', 'system.storage']);
  assert.equal(selected.config.background, undefined);
  assert.equal(selected.permissions, undefined);
  assert.equal(JSON.stringify(source), before);
});

test('local staging permits only its entry, local session modules, storage adapter and shared assets', () => {
  const include = sourceFilter(root, 'local-session');
  const allowed = ['manifest.json', 'profile.js', 'local-app.ux',
    'lib/local-session.js', 'lib/local-codec.js', 'lib/local-journal.js',
    'lib/local-owner.js', 'lib/local-presentation.js', 'lib/local-ui-flow.js', 'lib/local-performance.js', 'ui/local-tokens.js',
    'common/local-theme.css', 'common/local-brand/icon-pending.png',
    'platform/local-storage.js', 'platform/probe-storage.js', 'pages/LocalSession/index.ux'];
  for (const file of ['', 'pages', 'pages/LocalSession', 'common', 'lib', 'platform', ...allowed])
    assert.equal(include(path.join(root, file)), true, file);
  const denied = ['app.ux', 'probe-app.ux', 'lib/probe-controller.js', 'lib/probe-journal.js', 'lib/demo.js',
    'lib/companion-store.js', 'platform/interconnect-transport.js', 'pages/Home', 'pages/Home/index.ux',
    'pages/StorageProbe', 'pages/StorageProbe/index.ux', 'pages/States/index.ux', 'pages/LocalSession/extra.ux',
    'lib/local-unapproved.js', 'common/secret.pem', 'secret/private.pem', 'common/icon.png', 'common/icon.svg', 'common/theme.css'];
  for (const file of denied) assert.equal(include(path.join(root, file)), false, file);
  assert.equal(include(path.join(root, '..', 'sign/private.pem')), false);
});

test('demo and both storage probe versions exclude all local session experiment inputs', () => {
  for (const mode of ['demo', 'probe', 'probe-upgrade']) {
    const include = sourceFilter(root, mode);
    for (const file of ['local-app.ux', 'lib/local-session.js', 'lib/local-codec.js', 'lib/local-journal.js',
      'lib/local-owner.js', 'platform/local-storage.js', 'common/local-session.css', 'lib/local-future.js',
      'lib/local-presentation.js', 'lib/local-ui-flow.js', 'ui/local-tokens.js',
      'common/local-theme.css', 'common/local-brand/icon-pending.png',
      'pages/LocalSession', 'pages/LocalSession/index.ux']) {
      assert.equal(include(path.join(root, file)), false, mode + ': ' + file);
    }
  }
});

test('selecting the local experiment preserves existing companion and probe manifests', () => {
  const before = JSON.stringify(base);
  configureManifest(base, 'local-session');
  assert.equal(JSON.stringify(base), before);
  for (const mode of ['demo']) {
    const selected = configureManifest(base, mode);
    assert.equal(selected.router.entry, 'pages/Home');
    assert.equal(selected.router.pages['pages/LocalSession'], undefined);
    assert.deepEqual(selected.features.map(feature => feature.name).sort(), ['system.interconnect', 'system.router']);
  }
  const live = configureManifest(base, 'live');
  assert.equal(live.router.entry, 'pages/Mode');
  assert(live.router.pages['pages/LocalSession']);
  assert.deepEqual(live.features.map(feature => feature.name).sort(), ['system.crypto', 'system.file', 'system.interconnect', 'system.router']);
  for (const mode of ['probe', 'probe-upgrade']) {
    const selected = configureManifest(base, mode);
    assert.equal(selected.router.entry, 'pages/StorageProbe');
    assert.deepEqual(Object.keys(selected.router.pages), ['pages/StorageProbe']);
  }
});

function checkProject({ localBadge = '隔离实验', omitLocalPage = false } = {}) {
  const project = path.dirname(root);
  const scriptPath = path.join(project, 'scripts/check-project.cjs');
  const icon = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(icon);
  icon.writeUInt32BE(192, 16); icon.writeUInt32BE(192, 20);
  const files = new Map([[path.join(root, 'manifest.json'), JSON.stringify(base)], [path.join(root, 'common/icon.png'), icon],
    [path.join(root, 'common/local-brand/icon-pending.png'), icon]]);
  for (const page of ['Home', 'Detail', 'Control', 'Connection', 'States', 'StorageProbe', 'LocalSession', 'ClickProbe', 'Mode']) {
    if (page === 'LocalSession' && omitLocalPage) continue;
    const badge = page === 'Mode' ? '独立学习 手机伴侣' : page === 'ClickProbe' ? '隔离测试 · 不保存记录' : page === 'StorageProbe' ? '隔离测试数据' : page === 'LocalSession' ? localBadge : '演示数据';
    files.set(path.join(root, 'pages', page, 'index.ux'), '<template><text>' + badge + '</text></template><script>export default {}</script>');
  }
  const memoryFs = {
    readFileSync(file) { assert(files.has(file), 'Unknown checker input: ' + file); return files.get(file); },
    existsSync: file => files.has(file),
    readdirSync(directory) {
      const names = new Map();
      for (const file of files.keys()) {
        if (!file.startsWith(directory + path.sep)) continue;
        const relative = path.relative(directory, file), name = relative.split(path.sep)[0];
        names.set(name, relative.includes(path.sep));
      }
      return [...names].map(([name, isDirectory]) => ({ name, isDirectory: () => isDirectory }));
    }
  };
  const outputs = [], processBoundary = { execPath: process.execPath, exitCode: 0 };
  const requireBoundary = name => {
    if (name === 'node:fs') return memoryFs;
    if (name === 'node:path') return path;
    if (name === 'node:child_process') return { spawnSync: () => ({ status: 0, stderr: '' }) };
    if (name === './build-profiles.cjs') return { configureManifest, identity };
    throw new Error('Unexpected checker dependency: ' + name);
  };
  vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), { require: requireBoundary, __dirname: path.dirname(scriptPath), process: processBoundary,
    console: { log: value => outputs.push(value) } }, { filename: scriptPath });
  return { exitCode: processBoundary.exitCode, report: JSON.parse(outputs[0]) };
}

test('project checker accepts the isolated local badge without requiring a companion demo label', () => {
  const result = checkProject();
  assert.equal(result.exitCode, 0, result.report.errors.join('\n'));
});

test('project checker rejects a missing local isolation badge even if a demo label is present', () => {
  const result = checkProject({ localBadge: '演示数据' });
  assert.equal(result.exitCode, 1);
  assert(result.report.errors.some(error => error.includes('explicit local isolation badge')));
});

test('project checker checks routes from the selected local profile instead of only the source companion manifest', () => {
  const result = checkProject({ omitLocalPage: true });
  assert.equal(result.exitCode, 1);
  assert(result.report.errors.some(error => error.includes('pages/LocalSession')));
});

// The inspector receives genuinely signed in-memory archives. Only its file
// boundary and expected test certificate are substituted; ZIP/CRC/signature,
// metadata, resources and profile checks all execute unchanged.
const toolkitRequire = createRequire(require.resolve('aiot-toolkit/package.json'));
const packRequire = createRequire(toolkitRequire.resolve('@aiot-toolkit/aiotpack/package.json'));
const JSZip = packRequire('jszip');
const SignUtil = packRequire('@aiot-toolkit/aiotpack/lib/compiler/javascript/vela/utils/signature/SignUtil').default;
const jsrsasign = packRequire('jsrsasign');
let inspectorSigning;
function getInspectorSigning() {
  if (!inspectorSigning) {
    const keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKey = keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' });
    const certificate = jsrsasign.KJUR.asn1.x509.X509Util.newCertPEM({ serial: { int: 1 }, sigalg: 'SHA256withRSA',
      issuer: { str: '/CN=Mirra test fixture' }, subject: { str: '/CN=Mirra test fixture' },
      notbefore: '261012000000Z', notafter: '361012000000Z',
      sbjpubkey: keyPair.publicKey.export({ type: 'spki', format: 'pem' }), cakey: privateKey });
    inspectorSigning = { privateKey, certificate, fingerprint: new crypto.X509Certificate(certificate).fingerprint256 };
  }
  return inspectorSigning;
}

async function inspectFixture({ badge = '隔离实验', extraFiles = {}, mutateManifest = () => {} } = {}) {
  const manifest = configureManifest(base, 'local-session');
  mutateManifest(manifest);
  const resources = {
    'manifest.json': Buffer.from(JSON.stringify(manifest)),
    'app.js': Buffer.from('local session entry'),
    'pages/LocalSession/index.js': Buffer.from("[[0,'page'],[0,'badge'],[0,'button']]; '" + badge + "';"),
    'common/local-brand/icon-pending.png': Buffer.from('test icon resource'),
    ...Object.fromEntries(Object.entries(extraFiles).map(([name, content]) => [name, Buffer.from(content)]))
  };
  const hash = content => crypto.createHash('sha256').update(content).digest();
  const metadata = new JSZip();
  metadata.file('hash.json', JSON.stringify({ algorithm: 'SHA-256', digests: Object.fromEntries(Object.entries(resources).map(([name, content]) => [name, hash(content).toString('hex')])) }), { createFolders: false });
  const unsignedMeta = await metadata.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const signing = getInspectorSigning();
  resources['META-INF/CERT'] = SignUtil.doSign(unsignedMeta, [{ name: 'hash.json', hash: hash(unsignedMeta) }], signing.privateKey, signing.certificate);
  const zip = new JSZip();
  for (const [name, content] of Object.entries(resources)) zip.file(name, content);
  const unsigned = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const signed = SignUtil.doSign(unsigned, Object.entries(resources).map(([name, content]) => ({ name, hash: hash(content) })), signing.privateKey, signing.certificate);
  const scriptPath = path.join(path.dirname(root), 'scripts/inspect-rpk.cjs');
  const requireBoundary = name => {
    if (name === 'node:fs') return { readFileSync: () => signed };
    if (name === './build-profiles.cjs') return { identity: mode => ({ ...identity(mode), fingerprint: signing.fingerprint }) };
    return require(name);
  };
  requireBoundary.resolve = require.resolve;
  const moduleBoundary = { exports: {} };
  vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), { require: requireBoundary, module: moduleBoundary, __dirname: path.dirname(scriptPath),
    Buffer, process }, { filename: scriptPath });
  return moduleBoundary.exports.inspect('in-memory-local-session.rpk', undefined, 'local-session');
}

test('RPK inspector verifies a signed single-page local experiment with an explicit isolation badge', async () => {
  const report = await inspectFixture();
  assert.equal(report.package, 'com.guanyi.mirra.band.localsessiontest');
  assert.equal(report.version, '0.1.4');
  assert.equal(report.versionCode, 5);
  assert.equal(report.profile, 'local-session');
  assert.match(report.signature, /content and per-file SHA-256 verified/);
});

test('RPK inspector rejects signed local packages containing companion, demo or storage probe pages', async () => {
  for (const name of ['Home', 'Detail', 'Connection', 'Control', 'States', 'StorageProbe']) {
    await assert.rejects(inspectFixture({ extraFiles: { ['pages/' + name + '/index.js']: 'foreign page' } }), /page bundled in local experiment/);
  }
});

test('RPK inspector rejects communication, unlabelled data, excess capabilities and secrets in a signed local package', async () => {
  await assert.rejects(inspectFixture({ extraFiles: { 'transport.js': "require('system.interconnect')" } }), /Communication code bundled/);
  await assert.rejects(inspectFixture({ badge: '演示数据' }), /Explicit mode badge missing/);
  await assert.rejects(inspectFixture({ mutateManifest: manifest => { manifest.permissions = [{ origin: '*' }]; } }), /Unexpected experiment permissions/);
  await assert.rejects(inspectFixture({ mutateManifest: manifest => { manifest.features.push({ name: 'system.interconnect' }); } }),
    error => error.code === 'ERR_ASSERTION' && Array.isArray(error.actual) && error.actual.includes('system.interconnect'));
  await assert.rejects(inspectFixture({ mutateManifest: manifest => { manifest.config.background = true; } }), /Unexpected background permission/);
  await assert.rejects(inspectFixture({ extraFiles: { 'secret.pem': 'synthetic secret' } }), /Sensitive resource filenames/);
});

test('RPK inspector rejects a signed local archive claiming the companion identity, wrong version or wrong entry', async () => {
  for (const [field, value] of [['package', 'com.guanyi.mirra'], ['name', 'Mirra'], ['versionName', '0.2.0'], ['versionCode', 6]]) {
    await assert.rejects(inspectFixture({ mutateManifest: manifest => { manifest[field] = value; } }),
      error => error.code === 'ERR_ASSERTION' && error.actual === value);
  }
  await assert.rejects(inspectFixture({ mutateManifest: manifest => { manifest.router.entry = 'pages/Home'; } }),
    error => error.code === 'ERR_ASSERTION' && error.actual === 'pages/Home');
});

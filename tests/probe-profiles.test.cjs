const test = require('node:test');
const assert = require('node:assert/strict');
const { configureManifest, identity } = require('../scripts/build-profiles.cjs');
const source = require('../src/manifest.json');

test('both probe versions share isolated identity and certificate while excluding phone communication', () => {
  const first = configureManifest(source, 'probe');
  const upgrade = configureManifest(source, 'probe-upgrade');
  assert.equal(first.package, 'com.guanyi.mirra.band.storageprobe');
  assert.notEqual(first.package, identity('live').package);
  assert.equal(first.package, upgrade.package);
  assert.equal(identity('probe').fingerprint, identity('probe-upgrade').fingerprint);
  assert.equal(identity('probe').fingerprint, identity('demo').fingerprint);
  assert.equal(first.versionName, '0.1.0'); assert.equal(first.versionCode, 1);
  assert.equal(upgrade.versionName, '0.1.1'); assert.equal(upgrade.versionCode, 2);
  assert.deepEqual(Object.keys(first.router.pages), ['pages/StorageProbe']);
  assert.equal(first.router.entry, 'pages/StorageProbe');
  assert.deepEqual(first.features.map(value => value.name).sort(), ['system.file', 'system.router', 'system.storage']);
  assert.equal(first.config.background, undefined);
  assert.equal(first.permissions, undefined);
});

test('configuring an experiment cannot mutate existing live or demonstration identities', () => {
  const before = JSON.stringify(source);
  configureManifest(source, 'probe'); configureManifest(source, 'probe-upgrade');
  assert.equal(JSON.stringify(source), before);
  const live = configureManifest(source, 'live'); const demo = configureManifest(source, 'demo');
  assert.equal(live.versionName, '0.4.0'); assert.equal(live.versionCode, 9);
  assert.equal(demo.versionName, '0.2.0'); assert.equal(demo.versionCode, 2);
  assert.deepEqual(live.features.map(value => value.name).sort(), ['system.file', 'system.interconnect', 'system.router']);
  assert.equal(live.router.pages['pages/StorageProbe'], undefined);
});

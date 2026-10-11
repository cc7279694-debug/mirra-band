const test = require('node:test'); const assert = require('node:assert/strict');
const { configureManifest, identity } = require('../scripts/build-profiles.cjs');
const base = require('../src/manifest.json');
test('live identity/routes strictly exclude demo states, demo explicitly separate', () => {
  const live = configureManifest(base, 'live'), demo = configureManifest(base, 'demo');
  assert.equal(live.package, 'com.guanyi.mirra'); assert.equal(live.versionName, '0.2.0');
  assert.equal(live.versionCode, 2); assert.equal(live.router.pages['pages/States'], undefined);
  assert.equal(demo.package, 'com.guanyi.mirra.band.demo'); assert.ok(demo.router.pages['pages/States']);
  assert.notEqual(identity('live').fingerprint, identity('demo').fingerprint);
  assert.throws(() => identity('typo'));
  assert.equal(base.package, 'com.guanyi.mirra');
});

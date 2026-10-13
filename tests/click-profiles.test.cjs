const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { identity, configureManifest } = require('../scripts/build-profiles.cjs');
const { sourceFilter } = require('../scripts/source-profile.cjs');
const source = require('../src/manifest.json');
const root = path.resolve(__dirname, '../src');

test('native click probe has a separate identity and no business or storage capabilities', () => {
  const before = JSON.stringify(source);
  const manifest = configureManifest(source, 'click-probe');
  assert.equal(manifest.package, 'com.guanyi.mirra.band.clickprobe');
  assert.equal(manifest.versionName, '0.1.0');
  assert.equal(manifest.versionCode, 1);
  assert.equal(manifest.name, 'Mirra点击探针');
  assert.equal(manifest.display.backgroundColor, '#FFFFFF');
  assert.deepEqual(manifest.features, [{ name: 'system.router' }]);
  assert.equal(manifest.router.entry, 'pages/ClickProbe');
  assert.deepEqual(Object.keys(manifest.router.pages), ['pages/ClickProbe']);
  assert.equal(manifest.permissions, undefined);
  assert.equal(manifest.config.background, undefined);
  assert.equal(manifest.config.designWidth, 168);
  assert.equal(identity('click-probe').fingerprint, identity('local-session').fingerprint);
  assert.notEqual(manifest.package, identity('local-session').package);
  assert.equal(JSON.stringify(source), before);
});

test('click probe whitelist excludes all session owners, native storage and supplied raw logo', () => {
  const include = sourceFilter(root, 'click-probe');
  for (const file of ['manifest.json', 'profile.js', 'click-probe-app.ux', 'pages/ClickProbe/index.ux',
    'common/click-probe.css', 'common/local-brand/icon-pending.png']) assert(include(path.join(root, file)), file);
  for (const file of ['local-app.ux', 'app.ux', 'probe-app.ux', 'lib/local-owner.js', 'lib/local-ui-flow.js',
    'platform/local-storage.js', 'platform/probe-storage.js', 'pages/LocalSession/index.ux',
    'pages/StorageProbe/index.ux', 'pages/Home/index.ux', 'common/local-brand/logo-source.png',
    '../sign/private.pem', 'common/click-unapproved.css']) assert.equal(include(path.join(root, file)), false, file);
});

test('existing profiles cannot bundle click probe inputs or the pending original logo', () => {
  for (const mode of ['live', 'demo', 'probe', 'probe-upgrade', 'local-session']) {
    const include = sourceFilter(root, mode);
    for (const file of ['click-probe-app.ux', 'pages/ClickProbe/index.ux', 'common/click-probe.css',
      'common/local-brand/logo-source.png']) assert.equal(include(path.join(root, file)), false, mode + ': ' + file);
  }
});

test('local experiment retains its existing identity and white display during formal integration', () => {
  const profile = identity('local-session');
  assert.equal(profile.versionName, '0.1.4');
  assert.equal(profile.versionCode, 5);
  assert.equal(profile.package, 'com.guanyi.mirra.band.localsessiontest');
  assert.equal(configureManifest(source, 'local-session').display.backgroundColor, '#FFFFFF');
  assert.equal(identity('live').versionName, '0.4.0');
  assert.equal(identity('live').versionCode, 9);
});

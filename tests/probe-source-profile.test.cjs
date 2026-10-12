const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { sourceFilter } = require('../scripts/source-profile.cjs');
const root = path.resolve(__dirname, '../src');
test('staging probe excludes live entry, commands, communication and demonstration pages', () => {
  const include = sourceFilter(root, 'probe');
  for (const file of ['app.ux', 'lib/companion-store.js', 'lib/companion-protocol.js', 'platform/interconnect-transport.js',
    'pages/Home', 'pages/States', 'pages/Control/index.ux']) assert.equal(include(path.join(root, file)), false, file);
  for (const file of ['probe-app.ux', 'lib/probe-controller.js', 'lib/probe-journal.js', 'platform/probe-storage.js',
    'pages/StorageProbe/index.ux', 'pages', 'lib', 'common/theme.css']) assert.equal(include(path.join(root, file)), true, file);
  assert.equal(include(path.join(root, '..', 'sign', 'private.pem')), false);
});
test('staging existing profiles excludes all experiment code and preserves their own pages', () => {
  for (const mode of ['demo', 'live']) {
    const include = sourceFilter(root, mode);
    for (const file of ['probe-app.ux', 'lib/probe-controller.js', 'platform/probe-storage.js', 'pages/StorageProbe/index.ux'])
      assert.equal(include(path.join(root, file)), false, file);
    assert.equal(include(path.join(root, 'app.ux')), true);
    assert.equal(include(path.join(root, 'pages/Home/index.ux')), true);
    assert.equal(include(path.join(root, 'pages/States/index.ux')), mode === 'demo');
  }
});

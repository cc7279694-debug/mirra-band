const test = require('node:test');
const assert = require('node:assert/strict');
const { createLocalBackend } = require('../src/platform/local-storage');
const { createProbeBackend } = require('../src/platform/probe-storage');

function rig(kind = 'storage', hold = false) {
  const calls = []; const values = new Map(); const timers = new Map(); let next = 0;
  const native = {
    get(o) { calls.push(o); if (!hold) o.success(values.get(o.key) || ''); },
    set(o) { calls.push(o); values.set(o.key, o.value); if (!hold) o.success(); },
    readText(o) { calls.push(o); if (hold) return; if (values.has(o.uri)) o.success({ text: values.get(o.uri) }); else o.fail('', 301); },
    writeText(o) { calls.push(o); values.set(o.uri, o.text); if (!hold) o.success(); },
  };
  const options = { kind, loadModule() { return native; }, schedule(fn) { timers.set(++next, fn); return next; }, cancelSchedule(id) { timers.delete(id); } };
  return { calls, values, timers, options, backend: createLocalBackend(options) };
}
test('local storage addresses fixed 05B keys without altering 05A records', async () => {
  const r = rig(); r.values.set('mirra_05a_journal_a', '05A baseline');
  assert.equal(await r.backend.read(0), null);
  await r.backend.write(0, '中文📖'); await r.backend.write(1, 'new');
  assert.equal(await r.backend.read(0), '中文📖');
  assert.deepEqual(r.calls.map(o => o.key), ['mirra_05b_test_sessions_a', 'mirra_05b_test_sessions_a', 'mirra_05b_test_sessions_b', 'mirra_05b_test_sessions_a']);
  assert.equal(r.values.get('mirra_05a_journal_a'), '05A baseline');
});
test('local file addresses only fixed isolated durable URIs', async () => {
  const r = rig('file'); assert.equal(await r.backend.read(0), null);
  await r.backend.write(1, 'record'); assert.equal(await r.backend.read(1), 'record');
  assert.deepEqual(r.calls.map(o => o.uri), ['internal://files/mirra_05b_test_sessions_a.json', 'internal://files/mirra_05b_test_sessions_b.json', 'internal://files/mirra_05b_test_sessions_b.json']);
});
test('namespace is a strict enum rather than caller-controlled keys or paths', () => {
  for (const namespace of ['live', '../phone', '', null, {}, 'local-session-test/../probe']) {
    assert.throws(() => createProbeBackend({ kind: 'storage', namespace }), e => e.code === 'INVALID_NAMESPACE');
  }
});
test('default probe adapter continues addressing the exact 05A namespace', async () => {
  const r = rig(); const probe = createProbeBackend(r.options);
  await probe.read(0); await probe.write(1, 'test');
  assert.deepEqual(r.calls.map(o => o.key), ['mirra_05a_journal_a', 'mirra_05a_journal_b']);
});
test('local wrapper cannot be redirected using caller namespace', async () => {
  const r = rig(); const local = createLocalBackend(Object.assign({}, r.options, { namespace: 'probe' }));
  await local.write(0, 'sample'); assert.equal(r.calls[0].key, 'mirra_05b_test_sessions_a');
});
test('local native timeout latches unknown and late completion cannot unlock', async () => {
  const r = rig('storage', true); const pending = r.backend.write(0, 'record');
  const rejection = assert.rejects(pending, e => e.code === 'TIMEOUT');
  [...r.timers.values()][0](); await rejection; r.calls[0].success();
  assert.equal(r.backend.describe().uncertain, true);
  await assert.rejects(r.backend.read(0), e => e.code === 'UNCERTAIN');
  assert.equal(r.calls.length, 1);
});
test('local retirement cancels owned callbacks but does not claim native cancellation', async () => {
  const r = rig('file', true); const pending = r.backend.write(0, 'record');
  const rejection = assert.rejects(pending, e => e.code === 'CLOSED'); r.backend.close(); await rejection;
  r.calls[0].success(); assert.equal(r.backend.describe().uncertain, true); assert.equal(r.timers.size, 0);
  await assert.rejects(r.backend.write(1, 'next'), e => e.code === 'CLOSED');
});
test('local empty write and byte overflow reject before native IO', async () => {
  const r = rig(); await assert.rejects(r.backend.write(0, ''), e => e.code === 'INVALID_TEXT');
  await assert.rejects(r.backend.write(0, '中'.repeat(3000)), e => e.code === 'TEXT_TOO_LARGE');
  assert.equal(r.calls.length, 0);
});

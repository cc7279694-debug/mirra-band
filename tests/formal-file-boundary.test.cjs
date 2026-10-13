const test = require('node:test');
const assert = require('node:assert/strict');
const { createProbeBackend } = require('../src/platform/probe-storage');

test('formal namespaces use fixed file URIs and distinct byte budgets; experiment slots remain unchanged', async () => {
  const calls = [], loads = [], files = new Map();
  const native = { readText(o) { calls.push(['read', o.uri]); files.has(o.uri) ? o.success({ text: files.get(o.uri) }) : o.fail(null, 301); },
    writeText(o) { calls.push(['write', o.uri]); files.set(o.uri, o.text); o.success(); } };
  for (const [namespace, prefix, maximum] of [
    ['catalog-live', 'mirra_catalog_live', 32768], ['local-session-live', 'mirra_local_sessions_live', 8192],
    ['local-session-test', 'mirra_05b_test_sessions', 8192], ['probe', 'mirra_05a_journal', 8192]
  ]) {
    const backend = createProbeBackend({ kind: 'file', namespace, loadModule(name) { loads.push(name); return native; } });
    assert.equal(backend.describe().maxBytes, maximum);
    const text = '📖'.repeat(maximum / 4);
    await backend.write(0, text); assert.equal(await backend.read(0), text);
    assert.equal(await backend.read(1), null);
    const before = calls.length;
    await assert.rejects(backend.write(1, text + 'a'), e => e.code === 'TEXT_TOO_LARGE');
    assert.equal(calls.length, before);
    assert.deepEqual(calls.slice(-3), [['write', 'internal://files/' + prefix + '_a.json'],
      ['read', 'internal://files/' + prefix + '_a.json'], ['read', 'internal://files/' + prefix + '_b.json']]);
    backend.close();
  }
  assert(loads.every(name => name === '@system.file'));
  assert.equal(files.size, 4);
});

test('formal namespaces cannot select storage or arbitrary paths and reject oversized native data', async () => {
  for (const namespace of ['catalog-live', 'local-session-live']) {
    assert.throws(() => createProbeBackend({ kind: 'storage', namespace }), e => e.code === 'INVALID_KIND');
  }
  for (const namespace of ['../catalog-live', 'internal://files/other', '__proto__', 'constructor']) {
    assert.throws(() => createProbeBackend({ kind: 'file', namespace }), e => e.code === 'INVALID_NAMESPACE');
  }
  const backend = createProbeBackend({ kind: 'file', namespace: 'catalog-live',
    loadModule: () => ({ readText(o) { o.success({ text: 'a'.repeat(32769) }); } }) });
  await assert.rejects(backend.read(0), e => e.code === 'TEXT_TOO_LARGE');
  backend.close();
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { createProbeBackend } = require('../src/platform/probe-storage');
test('formal confirmed archive owns fixed file URIs with a bounded 64KiB native payload', async () => {
  const values = new Map(); const calls = [];
  const backend = createProbeBackend({ kind: 'file', namespace: 'local-record-archive-live', loadModule() { return {
    writeText(value) { calls.push(value.uri); values.set(value.uri, value.text); value.success(); },
    readText(value) { calls.push(value.uri); values.has(value.uri) ? value.success({ text: values.get(value.uri) }) : value.fail('', 301); }
  }; } });
  assert.equal(await backend.read(0), null); await backend.write(0, 'a'.repeat(65536)); assert.equal((await backend.read(0)).length, 65536);
  assert.equal(backend.describe().maxBytes, 65536);
  assert.deepEqual(calls, ['internal://files/mirra_local_record_archive_live_a.json', 'internal://files/mirra_local_record_archive_live_a.json', 'internal://files/mirra_local_record_archive_live_a.json']);
  const before = calls.length; await assert.rejects(backend.write(1, 'a'.repeat(65537)), error => error.code === 'TEXT_TOO_LARGE'); assert.equal(calls.length, before);
});
test('archive namespace is file-only and existing formal Session remains capped at 8192 bytes', async () => {
  assert.throws(() => createProbeBackend({ kind: 'storage', namespace: 'local-record-archive-live' }), error => error.code === 'INVALID_KIND');
  let called = false; const backend = createProbeBackend({ kind: 'file', namespace: 'local-session-live', loadModule() { called = true; return {}; } });
  await assert.rejects(backend.write(0, 'a'.repeat(8193)), error => error.code === 'TEXT_TOO_LARGE'); assert.equal(called, false);
});

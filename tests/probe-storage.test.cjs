const test = require('node:test');
const assert = require('node:assert/strict');
const { createProbeBackend } = require('../src/platform/probe-storage');

// Native callbacks and timer delivery are the external boundary; the adapter is real.
function rig(kind = 'storage', behavior = {}) {
  const calls = []; const loads = []; const timers = new Map(); let timerId = 0;
  const native = {
    get(options) { calls.push({ method: 'get', options }); (behavior.read || (o => o.success('saved')))(options); },
    set(options) { calls.push({ method: 'set', options }); (behavior.write || (o => o.success()))(options); },
    readText(options) { calls.push({ method: 'readText', options }); (behavior.read || (o => o.success({ text: 'saved' })))(options); },
    writeText(options) { calls.push({ method: 'writeText', options }); (behavior.write || (o => o.success()))(options); },
  };
  const backend = createProbeBackend({ kind, loadModule(name) { loads.push(name); return native; },
    schedule(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    cancelSchedule(id) { timers.delete(id); } });
  return { backend, native, calls, loads, timers };
}
function rejectsCode(promise, code) {
  return assert.rejects(promise, error => {
    assert.equal(error.code, code); assert.equal(error.message, code); return true;
  });
}

test('storage reads only the two fixed keys and preserves documented string callbacks', async () => {
  const r = rig('storage', { read: o => o.success('中文📖') });
  assert.equal(await r.backend.read(0), '中文📖');
  assert.equal(await r.backend.read(1), '中文📖');
  assert.deepEqual(r.loads, ['@system.storage']);
  assert.deepEqual(r.calls.map(c => [c.method, c.options.key]), [
    ['get', 'mirra_05a_journal_a'], ['get', 'mirra_05a_journal_b'],
  ]);
  assert.equal(r.timers.size, 0);
});
test('storage missing empty string becomes null without assuming object callbacks', async () => {
  const r = rig('storage', { read: o => o.success('') });
  assert.equal(await r.backend.read(0), null);
  assert.equal(r.calls.length, 1);
});
test('file reads only fixed persistent file URIs and extracts documented text', async () => {
  const r = rig('file', { read: o => o.success({ text: '{"marker":"测试"}' }) });
  assert.equal(await r.backend.read(0), '{"marker":"测试"}');
  assert.equal(await r.backend.read(1), '{"marker":"测试"}');
  assert.deepEqual(r.loads, ['@system.file']);
  assert.deepEqual(r.calls.map(c => [c.method, c.options.uri]), [
    ['readText', 'internal://files/mirra_05a_journal_a.json'],
    ['readText', 'internal://files/mirra_05a_journal_b.json'],
  ]);
});
test('only documented file read error 301 means absent; I/O errors remain errors', async () => {
  const r = rig('file', { read: o => o.fail('private native path', 301) });
  assert.equal(await r.backend.read(0), null);
  r.native.readText = o => o.fail('private native path', 300);
  await rejectsCode(r.backend.read(1), 'NATIVE_FAIL_300');
  assert.equal(r.backend.describe().uncertain, false);
});
test('storage and file writes use selected native API without delete or clear', async () => {
  for (const kind of ['storage', 'file']) {
    const r = rig(kind);
    await r.backend.write(1, '测试📖');
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0].method, kind === 'storage' ? 'set' : 'writeText');
    assert.equal(r.calls[0].options[kind === 'storage' ? 'key' : 'uri'], kind === 'storage'
      ? 'mirra_05a_journal_b' : 'internal://files/mirra_05a_journal_b.json');
    assert.equal(r.calls[0].options[kind === 'storage' ? 'value' : 'text'], '测试📖');
    assert.equal(r.timers.size, 0);
  }
});
test('invalid slots reject before module load and cannot address unrelated data', async () => {
  const r = rig();
  for (const slot of [-1, 2, '0', null, NaN, {}, 'other-key']) {
    await rejectsCode(r.backend.read(slot), 'INVALID_SLOT');
    await rejectsCode(r.backend.write(slot, 'test'), 'INVALID_SLOT');
  }
  assert.deepEqual(r.loads, []); assert.equal(r.calls.length, 0);
});
test('nonstring and malformed Unicode writes reject before loading a feature', async () => {
  const r = rig();
  for (const value of [null, {}, 12, new String('text')]) await rejectsCode(r.backend.write(0, value), 'INVALID_TEXT');
  for (const value of ['\ud800', '\udfff', 'x\ud800z']) await rejectsCode(r.backend.write(0, value), 'INVALID_UNICODE');
  assert.deepEqual(r.loads, []);
});
test('empty writes reject before native load and cannot invoke storage key deletion', async () => {
  for (const kind of ['storage', 'file']) {
    const r = rig(kind);
    await rejectsCode(r.backend.write(0, ''), 'INVALID_TEXT');
    await rejectsCode(r.backend.write(1, ''), 'INVALID_TEXT');
    assert.deepEqual(r.loads, []); assert.equal(r.calls.length, 0);
  }
});
test('UTF8 8192 byte boundary accepts exact size and rejects oversized writes before native call', async () => {
  const r = rig();
  await r.backend.write(0, 'a'.repeat(8192));
  await r.backend.write(1, '📖'.repeat(2048));
  assert.equal(r.calls.length, 2);
  await rejectsCode(r.backend.write(0, 'a'.repeat(8193)), 'TEXT_TOO_LARGE');
  await rejectsCode(r.backend.write(0, '📖'.repeat(2048) + 'a'), 'TEXT_TOO_LARGE');
  assert.equal(r.calls.length, 2);
});
test('oversized or invalid Unicode native reads are rejected rather than passed to journal', async () => {
  for (const kind of ['storage', 'file']) {
    const wrap = value => kind === 'file' ? { text: value } : value;
    const r = rig(kind, { read: o => o.success(wrap('a'.repeat(8193))) });
    await rejectsCode(r.backend.read(0), 'TEXT_TOO_LARGE');
    r.native[kind === 'file' ? 'readText' : 'get'] = o => o.success(wrap('\ud800'));
    await rejectsCode(r.backend.read(0), 'INVALID_UNICODE');
  }
});
test('malformed success callback shapes never become a valid empty or successful write', async () => {
  for (const value of [undefined, null, 2, { data: 'saved' }]) {
    const r = rig('storage', { read: o => o.success(value) });
    await rejectsCode(r.backend.read(0), 'CALLBACK_SHAPE');
  }
  for (const value of [undefined, null, 'saved', {}, { text: 2 }, ['saved'], { text: 'saved', unexpected: true }]) {
    const r = rig('file', { read: o => o.success(value) });
    await rejectsCode(r.backend.read(0), 'CALLBACK_SHAPE');
  }
  for (const kind of ['storage', 'file']) {
    const r = rig(kind, { write: o => o.success({ unknown: 'private detail' }) });
    await rejectsCode(r.backend.write(0, 'test'), 'CALLBACK_SHAPE');
  }
});
test('native failures expose only bounded numeric codes and permit a subsequent recovery read', async () => {
  const r = rig('storage', { write: o => o.fail('private signing path', 300) });
  await rejectsCode(r.backend.write(0, 'test'), 'NATIVE_FAIL_300');
  assert.equal(await r.backend.read(0), 'saved');
  r.native.get = o => o.fail({ get message() { throw new Error('private'); } }, 'private-secret');
  await rejectsCode(r.backend.read(0), 'NATIVE_FAIL_UNKNOWN');
  assert.equal(r.backend.describe().uncertain, false);
});
test('duplicate success and late fail settle exactly once with no leftover timer', async () => {
  let callback; const r = rig('storage', { read: o => { callback = o; } });
  const pending = r.backend.read(0);
  callback.success('first'); callback.success('second'); callback.fail('private', 300);
  assert.equal(await pending, 'first'); assert.equal(r.timers.size, 0);
  assert.equal(r.backend.describe().pendingCount, 0);
});
test('timeout poisons backend including other in-flight reads; late native success cannot heal it', async () => {
  const callbacks = []; const r = rig('storage', { read: o => callbacks.push(o) });
  const first = r.backend.read(0); const second = r.backend.read(1);
  const firstFailure = rejectsCode(first, 'TIMEOUT'); const secondFailure = rejectsCode(second, 'UNCERTAIN');
  assert.equal(r.timers.size, 2);
  const timer = [...r.timers.values()][0]; assert.equal(timer.delay, 5000); timer.fn();
  await firstFailure; await secondFailure;
  assert.equal(r.timers.size, 0); assert.equal(r.backend.describe().uncertain, true);
  callbacks.forEach(o => o.success('late'));
  await rejectsCode(r.backend.read(0), 'UNCERTAIN');
  await rejectsCode(r.backend.write(0, 'must not write'), 'UNCERTAIN');
  assert.equal(callbacks.length, 2);
});
test('timeout after a write never reports save success or launches a retry', async () => {
  let callback; const r = rig('file', { write: o => { callback = o; } });
  const pending = r.backend.write(0, 'data'); const failure = rejectsCode(pending, 'TIMEOUT');
  [...r.timers.values()][0].fn(); await failure;
  callback.success();
  assert.equal(r.backend.describe().uncertain, true); assert.equal(r.calls.length, 1);
});
test('close cancels owned timers and rejects pending promises without pretending to cancel native IO', async () => {
  let callback; const r = rig('file', { write: o => { callback = o; } });
  const pending = r.backend.write(0, 'data'); const failure = rejectsCode(pending, 'CLOSED');
  r.backend.close(); r.backend.close(); await failure;
  assert.equal(r.timers.size, 0); assert.equal(r.backend.describe().closed, true);
  callback.success(); callback.fail('private', 300);
  await rejectsCode(r.backend.read(0), 'CLOSED');
  await rejectsCode(r.backend.write(0, 'test'), 'CLOSED');
  assert.equal(r.calls.length, 1);
});
test('module or missing method errors are safe and cannot accidentally select another feature', async () => {
  const backend = createProbeBackend({ kind: 'file', loadModule() { throw new Error('private-secret'); } });
  await rejectsCode(backend.read(0), 'MODULE_LOAD_FAILED');
  assert.equal(backend.describe().uncertain, false);
  const missing = createProbeBackend({ kind: 'storage', loadModule: () => ({}) });
  await rejectsCode(missing.write(0, 'test'), 'API_MISSING');
});
test('a synchronous native throw during IO fails closed because completion is unknown', async () => {
  const r = rig('storage', { write() { throw new Error('private-secret'); } });
  await rejectsCode(r.backend.write(0, 'test'), 'NATIVE_THROW');
  assert.equal(r.backend.describe().uncertain, true);
  await rejectsCode(r.backend.read(0), 'UNCERTAIN');
});
test('configured timeouts are bounded and invalid configuration cannot issue IO', async () => {
  assert.throws(() => createProbeBackend({ kind: 'other', loadModule() {} }), /INVALID_KIND/);
  for (const timeoutMs of [0, -1, 5001, Infinity, '5', 1.5]) {
    assert.throws(() => createProbeBackend({ kind: 'storage', loadModule() {}, timeoutMs }), /INVALID_TIMEOUT/);
  }
  let delay;
  const backend = createProbeBackend({ kind: 'storage', loadModule: () => ({ get: o => o.success('value') }),
    schedule(fn, ms) { delay = ms; return 1; }, cancelSchedule() {}, timeoutMs: 100 });
  assert.equal(await backend.read(0), 'value'); assert.equal(delay, 100);
});
test('malformed file objects cannot make the adapter inspect arbitrary thrown error getters', async () => {
  let codeRead = 0;
  const nativeThrow = { get code() { codeRead++; throw new Error('private error detail'); } };
  const payload = new Proxy({}, { ownKeys() { throw nativeThrow; } });
  const r = rig('file', { read: o => o.success(payload) });
  await rejectsCode(r.backend.read(0), 'CALLBACK_SHAPE');
  assert.equal(codeRead, 0); assert.equal(r.backend.describe().uncertain, false);
  r.native.readText = o => o.success({ text: 'recovered' });
  assert.equal(await r.backend.read(0), 'recovered');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const domain = require('../src/lib/local-session');
let factory; try { factory = require('../src/lib/record-archive').createRecordArchive; } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
const hash = raw => crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
function record(ordinal = 1) {
  const observation = { wallMs: 1000, ownerId: 'fixture-owner', monotonicMs: null, monotonicVerified: false };
  let doc = domain.createDocument('archive-install'); doc.counter = ordinal - 1;
  doc = domain.transition(doc, { type: 'START_CONFIRMED', bookId: 'test-reading-1', firstActionId: 'read-first-paragraph', confirmed: true }, observation);
  doc = domain.transition(doc, { type: 'FINISH', endPage: null }, observation);
  return { schemaVersion: 1, installationId: doc.installationId, session: doc.pending[0] };
}
function receipt(value) { const canonical = JSON.stringify(value); return { installationId: value.installationId, sessionId: value.session.id, digest: hash(canonical), bytes: Buffer.byteLength(canonical), status: 'PERSISTED' }; }
function rig(slots = [null, null]) {
  assert.equal(typeof factory, 'function', 'record archive is not implemented');
  const writes = []; let failure = null; let count = 0;
  const backend = { async read(slot) { return slots[slot]; }, async write(slot, raw) { count++; writes.push(slot); if (failure && failure.count === count) { if (failure.writeFirst) slots[slot] = raw; throw Object.assign(new Error('private'), { code: failure.code }); } slots[slot] = raw; } };
  const archive = factory({ backend, hash }); return { archive, slots, writes, backend, fail(count, code = 'NATIVE_FAIL_300', writeFirst = false) { failure = { count, code, writeFirst }; } };
}
test('confirmed raw facts become sealed only after both independent archive readbacks', async () => {
  const r = rig(); assert.equal((await r.archive.open()).status, 'empty'); const value = record();
  const result = await r.archive.saveConfirmed(value, receipt(value));
  assert.equal(result.status, 'ready'); assert.equal(result.sealed, true); assert.deepEqual(r.writes, [0, 1]);
  assert.equal(r.slots[0], r.slots[1]); assert.deepEqual(r.archive.records(), [value]);
});
test('duplicate confirmation is idempotent and a changed raw fact conflicts', async () => {
  const r = rig(); await r.archive.open(); const value = record(); await r.archive.saveConfirmed(value, receipt(value));
  const before = r.writes.length; await r.archive.saveConfirmed(value, receipt(value)); assert.equal(r.writes.length, before);
  const changed = JSON.parse(JSON.stringify(value)); changed.session.endPage = 9;
  assert.equal((await r.archive.saveConfirmed(changed, receipt(changed))).code, 'ARCHIVE_RECORD_CONFLICT'); assert.equal(r.writes.length, before);
});
test('ACK digest bytes identity and status are checked before any archive write', async () => {
  const value = record();
  for (const patch of [{ digest: 'f'.repeat(64) }, { bytes: 1 }, { installationId: 'other' }, { sessionId: 'archive-install:2' }, { status: 'SENT' }]) {
    const r = rig(); await r.archive.open(); const result = await r.archive.saveConfirmed(value, { ...receipt(value), ...patch });
    assert.equal(result.status, 'blocked'); assert.equal(r.writes.length, 0); assert.deepEqual(r.archive.records(), []);
  }
});
test('failure while mirroring keeps first copy but cannot prove a new pending retirement', async () => {
  const r = rig(); await r.archive.open(); const value = record(); r.fail(2);
  assert.equal((await r.archive.saveConfirmed(value, receipt(value))).status, 'blocked');
  const restored = rig(r.slots); const state = await restored.archive.open(); assert.equal(state.sealed, false); assert.deepEqual(restored.archive.records(), [value]);
  const previous = domain.createDocument(value.installationId); previous.counter = 1; previous.pending = [value.session]; previous.state = 'FINISHED_PENDING_SYNC';
  const next = domain.createDocument(value.installationId); next.counter = 1;
  assert.equal(await restored.archive.historyError(previous, next, { requireSealed: true }), 'PENDING_DISAPPEARED');
  assert.equal((await restored.archive.saveConfirmed(value, receipt(value))).sealed, true);
  assert.equal(await restored.archive.historyError(previous, next, { requireSealed: true }), null);
});
test('one corrupted archive copy recovers all mirrored retired facts without an empty fallback', async () => {
  const r = rig(); await r.archive.open(); const value = record(); await r.archive.saveConfirmed(value, receipt(value)); r.slots[0] = '{';
  const restored = rig(r.slots); assert.equal((await restored.archive.open()).status, 'recovered'); assert.deepEqual(restored.archive.records(), [value]);
  const previous = domain.createDocument(value.installationId); previous.counter = 1; previous.pending = [value.session]; previous.state = 'FINISHED_PENDING_SYNC';
  const next = domain.createDocument(value.installationId); next.counter = 1;
  assert.equal(await restored.archive.historyError(previous, next, { requireSealed: false }), null);
  assert.equal(await restored.archive.historyError(previous, next, { requireSealed: true }), 'PENDING_DISAPPEARED');
});
test('unknown schema and both corrupted slots block rather than appear empty', async () => {
  const r = rig(); await r.archive.open(); const value = record(); await r.archive.saveConfirmed(value, receipt(value));
  const changed = JSON.parse(r.slots[0]); changed.schemaVersion = 99;
  for (const slots of [['{', '{'], [JSON.stringify(changed), r.slots[1]]]) { const next = rig(slots); assert.equal((await next.archive.open()).status, 'blocked'); assert.equal((await next.archive.saveConfirmed(value, receipt(value))).status, 'blocked'); assert.equal(next.writes.length, 0); }
});
test('timeout cannot be unlocked by reopening the same owner', async () => {
  const r = rig(); await r.archive.open(); const value = record(); r.fail(1, 'TIMEOUT', true);
  assert.equal((await r.archive.saveConfirmed(value, receipt(value))).status, 'uncertain'); assert.equal((await r.archive.open()).status, 'uncertain');
  assert.equal((await r.archive.saveConfirmed(value, receipt(value))).status, 'uncertain');
});
test('byte capacity preserves the full confirmed archive and never evicts older raw records', async () => {
  const r = rig(); await r.archive.open(); let full = false;
  for (let ordinal = 1; ordinal <= 65; ordinal++) { const value = record(ordinal); const before = r.archive.records(); const writes = r.writes.length; const result = await r.archive.saveConfirmed(value, receipt(value)); if (result.code === 'ARCHIVE_CAPACITY') { assert.deepEqual(r.archive.records(), before); assert.equal(r.writes.length, writes); full = true; break; } }
  assert.equal(full, true); assert.ok(r.archive.records().length > 8); assert.ok(Buffer.byteLength(r.slots[0]) <= 65536);
});

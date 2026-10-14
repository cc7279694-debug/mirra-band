const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createRecordArchive } = require('../src/lib/record-archive');
const { createLocalOwner } = require('../src/lib/local-owner');
const { createJournal } = require('../src/lib/local-journal');
const { createDocument, transition } = require('../src/lib/local-session');
const { encodeRecord } = require('../src/lib/local-codec');
const model = require('../src/lib/record-model');
const hash = raw => crypto.createHash('sha256').update(raw).digest('hex');
const time = () => ({ wallMs: 1000, ownerId: 'retirement-owner', monotonicMs: null, monotonicVerified: false });
function completed() { let doc = createDocument('retirement-install'); doc = transition(doc, { type: 'START_CONFIRMED', bookId: 'test-reading-1', firstActionId: 'read-first-paragraph', confirmed: true }, time()); return transition(doc, { type: 'FINISH', endPage: null }, time()); }
function receipt(record) { const raw = model.canonicalRecord(record); return { installationId: record.installationId, sessionId: record.session.id, digest: hash(raw), bytes: Buffer.byteLength(raw), status: 'PERSISTED' }; }
function rig(doc = completed(), existing = null, profile = 'formal') {
  const slots = existing || { primary: [encodeRecord(1, doc, { profile }), null], archive: [null, null] }; const calls = []; let failMirror = false;
  const primary = { async read(slot) { calls.push('primary-read-' + slot); return slots.primary[slot]; }, async write(slot, raw) { calls.push('primary-write-' + slot); slots.primary[slot] = raw; } };
  const backend = { async read(slot) { calls.push('archive-read-' + slot); return slots.archive[slot]; }, async write(slot, raw) { calls.push('archive-write-' + slot); if (failMirror && slot === 1) throw Object.assign(new Error('private'), { code: 'NATIVE_FAIL_300' }); slots.archive[slot] = raw; } };
  const archive = createRecordArchive({ backend, hash });
  const owner = createLocalOwner({ backendFactory: () => primary, clock: time, installationIdFactory: () => 'must-not-create', storageQualified: true, sessionContext: { profile }, recordArchive: archive,
    catalogProvider: () => [{ id: 'test-reading-1', title: '真实书', startPage: 1, firstActions: [{ id: 'read-first-paragraph', text: '读第一段。' }] }], catalogRevisionProvider: () => 'fixture-revision' });
  return { owner, archive, slots, calls, primary, failMirror() { failMirror = true; } };
}
async function opened(r) { await r.archive.open(); await r.owner.open(); }
test('single formal owner seals archive twice before CAS retiring an exact schema1 pending record', async () => {
  const r = rig(); await opened(r); const before = r.owner.snapshot().document; const value = { schemaVersion: 1, installationId: before.installationId, session: before.pending[0] };
  assert.equal(typeof r.owner.acknowledgeCompleted, 'function'); const result = await r.owner.acknowledgeCompleted({ recordId: value.session.id, receipt: receipt(value) });
  assert.equal(result.document.pending.length, 0); assert.equal(result.document.state, 'IDLE'); assert.equal(result.document.schemaVersion, 1); assert.equal(result.document.counter, 1);
  assert.equal(result.confirmed, true);
  assert.ok(r.calls.indexOf('primary-write-1') > r.calls.lastIndexOf('archive-write-1')); assert.deepEqual(r.archive.records(), [value]);
});
test('mirror failure leaves original pending raw facts and primary bytes unchanged', async () => {
  const r = rig(); await opened(r); const before = r.owner.snapshot().document; const raw = r.slots.primary.slice(); r.failMirror();
  const value = { schemaVersion: 1, installationId: before.installationId, session: before.pending[0] };
  assert.equal(typeof r.owner.acknowledgeCompleted, 'function'); const result = await r.owner.acknowledgeCompleted({ recordId: value.session.id, receipt: receipt(value) });
  assert.equal(result.confirmed, false);
  assert.deepEqual(r.owner.snapshot().document, before); assert.deepEqual(r.slots.primary, raw);
  assert.equal(r.owner.snapshot().canWrite, false);
});
test('cold recovery accepts retired schema1 history only from a retained valid complete archive', async () => {
  const r = rig(); await opened(r); const doc = r.owner.snapshot().document; const value = { schemaVersion: 1, installationId: doc.installationId, session: doc.pending[0] };
  assert.equal(typeof r.owner.acknowledgeCompleted, 'function'); await r.owner.acknowledgeCompleted({ recordId: value.session.id, receipt: receipt(value) }); r.slots.archive[0] = '{';
  const restored = rig(doc, r.slots); await opened(restored); assert.equal(restored.owner.snapshot().document.pending.length, 0); assert.deepEqual(restored.archive.records(), [value]);
});
test('a forged proof callback cannot authorize pending deletion and experiment remains immutable', async () => {
  const before = completed(); const next = createDocument(before.installationId); next.counter = before.counter;
  for (const profile of ['formal', 'experiment']) {
    const raw = encodeRecord(1, before, { profile }); let writes = 0;
    const journal = createJournal({ backend: { async read(slot) { return slot === 0 ? raw : null; }, async write() { writes++; } }, context: { profile }, recordArchive: { historyError: async () => null, snapshot: () => ({ sealed: true }) } });
    assert.equal((await journal.save(next)).code, 'PENDING_DISAPPEARED'); assert.equal(writes, 0);
  }
});
test('all eight sealed acknowledgements free the original pending capacity for the ninth study', async () => {
  let doc = createDocument('retirement-install'); for (let n = 0; n < 8; n++) { doc = transition(doc, { type: 'START_CONFIRMED', bookId: 'test-reading-1', firstActionId: 'read-first-paragraph', confirmed: true }, time()); doc = transition(doc, { type: 'FINISH', endPage: null }, time()); }
  const r = rig(doc); await opened(r); assert.equal(typeof r.owner.acknowledgeCompleted, 'function');
  for (const session of doc.pending) { const value = { schemaVersion: 1, installationId: doc.installationId, session }; await r.owner.acknowledgeCompleted({ recordId: session.id, receipt: receipt(value) }); }
  const result = await r.owner.dispatch({ type: 'START_CONFIRMED', bookId: 'test-reading-1', firstActionId: 'read-first-paragraph', confirmed: true, catalogRevision: 'fixture-revision' });
  assert.equal(result.errorCode, null); assert.equal(result.document.active.id, 'retirement-install:9'); assert.equal(result.document.pending.length, 0); assert.equal(r.archive.records().length, 8);
});
test('a retained archive cannot be paired with empty or rolled back primary identity', async () => {
  const r = rig(); await opened(r); const doc = r.owner.snapshot().document; const value = { schemaVersion: 1, installationId: doc.installationId, session: doc.pending[0] };
  await r.owner.acknowledgeCompleted({ recordId: value.session.id, receipt: receipt(value) });
  for (const primary of [[null, null], [encodeRecord(1, createDocument(doc.installationId), { profile: 'formal' }), null], [encodeRecord(1, createDocument('other-install'), { profile: 'formal' }), null]]) {
    const restored = rig(doc, { primary, archive: r.slots.archive.slice() }); await opened(restored);
    assert.equal(restored.owner.snapshot().status, 'BLOCKED'); assert.equal(restored.owner.snapshot().canWrite, false); assert.equal(restored.calls.some(call => call.startsWith('primary-write')), false);
  }
});
test('retired ordinal gaps cannot treat a wholly disappeared archive as a fresh empty namespace', async () => {
  const r = rig(); await opened(r); const doc = r.owner.snapshot().document; const value = { schemaVersion: 1, installationId: doc.installationId, session: doc.pending[0] };
  await r.owner.acknowledgeCompleted({ recordId: value.session.id, receipt: receipt(value) });
  const cleared = r.owner.snapshot().document; const restored = rig(cleared, { primary: [encodeRecord(3, cleared, { profile: 'formal' }), encodeRecord(4, cleared, { profile: 'formal' })], archive: [null, null] });
  await opened(restored); assert.equal(restored.owner.snapshot().status, 'BLOCKED'); assert.equal(restored.owner.snapshot().errorCode, 'RECORD_HISTORY_INCOMPLETE');
});
test('wrong receipt leaves pending untouched and a correct repeated ACK never creates another primary save', async () => {
  const r = rig(); await opened(r); const doc = r.owner.snapshot().document; const value = { schemaVersion: 1, installationId: doc.installationId, session: doc.pending[0] };
  const before = r.slots.primary.slice(); await r.owner.acknowledgeCompleted({ recordId: value.session.id, receipt: { ...receipt(value), digest: 'f'.repeat(64) } });
  assert.deepEqual(r.slots.primary, before); assert.deepEqual(r.owner.snapshot().document, doc);
  await r.owner.acknowledgeCompleted({ recordId: value.session.id, receipt: receipt(value) }); const retired = r.slots.primary.slice();
  await r.owner.acknowledgeCompleted({ recordId: value.session.id, receipt: receipt(value) }); assert.deepEqual(r.slots.primary, retired); assert.equal(r.archive.records().length, 1);
});
test('a concurrent newer primary causes CAS failure after archive sealing without deleting either fact', async () => {
  const r = rig(); await opened(r); const doc = r.owner.snapshot().document; const value = { schemaVersion: 1, installationId: doc.installationId, session: doc.pending[0] };
  // Race is injected at native archive IO, while the production owner is busy.
  let replaced = false;
  const originalArchiveSlot = r.slots.archive;
  Object.defineProperty(originalArchiveSlot, '1', { configurable: true, get() { return this.mirrored || null; }, set(raw) { this.mirrored = raw; if (!replaced) { replaced = true; const next = JSON.parse(JSON.stringify(doc)); next.state = 'IDLE'; r.slots.primary[1] = encodeRecord(2, next, { profile: 'formal' }); } } });
  await r.owner.acknowledgeCompleted({ recordId: value.session.id, receipt: receipt(value) });
  assert.equal(r.owner.snapshot().status, 'BLOCKED'); assert.equal(r.owner.snapshot().errorCode, 'STATE_CHANGED'); assert.deepEqual(r.owner.snapshot().document, doc); assert.deepEqual(r.archive.records(), [value]);
});

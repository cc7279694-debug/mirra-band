const test = require('node:test');
const assert = require('node:assert/strict');
const { createJournal } = require('../src/lib/local-journal');
const { createDocument, transition, TEST_BOOKS } = require('../src/lib/local-session');
const { encodeRecord, MAX_SEQUENCE } = require('../src/lib/local-codec');

function rig(values = [null, null]) {
  const slots = values.slice(); const writes = []; let failRead = false; let failWrite = false;
  const backend = { async read(slot) { if (failRead) throw Object.assign(new Error('PRIVATE'), { code: 'NATIVE_FAIL_300' }); return slots[slot]; },
    async write(slot, text) { writes.push({ slot, text }); if (failWrite) throw Object.assign(new Error('PRIVATE'), { code: 'NATIVE_FAIL_300' }); slots[slot] = text; } };
  return { backend, slots, writes, journal: createJournal({ backend }), failRead() { failRead = true; }, failWrite() { failWrite = true; } };
}
const doc = () => createDocument('installation-test');
function activeDocument() {
  let current = doc(); let wallMs = 100000;
  const time = () => ({ wallMs: wallMs++, ownerId: 'history-owner', monotonicMs: null, monotonicVerified: false });
  current = transition(current, { type: 'SELECT_BOOK', bookId: TEST_BOOKS[0].id }, time());
  current = transition(current, { type: 'SELECT_ACTION', firstActionId: 'read-first-paragraph' }, time());
  return transition(current, { type: 'CONFIRM_START', confirmed: true }, time());
}
const time = wallMs => ({ wallMs, ownerId: 'history-owner', monotonicMs: null, monotonicVerified: false });
const finishedDocument = () => transition(activeDocument(), { type: 'FINISH', endPage: null }, time(101000));
test('empty recovery reads both independent slots before deciding the namespace is empty', async () => {
  const reads = []; const journal = createJournal({ backend: { async read(slot) { reads.push(slot); return null; }, async write() {} } });
  assert.equal((await journal.recover()).status, 'empty'); assert.deepEqual(reads, [0, 1]);
});
test('both genuinely absent slots recover empty; initial save is read back exactly', async () => {
  const r = rig(); assert.equal((await r.journal.recover()).status, 'empty');
  const result = await r.journal.save(doc()); assert.equal(result.status, 'ready'); assert.equal(result.sequence, 1);
  assert.deepEqual(result.document, doc()); assert.equal(r.writes[0].slot, 0);
  assert.deepEqual((await createJournal({ backend: r.backend }).recover()).document, doc());
});
test('save writes opposite slot and preserves last known valid bytes', async () => {
  const raw = encodeRecord(1, doc()); const r = rig([raw, null]); const next = doc();
  next.counter = 1; const result = await r.journal.save(next);
  assert.equal(result.status, 'ready'); assert.equal(result.sequence, 2); assert.equal(r.slots[0], raw); assert.equal(r.writes[0].slot, 1);
});
test('truncated newest slot recovers older canonical document without emptying it', async () => {
  const raw = encodeRecord(2, doc()); const r = rig([raw, raw.slice(0, -10)]);
  const result = await r.journal.recover(); assert.equal(result.status, 'recovered'); assert.equal(result.sequence, 2); assert.deepEqual(result.document, doc());
});
test('unknown schema or marker blocks even beside an older valid snapshot', async () => {
  const raw = encodeRecord(1, doc());
  for (const mutation of [value => { value.schemaVersion = 999; }, value => { value.marker = 'OTHER_IDENTITY'; }, value => { value.extra = true; }]) {
    const unknown = JSON.parse(raw); mutation(unknown); const r = rig([raw, JSON.stringify(unknown)]);
    assert.equal((await r.journal.recover()).status, 'blocked'); assert.equal((await r.journal.save(doc())).status, 'blocked'); assert.equal(r.writes.length, 0);
  }
});
test('two damaged slots and identical sequence conflicts stop writing', async () => {
  const changed = doc(); changed.counter = 1;
  for (const slots of [['{', '{'], [encodeRecord(1, doc()), encodeRecord(1, changed)]]) {
    const r = rig(slots); assert.equal((await r.journal.recover()).status, 'blocked');
    assert.equal((await r.journal.save(doc())).status, 'blocked'); assert.equal(r.writes.length, 0);
  }
});
test('read IO failure preserves data and cannot be treated as absent', async () => {
  const raw = encodeRecord(1, doc()); const r = rig([raw, null]); r.failRead();
  const result = await r.journal.recover(); assert.equal(result.status, 'blocked'); assert.equal(result.code, 'READ_FAILED');
  assert.equal(result.errorCode, 'NATIVE_FAIL_300'); assert.equal((await r.journal.save(doc())).status, 'blocked'); assert.equal(r.slots[0], raw);
});
test('write failure and mismatched readback require explicit recovery', async () => {
  const raw = encodeRecord(1, doc()); const r = rig([raw, null]); r.failWrite();
  assert.equal((await r.journal.save(doc())).code, 'WRITE_FAILED');
  assert.equal((await r.journal.save(doc())).code, 'RECOVERY_REQUIRED'); assert.equal(r.slots[0], raw);
  const mismatch = rig([raw, null]); mismatch.backend.write = async () => {};
  assert.equal((await mismatch.journal.save(doc())).code, 'READBACK_MISMATCH'); assert.equal((await mismatch.journal.save(doc())).code, 'RECOVERY_REQUIRED');
  assert.equal((await mismatch.journal.recover()).status, 'ready');
});
test('write completed before failed acknowledgement is not acknowledged as success', async () => {
  const r = rig([encodeRecord(1, doc()), null]);
  r.backend.write = async (slot, text) => { r.slots[slot] = text; throw Object.assign(new Error('PRIVATE'), { code: 'NATIVE_FAIL_300' }); };
  assert.equal((await r.journal.save(doc())).status, 'blocked');
  const recovered = await r.journal.recover(); assert.equal(recovered.sequence, 2); assert.equal(recovered.status, 'ready');
});
test('timeout or native throw permanently latches unknown until retired', async () => {
  for (const code of ['TIMEOUT', 'NATIVE_THROW']) {
    const r = rig([encodeRecord(1, doc()), null]); r.backend.write = async () => { throw Object.assign(new Error('PRIVATE'), { code }); };
    assert.equal((await r.journal.save(doc())).status, 'uncertain'); assert.equal((await r.journal.recover()).status, 'uncertain');
    assert.equal((await r.journal.save(doc())).status, 'uncertain');
  }
});
test('concurrent save is BUSY and cannot corrupt an in-flight successful save', async () => {
  const r = rig(); let release; r.backend.write = (slot, text) => new Promise(resolve => { release = () => { r.slots[slot] = text; resolve(); }; });
  const first = r.journal.save(doc()); while (!release) await Promise.resolve();
  assert.equal((await r.journal.save(doc())).code, 'BUSY'); release(); assert.equal((await first).status, 'ready');
});
test('retirement prevents in-flight IO from publishing ready', async () => {
  const r = rig(); let release; r.backend.write = (slot, text) => new Promise(resolve => { release = () => { r.slots[slot] = text; resolve(); }; });
  const first = r.journal.save(doc()); while (!release) await Promise.resolve(); r.journal.close(); release();
  assert.equal((await first).code, 'CLOSED'); assert.equal((await r.journal.recover()).code, 'CLOSED');
});
test('exhausted sequence and stale expected sequence never overwrite records', async () => {
  const r = rig([encodeRecord(MAX_SEQUENCE, doc()), null]); assert.equal((await r.journal.save(doc())).code, 'SEQUENCE_EXHAUSTED'); assert.equal(r.writes.length, 0);
  const stale = rig([encodeRecord(3, doc()), null]); assert.equal((await stale.journal.save(doc(), { expectedSequence: 2 })).code, 'STATE_CHANGED'); assert.equal(stale.writes.length, 0);
});
test('invalid document rejects before native reads or writes', async () => {
  let calls = 0; const journal = createJournal({ backend: { async read() { calls++; return null; }, async write() { calls++; } } });
  const result = await journal.save({ schemaVersion: 99 }); assert.equal(result.status, 'blocked'); assert.equal(calls, 0);
});
test('cold recovery blocks higher sequence from a different installation instead of losing pending history', async () => {
  const previous = finishedDocument(); const r = rig([encodeRecord(1, previous), encodeRecord(2, createDocument('other-installation'))]);
  const result = await r.journal.recover(); assert.equal(result.status, 'blocked'); assert.equal(result.code, 'IDENTITY_CONFLICT');
  assert.equal((await r.journal.save(previous)).status, 'blocked'); assert.equal(r.writes.length, 0);
});
test('cold recovery blocks a counter rollback even when record sequence increases', async () => {
  const previous = activeDocument(); const r = rig([encodeRecord(1, previous), encodeRecord(2, doc())]);
  const result = await r.journal.recover(); assert.equal(result.status, 'blocked'); assert.equal(result.code, 'COUNTER_ROLLBACK'); assert.equal(r.writes.length, 0);
});
test('cold recovery blocks disappearing or changed pending records in newer canonical data', async () => {
  const previous = finishedDocument();
  for (const mutation of ['removed', 'changed']) {
    const next = JSON.parse(JSON.stringify(previous));
    if (mutation === 'removed') { next.pending = []; next.state = 'IDLE'; } else next.pending[0].endPage = 99;
    // Reverse slots also exercises sequence ordering independently of slot order.
    const r = rig([encodeRecord(3, next), encodeRecord(2, previous)]);
    const result = await r.journal.recover(); assert.equal(result.status, 'blocked'); assert.equal(result.code, mutation === 'removed' ? 'PENDING_DISAPPEARED' : 'PENDING_CHANGED');
    assert.equal(r.writes.length, 0);
  }
});
test('cold recovery blocks active disappearance and immutable active snapshot changes', async () => {
  const previous = activeDocument();
  for (const mutation of ['removed', 'changed']) {
    const next = JSON.parse(JSON.stringify(previous));
    if (mutation === 'removed') { next.active = null; next.state = 'IDLE'; } else next.active.bookSnapshot.title = 'changed old book title';
    const r = rig([encodeRecord(1, previous), encodeRecord(2, next)]);
    const result = await r.journal.recover(); assert.equal(result.status, 'blocked'); assert.equal(result.code, mutation === 'removed' ? 'ACTIVE_DISAPPEARED' : 'ACTIVE_CHANGED'); assert.equal(r.writes.length, 0);
  }
});
test('cold recovery blocks rewrites of already closed focus boundaries', async () => {
  const previous = transition(activeDocument(), { type: 'BEGIN_BREAK', minutes: 5 }, time(101000));
  const next = transition(previous, { type: 'RESUME' }, time(102000));
  next.active.intervals[0].end.wallMs++; next.active.intervals[1].start.wallMs++;
  const r = rig([encodeRecord(1, previous), encodeRecord(2, next)]);
  const result = await r.journal.recover(); assert.equal(result.status, 'blocked'); assert.equal(result.code, 'ACTIVE_CHANGED');
});
test('ordinary BREAK, RESUME and FINISH retain valid adjacent history and recover latest', async () => {
  let previous = activeDocument(); let sequence = 1;
  for (const action of [{ type: 'BEGIN_BREAK', minutes: 5 }, { type: 'RESUME' }, { type: 'FINISH', endPage: null }]) {
    const next = transition(previous, action, time(101000 + sequence * 1000));
    const r = rig([encodeRecord(sequence, previous), encodeRecord(sequence + 1, next)]);
    const result = await r.journal.recover(); assert.equal(result.status, 'ready'); assert.deepEqual(result.document, next);
    previous = next; sequence++;
  }
});
test('journal refuses to write a candidate that deletes already stored pending history', async () => {
  const previous = finishedDocument(); const next = doc(); next.counter = previous.counter;
  const r = rig([encodeRecord(1, previous), null]); const result = await r.journal.save(next);
  assert.equal(result.status, 'blocked'); assert.equal(result.code, 'PENDING_DISAPPEARED'); assert.equal(r.writes.length, 0);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLocalOwner } = require('../src/lib/local-owner');
const { createDocument, transition, TEST_BOOKS } = require('../src/lib/local-session');
const { encodeRecord, byteLength } = require('../src/lib/local-codec');
const { createLocalBackend } = require('../src/platform/local-storage');

function rig(options = {}) {
  const slots = options.slots || [null, null]; const writes = []; let wallMs = 100000; let identities = 0;
  let writeFailure = null; let closed = false; let uncertain = false; let holdReadback = false; let readbackSlot = null; let release = null;
  const backend = {
    async read(slot) { if (closed) throw Object.assign(new Error('PRIVATE'), { code: 'CLOSED' });
      if (holdReadback && slot === readbackSlot) return new Promise(resolve => { release = () => { holdReadback = false; resolve(slots[slot]); }; }); return slots[slot]; },
    async write(slot, text) { writes.push({ slot, text }); if (writeFailure) {
      if (writeFailure === 'TIMEOUT') uncertain = true;
      throw Object.assign(new Error('PRIVATE'), { code: writeFailure });
    } slots[slot] = text; if (holdReadback) readbackSlot = slot; },
    describe() { return { uncertain, closed }; }, close() { closed = true; },
  };
  const owner = createLocalOwner({ backendFactory: () => backend, storageQualified: options.storageQualified !== false,
    clock: () => ({ wallMs, ownerId: options.ownerId || 'owner-test', monotonicMs: null, monotonicVerified: false }),
    installationIdFactory: () => { identities++; return 'installation-test'; } });
  return { owner, slots, writes, backend, next(ms = 1000) { wallMs += ms; }, identities: () => identities,
    fail(code) { writeFailure = code; }, hold() { holdReadback = true; }, release: () => release && release(), waiting: () => Boolean(release) };
}
async function prepare(r) {
  await r.owner.open(); await r.owner.dispatch({ type: 'SELECT_BOOK', bookId: TEST_BOOKS[0].id });
  await r.owner.dispatch({ type: 'SELECT_ACTION', firstActionId: 'read-first-paragraph' });
}
async function start(r) { await prepare(r); await r.owner.dispatch({ type: 'CONFIRM_START', confirmed: true }); }

test('unqualified storage permits empty read but never initializes or starts persisted records', async () => {
  const r = rig({ storageQualified: false }); const opened = await r.owner.open();
  assert.equal(opened.status, 'EMPTY'); assert.equal(opened.document, null); assert.equal(opened.canWrite, false); assert.equal(r.identities(), 0);
  const result = await r.owner.dispatch({ type: 'SELECT_BOOK', bookId: 'test-reading-1' });
  assert.equal(result.errorCode, 'STORAGE_EVIDENCE_REQUIRED'); assert.equal(r.writes.length, 0); assert.equal(r.identities(), 0);
});
test('unqualified owner may read existing experiment records without enabling writes', async () => {
  const document = createDocument('existing-install'); const r = rig({ storageQualified: false, slots: [encodeRecord(1, document), null] });
  const result = await r.owner.open(); assert.deepEqual(result.document, document); assert.equal(result.canWrite, false); assert.equal(r.writes.length, 0);
});
test('first legal qualified operation persists stable identity before committing PREPARING', async () => {
  const r = rig(); await r.owner.open(); assert.equal(r.identities(), 0);
  const result = await r.owner.dispatch({ type: 'SELECT_BOOK', bookId: TEST_BOOKS[0].id });
  assert.equal(result.document.state, 'PREPARING'); assert.equal(result.document.installationId, 'installation-test');
  assert.equal(r.identities(), 1); assert.equal(r.writes.length, 1);
});
test('invalid first action neither writes nor invents a persisted identity', async () => {
  const r = rig(); await r.owner.open(); const result = await r.owner.dispatch({ type: 'CONFIRM_START', confirmed: true });
  assert.equal(result.document, null); assert.equal(r.writes.length, 0);
});
test('FOCUS is not shown before exact native readback; rapid second action is BUSY', async () => {
  const r = rig(); await prepare(r); r.hold(); const pending = r.owner.dispatch({ type: 'CONFIRM_START', confirmed: true });
  while (!r.waiting()) await Promise.resolve();
  assert.equal(r.owner.snapshot().document.state, 'PREPARING'); assert.equal(r.owner.snapshot().busy, true);
  const repeated = await r.owner.dispatch({ type: 'CONFIRM_START', confirmed: true }); assert.equal(repeated.errorCode, 'BUSY');
  r.release(); assert.equal((await pending).document.state, 'FOCUS'); assert.equal(r.owner.snapshot().document.counter, 1);
});
test('repeated start after success cannot create duplicate active session', async () => {
  const r = rig(); await start(r); const id = r.owner.snapshot().document.active.id; const writes = r.writes.length;
  await r.owner.dispatch({ type: 'CONFIRM_START', confirmed: true });
  assert.equal(r.owner.snapshot().document.active.id, id); assert.equal(r.owner.snapshot().document.counter, 1); assert.equal(r.writes.length, writes);
});
test('recreated owner restores same FOCUS session and stored identity without generating another', async () => {
  const r = rig(); await start(r); const original = r.owner.snapshot().document.active.id;
  const restored = rig({ slots: r.slots, ownerId: 'new-process' }); const result = await restored.owner.open();
  assert.equal(result.document.active.id, original); assert.equal(result.document.state, 'FOCUS'); assert.equal(restored.identities(), 0);
  assert.equal(result.summary.timeUncertain, true); assert.equal(restored.writes.length, 0);
});
test('BREAK expires only in read-only projection and requires explicit RESUME', async () => {
  const r = rig(); await start(r); r.next(); await r.owner.dispatch({ type: 'BEGIN_BREAK', minutes: 5 }); const writes = r.writes.length;
  r.next(360000); const snapshot = r.owner.snapshot(); assert.equal(snapshot.document.state, 'BREAK'); assert.equal(snapshot.summary.breakRemainingMs, 0); assert.equal(r.writes.length, writes);
  await r.owner.dispatch({ type: 'RESUME' }); assert.equal(r.owner.snapshot().document.state, 'FOCUS');
});
test('nullable finish moves active into pending once and preserves previous unsynchronized records', async () => {
  const r = rig(); await start(r); r.next(); const id = r.owner.snapshot().document.active.id;
  await r.owner.dispatch({ type: 'FINISH', endPage: null }); let snapshot = r.owner.snapshot();
  assert.equal(snapshot.document.state, 'FINISHED_PENDING_SYNC'); assert.equal(snapshot.document.active, null); assert.equal(snapshot.pendingCount, 1); assert.equal(snapshot.document.pending[0].id, id); assert.equal(snapshot.document.pending[0].endPage, null);
  const writes = r.writes.length; await r.owner.dispatch({ type: 'FINISH', endPage: null }); assert.equal(r.writes.length, writes); assert.equal(r.owner.snapshot().pendingCount, 1);
  await r.owner.dispatch({ type: 'NEW_SESSION' }); await start(r); r.next(); await r.owner.dispatch({ type: 'FINISH', endPage: null });
  snapshot = r.owner.snapshot(); assert.equal(snapshot.pendingCount, 2); assert.equal(new Set(snapshot.document.pending.map(s => s.id)).size, 2);
});
test('known write failure leaves the previously confirmed business document unchanged', async () => {
  const r = rig(); await prepare(r); const original = r.owner.snapshot().document; r.fail('NATIVE_FAIL_300');
  const result = await r.owner.dispatch({ type: 'CONFIRM_START', confirmed: true });
  assert.equal(result.status, 'BLOCKED'); assert.deepEqual(result.document, original); assert.equal(result.canWrite, false); assert.equal(result.errorCode, 'NATIVE_FAIL_300');
});
test('uncertain IO cannot be unlocked by re-open, later callbacks, or another action', async () => {
  const r = rig(); await prepare(r); r.fail('TIMEOUT'); const result = await r.owner.dispatch({ type: 'CONFIRM_START', confirmed: true });
  assert.equal(result.status, 'UNCERTAIN'); const writes = r.writes.length; assert.equal((await r.owner.open()).status, 'UNCERTAIN');
  assert.equal((await r.owner.dispatch({ type: 'SELECT_BOOK', bookId: TEST_BOOKS[0].id })).status, 'UNCERTAIN'); assert.equal(r.writes.length, writes);
});
test('owner retirement cannot publish successful state after pending native completion', async () => {
  const r = rig(); await prepare(r); r.hold(); const pending = r.owner.dispatch({ type: 'CONFIRM_START', confirmed: true });
  while (!r.waiting()) await Promise.resolve(); let updates = 0; r.owner.subscribe(() => updates++); r.owner.close(); const retiredUpdates = updates; r.release(); await pending;
  assert.equal(r.owner.snapshot().status, 'CLOSED'); assert.equal(r.owner.snapshot().document.state, 'PREPARING'); assert.equal(updates, retiredUpdates);
});
test('subscribers cannot mutate persisted owner data or turn verified success into failure', async () => {
  const r = rig(); r.owner.subscribe(s => { if (s.document) s.document.state = 'WRONG'; throw new Error('VIEW_FAILURE'); });
  await prepare(r); const copy = r.owner.snapshot(); copy.document.installationId = 'OTHER';
  assert.equal(r.owner.snapshot().document.state, 'PREPARING'); assert.equal(r.owner.snapshot().document.installationId, 'installation-test');
});
test('rollback observations retain original boundaries without negative focus or automatic clearing', async () => {
  const r = rig(); await start(r); const beginning = r.owner.snapshot().document.active.startAt; r.next(-5000);
  await r.owner.dispatch({ type: 'FINISH', endPage: null }); const result = r.owner.snapshot();
  assert.deepEqual(result.document.pending[0].startAt, beginning); assert.equal(result.summary.timeUncertain, true);
  assert.equal(result.summary.observedFocusMs, null); assert.equal(result.summary.trustedFocusMs, 0);
});
test('active growth stops before consuming reserved finish bytes and never deletes pending records', async () => {
  const r = rig(); await start(r); let stopped = false;
  for (let index = 0; index < 40; index++) {
    const previous = r.owner.snapshot(); const writes = r.writes.length; r.next();
    const result = await r.owner.dispatch(previous.document.state === 'FOCUS' ? { type: 'BEGIN_BREAK', minutes: 5 } : { type: 'RESUME' });
    if (result.errorCode) {
      assert.equal(result.errorCode, 'CAPACITY_REQUIRED'); assert.deepEqual(result.document, previous.document); assert.equal(r.writes.length, writes);
      assert.match(result.recoveryHint, /空间预算不足/); stopped = true; break;
    }
    assert.ok(byteLength(r.writes[r.writes.length - 1].text) <= 7168);
  }
  assert.equal(stopped, true); const finished = await r.owner.dispatch({ type: 'FINISH', endPage: null });
  assert.equal(finished.document.state, 'FINISHED_PENDING_SYNC'); assert.equal(finished.pendingCount, 1);
  assert.ok(byteLength(r.writes[r.writes.length - 1].text) <= 8192);
});
test('FINISH may use reserved space beyond the ordinary mutation budget', async () => {
  let document = createDocument('installation-test'); let wallMs = 100000;
  const observation = () => ({ wallMs: wallMs++, ownerId: 'owner-test', monotonicMs: null, monotonicVerified: false });
  document = transition(document, { type: 'SELECT_BOOK', bookId: TEST_BOOKS[0].id }, observation());
  document = transition(document, { type: 'SELECT_ACTION', firstActionId: 'read-first-paragraph' }, observation());
  document = transition(document, { type: 'CONFIRM_START', confirmed: true }, observation());
  let raw = encodeRecord(1, document);
  while (byteLength(raw) <= 7168) {
    document = transition(document, document.state === 'FOCUS' ? { type: 'BEGIN_BREAK', minutes: 5 } : { type: 'RESUME' }, observation()); raw = encodeRecord(1, document);
  }
  assert.ok(byteLength(raw) < 7900); const r = rig({ slots: [raw, null] }); await r.owner.open();
  const finished = await r.owner.dispatch({ type: 'FINISH', endPage: null });
  assert.equal(finished.document.state, 'FINISHED_PENDING_SYNC'); assert.equal(finished.pendingCount, 1);
  assert.ok(byteLength(r.writes[0].text) > 7168); assert.ok(byteLength(r.writes[0].text) <= 8192);
});
test('real native adapter and owner retain uncertainty after write occurs but callback times out', async () => {
  const values = new Map(); const timers = new Map(); let timerId = 0; let held = null; let hold = false; let writes = 0;
  const native = { get(o) { o.success(values.get(o.key) || ''); }, set(o) { writes++; values.set(o.key, o.value); if (hold) held = o; else o.success(); } };
  const backendFactory = () => createLocalBackend({ kind: 'storage', loadModule: () => native,
    schedule(fn) { timers.set(++timerId, fn); return timerId; }, cancelSchedule(id) { timers.delete(id); } });
  const options = { backendFactory, storageQualified: true,
    clock: () => ({ wallMs: 100000, ownerId: 'native-owner', monotonicMs: null, monotonicVerified: false }), installationIdFactory: () => 'native-installation' };
  const owner = createLocalOwner(options); await owner.open();
  await owner.dispatch({ type: 'SELECT_BOOK', bookId: TEST_BOOKS[0].id }); await owner.dispatch({ type: 'SELECT_ACTION', firstActionId: 'read-first-paragraph' });
  hold = true; const pending = owner.dispatch({ type: 'CONFIRM_START', confirmed: true }); while (!held) await Promise.resolve();
  [...timers.values()][0](); const failure = await pending; assert.equal(failure.status, 'UNCERTAIN'); assert.equal(failure.document.state, 'PREPARING');
  held.success(); assert.equal(owner.snapshot().status, 'UNCERTAIN'); assert.equal(owner.snapshot().document.state, 'PREPARING');
  await owner.open(); await owner.dispatch({ type: 'CONFIRM_START', confirmed: true }); assert.equal(writes, 3);
  owner.close(); hold = false; const recreated = createLocalOwner(options); const restored = await recreated.open();
  assert.equal(restored.document.state, 'FOCUS'); assert.equal(restored.document.counter, 1); assert.equal(restored.document.active.id, 'native-installation:1');
  assert.equal(writes, 3);
});
test('stale owner cannot overwrite a newer snapshot and must explicitly recover', async () => {
  const r = rig(); await prepare(r); const old = r.owner.snapshot();
  const otherDocument = transition(old.document, { type: 'CONFIRM_START', confirmed: true }, { wallMs: 100500, ownerId: 'other-owner', monotonicMs: null, monotonicVerified: false });
  r.slots[0] = encodeRecord(old.sequence + 1, otherDocument); const writes = r.writes.length;
  const blocked = await r.owner.dispatch({ type: 'CONFIRM_START', confirmed: true });
  assert.equal(blocked.status, 'BLOCKED'); assert.equal(blocked.errorCode, 'STATE_CHANGED'); assert.deepEqual(blocked.document, old.document); assert.equal(r.writes.length, writes);
  const recovered = await r.owner.open(); assert.equal(recovered.document.active.id, otherDocument.active.id); assert.equal(recovered.document.state, 'FOCUS');
});
test('unknown record remains visible as blocked without replacing confirmed document with empty', async () => {
  const r = rig(); await prepare(r); const confirmed = r.owner.snapshot().document;
  const unknown = JSON.parse(r.slots[0]); unknown.schemaVersion = 99; r.slots[0] = JSON.stringify(unknown);
  const blocked = await r.owner.open(); assert.equal(blocked.status, 'BLOCKED'); assert.deepEqual(blocked.document, confirmed);
  const writes = r.writes.length; await r.owner.dispatch({ type: 'CONFIRM_START', confirmed: true }); assert.equal(r.writes.length, writes);
});
test('disappeared storage never turns a known Session into an empty new installation', async () => {
  const r = rig(); await start(r); const known = r.owner.snapshot(); r.slots[0] = null; r.slots[1] = null;
  const result = await r.owner.open(); assert.equal(result.status, 'BLOCKED'); assert.equal(result.errorCode, 'STORAGE_DISAPPEARED');
  assert.deepEqual(result.document, known.document); assert.equal(result.sequence, known.sequence); assert.equal(result.canWrite, false);
  const identities = r.identities(); const writes = r.writes.length; await r.owner.dispatch({ type: 'SELECT_BOOK', bookId: TEST_BOOKS[0].id });
  assert.equal(r.identities(), identities); assert.equal(r.writes.length, writes);
});
test('same owner cannot roll back a confirmed Session to an older intact slot', async () => {
  const r = rig(); await start(r); const known = r.owner.snapshot(); r.slots[0] = '{';
  const result = await r.owner.open(); assert.equal(result.status, 'BLOCKED'); assert.equal(result.errorCode, 'SNAPSHOT_ROLLBACK');
  assert.deepEqual(result.document, known.document); assert.equal(result.sequence, known.sequence);
  const restarted = rig({ slots: r.slots }); const recovered = await restarted.owner.open();
  assert.equal(recovered.status, 'RECOVERED'); assert.match(recovered.recoveryHint, /核对/);
});
test('same-sequence document conflict cannot replace the last acknowledged document', async () => {
  const r = rig(); await prepare(r); const known = r.owner.snapshot(); const conflicting = createDocument('installation-test');
  r.slots[0] = encodeRecord(known.sequence, conflicting); r.slots[1] = null;
  const result = await r.owner.open(); assert.equal(result.status, 'BLOCKED'); assert.equal(result.errorCode, 'SNAPSHOT_CONFLICT');
  assert.deepEqual(result.document, known.document); assert.equal(result.sequence, known.sequence);
});
test('different persisted installation identity cannot replace a known history', async () => {
  const r = rig(); await prepare(r); const known = r.owner.snapshot(); r.slots[0] = encodeRecord(known.sequence + 1, createDocument('other-installation')); r.slots[1] = null;
  const result = await r.owner.open(); assert.equal(result.status, 'BLOCKED'); assert.equal(result.errorCode, 'IDENTITY_CONFLICT'); assert.deepEqual(result.document, known.document);
});
test('invalid current clock is displayed as unknown rather than clearing saved learning time to zero', async () => {
  const r = rig(); await start(r); const known = r.owner.snapshot().document; r.next(NaN);
  const result = r.owner.snapshot(); assert.deepEqual(result.document, known); assert.equal(result.summary.timeUncertain, true);
  assert.equal(result.summary.observedFocusMs, null); assert.equal(result.summary.observedBreakMs, null);
});
test('live recovery refuses a sole newer slot that removes or edits acknowledged pending records', async () => {
  for (const mutation of ['removed', 'changed']) {
    const r = rig(); await start(r); await r.owner.dispatch({ type: 'FINISH', endPage: null }); const known = r.owner.snapshot();
    const next = JSON.parse(JSON.stringify(known.document));
    if (mutation === 'removed') { next.pending = []; next.state = 'IDLE'; } else next.pending[0].endPage = 999;
    r.slots[0] = encodeRecord(known.sequence + 1, next); r.slots[1] = null;
    const result = await r.owner.open(); assert.equal(result.status, 'BLOCKED'); assert.equal(result.errorCode, mutation === 'removed' ? 'PENDING_DISAPPEARED' : 'PENDING_CHANGED');
    assert.deepEqual(result.document, known.document); assert.equal(result.sequence, known.sequence); assert.equal(result.canWrite, false);
    const writes = r.writes.length; await r.owner.dispatch({ type: 'SELECT_BOOK', bookId: TEST_BOOKS[0].id }); assert.equal(r.writes.length, writes);
  }
});
test('live recovery refuses a sole newer slot that drops active session with or without counter rollback', async () => {
  for (const rollback of [false, true]) {
    const r = rig(); await start(r); const known = r.owner.snapshot(); const next = createDocument('installation-test'); next.counter = rollback ? 0 : known.document.counter;
    r.slots[0] = encodeRecord(known.sequence + 1, next); r.slots[1] = null;
    const result = await r.owner.open(); assert.equal(result.status, 'BLOCKED'); assert.equal(result.errorCode, rollback ? 'COUNTER_ROLLBACK' : 'ACTIVE_DISAPPEARED');
    assert.deepEqual(result.document, known.document); assert.equal(result.sequence, known.sequence); assert.equal(result.canWrite, false);
  }
});
test('live recovery refuses a sole newer slot that alters immutable active book or action', async () => {
  const r = rig(); await start(r); const known = r.owner.snapshot(); const next = JSON.parse(JSON.stringify(known.document)); next.active.firstActionSnapshot.text = 'changed confirmed action';
  r.slots[0] = encodeRecord(known.sequence + 1, next); r.slots[1] = null;
  const result = await r.owner.open(); assert.equal(result.status, 'BLOCKED'); assert.equal(result.errorCode, 'ACTIVE_CHANGED'); assert.deepEqual(result.document, known.document);
});

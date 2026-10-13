const test = require('node:test');
const assert = require('node:assert/strict');
const { createLocalOwner } = require('../src/lib/local-owner');
const { createLocalUiFlow } = require('../src/lib/local-ui-flow');
const { createLocalBackend } = require('../src/platform/local-storage');
const { createDocument, transition, TEST_BOOKS } = require('../src/lib/local-session');
const { encodeRecord } = require('../src/lib/local-codec');

const clock = () => ({ wallMs: 100000, ownerId: 'atomic-owner', monotonicMs: null, monotonicVerified: false });
const step = (doc, action) => transition(doc, action, clock());
const idle = () => createDocument('atomic-install');
const preparing = (action = true) => {
  let doc = step(idle(), { type: 'SELECT_BOOK', bookId: TEST_BOOKS[0].id });
  if (action) doc = step(doc, { type: 'SELECT_ACTION', firstActionId: 'read-first-paragraph' });
  return doc;
};
const focused = () => step(preparing(), { type: 'CONFIRM_START', confirmed: true });
const finished = () => step(focused(), { type: 'FINISH', endPage: null });
const startAction = (extra = {}) => Object.assign({ type: 'START_CONFIRMED', bookId: TEST_BOOKS[0].id,
  firstActionId: 'read-first-paragraph', confirmed: true }, extra);
const uri = slot => 'internal://files/mirra_05b_test_sessions_' + (slot === 0 ? 'a' : 'b') + '.json';

// Exercise the real file adapter and journal. Controlled callbacks establish
// native API counts and acknowledgement boundaries, not physical-device latency.
function rig(doc = null, options = {}) {
  const files = new Map(); const calls = []; const timers = new Map(); let timer = 0; let identities = 0;
  let readFailure = null; let writeFailure = false; let mismatch = false; let hold = false; let held = null;
  if (doc) files.set(uri(0), encodeRecord(10, doc));
  const native = {
    readText(args) {
      calls.push({ type: 'read', uri: args.uri });
      if (readFailure === calls.filter(call => call.type === 'read').length) { args.fail({}, 300); return; }
      if (!files.has(args.uri)) { args.fail({}, 301); return; }
      args.success({ text: mismatch && calls.some(call => call.type === 'write') ? '{' : files.get(args.uri) });
    },
    writeText(args) {
      calls.push({ type: 'write', uri: args.uri });
      if (writeFailure) { args.fail({}, 300); return; }
      files.set(args.uri, args.text);
      if (hold) held = args; else args.success();
    }
  };
  const owner = createLocalOwner({ storageQualified: options.storageQualified !== false,
    clock, installationIdFactory: () => { identities++; return 'atomic-install'; },
    backendFactory: () => createLocalBackend({ kind: 'file', loadModule: () => native,
      schedule(fn) { timers.set(++timer, fn); return timer; }, cancelSchedule(id) { timers.delete(id); } }) });
  const ui = createLocalUiFlow({ owner, catalog: TEST_BOOKS });
  return { owner, ui, calls, files, timers, identities: () => identities,
    counts: () => ({ reads: calls.filter(call => call.type === 'read').length, writes: calls.filter(call => call.type === 'write').length }),
    clearCalls() { calls.length = 0; }, failRead(at) { readFailure = at; }, failWrite() { writeFailure = true; },
    mismatch() { mismatch = true; }, hold() { hold = true; }, release() { assert.ok(held); hold = false; const args = held; held = null; args.success(); },
    timeout() { assert.equal(timers.size, 1); [...timers.values()][0](); },
    async untilHeld() { for (let n = 0; n < 200 && !held; n++) await Promise.resolve(); assert.ok(held, 'expected pending native write'); } };
}

for (const [name, original, choose] of [
  ['EMPTY', null, null], ['IDLE', idle(), null], ['matching PREPARING', preparing(), null],
  ['PREPARING without action', preparing(false), null], ['PREPARING changed action', preparing(), ['action', 'open-book']],
  ['PREPARING changed book', preparing(), ['book', 'test-review-1']], ['FINISHED', finished(), null]
]) test('one explicit start commits once from ' + name + ' through real file callbacks', async () => {
  const r = rig(original); await r.ui.show();
  if (choose && choose[0] === 'action') { r.ui.openActionPicker(); r.ui.chooseAction(choose[1]); }
  if (choose && choose[0] === 'book') { r.ui.openBookPicker(); r.ui.chooseBook(choose[1]); }
  const preview = r.ui.getState().preview; const before = r.owner.snapshot(); const observedStates = [];
  r.owner.subscribe(snapshot => { observedStates.push(snapshot.document && snapshot.document.state); });
  r.clearCalls(); await r.ui.confirmStart(preview); const after = r.owner.snapshot();
  assert.deepEqual(r.counts(), { reads: 3, writes: 1 }); assert.equal(after.sequence, before.sequence + 1);
  assert.equal(after.document.state, 'FOCUS'); assert.equal(r.ui.getState().view, 'READING');
  assert.equal(after.document.counter, (original ? original.counter : 0) + 1);
  assert.equal(after.document.active.id, 'atomic-install:' + after.document.counter);
  assert.deepEqual(after.document.active.bookSnapshot, preview.bookSnapshot);
  assert.deepEqual(after.document.active.firstActionSnapshot, preview.firstActionSnapshot);
  assert.deepEqual(after.document.pending, original ? original.pending : []);
  assert.deepEqual(after.document.active.confirmedAt, clock()); assert.deepEqual(after.document.active.startAt, clock());
  assert.equal(after.document.active.intervals.length, 1);
  assert.ok(observedStates.every(state => state === (original && original.state) || state === 'FOCUS'));
});

test('atomic start final candidate exactly equals existing legal transition composition', () => {
  for (const original of [idle(), preparing(false), preparing(), finished()]) {
    for (const book of TEST_BOOKS) for (const action of book.firstActions) {
      let expected = original;
      if (expected.state === 'FINISHED_PENDING_SYNC') expected = step(expected, { type: 'NEW_SESSION' });
      if (expected.state === 'PREPARING' && expected.preparation.bookSnapshot.id !== book.id) expected = step(expected, { type: 'CANCEL_PREPARATION' });
      if (expected.state === 'IDLE') expected = step(expected, { type: 'SELECT_BOOK', bookId: book.id });
      if (!expected.preparation.firstActionSnapshot || expected.preparation.firstActionSnapshot.id !== action.id) {
        expected = step(expected, { type: 'SELECT_ACTION', firstActionId: action.id });
      }
      expected = step(expected, { type: 'CONFIRM_START', confirmed: true });
      const copied = JSON.parse(JSON.stringify(original));
      const actual = step(original, startAction({ bookId: book.id, firstActionId: action.id }));
      assert.deepEqual(actual, expected); assert.deepEqual(original, copied);
    }
  }
});

for (const [name, action, code] of [
  ['unconfirmed', startAction({ confirmed: false }), 'CONFIRM_REQUIRED'],
  ['unknown book', startAction({ bookId: 'phone-book' }), 'BOOK'],
  ['unknown action', startAction({ firstActionId: 'unseen' }), 'FIRST_ACTION'],
  ['action belonging to another book', startAction({ firstActionId: 'read-next-page' }), 'FIRST_ACTION'],
  ['unknown field', Object.assign(startAction(), { skipConfirmation: true }), 'UNKNOWN_FIELD']
]) test('atomic start rejects ' + name + ' without native IO or partial preparation', async () => {
  const original = finished(); const r = rig(original); await r.owner.open(); r.clearCalls();
  const result = await r.owner.dispatch(action);
  assert.equal(result.errorCode, code); assert.deepEqual(result.document, original);
  assert.deepEqual(r.counts(), { reads: 0, writes: 0 }); assert.equal(result.sequence, 10);
});

for (const [name, doc, code] of [
  ['FOCUS', focused(), 'STATE'], ['BREAK', step(focused(), { type: 'BEGIN_BREAK', minutes: 5 }), 'STATE'],
  ['counter exhausted', Object.assign(idle(), { counter: Number.MAX_SAFE_INTEGER }), 'COUNTER_CAPACITY']
]) test('atomic start rejects ' + name + ' while preserving all confirmed history', async () => {
  const r = rig(doc); await r.owner.open(); r.clearCalls(); const result = await r.owner.dispatch(startAction());
  assert.equal(result.errorCode, code); assert.deepEqual(result.document, doc);
  assert.deepEqual(r.counts(), { reads: 0, writes: 0 });
});

test('full pending queue blocks atomic next start without persisting NEW_SESSION', async () => {
  let doc = idle();
  for (let index = 0; index < 8; index++) {
    if (doc.state === 'FINISHED_PENDING_SYNC') doc = step(doc, { type: 'NEW_SESSION' });
    doc = step(doc, { type: 'SELECT_BOOK', bookId: TEST_BOOKS[0].id });
    doc = step(doc, { type: 'SELECT_ACTION', firstActionId: 'read-first-paragraph' });
    doc = step(doc, { type: 'CONFIRM_START', confirmed: true }); doc = step(doc, { type: 'FINISH', endPage: null });
  }
  const r = rig(doc); await r.owner.open(); r.clearCalls(); const result = await r.owner.dispatch(startAction());
  assert.equal(result.errorCode, 'PENDING_CAPACITY'); assert.deepEqual(result.document, doc);
  assert.deepEqual(r.counts(), { reads: 0, writes: 0 });
});

for (const [name, inject] of [
  ['first slot read', r => r.failRead(1)], ['second slot read', r => r.failRead(2)],
  ['write', r => r.failWrite()], ['exact readback', r => r.failRead(3)], ['readback mismatch', r => r.mismatch()]
]) test('atomic ' + name + ' failure never exposes partial business state or successful reading', async () => {
  const original = finished(); const r = rig(original); await r.ui.show(); const before = r.owner.snapshot();
  const raw = r.files.get(uri(0)); r.clearCalls(); inject(r); await r.ui.confirmStart(r.ui.getState().preview);
  const result = r.owner.snapshot(); assert.deepEqual(result.document, original); assert.equal(result.sequence, before.sequence);
  assert.equal(result.canWrite, false); assert.equal(result.status, 'BLOCKED'); assert.notEqual(r.ui.getState().view, 'READING');
  assert.equal(r.files.get(uri(0)), raw); assert.ok(r.counts().writes <= 1);
});

test('held atomic write immediately locks repeat start and remains unpublished until exact acknowledgement', async () => {
  const original = finished(); const r = rig(original); await r.ui.show(); r.clearCalls(); r.hold();
  const preview = r.ui.getState().preview; const operation = r.ui.confirmStart(preview); await r.untilHeld();
  assert.equal(r.ui.getState().busy, true); assert.deepEqual(r.owner.snapshot().document, original);
  assert.notEqual(r.ui.getState().view, 'READING'); await r.ui.confirmStart(preview);
  r.ui.chooseBook('test-review-1'); assert.equal(r.counts().writes, 1); r.release(); await operation;
  assert.deepEqual(r.counts(), { reads: 3, writes: 1 }); assert.equal(r.owner.snapshot().document.counter, 2);
  assert.equal(r.owner.snapshot().document.active.id, 'atomic-install:2');
  await r.ui.confirmStart(preview); assert.equal(r.counts().writes, 1);
});

test('hidden acknowledged atomic start recovers one FOCUS rather than half-completed preparation', async () => {
  const r = rig(); await r.ui.show(); r.clearCalls(); r.hold(); const operation = r.ui.confirmStart(r.ui.getState().preview);
  await r.untilHeld(); r.ui.hide(); r.release(); await operation;
  assert.notEqual(r.ui.getState().view, 'READING'); assert.equal(r.owner.snapshot().document.state, 'FOCUS');
  assert.equal(r.counts().writes, 1); const id = r.owner.snapshot().document.active.id;
  await r.ui.show(); assert.equal(r.ui.getState().view, 'READING'); assert.equal(r.owner.snapshot().document.active.id, id);
  assert.equal(r.counts().writes, 1); assert.equal(r.identities(), 1);
});

test('native start timeout remains locked after hide/show and cannot allocate a duplicate record', async () => {
  const original = finished(); const r = rig(original); await r.ui.show(); r.clearCalls(); r.hold();
  const operation = r.ui.confirmStart(r.ui.getState().preview); await r.untilHeld(); r.timeout(); await operation;
  assert.equal(r.owner.snapshot().status, 'UNCERTAIN'); assert.deepEqual(r.owner.snapshot().document, original);
  r.release(); await r.ui.reload(); r.ui.hide(); await r.ui.show(); await r.ui.confirmStart(r.ui.getState().preview);
  assert.equal(r.owner.snapshot().status, 'UNCERTAIN'); assert.equal(r.counts().writes, 1);
  assert.notEqual(r.ui.getState().view, 'READING'); assert.deepEqual(r.owner.snapshot().document, original);
});

test('atomic native completion after Owner retirement cannot publish or revive the prior page', async () => {
  const original = finished(); const r = rig(original); await r.ui.show(); r.hold();
  const operation = r.ui.confirmStart(r.ui.getState().preview); await r.untilHeld(); r.owner.close(); r.release(); await operation;
  assert.equal(r.owner.snapshot().status, 'CLOSED'); assert.deepEqual(r.owner.snapshot().document, original);
  assert.notEqual(r.ui.getState().view, 'READING'); assert.equal(r.owner.snapshot().canWrite, false);
});

test('stale on-disk sequence prevents atomic candidate from overwriting another confirmed start', async () => {
  const original = preparing(); const r = rig(original); await r.ui.show(); const newer = step(original, { type: 'CONFIRM_START', confirmed: true });
  r.files.set(uri(1), encodeRecord(11, newer)); r.clearCalls(); await r.ui.confirmStart(r.ui.getState().preview);
  assert.equal(r.owner.snapshot().errorCode, 'STATE_CHANGED'); assert.deepEqual(r.owner.snapshot().document, original);
  assert.equal(r.counts().writes, 0); assert.notEqual(r.ui.getState().view, 'READING');
});

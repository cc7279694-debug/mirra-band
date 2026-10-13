const test = require('node:test');
const assert = require('node:assert/strict');
const { createLocalOwner } = require('../src/lib/local-owner');
const { createLocalBackend } = require('../src/platform/local-storage');
const { createLocalUiFlow } = require('../src/lib/local-ui-flow');
const { TEST_BOOKS } = require('../src/lib/local-session');

// The real file adapter, journal, codec, owner and flow execute here. Only
// firmware callbacks and deadline scheduling are controlled; this is not
// native rendering or device durability evidence.
function rig(t) {
  const files = new Map(); const calls = []; const deadlines = new Map();
  let nextDeadline = 0; let holdRead = false; let holdReadback = false;
  let held = null; let exits = 0;
  function succeed(request) {
    if (files.has(request.uri)) request.success({ text: files.get(request.uri) });
    else request.fail('', 301);
  }
  const backend = createLocalBackend({ kind: 'file', loadModule: () => ({
    readText(request) {
      calls.push('read');
      if (holdRead) { holdRead = false; held = request; return; }
      succeed(request);
    },
    writeText(request) {
      calls.push('write'); files.set(request.uri, request.text);
      if (holdReadback) { holdReadback = false; holdRead = true; }
      request.success();
    },
  }), schedule(callback) {
    const id = ++nextDeadline; deadlines.set(id, callback); return id;
  }, cancelSchedule(id) { deadlines.delete(id); } });
  const owner = createLocalOwner({ backendFactory: () => backend, storageQualified: true,
    clock: () => ({ wallMs: 100000, ownerId: 'readonly-owner', monotonicMs: null, monotonicVerified: false }),
    installationIdFactory: () => 'readonly-installation' });
  const ui = createLocalUiFlow({ owner, catalog: TEST_BOOKS, requestExit: () => { exits++; } });
  t.after(() => { ui.dispose(); owner.close(); });
  return { owner, ui, calls, exits: () => exits,
    holdRead: () => { holdRead = true; }, holdReadback: () => { holdReadback = true; },
    writes: () => calls.filter(call => call === 'write').length,
    async untilHeld() {
      for (let count = 0; count < 200 && !held; count++) await Promise.resolve();
      assert.ok(held, 'a real file adapter read must be outstanding');
    },
    release() { assert.ok(held); const request = held; held = null; succeed(request); },
  };
}
async function startOwner(r) {
  await r.owner.open();
  await r.owner.dispatch({ type: 'SELECT_BOOK', bookId: 'test-reading-1' });
  await r.owner.dispatch({ type: 'SELECT_ACTION', firstActionId: 'read-first-paragraph' });
  await r.owner.dispatch({ type: 'CONFIRM_START', confirmed: true });
}

test('details can open and return to reading while the real owner file read is pending', async t => {
  const r = rig(t); await startOwner(r); r.holdRead();
  const showing = r.ui.show(); await r.untilHeld();
  const before = r.owner.snapshot(); const preview = r.ui.getState().preview; const writes = r.writes();
  assert.equal(before.busy, true); assert.equal(r.ui.getState().operation, 'read');
  assert.equal(r.ui.openDetails().view, 'DETAILS');
  assert.equal(r.ui.openDetails().view, 'DETAILS', 'repeat taps must not add a details return frame');
  assert.deepEqual(r.ui.getState().preview, preview);
  assert.equal(r.ui.back().view, 'READING');
  assert.equal(r.ui.getState().busy, true); assert.equal(r.ui.getState().operation, 'read');
  assert.equal(r.exits(), 0); assert.equal(r.writes(), writes);
  assert.deepEqual(r.owner.snapshot(), before);
  r.release(); await showing;
  assert.equal(r.ui.getState().operationUncertain, false); assert.equal(r.ui.getState().busy, false);
  assert.equal(r.ui.getState().view, 'READING'); assert.equal(r.owner.snapshot().sequence, 3);
});

test('pending details navigation leaves business pickers and writes locked', async t => {
  const r = rig(t); await startOwner(r); r.holdRead();
  const showing = r.ui.show(); await r.untilHeld(); const writes = r.writes();
  assert.equal(r.ui.openDetails().view, 'DETAILS'); r.ui.back();
  assert.equal(r.ui.openBreakPicker().view, 'READING');
  assert.equal(r.ui.openFinishReview().view, 'READING');
  assert.equal(r.ui.openBookPicker().view, 'READING');
  assert.equal(r.ui.openActionPicker().view, 'READING');
  await r.ui.beginBreak(5); await r.ui.resume(); await r.ui.finish(null);
  await r.ui.confirmStart(r.ui.getState().preview);
  assert.equal(r.owner.snapshot().canWrite, false); assert.equal(r.writes(), writes);
  assert.equal(r.owner.snapshot().document.state, 'FOCUS');
  r.release(); await showing;
});

test('details during start readback preserve the captured action and exactly one successful start', async t => {
  const r = rig(t); await r.ui.show(); r.ui.openActionPicker(); r.ui.chooseAction('open-book');
  const preview = r.ui.getState().preview; r.holdReadback();
  const starting = r.ui.confirmStart(preview); await r.untilHeld(); const writes = r.writes();
  assert.equal(r.ui.openDetails().view, 'DETAILS');
  assert.deepEqual(r.ui.getState().preview, preview); assert.equal(r.ui.getState().operation, 'start');
  assert.equal(r.ui.back().view, 'READY');
  assert.equal(r.ui.openBookPicker().view, 'READY'); assert.equal(r.ui.openActionPicker().view, 'READY');
  r.ui.chooseBook('test-review-1'); r.ui.chooseAction('read-first-paragraph');
  await r.ui.confirmStart(preview);
  assert.equal(r.writes(), writes); assert.equal(r.exits(), 0);
  r.release(); await starting;
  const saved = r.owner.snapshot();
  assert.equal(saved.document.state, 'FOCUS'); assert.equal(saved.document.counter, 1); assert.equal(saved.sequence, 1);
  assert.equal(saved.document.active.firstActionSnapshot.id, 'open-book');
  assert.equal(r.ui.getState().operationUncertain, false); assert.equal(r.ui.getState().view, 'READING');
});

test('details and return during finish readback preserve page draft and the confirmed saved receipt', async t => {
  const r = rig(t); await startOwner(r); await r.ui.show();
  r.ui.openFinishReview(); r.ui.openPageEditor(); r.ui.setPageDigits('27'); r.holdReadback();
  const finishing = r.ui.finish(); await r.untilHeld(); const writes = r.writes();
  assert.equal(r.ui.openDetails().view, 'DETAILS'); assert.equal(r.ui.back().view, 'PAGE_EDITOR');
  assert.equal(r.ui.getState().pageDigits, '27'); assert.equal(r.ui.getState().operation, 'finish');
  r.ui.setPageDigits('99'); await r.ui.finish(99);
  assert.equal(r.ui.getState().pageDigits, '27'); assert.equal(r.writes(), writes); assert.equal(r.exits(), 0);
  r.release(); await finishing;
  const saved = r.owner.snapshot();
  assert.equal(saved.document.pending.length, 1); assert.equal(saved.document.pending[0].endPage, 27);
  assert.equal(r.ui.getState().view, 'SAVED'); assert.equal(r.ui.getState().operationUncertain, false);
});

test('details return cannot restore an obsolete break picker after the pending owner state changes', async t => {
  const r = rig(t); await startOwner(r); await r.ui.show(); r.ui.openBreakPicker(); r.holdReadback();
  const breaking = r.ui.beginBreak(5); await r.untilHeld();
  assert.equal(r.ui.openDetails().view, 'DETAILS');
  let restored = null;
  const off = r.owner.subscribe(snapshot => {
    if (!snapshot.busy && snapshot.document.state === 'BREAK' && r.ui.getState().view === 'DETAILS') restored = r.ui.back().view;
  });
  r.release(); await breaking; off();
  assert.equal(restored, 'RESTING'); assert.equal(r.ui.getState().view, 'RESTING'); assert.equal(r.exits(), 0);
});

for (const lifecycle of ['hide', 'dispose']) test(lifecycle + ' prevents pending details navigation and Back', async t => {
  const r = rig(t); await startOwner(r); r.holdRead();
  const showing = r.ui.show(); await r.untilHeld(); const writes = r.writes();
  r.ui[lifecycle]();
  assert.equal(r.ui.openDetails().view, 'READING'); assert.equal(r.ui.back().view, 'READING');
  assert.equal(r.ui.getState().visible, false); assert.equal(r.writes(), writes); assert.equal(r.exits(), 0);
  r.release(); await showing;
});

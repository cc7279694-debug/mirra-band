const test = require('node:test');
const assert = require('node:assert/strict');
const { rig, prepare, start, finished, TEST_BOOKS } = require('./fixtures/local-ui-rig.cjs');
let createLocalUiFlow;
try { ({ createLocalUiFlow } = require('../src/lib/local-ui-flow')); }
catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
function flow(r) {
  assert.equal(typeof createLocalUiFlow, 'function', 'safe UI orchestration has not been implemented');
  return createLocalUiFlow({ owner: r.owner, catalog: TEST_BOOKS });
}

test('second start save failure stops the chain despite resolved owner Promise', async () => {
  const r = rig(); const ui = flow(r); await ui.show(); r.failAt(2); await ui.confirmStart(ui.getState().preview);
  assert.deepEqual(r.commands.map(a => a.type), ['SELECT_BOOK', 'SELECT_ACTION']);
  assert.equal(r.realOwner.snapshot().document.state, 'PREPARING'); assert.notEqual(ui.getState().view, 'READING');
  assert.equal(ui.getState().ownerSnapshot.status, 'BLOCKED'); assert.equal(ui.getState().busy, false);
});
test('a whole start chain remains locked while native readback awaits acknowledgement', async () => {
  const r = rig(); const ui = flow(r); await ui.show(); const preview = ui.getState().preview; r.holdAt(2);
  const first = ui.confirmStart(preview); await r.untilHeld();
  await ui.confirmStart(preview); ui.openBookPicker(); ui.chooseBook('test-review-1');
  assert.equal(ui.getState().busy, true); assert.equal(r.commands.length, 2); assert.equal(r.realOwner.snapshot().document.counter, 0);
  r.release(); await first; assert.equal(r.realOwner.snapshot().document.counter, 1);
  assert.equal(r.commands.length, 3); assert.equal(ui.getState().view, 'READING');
});
test('an immutable click capture cannot be replaced during asynchronous start', async () => {
  const r = rig(); const ui = flow(r); await ui.show(); ui.openActionPicker(); ui.chooseAction('open-book');
  const preview = JSON.parse(JSON.stringify(ui.getState().preview)); r.holdAt(1);
  const operation = ui.confirmStart(preview); await r.untilHeld();
  preview.actionId = 'read-first-paragraph'; preview.text = 'wrong'; preview.firstActionSnapshot.text = 'wrong';
  ui.chooseAction('read-first-paragraph'); r.next(); r.release(); await operation;
  assert.equal(r.realOwner.snapshot().document.active.firstActionSnapshot.id, 'open-book');
  assert.equal(r.realOwner.snapshot().document.active.firstActionSnapshot.text, '打开这本测试书籍，找到准备阅读的一页。');
});
test('hide cancels only unstarted continuation and re-entry never completes preparation itself', async () => {
  const r = rig(); const ui = flow(r); await ui.show(); r.holdAt(1);
  const operation = ui.confirmStart(ui.getState().preview); await r.untilHeld(); ui.hide(); r.release(); await operation;
  assert.deepEqual(r.commands.map(a => a.type), ['SELECT_BOOK']);
  assert.equal(r.realOwner.snapshot().document.state, 'PREPARING'); assert.equal(r.closes(), 0);
  await ui.show(); assert.equal(ui.getState().view, 'READY'); assert.equal(r.commands.length, 1);
  await ui.confirmStart(ui.getState().preview); assert.equal(r.realOwner.snapshot().document.counter, 1);
});
test('hide followed by show cannot revive an old in-flight command continuation', async () => {
  const r = rig(); const ui = flow(r); await ui.show(); r.holdAt(1);
  const operation = ui.confirmStart(ui.getState().preview); await r.untilHeld(); ui.hide(); await ui.show();
  r.release(); await operation; assert.equal(r.commands.length, 1); assert.equal(r.realOwner.snapshot().document.state, 'PREPARING');
});
test('unqualified storage refuses all new start writes', async () => {
  const r = rig({ storageQualified: false }); const ui = flow(r); await ui.show(); await ui.confirmStart(ui.getState().preview);
  assert.equal(r.commands.length, 0); assert.equal(r.writes.length, 0); assert.equal(r.identities(), 0);
});
test('BLOCKED unknown schema remains blocked and cannot dispatch', async () => {
  const r = rig({ slots: ['{"schemaVersion":99}', null] }); const ui = flow(r); await ui.show();
  await ui.confirmStart(ui.getState().preview); assert.equal(ui.getState().ownerSnapshot.status, 'BLOCKED'); assert.equal(r.commands.length, 0);
});
test('RECOVERED requires a UI-only acknowledgement before any new business write', async () => {
  const seed = rig(); await prepare(seed); seed.slots[0] = '{';
  const r = rig({ slots: seed.slots }); const ui = flow(r); await ui.show();
  assert.equal(ui.getState().ownerSnapshot.status, 'RECOVERED'); await ui.confirmStart(ui.getState().preview);
  assert.equal(r.commands.length, 0); ui.acknowledgeRecovery(); assert.equal(r.commands.length, 0);
  await ui.confirmStart(ui.getState().preview); assert.equal(r.realOwner.snapshot().document.state, 'FOCUS');
});
test('stale sequence preview cannot start against a newer preparation', async () => {
  const r = rig(); const ui = flow(r); await ui.show(); const preview = ui.getState().preview;
  await r.owner.dispatch({ type: 'SELECT_BOOK', bookId: 'test-review-1' }); const before = r.commands.length;
  await ui.confirmStart(preview); assert.equal(r.commands.length, before); assert.equal(r.realOwner.snapshot().document.state, 'PREPARING');
});
test('changed visible text is not accepted as a confirmation of a different stored fact', async () => {
  const r = rig(); const ui = flow(r); await ui.show(); const preview = JSON.parse(JSON.stringify(ui.getState().preview));
  preview.text = 'unseen alternate action'; await ui.confirmStart(preview); assert.equal(r.commands.length, 0);
});
test('unknown dispatch rejection latches UI writes even when owner still says writable', async () => {
  const r = rig(); const dispatch = r.owner.dispatch; r.owner.dispatch = () => Promise.reject(new Error('unknown'));
  const ui = flow(r); await ui.show(); await ui.confirmStart(ui.getState().preview);
  assert.equal(ui.getState().operationUncertain, true); r.owner.dispatch = dispatch;
  await ui.reload(); await ui.confirmStart(ui.getState().preview); assert.equal(r.commands.length, 0);
  ui.hide(); await ui.show(); await ui.confirmStart(ui.getState().preview); assert.equal(r.commands.length, 0);
});
test('uncertain native write stays unwritable through UI reload and visibility callbacks', async () => {
  const r = rig(); const ui = flow(r); await ui.show(); r.failAt(1, 'TIMEOUT'); await ui.confirmStart(ui.getState().preview);
  const before = r.commands.length; assert.equal(ui.getState().ownerSnapshot.status, 'UNCERTAIN');
  await ui.reload(); ui.hide(); await ui.show(); await ui.confirmStart(ui.getState().preview);
  assert.equal(r.commands.length, before); assert.notEqual(ui.getState().view, 'READING');
});
test('duplicate finish during readback persists exactly one matching pending session', async () => {
  const r = rig(); await start(r); const ui = flow(r); await ui.show(); ui.openFinishReview();
  const id = r.realOwner.snapshot().document.active.id; r.holdAt(r.writes.length + 1);
  const first = ui.finish(null); await r.untilHeld(); await ui.finish(5); assert.notEqual(ui.getState().view, 'SAVED');
  r.release(); await first; assert.equal(ui.getState().view, 'SAVED');
  assert.equal(r.realOwner.snapshot().document.pending.length, 1); assert.equal(r.realOwner.snapshot().document.pending[0].id, id);
  assert.equal(r.realOwner.snapshot().document.pending[0].endPage, null);
});
test('finish failure keeps page draft and never claims saved', async () => {
  const r = rig(); await start(r); const ui = flow(r); await ui.show(); ui.openFinishReview(); ui.openPageEditor(); ui.setPageDigits('27');
  r.failAt(r.writes.length + 1); await ui.finish(); assert.equal(ui.getState().view, 'PAGE_EDITOR');
  assert.equal(ui.getState().pageDigits, '27'); assert.equal(r.realOwner.snapshot().document.pending.length, 0);
  assert.equal(r.realOwner.snapshot().document.state, 'FOCUS');
});
test('hidden successful native finish does not publish a stale SAVED view', async () => {
  const r = rig(); await start(r); const ui = flow(r); await ui.show(); ui.openFinishReview(); r.holdAt(r.writes.length + 1);
  const operation = ui.finish(null); await r.untilHeld(); ui.hide(); r.release(); await operation;
  assert.notEqual(ui.getState().view, 'SAVED'); await ui.show(); assert.equal(ui.getState().view, 'READY');
  assert.equal(r.realOwner.snapshot().document.pending.length, 1);
});
for (const mutation of ['sequence', 'status', 'error', 'identity', 'book', 'state', 'pending']) test('invalid SELECT_BOOK acknowledgement ' + mutation + ' stops every later start command', async () => {
  const r = rig(); const dispatch = r.owner.dispatch;
  r.owner.dispatch = async action => {
    const result = await dispatch(action); if (action.type !== 'SELECT_BOOK') return result;
    if (mutation === 'sequence') result.sequence--;
    if (mutation === 'status') result.status = 'BLOCKED';
    if (mutation === 'error') result.errorCode = 'SAVE_FAILED';
    if (mutation === 'identity') result.document.installationId = 'wrong-installation';
    if (mutation === 'book') result.document.preparation.bookSnapshot.title = 'wrong book';
    if (mutation === 'state') result.document.state = 'IDLE';
    if (mutation === 'pending') result.document.pending = [{}];
    return result;
  };
  const ui = flow(r); await ui.show(); await ui.confirmStart(ui.getState().preview);
  assert.deepEqual(r.commands.map(a => a.type), ['SELECT_BOOK']); assert.notEqual(ui.getState().view, 'READING');
  assert.equal(ui.getState().operationUncertain, true);
});
for (const mutation of ['missing', 'differentId', 'differentPage', 'differentBook', 'oldPending', 'active', 'sequence']) test('FINISH acknowledgement ' + mutation + ' cannot falsely show SAVED', async () => {
  const r = rig(); await finished(r); await r.owner.dispatch({ type: 'NEW_SESSION' }); await start(r);
  const dispatch = r.owner.dispatch;
  r.owner.dispatch = async action => {
    const result = await dispatch(action); if (action.type !== 'FINISH') return result;
    const saved = result.document.pending[result.document.pending.length - 1];
    if (mutation === 'missing') result.document.pending.pop();
    if (mutation === 'differentId') saved.id = 'other:2';
    if (mutation === 'differentPage') saved.endPage = 12;
    if (mutation === 'differentBook') saved.bookSnapshot.title = 'wrong';
    if (mutation === 'oldPending') result.document.pending[0].endPage = 30;
    if (mutation === 'active') result.document.active = saved;
    if (mutation === 'sequence') result.sequence--;
    return result;
  };
  const ui = flow(r); await ui.show(); ui.openFinishReview(); await ui.finish(null);
  assert.notEqual(ui.getState().view, 'SAVED'); assert.equal(ui.getState().operationUncertain, true);
});
test('show read rejection cannot present an actionable empty start', async () => {
  const r = rig(); r.owner.open = () => Promise.reject(new Error('unknown read outcome'));
  const ui = flow(r); await ui.show(); await ui.confirmStart(ui.getState().preview);
  assert.equal(r.commands.length, 0); assert.equal(ui.getState().operationUncertain, true);
});
test('show locks an already opened writable owner until its required read completes', async () => {
  const r = rig(); await r.owner.open(); const open = r.owner.open; let releaseRead;
  r.owner.open = () => new Promise(resolve => { releaseRead = () => open().then(resolve); });
  const ui = flow(r); const showing = ui.show();
  assert.equal(ui.getState().busy, true); await ui.confirmStart(ui.getState().preview);
  assert.equal(r.commands.length, 0); releaseRead(); await showing; assert.equal(ui.getState().busy, false);
});
test('reload after known save failure retains the page editor and unsaved digits', async () => {
  const r = rig(); await start(r); const ui = flow(r); await ui.show(); ui.openFinishReview(); ui.openPageEditor(); ui.setPageDigits('27');
  r.failAt(r.writes.length + 1); await ui.finish(); await ui.reload();
  assert.equal(ui.getState().view, 'PAGE_EDITOR'); assert.equal(ui.getState().pageDigits, '27');
  await ui.finish(); assert.equal(r.realOwner.snapshot().document.pending[0].endPage, 27);
});
test('uncertain outcome still allows read-only details and Back without unlocking writes', async () => {
  const r = rig(); r.owner.dispatch = () => Promise.reject(new Error('unknown'));
  const ui = flow(r); await ui.show(); await ui.confirmStart(ui.getState().preview); ui.openDetails();
  assert.equal(ui.getState().view, 'DETAILS'); ui.back(); assert.equal(ui.getState().view, 'READY');
  assert.equal(ui.getState().operationUncertain, true); assert.equal(r.writes.length, 0);
});
test('a replacement UI waits for already-started native IO then performs its own read', async () => {
  const r = rig(); await prepare(r); r.holdAt(r.writes.length + 1);
  const saving = r.owner.dispatch({ type: 'CONFIRM_START', confirmed: true }); await r.untilHeld();
  let reads = 0; const open = r.owner.open; r.owner.open = () => { reads++; return open(); };
  const ui = flow(r); await ui.show(); assert.equal(reads, 0);
  r.release(); await saving;
  for (let index = 0; index < 100 && ui.getState().busy; index++) await Promise.resolve();
  assert.equal(reads, 1); assert.equal(ui.getState().view, 'READING'); assert.equal(r.commands.length, 3);
});
test('capacity failures preserve history while the retained active session can still finish', async () => {
  const r = rig(); const ui = flow(r); await ui.show(); await ui.confirmStart(ui.getState().preview);
  let limited = false;
  for (let index = 0; index < 40; index++) {
    r.next();
    if (ui.getState().view === 'READING') { ui.openBreakPicker(); await ui.beginBreak(5); }
    else if (ui.getState().view === 'RESTING') await ui.resume();
    if (ui.getState().errorCode) { limited = true; break; }
  }
  assert.equal(limited, true); const activeId = r.realOwner.snapshot().document.active.id;
  if (ui.getState().view === 'BREAK_PICKER') ui.back();
  ui.openFinishReview(); await ui.finish(null);
  assert.equal(ui.getState().view, 'SAVED'); assert.equal(r.realOwner.snapshot().document.pending[0].id, activeId);
});
test('a full pending queue refuses another session without deleting or acknowledging any history', async () => {
  const r = rig(); const ui = flow(r); await ui.show();
  for (let index = 0; index < 8; index++) {
    await ui.confirmStart(ui.getState().preview); assert.equal(ui.getState().view, 'READING');
    r.next(); ui.openFinishReview(); await ui.finish(null); assert.equal(ui.getState().view, 'SAVED'); ui.done();
  }
  const pending = r.realOwner.snapshot().document.pending;
  await ui.confirmStart(ui.getState().preview);
  assert.notEqual(ui.getState().view, 'READING'); assert.deepEqual(r.realOwner.snapshot().document.pending, pending);
  assert.equal(r.realOwner.snapshot().document.counter, 8); assert.equal(r.realOwner.snapshot().document.active, null);
  assert.ok(['PENDING_CAPACITY', 'CAPACITY_REQUIRED'].includes(ui.getState().errorCode));
});

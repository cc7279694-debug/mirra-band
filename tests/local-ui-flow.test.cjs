const test = require('node:test');
const assert = require('node:assert/strict');
const { rig, idleRig, prepare, start, finished, TEST_BOOKS } = require('./fixtures/local-ui-rig.cjs');
let createLocalUiFlow;
try { ({ createLocalUiFlow } = require('../src/lib/local-ui-flow')); }
catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
function flow(r, options = {}) {
  assert.equal(typeof createLocalUiFlow, 'function', 'safe UI orchestration has not been implemented');
  return createLocalUiFlow(Object.assign({ owner: r.owner, catalog: TEST_BOOKS }, options));
}
function trace(r, from = 0) { return r.commands.slice(from).map(action => action.type); }

test('empty show, subscription and UI choices keep all business storage untouched', async () => {
  const r = rig(); const ui = flow(r); let updates = 0;
  const stop = ui.subscribe(() => { updates++; }); await ui.show();
  assert.equal(ui.getState().view, 'READY'); assert.equal(ui.getState().ownerSnapshot.document, null);
  ui.openBookPicker(); ui.chooseBook('test-review-1'); ui.openActionPicker(); ui.chooseAction('read-next-page');
  assert.equal(ui.getState().preview.bookId, 'test-review-1');
  assert.equal(ui.getState().preview.actionId, 'read-next-page');
  assert.equal(r.writes.length, 0); assert.equal(r.identities(), 0); assert.ok(updates > 1); stop();
});
for (const persisted of [false, true]) test('one explicit default confirmation starts from ' + (persisted ? 'IDLE' : 'EMPTY') + ' with one acknowledged atomic commit', async () => {
  const r = persisted ? idleRig() : rig(); const ui = flow(r); await ui.show();
  assert.equal(ui.getState().preview.text, '翻到第1页，读这一页的第一段。');
  await ui.confirmStart(ui.getState().preview);
  assert.deepEqual(trace(r), ['START_CONFIRMED']);
  assert.equal(ui.getState().view, 'READING');
  assert.equal(r.realOwner.snapshot().document.active.id, 'ui-installation:1');
  assert.equal(r.realOwner.snapshot().document.active.firstActionSnapshot.text, '翻到第1页，读这一页的第一段。');
});
test('an already matching PREPARING confirmation commits the same visible book and action once', async () => {
  const r = rig(); await prepare(r); const before = r.commands.length; const ui = flow(r); await ui.show();
  await ui.confirmStart(ui.getState().preview);
  assert.deepEqual(trace(r, before), ['START_CONFIRMED']); assert.equal(ui.getState().view, 'READING');
});
test('PREPARING with empty action selects and confirms it in one commit', async () => {
  const r = rig(); await prepare(r, { action: false }); const before = r.commands.length; const ui = flow(r); await ui.show();
  await ui.confirmStart(ui.getState().preview);
  assert.deepEqual(trace(r, before), ['START_CONFIRMED']);
});
test('same-book draft action change atomically starts only the displayed action', async () => {
  const r = rig(); await prepare(r); const before = r.commands.length; const ui = flow(r); await ui.show();
  ui.openActionPicker(); ui.chooseAction('open-book'); assert.equal(r.commands.length, before);
  await ui.confirmStart(ui.getState().preview);
  assert.deepEqual(trace(r, before), ['START_CONFIRMED']);
  assert.equal(r.realOwner.snapshot().document.active.firstActionSnapshot.id, 'open-book');
});
test('explicit different-book draft replaces preparation only in the confirmed final commit', async () => {
  const r = rig(); await prepare(r); const before = r.commands.length; const ui = flow(r); await ui.show();
  ui.openBookPicker(); ui.chooseBook('test-review-1'); assert.equal(r.commands.length, before);
  await ui.confirmStart(ui.getState().preview);
  assert.deepEqual(trace(r, before), ['START_CONFIRMED']);
  assert.equal(r.realOwner.snapshot().document.active.bookSnapshot.id, 'test-review-1');
});
test('FINISHED cold show and Done are read only; a new confirmation retains pending history', async () => {
  const r = rig(); await finished(r); const saved = r.realOwner.snapshot().document.pending[0];
  const before = r.commands.length; const ui = flow(r); await ui.show(); assert.equal(ui.getState().view, 'READY');
  ui.done(); assert.equal(r.commands.length, before); await ui.confirmStart(ui.getState().preview);
  assert.deepEqual(trace(r, before), ['START_CONFIRMED']);
  assert.deepEqual(r.realOwner.snapshot().document.pending, [saved]);
  assert.equal(r.realOwner.snapshot().document.active.id, 'ui-installation:2');
});
for (const state of ['FOCUS', 'BREAK']) test(state + ' re-entry and refused start never write or resume automatically', async () => {
  const r = rig(); await start(r); if (state === 'BREAK') await r.owner.dispatch({ type: 'BEGIN_BREAK', minutes: 5 });
  const before = r.commands.length; const ui = flow(r); await ui.show();
  assert.equal(ui.getState().view, state === 'FOCUS' ? 'READING' : 'RESTING');
  await ui.confirmStart({}); assert.equal(r.commands.length, before); assert.equal(r.realOwner.snapshot().document.state, state);
});
test('break picker dwell and Back preserve focus until a valid explicit duration', async () => {
  const r = rig(); await start(r); const before = r.commands.length; const ui = flow(r); await ui.show();
  ui.openBreakPicker(); r.next(60000); assert.equal(r.realOwner.snapshot().document.state, 'FOCUS');
  ui.back(); assert.equal(ui.getState().view, 'READING'); assert.equal(r.commands.length, before);
  ui.openBreakPicker(); await ui.beginBreak(3); assert.equal(r.commands.length, before);
  await ui.beginBreak(5); assert.equal(ui.getState().view, 'RESTING');
  r.next(360000); assert.equal(r.realOwner.snapshot().summary.breakRemainingMs, 0);
  assert.equal(r.realOwner.snapshot().document.state, 'BREAK'); await ui.resume(); assert.equal(ui.getState().view, 'READING');
});
test('finish review is read only and the final save captures the later clock with null page', async () => {
  const r = rig(); await start(r); const before = r.commands.length; const ui = flow(r); await ui.show();
  ui.openFinishReview(); assert.equal(ui.getState().view, 'FINISH_REVIEW'); assert.equal(ui.getState().pageDigits, '');
  r.next(9000); assert.equal(r.commands.length, before); assert.equal(r.realOwner.snapshot().document.state, 'FOCUS');
  await ui.finish(null); assert.equal(ui.getState().view, 'SAVED');
  assert.equal(r.realOwner.snapshot().document.pending[0].finishedAt.wallMs, 109000);
  assert.equal(r.realOwner.snapshot().document.pending[0].endPage, null);
  ui.done(); assert.equal(ui.getState().view, 'READY'); assert.deepEqual(trace(r, before), ['FINISH']);
});
test('Back cancels page input without saving or changing active session', async () => {
  const r = rig(); await start(r); const ui = flow(r); await ui.show(); const before = r.commands.length;
  ui.openFinishReview(); ui.openPageEditor(); ui.setPageDigits('123'); ui.back();
  assert.equal(ui.getState().view, 'FINISH_REVIEW'); assert.equal(ui.getState().pageDigits, '');
  assert.equal(r.commands.length, before); ui.back(); assert.equal(ui.getState().view, 'READING');
});
for (const digits of ['', '1', '999999']) test('optional page input saves ' + JSON.stringify(digits) + ' exactly', async () => {
  const r = rig(); await start(r); const ui = flow(r); await ui.show();
  ui.openFinishReview(); ui.openPageEditor(); ui.setPageDigits(digits); await ui.finish();
  assert.equal(ui.getState().view, 'SAVED'); assert.equal(r.realOwner.snapshot().document.pending[0].endPage, digits === '' ? null : Number(digits));
});
for (const digits of ['0', '-1', '1000000', '1.5', '1e2', 'x', ' 1', '１２']) test('invalid page input ' + JSON.stringify(digits) + ' cannot reach FINISH', async () => {
  const r = rig(); await start(r); const ui = flow(r); await ui.show(); const before = r.commands.length;
  ui.openFinishReview(); ui.openPageEditor(); ui.setPageDigits(digits); await ui.finish();
  assert.equal(r.commands.length, before); assert.equal(r.realOwner.snapshot().document.state, 'FOCUS');
  assert.ok(ui.getState().pageError); assert.equal(ui.getState().view, 'PAGE_EDITOR');
});
test('details and selectors return to their prior view with no owner mutation', async () => {
  const r = rig(); const ui = flow(r); await ui.show(); ui.openBookPicker(); ui.openDetails();
  assert.equal(ui.getState().view, 'DETAILS'); ui.back(); assert.equal(ui.getState().view, 'BOOK_PICKER');
  ui.back(); assert.equal(ui.getState().view, 'READY'); ui.openActionPicker(); ui.back();
  assert.equal(ui.getState().view, 'READY'); assert.equal(r.writes.length, 0);
});
test('hide and dispose leave the application owner alive and unsubscribe UI resources', async () => {
  const r = rig(); let exits = 0; const ui = flow(r, { requestExit: () => { exits++; } }); await ui.show();
  ui.hide(); await ui.confirmStart(ui.getState().preview); assert.equal(r.commands.length, 0);
  await ui.show(); ui.back(); assert.equal(exits, 1); ui.hide(); ui.dispose();
  assert.equal(r.closes(), 0); assert.notEqual(r.realOwner.snapshot().status, 'CLOSED');
});
test('state returned to subscribers is independent from internal drafts and business snapshot', async () => {
  const r = rig(); const ui = flow(r); await ui.show(); const state = ui.getState();
  state.view = 'SAVED'; state.bookId = 'wrong'; state.ownerSnapshot.canWrite = false;
  assert.equal(ui.getState().view, 'READY'); assert.equal(ui.getState().preview.bookId, 'test-reading-1');
  await ui.confirmStart(ui.getState().preview); assert.equal(ui.getState().view, 'READING');
});

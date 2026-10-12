const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../src/lib/local-session');
const obs = wallMs => ({ wallMs, ownerId: 'a', monotonicMs: null, monotonicVerified: false });
function focus(id = 'install-a') {
  let doc = domain.createDocument(id);
  doc = domain.transition(doc, { type: 'SELECT_BOOK', bookId: domain.TEST_BOOKS[0].id }, obs(1));
  doc = domain.transition(doc, { type: 'SELECT_ACTION', firstActionId: domain.TEST_BOOKS[0].firstActions[0].id }, obs(2));
  return domain.transition(doc, { type: 'CONFIRM_START', confirmed: true }, obs(3));
}
const finish = doc => domain.transition(doc, { type: 'FINISH', endPage: 20 }, obs(10));
const copy = doc => JSON.parse(JSON.stringify(doc));
test('history comparison refuses installation change and counter rollback', () => {
  assert.equal(domain.historyError(finish(focus()), domain.createDocument('install-b')), 'IDENTITY_CONFLICT');
  assert.equal(domain.historyError(finish(focus()), domain.createDocument('install-a')), 'COUNTER_ROLLBACK');
});
test('completed pending history must remain an exact immutable subset', () => {
  const old = finish(focus()); const missing = copy(old); missing.state = 'IDLE'; missing.pending = [];
  assert.equal(domain.historyError(old, missing), 'PENDING_DISAPPEARED');
  const modified = copy(old); modified.pending[0].endPage++;
  assert.equal(domain.historyError(old, modified), 'PENDING_CHANGED');
});
test('active Session cannot disappear despite a nondecreasing counter', () => {
  const old = focus(); const missing = domain.createDocument('install-a'); missing.counter = 1;
  assert.equal(domain.historyError(old, missing), 'ACTIVE_DISAPPEARED');
});
test('active immutable snapshots and prior raw boundaries cannot change', () => {
  const old = focus(); const modified = copy(old); modified.active.bookSnapshot.title = '测试书籍 · 被改写';
  assert.equal(domain.historyError(old, modified), 'ACTIVE_CHANGED');
  const rest = domain.transition(old, { type: 'BEGIN_BREAK', minutes: 5 }, obs(7));
  const modifiedRest = copy(rest); modifiedRest.active.intervals[0].end.wallMs = 8; modifiedRest.active.intervals[1].start.wallMs = 8;
  assert.equal(domain.historyError(rest, modifiedRest), 'ACTIVE_CHANGED');
});
test('normal closure, break/resume, finish and later queued Session are permitted', () => {
  const old = focus(); const rest = domain.transition(old, { type: 'BEGIN_BREAK', minutes: 10 }, obs(7));
  const resumed = domain.transition(rest, { type: 'RESUME' }, obs(9)); const done = finish(resumed);
  assert.equal(domain.historyError(old, rest), null); assert.equal(domain.historyError(old, done), null);
  assert.equal(domain.historyError(rest, resumed), null); assert.equal(domain.historyError(rest, done), null);
  let next = domain.transition(done, { type: 'NEW_SESSION' }, obs(11));
  next = domain.transition(next, { type: 'SELECT_BOOK', bookId: domain.TEST_BOOKS[1].id }, obs(12));
  next = domain.transition(next, { type: 'SELECT_ACTION', firstActionId: domain.TEST_BOOKS[1].firstActions[0].id }, obs(13));
  next = domain.transition(next, { type: 'CONFIRM_START', confirmed: true }, obs(14));
  assert.equal(domain.historyError(old, next), null); assert.equal(domain.historyError(done, next), null);
});

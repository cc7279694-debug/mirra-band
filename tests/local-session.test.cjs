const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../src/lib/local-session');
const obs = (wallMs, ownerId = 'process-a', monotonicMs = null, monotonicVerified = false) => ({ wallMs, ownerId, monotonicMs, monotonicVerified });
const act = (doc, type, time, extra = {}) => domain.transition(doc, { type, ...extra }, time);
function preparing(doc = domain.createDocument('installation-a')) {
  doc = act(doc, 'SELECT_BOOK', obs(1000), { bookId: domain.TEST_BOOKS[0].id });
  return act(doc, 'SELECT_ACTION', obs(1500), { firstActionId: domain.TEST_BOOKS[0].firstActions[0].id });
}
const focused = () => act(preparing(), 'CONFIRM_START', obs(2000), { confirmed: true });
function complete(doc, time = 5000) { return act(doc, 'FINISH', obs(time), { endPage: null }); }
function code(fn, expected) { assert.throws(fn, error => error.code === expected); }

test('empty local document has no Session, independent schema and stable installation identity', () => {
  const doc = domain.createDocument('installation-a');
  assert.equal(doc.schemaVersion, 1); assert.equal(doc.state, 'IDLE'); assert.equal(doc.counter, 0);
  assert.equal(doc.active, null); assert.equal(doc.preparation, null); assert.deepEqual(doc.pending, []);
  assert.deepEqual(domain.createEmptyDocument({ installationId: 'installation-a' }), doc);
});
test('preparation is not a Session; explicit action confirmation atomically creates one stable ID', () => {
  const prep = preparing(); assert.equal(prep.state, 'PREPARING'); assert.equal(prep.active, null);
  code(() => act(prep, 'CONFIRM_START', obs(2000), { confirmed: false }), 'CONFIRM_REQUIRED');
  const doc = act(prep, 'CONFIRM_START', obs(2000), { confirmed: true });
  assert.equal(doc.state, 'FOCUS'); assert.equal(doc.active.id, 'installation-a:1'); assert.equal(doc.counter, 1);
  assert.equal(prep.counter, 0); assert.equal(prep.active, null);
  assert.equal(doc.active.intervals.length, 1); assert.equal(doc.active.intervals[0].kind, 'FOCUS');
});
test('unknown book or first action cannot become preparation', () => {
  code(() => act(domain.createDocument('a'), 'SELECT_BOOK', obs(1), { bookId: 'phone-real-book' }), 'BOOK');
  code(() => act(preparing(), 'SELECT_ACTION', obs(1), { firstActionId: 'invented' }), 'FIRST_ACTION');
  const noAction = act(domain.createDocument('a'), 'SELECT_BOOK', obs(1), { bookId: domain.TEST_BOOKS[0].id });
  code(() => act(noAction, 'CONFIRM_START', obs(2), { confirmed: true }), 'FIRST_ACTION');
});
test('preparation cancellation creates no history and test snapshots are self contained', () => {
  const prep = preparing(); const cancelled = act(prep, 'CANCEL_PREPARATION', obs(2000));
  assert.equal(cancelled.state, 'IDLE'); assert.equal(cancelled.counter, 0); assert.deepEqual(cancelled.pending, []);
  assert.equal(prep.preparation.bookSnapshot.title, domain.TEST_BOOKS[0].title);
  assert.equal(prep.preparation.firstActionSnapshot.text, domain.TEST_BOOKS[0].firstActions[0].text);
});
test('duplicate start and illegal transitions cannot create a second Session', () => {
  const doc = focused(); code(() => act(doc, 'CONFIRM_START', obs(3000), { confirmed: true }), 'STATE');
  code(() => act(doc, 'SELECT_BOOK', obs(3000), { bookId: domain.TEST_BOOKS[1].id }), 'STATE');
  code(() => act(doc, 'RESUME', obs(3000)), 'STATE'); assert.equal(doc.active.id, 'installation-a:1');
});
test('5 and 10 minute breaks require explicit resume even after deadline', () => {
  for (const minutes of [5, 10]) {
    const doc = act(focused(), 'BEGIN_BREAK', obs(12000), { minutes });
    const view = domain.summarize(doc, obs(12000 + minutes * 60000 + 1));
    assert.equal(doc.state, 'BREAK'); assert.equal(view.breakRemainingMs, 0);
    const resumed = act(doc, 'RESUME', obs(700000)); assert.equal(resumed.state, 'FOCUS');
    assert.equal(resumed.active.intervals[1].kind, 'BREAK'); assert.equal(resumed.active.intervals.length, 3);
  }
  code(() => act(focused(), 'BEGIN_BREAK', obs(3000), { minutes: 3 }), 'BREAK_MINUTES');
});
test('observed focus excludes real break intervals and wall-only time is never verified', () => {
  let doc = act(focused(), 'BEGIN_BREAK', obs(12000), { minutes: 5 });
  doc = act(doc, 'RESUME', obs(22000)); doc = complete(doc, 27000);
  const summary = domain.summarize(doc, obs(27000));
  assert.equal(summary.observedFocusMs, 15000); assert.equal(summary.observedBreakMs, 10000);
  assert.equal(summary.trustedFocusMs, 0); assert.equal(summary.timeUncertain, true);
  assert.equal(doc.pending[0].intervals[1].kind, 'BREAK');
});
test('finish from BREAK stores nullable page without inventing progress', () => {
  const doc = complete(act(focused(), 'BEGIN_BREAK', obs(4000), { minutes: 10 }), 7000);
  assert.equal(doc.state, 'FINISHED_PENDING_SYNC'); assert.equal(doc.active, null);
  assert.equal(doc.pending.length, 1); assert.equal(doc.pending[0].endPage, null);
  assert.equal(doc.pending[0].intervals[1].end.wallMs, 7000);
  code(() => complete(doc, 8000), 'STATE'); assert.equal(doc.pending.length, 1);
});
test('optional page accepts explicit positive integers only', () => {
  for (const endPage of [0, -1, 1.5, '5', undefined, 1000000]) code(() => act(focused(), 'FINISH', obs(5000), { endPage }), 'END_PAGE');
  assert.equal(act(focused(), 'FINISH', obs(5000), { endPage: 45 }).pending[0].endPage, 45);
});
test('pending records survive another Session and IDs never repeat', () => {
  let doc = complete(focused()); doc = act(doc, 'NEW_SESSION', obs(6000));
  doc = act(preparing(doc), 'CONFIRM_START', obs(7000), { confirmed: true });
  assert.equal(doc.active.id, 'installation-a:2'); assert.equal(doc.pending[0].id, 'installation-a:1');
  doc = complete(doc, 9000); assert.equal(doc.pending.length, 2);
});
test('pending capacity stops another START without deleting unsynchronized records', () => {
  let doc = domain.createDocument('a');
  for (let n = 0; n < 8; n++) { if (doc.state !== 'IDLE') doc = act(doc, 'NEW_SESSION', obs(1000)); doc = act(preparing(doc), 'CONFIRM_START', obs(2000), { confirmed: true }); doc = complete(doc); }
  const next = preparing(act(doc, 'NEW_SESSION', obs(6000)));
  code(() => act(next, 'CONFIRM_START', obs(7000), { confirmed: true }), 'PENDING_CAPACITY');
  assert.equal(next.pending.length, 8); assert.equal(next.counter, 8);
});
test('interval capacity stops extra transitions but permits ending the retained Session', () => {
  let doc = focused();
  for (let n = 1; n < 32; n++) doc = act(doc, doc.state === 'FOCUS' ? 'BEGIN_BREAK' : 'RESUME', obs(2000 + n * 1000), doc.state === 'FOCUS' ? { minutes: 5 } : {});
  code(() => act(doc, 'RESUME', obs(40000)), 'INTERVAL_CAPACITY');
  assert.equal(complete(doc, 41000).pending[0].intervals.length, 32);
});
test('owner reconstruction retains same Session and treats open duration as uncertain', () => {
  const doc = focused(); const copy = domain.validateDocument(JSON.parse(JSON.stringify(doc)));
  const summary = domain.summarize(copy, obs(10000, 'process-b'));
  assert.equal(copy.active.id, doc.active.id); assert.equal(summary.observedFocusMs, null);
  assert(summary.reasons.includes('OWNER_CHANGED')); assert.equal(summary.trustedFocusMs, 0);
  const done = act(copy, 'FINISH', obs(10000, 'process-b'), { endPage: null });
  assert.equal(done.pending[0].intervals[0].start.ownerId, 'process-a');
  assert.equal(done.pending[0].intervals[0].end.ownerId, 'process-b');
});
test('clock rollback, missing source and anomalous jumps preserve raw facts without negative duration', () => {
  for (const now of [obs(1000), obs(null), obs(2000 + 24 * 3600000)]) {
    const doc = act(focused(), 'FINISH', now, { endPage: null }); const summary = domain.summarize(doc, now);
    assert.equal(summary.observedFocusMs, null); assert.equal(summary.trustedFocusMs, 0);
    assert.equal(doc.pending[0].intervals[0].end.wallMs, now.wallMs); assert.equal(doc.pending.length, 1);
  }
});
test('only corroborated verified monotonic endpoints in one owner contribute trusted time', () => {
  let doc = act(preparing(), 'CONFIRM_START', obs(2000, 'a', 100, true), { confirmed: true });
  doc = act(doc, 'FINISH', obs(7000, 'a', 5100, true), { endPage: null });
  assert.equal(domain.summarize(doc, obs(7000)).trustedFocusMs, 5000);
  const changed = JSON.parse(JSON.stringify(doc)); changed.pending[0].intervals[0].end.monotonicMs = 100000;
  changed.pending[0].finishedAt.monotonicMs = 100000;
  assert.equal(domain.summarize(changed, obs(7000)).trustedFocusMs, 0);
});
test('strict document validation rejects future fields, duplicate IDs and sparse arrays', () => {
  const unknown = focused(); unknown.future = 1; code(() => domain.validateDocument(unknown), 'UNKNOWN_FIELD');
  const duplicate = complete(focused()); duplicate.pending.push(duplicate.pending[0]); code(() => domain.validateDocument(duplicate), 'DUPLICATE_ID');
  const sparse = complete(focused()); sparse.pending = new Array(1); code(() => domain.validateDocument(sparse), 'ARRAY');
});
test('stored completed history and state consistency cannot be forged by invalid shape', () => {
  const doc = focused(); doc.state = 'IDLE'; code(() => domain.validateDocument(doc), 'STATE');
  const saved = complete(focused()); saved.pending[0].finishedAt = null; code(() => domain.validateDocument(saved), 'SESSION');
  const prep = preparing(); prep.preparation.bookSnapshot.title = '\ud800'; code(() => domain.validateDocument(prep), 'UNICODE');
});

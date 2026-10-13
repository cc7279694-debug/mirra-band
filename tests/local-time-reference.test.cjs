const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../src/lib/local-session');
const { createLocalOwner } = require('../src/lib/local-owner');
const obs = (wallMs, ownerId = 'owner-a', monotonicMs = null, monotonicVerified = false) => ({ wallMs, ownerId, monotonicMs, monotonicVerified });
const act = (doc, type, time, extra = {}) => domain.transition(doc, { type, ...extra }, time);
function focus(time = obs(10000)) {
  let doc = domain.createDocument('time-reference');
  doc = act(doc, 'SELECT_BOOK', time, { bookId: domain.TEST_BOOKS[0].id });
  doc = act(doc, 'SELECT_ACTION', time, { firstActionId: domain.TEST_BOOKS[0].firstActions[0].id });
  return act(doc, 'CONFIRM_START', time, { confirmed: true });
}

test('new owner recovers bounded wall reference without changing facts or creating trusted time', () => {
  const doc = focus(); const before = JSON.stringify(doc);
  const result = domain.summarize(doc, obs(75000, 'owner-b'));
  assert.equal(result.observedFocusMs, 65000);
  assert.equal(result.observedBreakMs, 0);
  assert.equal(result.trustedFocusMs, 0);
  assert.equal(result.timeUncertain, true);
  assert.equal(result.timeConfidence, 'UNVERIFIED');
  assert.ok(result.reasons.includes('OWNER_CHANGED'));
  assert.ok(result.reasons.includes('WALL_ONLY'));
  assert.equal(JSON.stringify(doc), before);
});

test('cross-owner wall boundary accepts zero and the existing six-hour endpoint but rejects one millisecond beyond', () => {
  const doc = focus();
  for (const ms of [0, domain.MAX_OBSERVED_GAP_MS]) {
    const result = domain.summarize(doc, obs(10000 + ms, 'owner-b'));
    assert.equal(result.observedFocusMs, ms); assert.equal(result.trustedFocusMs, 0);
  }
  const result = domain.summarize(doc, obs(10001 + domain.MAX_OBSERVED_GAP_MS, 'owner-b'));
  assert.equal(result.observedFocusMs, null); assert.ok(result.reasons.includes('CLOCK_JUMP'));
  assert.ok(result.reasons.includes('OWNER_CHANGED'));
});

test('new-owner rollback and missing wall remain unknown and retain actual anomaly reasons', () => {
  for (const [time, reason] of [[obs(9999, 'owner-b'), 'CLOCK_ROLLBACK'], [obs(null, 'owner-b'), 'CLOCK_UNAVAILABLE']]) {
    const doc = focus(); const before = JSON.stringify(doc); const result = domain.summarize(doc, time);
    assert.equal(result.observedFocusMs, null); assert.equal(result.observedBreakMs, null);
    assert.equal(result.breakRemainingMs, null); assert.equal(result.trustedFocusMs, 0);
    assert.ok(result.reasons.includes(reason)); assert.ok(result.reasons.includes('OWNER_CHANGED'));
    assert.equal(JSON.stringify(doc), before);
  }
});

test('owner change never corroborates monotonic timestamps even when numeric deltas happen to match', () => {
  for (const monotonicMs of [65100, 1]) {
    const doc = focus(obs(10000, 'owner-a', 100, true));
    const result = domain.summarize(doc, obs(75000, 'owner-b', monotonicMs, true));
    assert.equal(result.observedFocusMs, 65000); assert.equal(result.trustedFocusMs, 0);
    assert.ok(result.reasons.includes('OWNER_CHANGED')); assert.ok(result.reasons.includes('WALL_ONLY'));
    assert.ok(!result.reasons.includes('CLOCK_DIVERGENCE'));
  }
});

test('same-owner verified monotonic evidence remains separate and contradictions invalidate the reference', () => {
  const doc = focus(obs(10000, 'owner-a', 100, true));
  const valid = domain.summarize(doc, obs(75000, 'owner-a', 65100, true));
  assert.equal(valid.observedFocusMs, 65000); assert.equal(valid.trustedFocusMs, 65000);
  assert.equal(valid.timeConfidence, 'VERIFIED_MONOTONIC');
  const invalid = domain.summarize(doc, obs(75000, 'owner-a', 95000, true));
  assert.equal(invalid.observedFocusMs, null); assert.equal(invalid.trustedFocusMs, 0);
  assert.ok(invalid.reasons.includes('CLOCK_DIVERGENCE'));
});

test('multiple owners sum only FOCUS, retain BREAK endpoints, and restore the countdown without auto-resume', () => {
  let doc = act(focus(), 'BEGIN_BREAK', obs(75000, 'owner-b'), { minutes: 5 });
  const before = JSON.stringify(doc); const resting = domain.summarize(doc, obs(135000, 'owner-c'));
  assert.equal(resting.observedFocusMs, 65000); assert.equal(resting.observedBreakMs, 60000);
  assert.equal(resting.breakRemainingMs, 240000); assert.equal(JSON.stringify(doc), before);
  const expired = domain.summarize(doc, obs(400000, 'owner-c'));
  assert.equal(expired.breakRemainingMs, 0); assert.equal(doc.state, 'BREAK');
  doc = act(doc, 'RESUME', obs(400000, 'owner-c'));
  doc = act(doc, 'FINISH', obs(420000, 'owner-d'), { endPage: null });
  const result = domain.summarize(doc, obs(999999, 'owner-e'));
  assert.equal(result.observedFocusMs, 85000); assert.equal(result.observedBreakMs, 325000);
  assert.equal(result.trustedFocusMs, 0); assert.equal(doc.pending[0].endPage, null);
  assert.equal(doc.pending.length, 1); assert.equal(doc.pending[0].id, 'time-reference:1');
});

test('a known anomaly in BREAK invalidates the entire reference time chain', () => {
  for (const time of [obs(74000, 'owner-c'), obs(null, 'owner-c'), obs(75001 + domain.MAX_OBSERVED_GAP_MS, 'owner-c')]) {
    let doc = act(focus(), 'BEGIN_BREAK', obs(75000, 'owner-b'), { minutes: 5 });
    doc = act(doc, 'FINISH', time, { endPage: null });
    const before = JSON.stringify(doc); const result = domain.summarize(doc, obs(90000, 'owner-d'));
    assert.equal(result.observedFocusMs, null); assert.equal(result.observedBreakMs, null);
    assert.equal(result.breakRemainingMs, null); assert.equal(result.trustedFocusMs, 0);
    assert.equal(JSON.stringify(doc), before);
  }
});

test('an anomalous earlier interval cannot be hidden by a later normal owner', () => {
  let doc = act(focus(), 'BEGIN_BREAK', obs(75000), { minutes: 5 });
  doc = act(doc, 'RESUME', obs(74000, 'owner-b'));
  const result = domain.summarize(doc, obs(94000, 'owner-c'));
  assert.equal(result.observedFocusMs, null); assert.ok(result.reasons.includes('CLOCK_ROLLBACK'));
  assert.equal(doc.state, 'FOCUS'); assert.equal(doc.active.intervals.length, 3);
});

test('the existing gap budget remains per interval rather than silently imposing a new total duration limit', () => {
  let doc = focus(obs(0));
  doc = act(doc, 'BEGIN_BREAK', obs(domain.MAX_OBSERVED_GAP_MS, 'owner-b'), { minutes: 5 });
  doc = act(doc, 'RESUME', obs(domain.MAX_OBSERVED_GAP_MS + 1000, 'owner-c'));
  const result = domain.summarize(doc, obs(2 * domain.MAX_OBSERVED_GAP_MS + 1000, 'owner-d'));
  assert.equal(result.observedFocusMs, 2 * domain.MAX_OBSERVED_GAP_MS);
  assert.equal(result.observedBreakMs, 1000); assert.equal(result.trustedFocusMs, 0);
});

async function ownerRig() {
  let wall = 10000; const slots = [null, null]; const writes = [];
  const owner = createLocalOwner({ storageQualified: true,
    backendFactory: () => ({ async read(slot) { return slots[slot]; }, async write(slot, raw) { writes.push(raw); slots[slot] = raw; }, describe: () => ({ closed: false, uncertain: false }), close() {} }),
    installationIdFactory: () => 'time-owner', clock: () => obs(wall) });
  await owner.open(); await owner.dispatch({ type: 'SELECT_BOOK', bookId: domain.TEST_BOOKS[0].id });
  await owner.dispatch({ type: 'SELECT_ACTION', firstActionId: domain.TEST_BOOKS[0].firstActions[0].id });
  await owner.dispatch({ type: 'CONFIRM_START', confirmed: true });
  return { owner, writes, set(value) { wall = value; } };
}

test('an observed backwards tick above the original start remains unknown within the same owner', async () => {
  const r = await ownerRig(); try {
    r.set(75000); assert.equal(r.owner.snapshot().summary.observedFocusMs, 65000);
    const before = JSON.stringify(r.owner.snapshot().document); const count = r.writes.length;
    r.set(74000); const bad = r.owner.snapshot().summary;
    assert.equal(bad.observedFocusMs, null); assert.ok(bad.reasons.includes('CLOCK_ROLLBACK'));
    r.set(80000); const later = r.owner.snapshot().summary;
    assert.equal(later.observedFocusMs, null); assert.ok(later.reasons.includes('CLOCK_ROLLBACK'));
    assert.equal(r.writes.length, count); assert.equal(JSON.stringify(r.owner.snapshot().document), before);
  } finally { r.owner.close(); }
});

test('missing runtime clock cannot become a clean reference on the next tick without forgetting the known anomaly', async () => {
  const r = await ownerRig(); try {
    r.set(null); assert.equal(r.owner.snapshot().summary.observedFocusMs, null);
    r.set(20000); const result = r.owner.snapshot().summary;
    assert.equal(result.observedFocusMs, null); assert.ok(result.reasons.includes('CLOCK_UNAVAILABLE'));
    assert.equal(r.owner.snapshot().document.active.startAt.wallMs, 10000);
  } finally { r.owner.close(); }
});

test('a completed record depends only on closed endpoints and cannot be poisoned by an unrelated current clock', async () => {
  const r = await ownerRig(); try {
    r.set(20000); await r.owner.dispatch({ type: 'FINISH', endPage: null });
    const before = JSON.stringify(r.owner.snapshot().document); const count = r.writes.length;
    for (const wall of [NaN, null, 1, 30000]) {
      r.set(wall); const result = r.owner.snapshot().summary;
      assert.equal(result.observedFocusMs, 10000); assert.equal(result.trustedFocusMs, 0);
      assert.ok(!result.reasons.includes('CLOCK_SOURCE_INVALID'));
      assert.equal(r.writes.length, count); assert.equal(JSON.stringify(r.owner.snapshot().document), before);
    }
  } finally { r.owner.close(); }
});

test('active known anomalies survive finish but a distinct explicitly started Session has its own clock memory', async () => {
  const r = await ownerRig(); try {
    r.set(75000); r.owner.snapshot(); r.set(74000); r.owner.snapshot();
    r.set(80000); await r.owner.dispatch({ type: 'FINISH', endPage: null });
    const old = r.owner.snapshot().document.pending[0];
    assert.equal(r.owner.snapshot().summary.observedFocusMs, null);
    await r.owner.dispatch({ type: 'NEW_SESSION' });
    await r.owner.dispatch({ type: 'SELECT_BOOK', bookId: domain.TEST_BOOKS[0].id });
    await r.owner.dispatch({ type: 'SELECT_ACTION', firstActionId: domain.TEST_BOOKS[0].firstActions[0].id });
    await r.owner.dispatch({ type: 'CONFIRM_START', confirmed: true });
    r.set(81000); const result = r.owner.snapshot();
    assert.equal(result.summary.observedFocusMs, 1000); assert.equal(result.summary.trustedFocusMs, 0);
    assert.notEqual(result.document.active.id, old.id); assert.deepEqual(result.document.pending[0], old);
  } finally { r.owner.close(); }
});

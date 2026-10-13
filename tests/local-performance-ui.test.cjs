const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const domainLib = require('../src/lib/local-session');
const presentationLib = require('../src/lib/local-presentation');
const flowLib = require('../src/lib/local-ui-flow');
const { rig, start } = require('./fixtures/local-ui-rig.cjs');

test('click timing begins before the first native tap feedback setter', async () => {
  const h = harness(); h.owner.performance = h.r.realOwner.performance;
  try {
    await h.page.onShow(); h.owner.performance.setEnabled(true);
    const descriptor = Object.getOwnPropertyDescriptor(h.page, 'tapCount'); let observed = false;
    Object.defineProperty(h.page, 'tapCount', { configurable: true, get: descriptor.get, set(value) {
      assert.equal(h.owner.performance.active, true, 'timing must include the initial native diagnostic work');
      observed = true; descriptor.set(value);
    } });
    await h.page.confirmStart(); assert.equal(observed, true);
    assert.equal(h.owner.performance.snapshot().active, false);
  } finally { h.cleanup(); }
});

// These are callback/assignment counts at a controlled Node boundary. Native
// paint latency, device storage latency and perceived smoothness remain unrun.
function harness(options = {}) {
  const r = options.r || rig(); const timers = new Map(); const assignments = [];
  const counts = { snapshots: 0, timeSnapshots: 0, fullProjection: 0, timeProjection: 0 };
  const owner = Object.assign({}, r.owner, {
    snapshot() { counts.snapshots++; return r.owner.snapshot(); },
    timerSnapshot() {
      counts.timeSnapshots++;
      return typeof r.realOwner.timerSnapshot === 'function' ? r.realOwner.timerSnapshot()
        : { summary: r.realOwner.snapshot().summary, timeHint: '' };
    },
  });
  const presentation = Object.assign({}, presentationLib, {
    presentLocal(...args) { counts.fullProjection++; return presentationLib.presentLocal(...args); },
    presentTime(...args) { counts.timeProjection++; return presentationLib.presentTime(...args); },
  });
  let timerId = 0;
  const module = { exports: {} };
  const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/LocalSession/index.ux'), 'utf8');
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm, '').replace(/\bexport\s+default\s+/, 'module.exports = ');
  vm.runInNewContext(script, { module, domainLib, presentationLib: presentation, flowLib,
    profile: { versionName: '0.1.4' }, Promise, Array, Object, Number, String, Math, JSON,
    setInterval(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearInterval(id) { timers.delete(id); } });
  const data = {};
  const page = Object.assign({}, module.exports, { $app: { $def: { getLocalOwner: () => owner }, exit() {} } });
  for (const [key, value] of Object.entries(module.exports.private)) {
    data[key] = value;
    Object.defineProperty(page, key, { configurable: true, get() { return data[key]; }, set(next) { data[key] = next; assignments.push(key); } });
  }
  page.onInit();
  return { r, owner, page, data, assignments, counts,
    clear() { assignments.length = 0; for (const key of Object.keys(counts)) counts[key] = 0; },
    tick() { for (const callback of timers.values()) callback(); },
    cleanup() { page.onDestroy(); r.realOwner.close(); } };
}

test('time-only presentation preserves reference qualifiers, break expiry and hard anomaly classification', () => {
  assert.equal(typeof presentationLib.presentTime, 'function');
  const summary = { observedFocusMs: 65000, observedBreakMs: 360000, breakRemainingMs: 0,
    trustedFocusMs: 0, timeUncertain: true, timeConfidence: 'UNVERIFIED', reasons: ['OWNER_CHANGED', 'WALL_ONLY'] };
  const reading = presentationLib.presentTime(summary, 'READING');
  assert.equal(reading.timer.valueText, '01:05'); assert.equal(reading.timer.qualifier, '参考值');
  assert.equal(reading.hardAnomaly, false); assert.match(reading.notice.title, /参考/);
  const rest = presentationLib.presentTime(summary, 'RESTING');
  assert.equal(rest.timer.valueText, '休息时间已到'); assert.equal(rest.focusTimer.valueText, '01:05');
  const unknown = presentationLib.presentTime(Object.assign({}, summary, {
    observedFocusMs: null, observedBreakMs: null, breakRemainingMs: null, reasons: ['CLOCK_ROLLBACK'] }), 'READING');
  assert.equal(unknown.timer.valueText, '--:--'); assert.equal(unknown.hardAnomaly, true);
});

test('ordinary reading ticks perform a time-only projection and change only time text', async () => {
  const r = rig(); await start(r); const h = harness({ r });
  try {
    await h.page.onShow(); const writes = r.writes.length; const snapshot = r.owner.snapshot(); h.clear();
    r.next(1000); h.tick();
    assert.equal(h.page.timerText, '00:01'); assert.equal(h.page.timerQualifier, '参考值');
    assert.equal(h.counts.snapshots, 0); assert.equal(h.counts.fullProjection, 0);
    assert.equal(h.counts.timeSnapshots, 1); assert.equal(h.counts.timeProjection, 1);
    assert.ok(h.assignments.length <= 4, 'unchanged native scalar fields must not be reassigned every second');
    assert.equal(r.writes.length, writes); assert.equal(r.owner.snapshot().document.active.id, snapshot.document.active.id);
    h.clear(); h.tick(); assert.equal(h.assignments.length, 0, 'same displayed second needs no native field update');
  } finally { h.cleanup(); }
});

test('an unchanged full projection does not republish every native field', async () => {
  const h = harness();
  try {
    await h.page.onShow(); h.clear(); h.page.safeRefresh();
    assert.ok(h.assignments.length <= 3, 'only explicit refresh counters/diagnostic counter text need change');
    assert.ok(!h.assignments.includes('primaryLabel')); assert.ok(!h.assignments.includes('bookTitle'));
  } finally { h.cleanup(); }
});

test('busy break persistence gets immediate feedback and avoids full projection or timer work until confirmed', async () => {
  const r = rig(); await start(r); const h = harness({ r });
  try {
    await h.page.onShow(); h.page.openBreakPicker(); h.clear(); r.holdAt(r.writes.length + 1);
    const operation = h.page.beginBreak(5);
    assert.equal(h.page.busy, true); assert.equal(h.page.canWrite, false);
    assert.equal(h.page.view, 'BREAK_PICKER'); assert.equal(r.owner.snapshot().document.state, 'FOCUS');
    await r.untilHeld(); h.clear(); r.next(1000); h.tick();
    assert.equal(h.counts.snapshots, 0); assert.equal(h.counts.timeSnapshots, 0);
    assert.equal(h.counts.fullProjection, 0); assert.equal(h.assignments.length, 0);
    const writes = r.writes.length; h.page.beginBreak(5); assert.equal(r.writes.length, writes);
    assert.equal(h.counts.fullProjection, 0, 'duplicate busy taps must not rebuild the entire view');
    r.release(); await operation; assert.equal(h.page.view, 'RESTING'); assert.equal(h.page.busy, false);
    assert.equal(r.owner.snapshot().document.state, 'BREAK');
  } finally { h.cleanup(); }
});

test('read-only Details and Back remain usable while a business readback is pending', async () => {
  const r = rig(); await start(r); const h = harness({ r });
  try {
    await h.page.onShow(); h.page.openBreakPicker(); r.holdAt(r.writes.length + 1);
    const operation = h.page.beginBreak(5); await r.untilHeld(); const writes = r.writes.length;
    h.page.showDetails(); assert.equal(h.page.view, 'DETAILS'); assert.equal(h.page.busy, true);
    h.page.backView(); assert.equal(h.page.view, 'BREAK_PICKER'); assert.equal(r.writes.length, writes);
    r.release(); await operation; assert.equal(h.page.view, 'RESTING');
  } finally { h.cleanup(); }
});

test('a failed native timer setter remains visible and retries without changing Session facts', async () => {
  const r = rig(); await start(r); const h = harness({ r });
  try {
    await h.page.onShow(); const id = r.owner.snapshot().document.active.id; const writes = r.writes.length;
    const descriptor = Object.getOwnPropertyDescriptor(h.page, 'timerText'); let failed = false;
    Object.defineProperty(h.page, 'timerText', { configurable: true, get: descriptor.get, set(value) {
      if (!failed && value === '00:01') { failed = true; throw new Error('private native timing detail'); }
      descriptor.set(value);
    } });
    r.next(1000); h.tick(); assert.equal(h.page.refreshError, 'UI_REFRESH'); assert.equal(h.page.primaryEnabled, false);
    h.tick(); assert.equal(h.page.refreshError, ''); assert.equal(h.page.timerText, '00:01');
    assert.equal(r.writes.length, writes); assert.equal(r.owner.snapshot().document.active.id, id);
  } finally { h.cleanup(); }
});

test('clock rollback still escalates the time-only tick to a truthful full anomaly refresh', async () => {
  const r = rig(); await start(r); const h = harness({ r });
  try {
    await h.page.onShow(); r.next(65000); h.tick(); assert.equal(h.page.timerText, '01:05');
    const writes = r.writes.length; h.clear(); r.next(-10000); h.tick();
    assert.equal(h.page.timerText, '--:--'); assert.equal(h.page.timerQualifier, '时间待核对');
    assert.equal(h.counts.fullProjection, 1); assert.match(h.page.detailTimeReason, /CLOCK_ROLLBACK/);
    r.next(10000); h.tick(); assert.equal(h.page.timerText, '--:--'); assert.equal(r.writes.length, writes);
  } finally { h.cleanup(); }
});

test('expired break ticks never resume or grow reading total', async () => {
  const r = rig(); await start(r); const h = harness({ r });
  try {
    await h.page.onShow(); r.next(12000); h.page.openBreakPicker(); await h.page.beginBreak(5);
    const writes = r.writes.length; h.clear(); r.next(360000); h.tick();
    assert.equal(h.page.timerText, '休息时间已到'); assert.equal(h.page.focusText, '00:12');
    assert.equal(h.counts.fullProjection, 0); assert.equal(r.owner.snapshot().document.state, 'BREAK');
    assert.equal(r.writes.length, writes); h.page.onHide(); h.clear(); h.tick(); assert.equal(h.assignments.length, 0);
  } finally { h.cleanup(); }
});

test('performance diagnostics are off by default and can be toggled without writing Session data', async () => {
  const h = harness();
  const trace = { enabled: false, active: false, setEnabled(value) { this.enabled = value; },
    snapshot() { return { enabled: this.enabled, active: this.active, last: null }; } };
  h.owner.performance = trace;
  try {
    await h.page.onShow(); assert.equal(h.page.performanceEnabled, false);
    assert.equal(typeof h.page.togglePerformance, 'function'); const writes = h.r.writes.length;
    h.page.showDetails(); h.page.togglePerformance(); assert.equal(trace.enabled, true);
    assert.equal(h.page.performanceEnabled, true); h.page.togglePerformance(); assert.equal(trace.enabled, false);
    assert.equal(h.r.writes.length, writes);
  } finally { h.cleanup(); }
});

test('a stale confirmation preview finishes its diagnostic without claiming confirmed state or success rendering', async () => {
  const h = harness(); h.owner.performance = h.r.realOwner.performance;
  try {
    await h.page.onShow(); h.owner.performance.setEnabled(true);
    h.page._projection.preview = Object.assign({}, h.page._projection.preview, { bookId: 'stale-book' });
    await h.page.confirmStart();
    const diagnostic = h.owner.performance.snapshot(); assert.equal(diagnostic.active, false);
    assert.equal(h.r.writes.length, 0); assert.equal(h.page.view, 'READY');
    assert.equal(Object.hasOwn(diagnostic.last.marks, 'state_confirmed'), false);
    assert.equal(Object.hasOwn(diagnostic.last.marks, 'view_bound'), false);
  } finally { h.cleanup(); }
});

test('a failed write has a total diagnostic but cannot claim confirmed state or successful interface submission', async () => {
  const h = harness(); h.owner.performance = h.r.realOwner.performance;
  try {
    await h.page.onShow(); h.owner.performance.setEnabled(true); h.r.failAt(1);
    await h.page.confirmStart(); const diagnostic = h.owner.performance.snapshot();
    assert.equal(diagnostic.active, false); assert.equal(h.page.canWrite, false);
    assert.equal(Object.hasOwn(diagnostic.last.marks, 'state_confirmed'), false);
    assert.equal(Object.hasOwn(diagnostic.last.marks, 'view_bound'), false);
    assert.equal(h.r.realOwner.snapshot().document, null);
  } finally { h.cleanup(); }
});

test('summary-only owner time observation retains reference identity and latches a known rollback without writes', async () => {
  const r = rig(); await start(r);
  try {
    assert.equal(typeof r.realOwner.timerSnapshot, 'function'); const snapshot = r.owner.snapshot(); const writes = r.writes.length;
    r.next(65000); assert.equal(r.realOwner.timerSnapshot().summary.observedFocusMs, 65000);
    r.next(-10000); const uncertain = r.realOwner.timerSnapshot();
    assert.equal(uncertain.summary.observedFocusMs, null); assert.ok(uncertain.summary.reasons.includes('CLOCK_ROLLBACK'));
    r.next(10000); assert.equal(r.realOwner.timerSnapshot().summary.observedFocusMs, null);
    assert.equal(r.writes.length, writes); assert.equal(r.owner.snapshot().document.active.id, snapshot.document.active.id);
  } finally { r.realOwner.close(); }
});

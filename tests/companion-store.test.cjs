const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createCompanionStore } = require('../src/lib/companion-store');
function rig() {
  let now = 100000, id = 0, listener; const timers = new Map(), intervals = new Map(), sent = [];
  const transport = { subscribe(fn) { listener = fn; return () => { listener = null; }; },
    start() { listener({ kind: 'connection', status: 'connected' }); }, stop() {},
    send(payload) { sent.push(JSON.parse(payload)); return true; } };
  const store = createCompanionStore({ transport, now: () => now, randomId: () => 'unique-' + (++id),
    setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: n => timers.delete(n),
    setInterval: fn => { intervals.set(++id, fn); return id; }, clearInterval: n => intervals.delete(n) });
  function reply(message) { listener({ kind: 'message', payload: JSON.stringify(message) }); }
  function ack(streamId = 'stream-1') { const request = sent.at(-1); reply({ ...request, type: 'HELLO_ACK', streamId }); }
  function snap(patch = {}, sequence = 1) {
    const m = JSON.parse(fs.readFileSync('protocol/v1/fixtures/active.json', 'utf8'));
    Object.assign(m, sent.at(-1), { type: 'SNAPSHOT', sequence }); delete m.lastSeenSessionId;
    Object.assign(m.body, patch); reply(m); return m;
  }
  return { store, timers, intervals, sent, ack, snap, reply,
    event(e) { listener(e); }, time(n) { now = n; }, advance(n) { now += n; [...intervals.values()].forEach(f => f()); } };
}
test('cold live start is unknown, handshake precedes snapshot and no overlapping polls', () => {
  const r = rig(); assert.equal(r.store.snapshot().body, null); r.store.start(); r.store.start();
  assert.equal(r.sent.length, 1); assert.equal(r.sent[0].type, 'HELLO'); r.ack();
  assert.equal(r.sent.at(-1).type, 'GET_SNAPSHOT'); r.advance(1000); assert.equal(r.sent.length, 2);
  r.snap(); assert.equal(r.store.snapshot().freshness, 'fresh');
  r.advance(5000); assert.equal(r.sent.length, 3); r.advance(1000); assert.equal(r.sent.length, 3);
});
test('unique timeout requests and late/duplicate/out-of-order responses do not refresh', () => {
  const r = rig(); r.store.start(); r.ack(); const m = r.snap();
  r.advance(5000); const oldRequest = r.sent.at(-1); r.store.requestRefresh();
  assert.notEqual(r.sent.at(-1).requestId, oldRequest.requestId);
  r.time(109000); r.reply(m); assert.equal(r.store.snapshot().lastSyncedAgeMs, 9000);
  [...r.timers.values()][0](); const length = r.sent.length; r.advance(1000);
  assert.equal(r.sent.length, length); assert.equal(r.store.snapshot().freshness, 'expired');
  assert.equal(r.store.snapshot().timer.elapsedMs, 125000);
});
test('15-second active and 30-second idle expiry freeze confirmed values', () => {
  for (const phase of ['ACTIVE', 'IDLE']) {
    const r = rig(); r.store.start(); r.ack();
    r.snap(phase === 'IDLE' ? { phase, sessionId: null, segmentType: null, elapsedMs: null, timerKind: 'NONE' } : {});
    const duration = phase === 'IDLE' ? 30000 : 15000;
    for (let n = 0; n < duration / 1000; n++) r.advance(1000);
    assert.equal(r.store.snapshot().freshness, 'expired');
    if (phase === 'ACTIVE') assert.equal(r.store.snapshot().timer.elapsedMs, 125000);
  }
});
test('native disconnect immediately rolls display back to confirmed and new stream can reset sequence', () => {
  const r = rig(); r.store.start(); r.ack(); r.snap({}, 80); r.advance(2000);
  assert.equal(r.store.snapshot().timer.elapsedMs, 127000);
  r.event({ kind: 'connection', status: 'disconnected' });
  assert.equal(r.store.snapshot().timer.elapsedMs, 125000); assert.equal(r.store.snapshot().freshness, 'expired');
  r.event({ kind: 'connection', status: 'connected' }); r.ack('stream-restored'); r.snap({}, 1);
  assert.equal(r.store.snapshot().freshness, 'fresh');
});
test('hide/show clears work and old client replies cannot revive state', () => {
  const r = rig(); r.store.start(); r.ack(); const old = r.snap();
  r.store.stop(); assert.equal(r.timers.size, 0); assert.equal(r.intervals.size, 0);
  r.store.start(); assert.equal(r.sent.at(-1).type, 'HELLO'); r.reply(old);
  assert.notEqual(r.store.snapshot().freshness, 'fresh'); r.store.destroy(); assert.equal(r.store.snapshot().body, null);
});
test('clock rollback/long scheduling gap freezes and requests new facts', () => {
  for (const delta of [-2000, 60000]) {
    const r = rig(); r.store.start(); r.ack(); r.snap(); r.advance(delta);
    assert.equal(r.store.snapshot().timer.elapsedMs, 125000);
    assert.notEqual(r.store.snapshot().freshness, 'fresh');
    assert.equal(r.sent.at(-1).type, 'HELLO');
  }
});
test('saving/ended do not interpolate, countdown zero retains phone phase', () => {
  const r = rig(); r.store.start(); r.ack(); r.snap({ phase: 'SAVING', timerKind: 'FINAL_SESSION_DURATION', segmentType: null });
  r.advance(1000); assert.equal(r.store.snapshot().timer.elapsedMs, 125000);
  r.store.requestRefresh(); r.snap({ segmentType: 'BREAK', timerKind: 'BREAK_REMAINING', remainingMs: 500 }, 2);
  r.advance(1000); assert.equal(r.store.snapshot().timer.remainingMs, 0); assert.equal(r.store.snapshot().body.phase, 'ACTIVE');
});
test('busy/disabled clears personal content, unsupported stops automatic retries', () => {
  for (const code of ['SOURCE_BUSY', 'DISABLED', 'UNSUPPORTED_PROTOCOL']) {
    const r = rig(); r.store.start(); r.ack(); r.snap(); r.store.requestRefresh();
    const req = r.sent.at(-1); const m = { protocolVersion: 1, type: 'STATUS_ERROR', clientInstanceId: req.clientInstanceId, requestId: req.requestId, streamId: req.streamId, code };
    r.reply(m); assert.equal(r.store.snapshot().body, null);
    const n = r.sent.length; r.advance(2000); if (code !== 'SOURCE_BUSY') assert.equal(r.sent.length, n);
  }
});
test('navigation show-before-hide cannot stop a new visible page lease', () => {
  const r = rig(), home = {}, detail = {};
  r.store.start(home); r.ack(); r.snap(); r.store.start(detail);
  r.store.stop(home); assert.equal(r.intervals.size, 1); assert.equal(r.store.snapshot().freshness, 'fresh');
  r.store.stop(detail); assert.equal(r.intervals.size, 0);
});
test('terminal status survives native reconnect and clock gaps until explicit retry or reentry', () => {
  for (const code of ['DISABLED', 'UNSUPPORTED_PROTOCOL', 'UNAUTHORIZED', 'IDENTITY_ERROR']) {
    const r = rig(); r.store.start(); r.ack(); r.snap(); r.store.requestRefresh();
    const req = r.sent.at(-1);
    r.reply({ protocolVersion: 1, type: 'STATUS_ERROR', clientInstanceId: req.clientInstanceId,
      requestId: req.requestId, streamId: req.streamId, code });
    const state = r.store.snapshot().connection, count = r.sent.length;
    r.event({ kind: 'connection', status: 'disconnected', code: 'CHANNEL_ERROR' });
    r.advance(2000); r.event({ kind: 'connection', status: 'connected' }); r.advance(60000);
    r.reply({ protocolVersion: 1, type: 'STATUS_ERROR', clientInstanceId: req.clientInstanceId,
      requestId: req.requestId, streamId: req.streamId, code: 'SOURCE_BUSY' });
    assert.equal(r.sent.length, count); assert.equal(r.store.snapshot().connection, state);
    assert.equal(r.store.snapshot().errorCode, code); assert.equal(r.store.snapshot().body, null);
    r.store.requestRefresh(); assert.equal(r.sent.length, count + 1); assert.equal(r.sent.at(-1).type, 'HELLO');
    r.store.stop(); r.store.start(); assert.equal(r.sent.length, count + 2);
  }
});

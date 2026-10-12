const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createCompanionStore } = require('../src/lib/companion-store');
const { present } = require('../src/lib/companion-presentation');

function rig() {
  let now = 100000, id = 0, listener;
  const timers = new Map(), intervals = new Map(), sent = [];
  const owner = {};
  const transport = {
    subscribe(fn) { listener = fn; return () => { listener = null; }; },
    start() { listener({ kind: 'connection', status: 'connected' }); }, stop() {},
    send(payload) { sent.push(JSON.parse(payload)); return true; },
  };
  const store = createCompanionStore({ transport, now: () => now, randomId: () => 'control-' + (++id),
    setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: h => timers.delete(h),
    setInterval: fn => { intervals.set(++id, fn); return id; }, clearInterval: h => intervals.delete(h) });
  function reply(message) { listener({ kind: 'message', payload: JSON.stringify(message) }); }
  function ready(patch = {}, controls = {}) {
    store.start(owner);
    assert.equal(sent.at(-1).protocolVersion, 2, 'New wrist must negotiate v2 before offering controls');
    const hello = sent.at(-1);
    reply({ ...hello, type: 'HELLO_ACK', streamId: 'stream-controls' });
    snapshot(patch, controls);
  }
  function snapshot(patch = {}, controls = {}, sequence = 1) {
    const base = JSON.parse(fs.readFileSync('protocol/v1/fixtures/active.json', 'utf8'));
    const req = sent.at(-1);
    reply({ protocolVersion: 2, type: 'SNAPSHOT', clientInstanceId: req.clientInstanceId,
      requestId: req.requestId, streamId: 'stream-controls', sequence, sourceObservedAtUnixMs: 2000000,
      body: { ...base.body, ...patch }, control: { activeSegmentId: 'segment-current',
        allowedActions: ['START_BREAK'], controlGrant: 'grant-one', grantExpiresAtUnixMs: 2010000,
        expectedFirstAction: null, ...controls } });
  }
  function result(command, code = 'APPLIED', extra = {}) {
    reply({ protocolVersion: 2, type: 'COMMAND_RESULT', clientInstanceId: command.clientInstanceId,
      requestId: command.requestId, streamId: command.streamId, action: command.action, code,
      sessionId: 'session-golden', monitorDegraded: false, ...extra });
  }
  function submit(action, options = {}, page = owner) {
    assert.equal(typeof store.submitControl, 'function', 'Store must expose an owner-gated control operation');
    return store.submitControl(action, { expected: store.snapshot().control.subject, ...options }, page);
  }
  return { store, owner, sent, timers, intervals, reply, ready, snapshot, result, submit,
    event(e) { listener(e); }, advance(ms) { now += ms; [...intervals.values()].forEach(fn => fn()); },
    timeout() { [...timers.values()].forEach(fn => fn()); } };
}

test('negotiated focus sends one exact bounded break command and waits for authoritative snapshot', () => {
  const r = rig(); r.ready();
  assert.equal(r.submit('START_BREAK', { breakMinutes: 5 }), true);
  const command = r.sent.at(-1);
  assert.equal(command.type, 'COMMAND'); assert.equal(command.breakMinutes, 5);
  assert.equal(command.expectedSegmentId, 'segment-current');
  assert.equal(command.expectedSessionId, 'session-golden');
  assert.equal(r.store.snapshot().body.segmentType, 'FOCUS');
  assert.equal(r.store.snapshot().control.busy, true);
  assert.equal(r.submit('START_BREAK', { breakMinutes: 10 }), false);
  r.result(command);
  assert.equal(r.sent.at(-1).type, 'GET_SNAPSHOT');
  assert.equal(r.store.snapshot().body.segmentType, 'FOCUS');
  assert.equal(r.store.snapshot().control.busy, true);
  r.snapshot({ segmentType: 'BREAK', timerKind: 'BREAK_REMAINING', remainingMs: 300000 },
    { activeSegmentId: 'break-8', allowedActions: ['FINISH_BREAK'], controlGrant: 'grant-two' }, 2);
  assert.equal(r.store.snapshot().body.segmentType, 'BREAK');
  assert.equal(r.store.snapshot().control.busy, false);
  assert.equal(r.sent.filter(m => m.type === 'COMMAND').length, 1);
});

test('early finish sends FINISH_BREAK and accepts real recovery without manufacturing focus', () => {
  const r = rig(); r.ready({ segmentType: 'BREAK', timerKind: 'BREAK_REMAINING', remainingMs: 600000 },
    { activeSegmentId: 'break-8', allowedActions: ['FINISH_BREAK'] });
  assert.equal(r.submit('FINISH_BREAK'), true); const command = r.sent.at(-1);
  assert.equal(command.breakMinutes, null); assert.equal(command.expectedSegmentId, 'break-8');
  r.result(command); r.snapshot({ segmentType: 'RECOVERY' },
    { allowedActions: [], controlGrant: null, grantExpiresAtUnixMs: null }, 2);
  assert.equal(present(r.store.snapshot()).title, '正在回到学习');
  assert.equal(r.submit('START_BREAK', { breakMinutes: 5 }), false);
});

test('controls expire using phone grant lifetime independently of wrist wall clock', () => {
  const r = rig(); r.ready();
  assert.equal(present(r.store.snapshot()).canStartBreak, true);
  r.advance(6000); r.advance(4000);
  assert.equal(r.submit('START_BREAK', { breakMinutes: 5 }), false);
  assert.equal(present(r.store.snapshot()).canStartBreak, false);
  assert.equal(r.sent.filter(m => m.type === 'COMMAND').length, 0);
});

test('timeout and disconnect never replay a control and late ACK cannot become success', () => {
  for (const disconnect of [false, true]) {
    const r = rig(); r.ready(); r.submit('START_BREAK', { breakMinutes: 5 }); const command = r.sent.at(-1);
    if (disconnect) r.event({ kind: 'connection', status: 'disconnected' }); else r.timeout();
    assert.match(present(r.store.snapshot()).controlMessage, /结果未确认/);
    r.result(command); r.advance(2000);
    assert.equal(r.sent.filter(m => m.type === 'COMMAND').length, 1);
    assert.equal(r.store.snapshot().body.segmentType, 'FOCUS');
    assert.notEqual(r.store.snapshot().control.resultCode, 'APPLIED');
  }
});

test('hiding command owner clears its ACK ownership even if another page is visible', () => {
  const r = rig(); r.ready(); const detail = {}; r.store.start(detail);
  r.submit('START_BREAK', { breakMinutes: 5 }); const command = r.sent.at(-1);
  r.store.stop(r.owner); r.result(command);
  assert.equal(r.submit('START_BREAK', { breakMinutes: 5 }), false);
  assert.equal(r.store.snapshot().control.resultCode, 'RESULT_UNKNOWN');
  r.store.stop(detail); assert.equal(r.timers.size, 0); assert.equal(r.intervals.size, 0);
});

test('old phone unsupported negotiation falls back to v1 read-only without a command', () => {
  const r = rig(); r.store.start(r.owner); const hello = r.sent.at(-1);
  assert.equal(hello.protocolVersion, 2);
  r.reply({ protocolVersion: 1, type: 'STATUS_ERROR', clientInstanceId: hello.clientInstanceId,
    requestId: hello.requestId, code: 'UNSUPPORTED_PROTOCOL' });
  assert.equal(r.sent.at(-1).protocolVersion, 1); assert.equal(r.sent.at(-1).type, 'HELLO');
  const oldHello = r.sent.at(-1); r.reply({ ...oldHello, type: 'HELLO_ACK', streamId: 'old-stream' });
  const req = r.sent.at(-1); const fixture = JSON.parse(fs.readFileSync('protocol/v1/fixtures/active.json', 'utf8'));
  const oldSnapshot = { ...fixture, ...req, type: 'SNAPSHOT', sequence: 1 };
  delete oldSnapshot.lastSeenSessionId;
  r.reply(oldSnapshot);
  assert.equal(r.store.snapshot().freshness, 'fresh');
  assert.equal(r.submit('START_BREAK', { breakMinutes: 5 }), false);
  assert.equal(r.sent.filter(m => m.type === 'COMMAND').length, 0);
});

test('preparation must keep full phone action visible and refuses truncated or changed validation facts', () => {
  const r = rig(); const action = '翻到第32页，读这一页第一段。'.repeat(8);
  const prep = { phase: 'PREPARING', intentId: 'intent-current', sessionId: null,
    segmentType: null, firstAction: action, currentPage: 32, totalPages: 400,
    timerKind: 'PREPARATION_ELAPSED' };
  r.ready(prep, { activeSegmentId: null, allowedActions: ['CONFIRM_PREPARATION_AND_START'], expectedFirstAction: action });
  const view = present(r.store.snapshot());
  assert.equal(view.canConfirmStart, true); assert.equal(view.firstActionRows.join(''), action);
  assert.equal(r.submit('CONFIRM_PREPARATION_AND_START'), true);
  const command = r.sent.at(-1); assert.equal(command.expectedFirstAction, action);
  assert.equal(command.expectedIntentId, 'intent-current'); assert.equal(command.expectedPage, 32);
  r.result(command, 'REQUIRES_PHONE'); r.snapshot({ ...prep, firstActionTruncated: true },
    { activeSegmentId: null, allowedActions: ['CONFIRM_PREPARATION_AND_START'], expectedFirstAction: action }, 2);
  assert.equal(present(r.store.snapshot()).canConfirmStart, false);
  assert.equal(r.submit('CONFIRM_PREPARATION_AND_START'), false);
});

test('demo and non-actionable phone states never offer controls even with injected grant', () => {
  const control = { availableActions: ['START_BREAK', 'FINISH_BREAK', 'CONFIRM_PREPARATION_AND_START'], busy: false };
  const body = JSON.parse(fs.readFileSync('protocol/v1/fixtures/active.json', 'utf8')).body;
  for (const input of [
    { mode: 'demo', body },
    { mode: 'live', body: { ...body, phase: 'SAVING' } },
    { mode: 'live', body: { ...body, phase: 'ENDED' } },
    { mode: 'live', body: { ...body, segmentType: 'RECOVERY' } },
    { mode: 'live', body, freshness: 'expired' },
  ]) {
    const view = present({ connection: 'connected', freshness: 'fresh', control, ...input });
    assert.equal(view.canStartBreak, false); assert.equal(view.canFinishBreak, false);
    assert.equal(view.canConfirmStart, false);
  }
});

test('a confirmation cannot apply to action or page facts newer than the content the user saw', () => {
  const r = rig(); const prep = { phase: 'PREPARING', intentId: 'intent-current', sessionId: null,
    segmentType: null, firstAction: '翻到第32页读第一段', currentPage: 32, totalPages: 400,
    timerKind: 'PREPARATION_ELAPSED' };
  r.ready(prep, { activeSegmentId: null, allowedActions: ['CONFIRM_PREPARATION_AND_START'], expectedFirstAction: prep.firstAction });
  const expected = r.store.snapshot().control.subject;
  r.store.requestRefresh();
  r.snapshot({ ...prep, currentPage: 33, firstAction: '翻到第33页读第一段' },
    { activeSegmentId: null, allowedActions: ['CONFIRM_PREPARATION_AND_START'], expectedFirstAction: '翻到第33页读第一段' }, 2);
  assert.equal(r.submit('CONFIRM_PREPARATION_AND_START', { expected }), false);
  assert.equal(r.sent.filter(m => m.type === 'COMMAND').length, 0);
});

test('long first actions preserve newline boundaries so every line can be read before confirming', () => {
  const { textRows } = require('../src/lib/companion-presentation');
  const rows = textRows('打开书本\n翻到第32页\n读第一段\n停下想一想', 24);
  assert.deepEqual(rows, ['打开书本', '翻到第32页', '读第一段', '停下想一想']);
});

test('v2 hello timeout falls back once and a late v2 acknowledgment cannot replace the v1 handshake', () => {
  const r = rig(); r.store.start(r.owner); const newHello = r.sent.at(-1); r.timeout();
  const oldHello = r.sent.at(-1); assert.equal(oldHello.protocolVersion, 1);
  r.reply({ ...newHello, type: 'HELLO_ACK', streamId: 'late-v2' });
  assert.equal(r.sent.at(-1), oldHello); assert.equal(r.store.snapshot().control.negotiated, false);
  r.timeout(); assert.equal(r.sent.filter(m => m.type === 'HELLO').length, 2);
  assert.equal(r.sent.filter(m => m.type === 'COMMAND').length, 0);
});

test('a v2 peer that declines SESSION_CONTROL stays read-only even if it sends grant-shaped data', () => {
  const r = rig(); r.store.start(r.owner); const hello = r.sent.at(-1);
  r.reply({ ...hello, type: 'HELLO_ACK', streamId: 'stream-controls', capabilities: ['READ_ONLY_SNAPSHOT'] });
  r.snapshot(); assert.equal(r.store.snapshot().freshness, 'fresh');
  assert.equal(r.store.snapshot().control.negotiated, false);
  assert.equal(r.submit('START_BREAK', { breakMinutes: 5 }), false);
});

test('rejected commands retain preparation and report the phone requirement after a fresh read', () => {
  const r = rig(); const prep = { phase: 'PREPARING', intentId: 'intent-current', sessionId: null,
    segmentType: null, firstAction: '翻到第32页', currentPage: 32, totalPages: 400, timerKind: 'PREPARATION_ELAPSED' };
  const control = { activeSegmentId: null, allowedActions: ['CONFIRM_PREPARATION_AND_START'], expectedFirstAction: prep.firstAction };
  r.ready(prep, control); r.submit('CONFIRM_PREPARATION_AND_START'); const command = r.sent.at(-1);
  r.result(command, 'REQUIRES_PHONE'); r.snapshot(prep, control, 2);
  assert.equal(r.store.snapshot().body.phase, 'PREPARING');
  assert.match(present(r.store.snapshot()).controlMessage, /请打开手机/);
  r.result(command, 'APPLIED'); assert.equal(r.store.snapshot().control.resultCode, 'REQUIRES_PHONE');
});

test('post-commit monitor degradation reports the real started state rather than an uncreated session', () => {
  const r = rig(); const prep = { phase: 'PREPARING', intentId: 'intent-current', sessionId: null,
    segmentType: null, firstAction: '翻到第32页', timerKind: 'PREPARATION_ELAPSED' };
  r.ready(prep, { activeSegmentId: null, allowedActions: ['CONFIRM_PREPARATION_AND_START'], expectedFirstAction: prep.firstAction });
  r.submit('CONFIRM_PREPARATION_AND_START'); const command = r.sent.at(-1);
  r.result(command, 'APPLIED', { monitorDegraded: true });
  r.snapshot({ segmentType: 'UNMONITORED', coverage: 'PARTIAL', monitorAvailability: 'UNAVAILABLE' },
    { allowedActions: [], controlGrant: null, grantExpiresAtUnixMs: null }, 2);
  assert.equal(r.store.snapshot().body.phase, 'ACTIVE');
  assert.match(present(r.store.snapshot()).controlMessage, /已开始，但监测降级/);
});

test('phone RESULT_UNKNOWN remains explicitly unknown while the wrist refresh is outstanding', () => {
  const r = rig(); r.ready(); r.submit('START_BREAK', { breakMinutes: 5 }); const command = r.sent.at(-1);
  r.result(command, 'RESULT_UNKNOWN');
  assert.match(present(r.store.snapshot()).controlMessage, /结果未确认/);
  assert.equal(r.store.snapshot().body.segmentType, 'FOCUS');
});

test('a slow already-negotiated v2 phone never loses control capability through read-only fallback', () => {
  const r = rig(); r.ready(); r.submit('START_BREAK', { breakMinutes: 5 });
  r.advance(5000); r.timeout();
  assert.equal(r.sent.at(-1).type, 'GET_SNAPSHOT');
  r.advance(3000); r.timeout(); r.advance(2000);
  assert.equal(r.sent.at(-1).type, 'HELLO');
  r.advance(3000); r.timeout();
  assert.equal(r.sent.at(-1).protocolVersion, 2);
  assert.match(present(r.store.snapshot()).controlMessage, /结果未确认/);
  assert.equal(r.sent.filter(m => m.type === 'COMMAND').length, 1);
});

test('degraded start feedback belongs only to its created session and cannot leak into a later preparation', () => {
  const r = rig(); const prepA = { phase: 'PREPARING', intentId: 'intent-a', sessionId: null,
    segmentType: null, firstAction: '翻到第32页', timerKind: 'PREPARATION_ELAPSED' };
  const preparation = { activeSegmentId: null, allowedActions: ['CONFIRM_PREPARATION_AND_START'], expectedFirstAction: prepA.firstAction };
  const noControls = { activeSegmentId: null, allowedActions: [], controlGrant: null, grantExpiresAtUnixMs: null };
  r.ready(prepA, preparation); r.submit('CONFIRM_PREPARATION_AND_START'); const command = r.sent.at(-1);
  r.result(command, 'APPLIED', { monitorDegraded: true });
  r.snapshot({ segmentType: 'UNMONITORED', coverage: 'PARTIAL', monitorAvailability: 'UNAVAILABLE' }, noControls, 2);
  assert.match(present(r.store.snapshot()).controlMessage, /已开始，但监测降级/);
  r.store.requestRefresh();
  r.snapshot({ phase: 'ENDED', segmentType: null, timerKind: 'FINAL_SESSION_DURATION', endType: 'NORMAL' }, noControls, 3);
  assert.equal(r.store.snapshot().body.phase, 'ENDED');
  assert.equal(present(r.store.snapshot()).controlMessage, '');
  r.store.requestRefresh(); r.snapshot({ ...prepA, intentId: 'intent-b', firstAction: '翻到第40页' },
    { ...preparation, expectedFirstAction: '翻到第40页' }, 4);
  assert.equal(r.store.snapshot().body.intentId, 'intent-b');
  assert.equal(present(r.store.snapshot()).controlMessage, '');
  assert.equal(r.store.snapshot().control.monitorDegraded, false);
});

test('a refused preparation hint clears after the phone starts learning through its normal path', () => {
  const r = rig(); const prep = { phase: 'PREPARING', intentId: 'intent-a', sessionId: null,
    segmentType: null, firstAction: '翻到第32页', timerKind: 'PREPARATION_ELAPSED' };
  const preparation = { activeSegmentId: null, allowedActions: ['CONFIRM_PREPARATION_AND_START'], expectedFirstAction: prep.firstAction };
  r.ready(prep, preparation); r.submit('CONFIRM_PREPARATION_AND_START'); const command = r.sent.at(-1);
  r.result(command, 'REQUIRES_PHONE', { sessionId: null }); r.snapshot(prep, preparation, 2);
  assert.match(present(r.store.snapshot()).controlMessage, /准备内容已保留/);
  r.store.requestRefresh(); r.snapshot({}, {}, 3);
  assert.equal(r.store.snapshot().body.phase, 'ACTIVE');
  assert.equal(present(r.store.snapshot()).controlMessage, '');
  assert.equal(r.store.snapshot().control.resultCode, null);
  r.result(command, 'REQUIRES_PHONE', { sessionId: null });
  assert.equal(present(r.store.snapshot()).controlMessage, '');
});

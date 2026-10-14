const test = require('node:test'), assert = require('node:assert/strict');
const { createCompanionStore } = require('../src/lib/companion-store');
test('one owner negotiates v4, routes only current record replies and retires sender on disconnect', () => {
  let listener; const sent = [], calls = []; let id = 0;
  const transport = { subscribe(fn) { listener = fn; return () => {}; }, start() { listener({ kind: 'connection', status: 'connected' }); }, stop() {},
    send(raw) { sent.push(JSON.parse(raw)); return true; } };
  const sync = { snapshot: () => ({ status: 'idle' }), disconnected: () => calls.push('stop'),
    connected: (ctx, enabled) => calls.push({ ctx, enabled }), handle: m => calls.push(m), nudge: () => calls.push('nudge') };
  const store = createCompanionStore({ transport, recordSync: sync, now: () => 1000, randomId: () => 'r-' + (++id),
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 2, clearInterval() {} });
  store.start(); const hello = sent[0]; assert.equal(hello.protocolVersion, 4);
  listener({ kind: 'message', payload: JSON.stringify({ ...hello, type: 'HELLO_ACK', streamId: 's', recordSyncEnabled: true }) });
  assert.equal(calls.filter(x => x && x.enabled).length, 0, 'HELLO alone is not a snapshot-confirmed source');
  const request = sent.at(-1), idle = require('../protocol/v1/fixtures/idle.json');
  listener({ kind: 'message', payload: JSON.stringify({ ...idle, protocolVersion: 4, clientInstanceId: request.clientInstanceId,
    requestId: request.requestId, streamId: 's', sourceObservedAtUnixMs: 1000,
    control: { activeSegmentId: null, allowedActions: [], controlGrant: null, grantExpiresAtUnixMs: null, expectedFirstAction: null } }) });
  assert.equal(calls.filter(x => x && x.enabled).length, 1);
  assert.equal(store.snapshot().records.status, 'idle');
  store.notifyLocalRecords(); assert.ok(calls.includes('nudge'));
  listener({ kind: 'connection', status: 'disconnected' }); assert.equal(calls.at(-1), 'stop');
  store.destroy();
});
test('v4 unsupported falls back to v3 without record synchronization or damaging old protocol', () => {
  let listener; const sent = []; let id = 0;
  const transport = { subscribe(fn) { listener = fn; return () => {}; }, start() { listener({ kind: 'connection', status: 'connected' }); }, stop() {}, send(raw) { sent.push(JSON.parse(raw)); return true; } };
  const sync = { snapshot: () => ({}), disconnected() {}, connected() { throw new Error('Must not sync old peer'); }, handle() {}, nudge() {} };
  const store = createCompanionStore({ transport, recordSync: sync, catalogReceiver: { cancel() {}, snapshot: () => ({}) },
    now: () => 1000, randomId: () => 'r-' + (++id), setTimeout: () => 1, clearTimeout() {}, setInterval: () => 2, clearInterval() {} });
  store.start(); const hello = sent[0]; assert.equal(hello.protocolVersion, 4);
  listener({ kind: 'message', payload: JSON.stringify({ protocolVersion: 4, type: 'STATUS_ERROR', clientInstanceId: hello.clientInstanceId,
    requestId: hello.requestId, code: 'UNSUPPORTED_PROTOCOL' }) });
  assert.equal(sent.at(-1).protocolVersion, 3); assert.equal(sent.at(-1).type, 'HELLO'); store.destroy();
});
test('v4 record burst defers snapshot polling and automatic catalog until the single record sender is released', () => {
  let listener, tick, time = 1000, busy = false, id = 0; const sent = [];
  const transport = { subscribe(fn) { listener = fn; return () => {}; }, start() { listener({ kind: 'connection', status: 'connected' }); }, stop() {}, send(raw) { sent.push(JSON.parse(raw)); return true; } };
  const sync = { snapshot: () => ({ busy }), disconnected() { busy = false; }, connected() { busy = true; }, handle() {}, nudge() {} };
  const receiver = { begin() {}, cancel() {}, snapshot: () => ({ status: 'idle' }) };
  const store = createCompanionStore({ transport, recordSync: sync, catalogReceiver: receiver, now: () => time,
    randomId: () => 'r-' + (++id), setTimeout: () => 1, clearTimeout() {}, setInterval: fn => { tick = fn; return 2; }, clearInterval() {} });
  const reply = m => listener({ kind: 'message', payload: JSON.stringify(m) });
  store.start(); reply({ ...sent[0], type: 'HELLO_ACK', streamId: 's', recordSyncEnabled: true });
  const snapshot = () => { const req = sent.findLast(m => m.type === 'GET_SNAPSHOT'), value = require('../protocol/v1/fixtures/idle.json');
    reply({ ...value, protocolVersion: 4, requestId: req.requestId, clientInstanceId: req.clientInstanceId, streamId: 's', sourceObservedAtUnixMs: time,
      sequence: id + 1, control: { activeSegmentId: null, allowedActions: [], controlGrant: null, grantExpiresAtUnixMs: null, expectedFirstAction: null } }); };
  snapshot(); assert.equal(store.snapshot().control.busy, true);
  assert.equal(store.submitControl('START_BREAK', {}, {}), false);
  for (let n = 0; n < 16; n++) { time += 1000; tick(); }
  assert.equal(sent.filter(m => m.type === 'GET_SNAPSHOT').length, 1); assert.equal(sent.filter(m => m.type === 'GET_CATALOG').length, 0);
  busy = false; time += 1000; tick(); assert.equal(sent.at(-1).type, 'GET_SNAPSHOT'); snapshot(); time += 1000; tick();
  assert.equal(sent.at(-1).type, 'GET_CATALOG'); assert.equal(sent.at(-1).protocolVersion, 4); store.destroy();
});

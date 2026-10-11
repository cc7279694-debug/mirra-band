const test = require('node:test');
const assert = require('node:assert/strict');
const { createTransport } = require('../src/platform/interconnect-transport');

function rig() {
  const timers = new Map(); let n = 0; const requests = []; const sent = [];
  const native = { getReadyState(o) { requests.push(o); }, send(o) { sent.push(o); } };
  const transport = createTransport({ loadModule: () => ({ instance: () => native }),
    setTimeout: f => { timers.set(++n, f); return n; }, clearTimeout: id => timers.delete(id) });
  const events = []; const off = transport.subscribe(e => events.push(e));
  return { transport, native, timers, requests, sent, events, off };
}
test('one callback owner, bounded readiness query, late callback inert after stop', () => {
  const r = rig(); r.transport.start(); r.transport.start();
  assert.equal(r.requests.length, 1); assert.equal(r.timers.size, 1);
  const old = r.native.onopen; r.transport.stop();
  assert.equal(r.timers.size, 0); assert.equal(r.native.onmessage, undefined);
  const count = r.events.length; old(); r.requests[0].success({ status: 1 });
  assert.equal(r.events.length, count);
});
test('query timeout cannot be resurrected by late success but new native open can recover', () => {
  const r = rig(); r.transport.start(); [...r.timers.values()][0]();
  assert.equal(r.events.at(-1).status, 'disconnected');
  r.requests[0].success({ status: 1 }); assert.equal(r.events.at(-1).status, 'disconnected');
  r.native.onopen(); assert.equal(r.events.at(-1).status, 'connected');
});
test('native message is UTF8 text only, close immediate, send failure is explicit', () => {
  const r = rig(); r.transport.start(); r.requests[0].success({ status: 1 });
  r.native.onmessage({ data: '中文📖' }); assert.equal(r.events.at(-1).payload, '中文📖');
  r.native.onmessage({ data: { bad: true } }); assert.equal(r.events.at(-1).kind, 'error');
  assert.equal(r.transport.send('hello'), true); r.sent[0].fail({}, 1006);
  assert.equal(r.events.at(-1).status, 'disconnected');
});
test('cannot steal callbacks or restore over a subsequent owner', () => {
  const r = rig(); const foreign = () => {}; r.native.onmessage = foreign;
  r.transport.start(); assert.equal(r.native.onmessage, foreign);
  assert.equal(r.requests.length, 0); assert.equal(r.events.at(-1).code, 'CALLBACK_OWNED');
  r.native.onmessage = undefined; r.transport.stop(); r.transport.start();
  r.native.onclose = foreign; r.transport.stop(); assert.equal(r.native.onclose, foreign);
});
test('late failure of a superseded send cannot invalidate the newer reply', () => {
  const r = rig(); r.transport.start(); r.requests[0].success({ status: 1 });
  r.transport.send('request-a'); r.transport.send('request-b');
  r.native.onmessage({ data: 'snapshot-b' });
  const count = r.events.length;
  r.sent[0].fail({}, 1006);
  assert.equal(r.events.length, count);
  assert.equal(r.transport.send('request-c'), true);
});
test('successful send settles its callbacks without claiming business freshness', () => {
  const r = rig(); r.transport.start(); r.requests[0].success({ status: 1 });
  r.transport.send('request');
  const count = r.events.length;
  assert.equal(typeof r.sent[0].success, 'function');
  r.sent[0].success();
  assert.equal(r.events.length, count);
  r.sent[0].fail({}, 1006);
  assert.equal(r.events.length, count);
  assert.equal(r.transport.send('next-request'), true);
});
test('failed send settles once and retired owner callbacks remain inert', () => {
  const r = rig(); r.transport.start(); r.requests[0].success({ status: 1 });
  r.transport.send('request'); r.sent[0].fail({}, 1006);
  assert.equal(r.events.at(-1).code, 'SEND_FAILED');
  r.native.onopen();
  const count = r.events.length;
  r.sent[0].fail({}, 1006);
  assert.equal(r.events.length, count);
  r.transport.stop(); r.transport.start(); r.requests[1].success({ status: 1 });
  const newCount = r.events.length;
  r.sent[0].fail({}, 1006);
  assert.equal(r.events.length, newCount);
});

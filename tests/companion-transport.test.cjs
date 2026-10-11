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

function initializationRig(loadModule) {
  const timers = new Map(); const events = []; let timerId = 0;
  const transport = createTransport({ loadModule,
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id) });
  transport.subscribe(event => events.push(event));
  return { transport, timers, events };
}
function assertInitializationFailure(r, code) {
  assert.doesNotThrow(() => r.transport.start());
  assert.equal(r.events.at(-1).status, 'unsupported');
  assert.equal(r.events.at(-1).code, code);
  assert.ok(code.length <= 45);
  assert.equal(r.timers.size, 0);
  assert.equal(r.transport.send('must-not-send'), false);
  assert.ok(!JSON.stringify(r.events).includes('private-detail'));
}

for (const [ErrorType, code] of [
  [TypeError, 'INIT_MODULE_LOAD_TYPE_ERROR'],
  [ReferenceError, 'INIT_MODULE_LOAD_REFERENCE_ERROR'],
  [RangeError, 'INIT_MODULE_LOAD_RANGE_ERROR'],
  [SyntaxError, 'INIT_MODULE_LOAD_SYNTAX_ERROR'],
  [Error, 'INIT_MODULE_LOAD_ERROR'],
]) {
  test('module-load diagnostics expose only the safe ' + ErrorType.name + ' category', () => {
    const r = initializationRig(() => { throw new ErrorType('private-detail'); });
    assertInitializationFailure(r, code);
  });
}
test('missing loader is reported as a fixed API category', () => {
  assertInitializationFailure(initializationRig(undefined), 'INIT_MODULE_LOAD_API_MISSING');
});
test('missing module or instance method cannot be mistaken for a connected native channel', () => {
  for (const platform of [null, {}, { instance: 1 }]) {
    assertInitializationFailure(initializationRig(() => platform), 'INIT_INSTANCE_API_MISSING');
  }
});
test('throwing instance accessor is attributed to instance acquisition', () => {
  const platform = Object.defineProperty({}, 'instance', {
    get() { throw new ReferenceError('private-detail'); },
  });
  assertInitializationFailure(initializationRig(() => platform), 'INIT_INSTANCE_REFERENCE_ERROR');
});
test('instance invocation retains the module receiver and reports its synchronous exception', () => {
  const platform = { instance() {
    if (this !== platform) throw new Error('wrong receiver');
    throw new TypeError('private-detail');
  } };
  assertInitializationFailure(initializationRig(() => platform), 'INIT_INSTANCE_TYPE_ERROR');
});
test('an invalid native instance is reported without reading its properties', () => {
  for (const native of [null, undefined, false, 'private-detail']) {
    assertInitializationFailure(initializationRig(() => ({ instance: () => native })), 'INIT_INSTANCE_API_MISSING');
  }
});
test('throwing native callback getter is distinguished from an unavailable module', () => {
  const native = Object.defineProperty({}, 'onmessage', {
    get() { throw new TypeError('private-detail'); },
  });
  assertInitializationFailure(initializationRig(() => ({ instance: () => native })), 'INIT_READ_CALLBACK_TYPE_ERROR');
});
test('a later callback getter failure still releases the earlier owned callback on stop', () => {
  let reads = 0; let retiredMessage;
  const native = Object.defineProperty({}, 'onopen', {
    get() { if (++reads === 2) { retiredMessage = native.onmessage; throw new ReferenceError('private-detail'); } },
  });
  const r = initializationRig(() => ({ instance: () => native }));
  assertInitializationFailure(r, 'INIT_READ_CALLBACK_REFERENCE_ERROR');
  assert.equal(typeof retiredMessage, 'function');
  assert.equal(native.onmessage, undefined);
  const count = r.events.length;
  retiredMessage({ data: 'late-message' });
  assert.equal(r.events.length, count);
  r.transport.stop();
});
test('setter failure preserves later foreign ownership and makes retired callbacks inert', () => {
  let open; let reject = true; let retiredOpen; let retiredMessage;
  const foreignMessage = () => {};
  const native = Object.defineProperty({}, 'onopen', {
    get() { return open; },
    set(value) {
      open = value;
      if (reject) {
        reject = false; retiredOpen = value; retiredMessage = native.onmessage;
        native.onmessage = foreignMessage;
        throw new SyntaxError('private-detail');
      }
    },
  });
  const r = initializationRig(() => ({ instance: () => native }));
  assertInitializationFailure(r, 'INIT_SET_CALLBACK_SYNTAX_ERROR');
  assert.equal(native.onmessage, foreignMessage);
  assert.equal(open, undefined);
  const count = r.events.length;
  retiredOpen(); retiredMessage({ data: 'late-message' });
  assert.equal(r.events.length, count);
  r.transport.stop();
  assert.equal(native.onmessage, foreignMessage);
});
test('readiness accessor failures identify the readiness stage and clear its timer', () => {
  const native = Object.defineProperty({}, 'getReadyState', {
    get() { throw new TypeError('private-detail'); },
  });
  const r = initializationRig(() => ({ instance: () => native }));
  assertInitializationFailure(r, 'INIT_READY_CALL_TYPE_ERROR');
  r.transport.stop();
  assert.equal(native.onopen, undefined);
});
test('readiness invocation keeps its receiver and failed initialization can be retried after stop', () => {
  let fail = true; let query; let retiredOpen;
  const native = { getReadyState(options) {
    if (this !== native) throw new Error('wrong receiver');
    if (fail) { retiredOpen = native.onopen; throw new RangeError('private-detail'); }
    query = options;
  } };
  const r = initializationRig(() => ({ instance: () => native }));
  assertInitializationFailure(r, 'INIT_READY_CALL_RANGE_ERROR');
  r.transport.stop(); fail = false; r.transport.start();
  const count = r.events.length;
  retiredOpen();
  assert.equal(r.events.length, count);
  assert.equal(r.events.at(-1).status, 'connecting');
  query.success({ status: 1 });
  assert.equal(r.events.at(-1).status, 'connected');
});
test('missing readiness API remains unsupported with a fixed category', () => {
  const native = {};
  const r = initializationRig(() => ({ instance: () => native }));
  assertInitializationFailure(r, 'INIT_READY_CALL_API_MISSING');
  r.transport.stop();
  assert.equal(native.onmessage, undefined);
});
test('diagnostics do not read arbitrary error name, message or payload getters', () => {
  const opaque = Object.create(null);
  for (const property of ['name', 'message', 'payload']) Object.defineProperty(opaque, property, {
    get() { throw new Error('private-detail'); },
  });
  assertInitializationFailure(initializationRig(() => { throw opaque; }), 'INIT_MODULE_LOAD_UNKNOWN_THROW');
});
test('normal asynchronous readiness failure retains its channel category and retires on stop', () => {
  let query;
  const native = { getReadyState(options) { query = options; } };
  const r = initializationRig(() => ({ instance: () => native }));
  r.transport.start();
  query.fail({ message: 'private-detail' }, 1006);
  assert.equal(r.events.at(-1).status, 'disconnected');
  assert.equal(r.events.at(-1).code, 'CHANNEL_UNAVAILABLE');
  assert.equal(r.timers.size, 0);
  r.transport.stop();
  const count = r.events.length;
  query.success({ status: 1 });
  assert.equal(r.events.length, count);
  assert.ok(!JSON.stringify(r.events).includes('private-detail'));
});
test('failed initialization retires native callbacks before the caller can stop', () => {
  let retiredOpen; let retiredMessage;
  const native = { getReadyState() {
    retiredOpen = native.onopen; retiredMessage = native.onmessage;
    throw new Error('private-detail');
  } };
  const r = initializationRig(() => ({ instance: () => native }));
  r.transport.start();
  assert.equal(r.events.at(-1).status, 'unsupported');
  const count = r.events.length;
  retiredOpen(); retiredMessage({ data: 'late-message' });
  assert.equal(r.events.length, count);
  assert.equal(native.onopen, undefined);
  assert.equal(native.onmessage, undefined);
  assert.equal(r.timers.size, 0);
});

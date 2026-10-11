const test = require('node:test');
const assert = require('node:assert/strict');
const { createTransport } = require('../src/platform/interconnect-transport');
const message = value => JSON.stringify({ value });

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
  assert.equal(r.transport.send(message('hello')), true); r.sent[0].fail({}, 1006);
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
  r.transport.send(message('request-a')); r.transport.send(message('request-b'));
  r.native.onmessage({ data: 'snapshot-b' });
  const count = r.events.length;
  r.sent[0].fail({}, 1006);
  assert.equal(r.events.length, count);
  assert.equal(r.transport.send(message('request-c')), true);
});
test('successful send settles its callbacks without claiming business freshness', () => {
  const r = rig(); r.transport.start(); r.requests[0].success({ status: 1 });
  r.transport.send(message('request'));
  const count = r.events.length;
  assert.equal(typeof r.sent[0].success, 'function');
  r.sent[0].success();
  assert.equal(r.events.length, count);
  r.sent[0].fail({}, 1006);
  assert.equal(r.events.length, count);
  assert.equal(r.transport.send(message('next-request')), true);
});
test('failed send settles once and retired owner callbacks remain inert', () => {
  const r = rig(); r.transport.start(); r.requests[0].success({ status: 1 });
  r.transport.send(message('request')); r.sent[0].fail({}, 1006);
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
  assert.equal(r.events.at(-1).code, 'READY_FAIL_1006');
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

function compatibilityRig(methods) {
  const r = rig(); delete r.native.getReadyState;
  Object.assign(r.native, methods);
  return r;
}

test('official diagnosis fallback uses a bounded timeout and requires exact status zero', () => {
  for (const [value, status, code] of [
    [0, 'connected', null], [204, 'disconnected', 'DIAG_STATUS_204'],
    [1001, 'disconnected', 'DIAG_STATUS_1001'], [1000, 'disconnected', 'DIAG_STATUS_1000'],
    ['0', 'disconnected', 'DIAG_STATUS_UNKNOWN_STRING'], [undefined, 'disconnected', 'DIAG_STATUS_UNKNOWN_UNDEFINED'],
  ]) {
    let query;
    const r = compatibilityRig({ diagnosis(options) {
      assert.equal(this, r.native); query = options;
    } });
    r.transport.start();
    assert.equal(r.events.at(-1).status, 'connecting');
    assert.equal(query.timeout, 3000);
    assert.equal(r.timers.size, 1);
    query.success({ status: value });
    assert.equal(r.events.at(-1).status, status);
    assert.equal(r.events.at(-1).code, code);
    assert.equal(r.timers.size, 0);
  }
});

test('supported readiness API preserves its original path ahead of fallback queries', () => {
  const r = rig();
  r.native.diagnosis = () => assert.fail('unexpected diagnosis fallback');
  r.native.getApkStatus = () => assert.fail('unexpected legacy fallback');
  r.transport.start();
  assert.equal(r.requests.length, 1);
  r.requests[0].success({ status: 1 });
  assert.equal(r.events.at(-1).status, 'connected');
});

test('non-callable readiness uses diagnosis before the deprecated query', () => {
  let query;
  const r = compatibilityRig({ getReadyState: 1, diagnosis(options) { query = options; },
    getApkStatus() { assert.fail('unexpected legacy fallback'); } });
  r.transport.start(); query.success({ status: 0 });
  assert.equal(r.events.at(-1).status, 'connected');
});

test('legacy getApkStatus is called once and only exact CONNECTED proves a channel', () => {
  for (const [value, status, code] of [
    ['CONNECTED', 'connected', null], ['DISCONNECTED', 'disconnected', 'APK_STATUS_DISCONNECTED'],
    ['UNINSTALLED', 'disconnected', 'APK_STATUS_UNINSTALLED'],
    ['connected', 'disconnected', 'APK_RAW_connected'],
    [{ status: 'CONNECTED' }, 'disconnected', 'APK_STATUS_UNKNOWN_OBJECT'],
    [true, 'disconnected', 'APK_STATUS_UNKNOWN_BOOLEAN'],
  ]) {
    let calls = 0;
    const r = compatibilityRig({ diagnosis: false, getApkStatus() {
      assert.equal(this, r.native); calls++; return value;
    } });
    r.transport.start(); r.transport.start();
    assert.equal(calls, 1);
    assert.equal(r.events.at(-1).status, status);
    assert.equal(r.events.at(-1).code, code);
    assert.equal(r.timers.size, 0);
  }
});

test('legacy system state tokens expose exact text for diagnosis but never imply a connected channel', () => {
  for (const [value, code] of [
    ['UNKNOWN', 'APK_RAW_UNKNOWN'], ['NOT_CONNECTED', 'APK_RAW_NOT_CONNECTED'],
    ['unknown', 'APK_RAW_unknown'], ['0', 'APK_RAW_0'],
    ['"CONNECTED"', 'APK_QUOTED_CONNECTED'], [' CONNECTED ', 'APK_PADDED_CONNECTED'],
  ]) {
    const r = compatibilityRig({ getApkStatus() { return value; } });
    r.transport.start();
    assert.equal(r.events.at(-1).code, code);
    assert.equal(r.events.at(-1).status, 'disconnected');
    assert.equal(r.transport.send(message('must-not-send')), false);
    assert.equal(r.sent.length, 0);
    assert.equal(r.timers.size, 0);
    assert.ok(code.length <= 45);
  }
});

test('legacy diagnostic tokens are bounded ASCII identifiers, never arbitrary bodies or coerced objects', () => {
  for (const value of ['private-detail', 'private detail', '私人内容', 'SECRET\nDETAIL',
    'A'.repeat(33), '{"status":"CONNECTED"}', '\u0000CONNECTED', ' '.repeat(65) + 'CONNECTED']) {
    const r = compatibilityRig({ getApkStatus() { return value; } });
    r.transport.start();
    assert.equal(r.events.at(-1).code, 'APK_STATUS_UNKNOWN_STRING');
    assert.equal(r.events.at(-1).status, 'disconnected');
    assert.ok(!JSON.stringify(r.events).includes('private-detail'));
  }
});

test('legacy CONNECTING keeps the original bounded wait without another query or sending data', () => {
  let calls = 0;
  const r = compatibilityRig({ getApkStatus() { calls++; return 'CONNECTING'; } });
  r.transport.start(); r.transport.start();
  assert.equal(r.events.at(-1).status, 'connecting');
  assert.equal(r.events.at(-1).code, 'APK_STATUS_CONNECTING');
  assert.equal(r.timers.size, 1);
  assert.equal(calls, 1);
  assert.equal(r.transport.send(message('must-not-send')), false);
  assert.equal(r.sent.length, 0);
  r.native.onopen();
  assert.equal(r.events.at(-1).status, 'connected');
  assert.equal(r.events.at(-1).code, null);
  assert.equal(r.timers.size, 0);
  assert.equal(r.transport.send(message('hello')), true);
  assert.equal(calls, 1);
});

test('legacy CONNECTING that never opens times out with its exact safe status category', () => {
  const r = compatibilityRig({ getApkStatus() { return 'CONNECTING'; } });
  r.transport.start();
  assert.equal(r.timers.size, 1);
  [...r.timers.values()][0]();
  assert.equal(r.events.at(-1).status, 'disconnected');
  assert.equal(r.events.at(-1).code, 'APK_CONNECTING_TIMEOUT');
  assert.equal(r.timers.size, 0);
  assert.equal(r.transport.send(message('must-not-send')), false);
  assert.equal(r.sent.length, 0);
});

test('legacy pending wait is settled by real close or error before its deadline', () => {
  for (const [event, code] of [['onclose', null], ['onerror', 'CHANNEL_ERROR']]) {
    const r = compatibilityRig({ getApkStatus() { return 'CONNECTING'; } });
    r.transport.start();
    assert.equal(r.events.at(-1).status, 'connecting');
    const deadline = [...r.timers.values()][0];
    r.native[event]({ code: 1006 });
    assert.equal(r.events.at(-1).status, 'disconnected');
    assert.equal(r.events.at(-1).code, code);
    assert.equal(r.timers.size, 0);
    const count = r.events.length;
    deadline();
    assert.equal(r.events.length, count);
  }
});

test('retired legacy CONNECTING callbacks cannot open or timeout a replacement owner', () => {
  const r = compatibilityRig({ getApkStatus() { return 'CONNECTING'; } });
  r.transport.start();
  assert.equal(r.events.at(-1).status, 'connecting');
  const oldOpen = r.native.onopen, deadline = [...r.timers.values()][0];
  r.transport.stop();
  assert.equal(r.timers.size, 0);
  r.transport.start();
  const count = r.events.length;
  oldOpen(); deadline();
  assert.equal(r.events.length, count);
  assert.equal(r.events.at(-1).status, 'connecting');
  assert.equal(r.timers.size, 1);
  r.transport.stop();
  assert.equal(r.timers.size, 0);
});

test('legacy query cannot overwrite a real native open delivered during that query', () => {
  const r = compatibilityRig({ getApkStatus() { r.native.onopen(); return 'CONNECTING'; } });
  r.transport.start();
  assert.equal(r.events.at(-1).status, 'connected');
  assert.equal(r.events.at(-1).code, null);
  assert.equal(r.events.filter(event => event.status === 'connected').length, 1);
  assert.equal(r.timers.size, 0);
});

for (const [method, stage] of [['diagnosis', 'DIAGNOSIS_CALL'], ['getApkStatus', 'APK_STATUS_CALL']]) {
  test(method + ' accessor exceptions retain a distinct safe diagnostic stage', () => {
    const native = Object.defineProperty({}, method, {
      get() { throw new TypeError('private-detail'); },
    });
    const r = initializationRig(() => ({ instance: () => native }));
    assertInitializationFailure(r, 'INIT_' + stage + '_TYPE_ERROR');
    assert.equal(native.onopen, undefined);
  });
  test(method + ' invocation exceptions retire callbacks without falling through', () => {
    let oldOpen;
    const r = compatibilityRig({ [method]() {
      assert.equal(this, r.native); oldOpen = r.native.onopen;
      throw new RangeError('private-detail');
    } });
    assertInitializationFailure(r, 'INIT_' + stage + '_RANGE_ERROR');
    const count = r.events.length; oldOpen();
    assert.equal(r.events.length, count);
    assert.equal(r.native.onopen, undefined);
  });
}

test('diagnosis timeout ignores late callbacks while a later actual open can recover', () => {
  let query;
  const r = compatibilityRig({ diagnosis(options) { query = options; } });
  r.transport.start(); [...r.timers.values()][0]();
  assert.equal(r.events.at(-1).code, 'CHANNEL_TIMEOUT');
  const count = r.events.length;
  query.success({ status: 0 }); query.fail({ message: 'private-detail' });
  assert.equal(r.events.length, count);
  r.native.onopen();
  assert.equal(r.events.at(-1).status, 'connected');
  assert.ok(!JSON.stringify(r.events).includes('private-detail'));
});

test('diagnosis failure is explicit and captured callbacks remain inert after stop or restart', () => {
  const queries = [];
  const r = compatibilityRig({ diagnosis(options) { queries.push(options); } });
  r.transport.start(); queries[0].fail({ message: 'private-detail' }, 1006);
  assert.equal(r.events.at(-1).code, 'DIAG_FAIL_1006');
  assert.equal(r.timers.size, 0);
  r.transport.stop(); r.transport.start();
  const count = r.events.length;
  queries[0].success({ status: 0 }); queries[0].fail({}, 1006);
  assert.equal(r.events.length, count);
  assert.equal(r.events.at(-1).status, 'connecting');
  queries[1].success({ status: 0 });
  assert.equal(r.events.at(-1).status, 'connected');
});

test('a native cached open delivered by its setter is never overwritten by initialization', () => {
  const r = rig(); let open;
  Object.defineProperty(r.native, 'onopen', {
    get() { return open; },
    set(value) { open = value; if (value) value({ isReconnected: false }); },
  });
  r.transport.start();
  assert.equal(r.events.at(-1).status, 'connected');
  assert.equal(r.events.filter(event => event.status === 'connected').length, 1);
  assert.equal(r.requests.length, 0);
  assert.equal(r.timers.size, 0);
});

test('a missing send capability is explicit and cannot claim delivered data', () => {
  const r = rig(); r.transport.start(); r.requests[0].success({ status: 1 });
  r.native.send = null;
  assert.equal(r.transport.send(message('hello')), false);
  assert.equal(r.events.at(-1).code, 'SEND_API_MISSING');
  assert.equal(r.events.at(-1).status, 'disconnected');
  assert.equal(r.events.some(event => event.kind === 'message'), false);
});

test('native send receives the same protocol object including Chinese and emoji without a wrapper', () => {
  const r = rig(); r.transport.start(); r.requests[0].success({ status: 1 });
  const payload = { type: 'HELLO', requestId: 'request-a', title: '观已📖', nested: { text: '专注' } };
  const wire = JSON.stringify(payload);
  assert.equal(r.transport.send(wire), true);
  assert.deepEqual(r.sent[0].data, payload);
  assert.equal(typeof r.sent[0].data, 'object');
  assert.equal(JSON.stringify(r.sent[0].data), wire);
});

test('invalid JSON and non-object messages never cross the native send boundary', () => {
  const r = rig(); r.transport.start(); r.requests[0].success({ status: 1 });
  for (const payload of ['bad json', 'null', '[]', '[{}]', '42', 'true', '"text"']) {
    assert.equal(r.transport.send(payload), false);
    assert.equal(r.events.at(-1).kind, 'error');
    assert.equal(r.events.at(-1).code, 'INVALID_PAYLOAD');
    assert.equal(r.sent.length, 0);
  }
  assert.equal(r.transport.send(message('still-connected')), true);
});

test('a send started by synchronous readiness success cannot revive failed initialization', () => {
  const r = rig();
  r.native.getReadyState = options => {
    options.success({ status: 1 }); throw new Error('private-detail');
  };
  r.transport.subscribe(event => { if (event.status === 'connected') r.transport.send(message('hello')); });
  r.transport.start();
  assert.equal(r.sent.length, 1);
  assert.equal(r.events.at(-1).status, 'unsupported');
  const count = r.events.length; r.sent[0].fail({}, 1006);
  assert.equal(r.events.length, count);
});

function queryRig(capability) {
  if (capability === 'ready') return rig();
  const r = compatibilityRig({ diagnosis(options) { r.requests.push(options); } });
  return r;
}

for (const [capability, prefix] of [['ready', 'READY'], ['diagnosis', 'DIAG']]) {
  test(capability + ' failure preserves known numeric codes without another native query or send', () => {
    for (const [value, readyCode, diagnosisCode] of [
      [200, 'READY_FAIL_200', 'DIAG_FAIL_200'], [201, 'READY_FAIL_201', 'DIAG_FAIL_201'],
      [202, 'READY_FAIL_202', 'DIAG_FAIL_202'], [203, 'READY_FAIL_203', 'DIAG_FAIL_203'],
      [204, 'READY_FAIL_204', 'DIAG_FAIL_204'], [205, 'READY_FAIL_205', 'DIAG_FAIL_205'],
      [207, 'READY_FAIL_207', 'DIAG_FAIL_207'], [300, 'READY_FAIL_300', 'DIAG_FAIL_300'],
      [1000, 'READY_FAIL_1000', 'DIAG_FAIL_1000'], [1001, 'READY_FAIL_1001', 'DIAG_FAIL_1001'],
      [1006, 'READY_FAIL_1006', 'DIAG_FAIL_1006'],
    ]) {
      const r = queryRig(capability); r.transport.start();
      r.requests[0].fail('private-detail', value);
      assert.equal(r.events.at(-1).code, capability === 'ready' ? readyCode : diagnosisCode);
      assert.equal(r.events.at(-1).status, 'disconnected');
      assert.equal(r.timers.size, 0);
      assert.equal(r.transport.send(message('must-not-send')), false);
      assert.equal(r.sent.length, 0);
      assert.equal(r.requests.length, 1);
      assert.ok(r.events.at(-1).code.length <= 45);
      assert.ok(!JSON.stringify(r.events).includes('private-detail'));
    }
  });

  test(capability + ' failure ignores opaque first arguments and accepts no code coercion', () => {
    const opaque = Object.create(null);
    let reads = 0;
    for (const name of ['code', 'data', 'message', 'body', 'toJSON', 'toString', 'valueOf']) {
      Object.defineProperty(opaque, name, { get() { reads++; throw new Error('private-detail'); } });
    }
    for (const value of ['1006', undefined, null, true, 123456789, NaN, Infinity,
      1006.5, BigInt(1006), Symbol('private-detail'), new Number(1006), opaque]) {
      const r = queryRig(capability); r.transport.start();
      assert.doesNotThrow(() => r.requests[0].fail(opaque, value));
      assert.equal(r.events.at(-1).code, prefix + '_FAIL_UNKNOWN');
      assert.equal(r.events.at(-1).status, 'disconnected');
      assert.equal(r.sent.length, 0);
      assert.equal(reads, 0);
      assert.ok(!JSON.stringify(r.events).includes('private-detail'));
    }
    const r = queryRig(capability); r.transport.start();
    assert.doesNotThrow(() => r.requests[0].fail(opaque, 1006));
    assert.equal(r.events.at(-1).code, prefix + '_FAIL_1006');
    assert.equal(reads, 0);
    const missing = queryRig(capability); missing.transport.start();
    missing.requests[0].fail({ code: 1006 });
    assert.equal(missing.events.at(-1).code, prefix + '_FAIL_UNKNOWN');
    const proxy = new Proxy(opaque, { get() { reads++; throw new Error('private-detail'); } });
    const guarded = queryRig(capability); guarded.transport.start();
    assert.doesNotThrow(() => guarded.requests[0].fail(proxy, 1006));
    assert.equal(guarded.events.at(-1).code, prefix + '_FAIL_1006');
    assert.equal(reads, 0);
  });

  test(capability + ' completed or retired query cannot replace the current diagnostic', () => {
    const r = queryRig(capability); r.transport.start();
    const first = r.requests[0]; first.fail({}, 203);
    const count = r.events.length;
    first.fail({}, 1006); first.success({ status: capability === 'ready' ? 1 : 0 });
    assert.equal(r.events.length, count);
    assert.equal(r.events.at(-1).code, prefix + '_FAIL_203');
    r.transport.stop(); r.transport.start();
    const currentCount = r.events.length;
    first.fail({}, 202); first.success({ status: capability === 'ready' ? 1 : 0 });
    assert.equal(r.events.length, currentCount);
    assert.equal(r.events.at(-1).status, 'connecting');
    r.requests[1].success({ status: capability === 'ready' ? 1 : 0 });
    const connectedCount = r.events.length;
    r.requests[1].fail({}, 1001); r.requests[1].success({ status: 2 });
    assert.equal(r.events.length, connectedCount);
    assert.equal(r.events.at(-1).status, 'connected');
  });

  test(capability + ' checks query ownership before reading any late result properties', () => {
    for (const retiredBy of ['timeout', 'success', 'fail', 'onopen', 'stop', 'restart']) {
      const r = queryRig(capability); r.transport.start(); const query = r.requests[0];
      if (retiredBy === 'timeout') [...r.timers.values()][0]();
      if (retiredBy === 'success') query.success({ status: capability === 'ready' ? 1 : 0 });
      if (retiredBy === 'fail') query.fail({}, 203);
      if (retiredBy === 'onopen') r.native.onopen();
      if (retiredBy === 'stop' || retiredBy === 'restart') r.transport.stop();
      if (retiredBy === 'restart') r.transport.start();
      let reads = 0;
      const late = Object.defineProperty({}, 'status', {
        get() { reads++; throw new Error('private-detail'); },
      });
      const opaque = new Proxy({}, { get() { reads++; throw new Error('private-detail'); } });
      const count = r.events.length;
      assert.doesNotThrow(() => query.success(late));
      assert.doesNotThrow(() => query.fail(opaque, opaque));
      assert.equal(reads, 0);
      assert.equal(r.events.length, count);
    }
  });
}

test('strict ready status two is disconnected with an interface-specific diagnostic', () => {
  const r = rig(); r.transport.start(); r.requests[0].success({ status: 2 });
  assert.equal(r.events.at(-1).code, 'READY_STATUS_2');
  assert.equal(r.events.at(-1).status, 'disconnected');
  assert.equal(r.timers.size, 0);
  assert.equal(r.sent.length, 0);
  assert.equal(r.transport.send(message('must-not-send')), false);
});

for (const [capability, prefix] of [['ready', 'READY'], ['diagnosis', 'DIAG'], ['apk', 'APK']]) {
  test(capability + ' unknown status uses bounded state tokens or fixed types without coercing or serializing values', () => {
    const opaque = Object.create(null); let reads = 0;
    for (const name of ['code', 'message', 'body', 'toJSON', 'toString', 'valueOf']) {
      Object.defineProperty(opaque, name, { get() { reads++; throw new Error('private-detail'); } });
    }
    for (const [value, kind] of [
      ['private-detail', 'STRING'], [undefined, 'UNDEFINED'], [opaque, 'OBJECT'], [null, 'OBJECT'],
      [123456789, 'NUMBER'], [NaN, 'NUMBER'], [true, 'BOOLEAN'], [() => 'private-detail', 'FUNCTION'],
      [Symbol('private-detail'), 'SYMBOL'], [BigInt(123456789), 'BIGINT'],
      [capability === 'ready' ? '1' : '0', 'STRING'], [new Number(capability === 'ready' ? 1 : 0), 'OBJECT'],
    ]) {
      const r = capability === 'apk' ? compatibilityRig({ getApkStatus() { return value; } }) : queryRig(capability);
      r.transport.start();
      if (capability !== 'apk') r.requests[0].success({ status: value });
      const expected = capability === 'apk' && value === '0' ? 'APK_RAW_0' : prefix + '_STATUS_UNKNOWN_' + kind;
      assert.equal(r.events.at(-1).code, expected);
      assert.equal(r.events.at(-1).status, 'disconnected');
      assert.equal(r.timers.size, 0);
      assert.equal(r.transport.send(message('must-not-send')), false);
      assert.equal(r.sent.length, 0);
      assert.ok(r.events.at(-1).code.length <= 45);
      assert.equal(reads, 0);
      assert.ok(!JSON.stringify(r.events).includes('private-detail'));
    }
  });
}

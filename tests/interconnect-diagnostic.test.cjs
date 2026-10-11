const test = require('node:test');
const assert = require('node:assert/strict');
const { createDiagnostic } = require('../src/lib/interconnect-diagnostic.js');

function fakeClock() {
  let nextId = 0;
  const tasks = new Map();
  return {
    setTimeout(callback, delay) {
      const id = nextId++;
      tasks.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
    fire() {
      const pending = Array.from(tasks.values());
      tasks.clear();
      pending.forEach((task) => task.callback());
    },
    pending() {
      return Array.from(tasks.values());
    },
  };
}

function harness(options = {}) {
  const clock = fakeClock();
  const requests = [];
  const connect = options.connect || {
    getReadyState(request) {
      requests.push(request);
    },
  };
  // Read-only diagnostics must never even access the business-data channel.
  Object.defineProperty(connect, 'send', {
    get() { throw new Error('send must stay untouched'); },
  });
  Object.defineProperty(connect, 'onmessage', {
    get() { throw new Error('onmessage must stay untouched'); },
  });
  const diagnostic = createDiagnostic({
    loadModule: options.loadModule || (() => ({ instance: () => connect })),
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    timeoutMs: options.timeoutMs,
  });
  const changes = [];
  return { clock, requests, connect, diagnostic, changes, onChange: (value) => changes.push(value) };
}

test('module loading failure stays unknown and does not expose external errors', () => {
  const { createDiagnostic } = require('../src/lib/interconnect-diagnostic.js');
  const changes = [];
  const diagnostic = createDiagnostic({
    loadModule() {
      throw new Error('secret-device-token');
    },
  });

  diagnostic.probe((value) => changes.push(value));

  assert.equal(diagnostic.snapshot().moduleStatus, 'unavailable');
  assert.equal(diagnostic.snapshot().connectionStatus, 'unknown');
  assert.equal(diagnostic.snapshot().title, '通信接口不可用');
  assert.doesNotMatch(JSON.stringify(changes), /secret-device-token/);
  assert.match(diagnostic.snapshot().detail, /只读探测/);
  assert.match(diagnostic.snapshot().detail, /演示签名/);
});

for (const invalidModule of [null, {}, { instance: () => null }, { instance: () => ({}) }]) {
  test(`invalid module shape ${JSON.stringify(invalidModule)} cannot claim platform support`, () => {
    const h = harness({ loadModule: () => invalidModule });
    h.diagnostic.probe(h.onChange);
    assert.equal(h.diagnostic.snapshot().moduleStatus, 'unavailable');
    assert.equal(h.diagnostic.snapshot().connectionStatus, 'unknown');
    assert.equal(h.clock.pending().length, 0);
  });
}

test('instance creation failure is safely reported without a timer', () => {
  const h = harness({ loadModule: () => ({ instance() { throw new Error('private-key'); } }) });
  h.diagnostic.probe(h.onChange);
  assert.equal(h.diagnostic.snapshot().moduleStatus, 'unavailable');
  assert.doesNotMatch(JSON.stringify(h.changes), /private-key/);
  assert.equal(h.clock.pending().length, 0);
});

for (const [status, expected] of [[1, 'connected'], [2, 'disconnected']]) {
  test(`ready status ${status} only describes ${expected} transport`, () => {
    const h = harness();
    h.diagnostic.probe(h.onChange);
    assert.equal(h.diagnostic.snapshot().connectionStatus, 'checking');
    h.requests[0].success({ status });
    assert.equal(h.diagnostic.snapshot().moduleStatus, 'available');
    assert.equal(h.diagnostic.snapshot().connectionStatus, expected);
    assert.match(h.diagnostic.snapshot().detail, /只读探测/);
    assert.match(h.diagnostic.snapshot().detail, /不代表真实学习数据/);
    assert.equal(h.clock.pending().length, 0);
    h.diagnostic.dispose();
  });
}

test('malformed ready status remains unknown instead of treating truthy data as connected', () => {
  for (const data of [null, 1, {}, { status: '1' }, { status: 3 }]) {
    const h = harness();
    h.diagnostic.probe(h.onChange);
    h.requests[0].success(data);
    assert.equal(h.diagnostic.snapshot().connectionStatus, 'unknown');
    assert.equal(h.clock.pending().length, 0);
    h.diagnostic.dispose();
  }
});

test('documented query error 1006 reports disconnected while all other query errors stay unknown', () => {
  for (const [code, expected] of [[1006, 'disconnected'], [1001, 'unknown'], [9999, 'unknown'], ['1006', 'unknown']]) {
    const h = harness();
    h.diagnostic.probe(h.onChange);
    h.requests[0].fail('secret-pairing-data', code);
    assert.equal(h.diagnostic.snapshot().connectionStatus, expected);
    assert.doesNotMatch(JSON.stringify(h.changes), /secret-pairing-data|未配对|不兼容/);
    assert.equal(h.clock.pending().length, 0);
    if (code === 9999 || typeof code === 'string') assert.equal(h.diagnostic.snapshot().code, null);
    h.diagnostic.dispose();
  }
});

test('timeout ends the pending query and ignores its late response', () => {
  const h = harness({ timeoutMs: 1250 });
  h.diagnostic.probe(h.onChange);
  assert.equal(h.clock.pending()[0].delay, 1250);
  h.clock.fire();
  assert.equal(h.diagnostic.snapshot().connectionStatus, 'unknown');
  assert.match(h.diagnostic.snapshot().detail, /超时/);
  const count = h.changes.length;
  h.requests[0].success({ status: 1 });
  h.requests[0].fail('late-private-error', 1006);
  assert.equal(h.changes.length, count);
  assert.equal(h.clock.pending().length, 0);
  h.diagnostic.dispose();
});

test('connection events supersede the pending ready query and never expose platform messages', () => {
  const h = harness();
  h.diagnostic.probe(h.onChange);
  h.connect.onopen({ isReconnected: true });
  assert.equal(h.diagnostic.snapshot().title, '通道已连接');
  h.requests[0].success({ status: 2 });
  assert.equal(h.diagnostic.snapshot().connectionStatus, 'connected');
  h.connect.onclose({ code: 1006, data: 'secret-close-message' });
  assert.equal(h.diagnostic.snapshot().connectionStatus, 'disconnected');
  h.connect.onerror({ code: 1001, data: 'secret-app-id' });
  assert.equal(h.diagnostic.snapshot().connectionStatus, 'unknown');
  assert.match(h.diagnostic.snapshot().detail, /平台报告/);
  assert.doesNotMatch(JSON.stringify(h.changes), /secret-close-message|secret-app-id/);
  assert.equal(h.clock.pending().length, 0);
  h.diagnostic.dispose();
});

test('dispose detaches owned callbacks and blocks pending query and saved event callbacks', () => {
  const h = harness();
  h.diagnostic.probe(h.onChange);
  const oldOpen = h.connect.onopen;
  const count = h.changes.length;
  h.diagnostic.dispose();
  assert.equal(h.connect.onopen, undefined);
  assert.equal(h.connect.onclose, undefined);
  assert.equal(h.connect.onerror, undefined);
  assert.equal(h.clock.pending().length, 0);
  oldOpen();
  h.requests[0].success({ status: 1 });
  assert.equal(h.changes.length, count);
});

test('a hidden page can resume and only the latest probe is allowed to update it', () => {
  const h = harness();
  h.diagnostic.probe(h.onChange);
  const oldOpen = h.connect.onopen;
  h.diagnostic.dispose();
  h.diagnostic.probe(h.onChange);
  const count = h.changes.length;
  oldOpen();
  h.requests[0].success({ status: 1 });
  assert.equal(h.changes.length, count);
  assert.equal(h.clock.pending().length, 1);
  h.requests[1].success({ status: 2 });
  assert.equal(h.diagnostic.snapshot().connectionStatus, 'disconnected');
  assert.equal(h.clock.pending().length, 0);
  h.diagnostic.dispose();
});

test('reprobing without disposal also releases the old timeout and ignores the old query', () => {
  const h = harness();
  h.diagnostic.probe(h.onChange);
  h.diagnostic.probe(h.onChange);
  h.requests[0].success({ status: 1 });
  assert.equal(h.diagnostic.snapshot().connectionStatus, 'checking');
  assert.equal(h.clock.pending().length, 1);
  h.requests[1].success({ status: 2 });
  assert.equal(h.diagnostic.snapshot().connectionStatus, 'disconnected');
  h.diagnostic.dispose();
});

test('existing singleton callbacks are not stolen or cleared by the diagnostic', () => {
  const open = () => {};
  const close = () => {};
  const error = () => {};
  const h = harness({ connect: { onopen: open, onclose: close, onerror: error, getReadyState(request) { request.success({ status: 1 }); } } });
  h.diagnostic.probe(h.onChange);
  assert.equal(h.diagnostic.snapshot().connectionStatus, 'connected');
  h.diagnostic.dispose();
  assert.equal(h.connect.onopen, open);
  assert.equal(h.connect.onclose, close);
  assert.equal(h.connect.onerror, error);
});

test('dispose never clears a callback that another consumer installed after the probe', () => {
  const h = harness();
  h.diagnostic.probe(h.onChange);
  const replacement = () => {};
  h.connect.onclose = replacement;
  h.diagnostic.dispose();
  assert.equal(h.connect.onclose, replacement);
});

test('synchronous query success wins over a subsequent platform throw', () => {
  const h = harness({ connect: { getReadyState(request) { request.success({ status: 1 }); throw new Error('secret-after-success'); } } });
  h.diagnostic.probe(h.onChange);
  assert.equal(h.diagnostic.snapshot().connectionStatus, 'connected');
  assert.equal(h.clock.pending().length, 0);
  assert.doesNotMatch(JSON.stringify(h.changes), /secret-after-success/);
  h.diagnostic.dispose();
});

test('synchronous query throw becomes unknown and releases the timeout', () => {
  const h = harness({ connect: { getReadyState() { throw new Error('secret-query-error'); } } });
  h.diagnostic.probe(h.onChange);
  assert.equal(h.diagnostic.snapshot().moduleStatus, 'available');
  assert.equal(h.diagnostic.snapshot().connectionStatus, 'unknown');
  assert.equal(h.clock.pending().length, 0);
  assert.doesNotMatch(JSON.stringify(h.changes), /secret-query-error/);
  h.diagnostic.dispose();
});

test('callback disposal during the first update stops platform loading', () => {
  let loads = 0;
  const h = harness({ loadModule() { loads += 1; return null; } });
  h.diagnostic.probe(() => h.diagnostic.dispose());
  assert.equal(loads, 0);
  assert.equal(h.clock.pending().length, 0);
});

test('consumer mutations cannot forge the next returned snapshot', () => {
  const h = harness();
  h.diagnostic.probe((value) => { value.connectionStatus = 'connected'; });
  const first = h.diagnostic.snapshot();
  first.connectionStatus = 'connected';
  assert.equal(h.diagnostic.snapshot().connectionStatus, 'checking');
  h.requests[0].success({ status: 2 });
  assert.equal(h.diagnostic.snapshot().connectionStatus, 'disconnected');
  h.diagnostic.dispose();
});

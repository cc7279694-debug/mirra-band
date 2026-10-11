const test = require('node:test');
const assert = require('node:assert/strict');
const { createTransport } = require('../src/platform/interconnect-transport');
const { createCompanionStore } = require('../src/lib/companion-store');
const protocol = require('../src/lib/companion-protocol');
const ackFixture = require('../protocol/v1/fixtures/hello_ack.json');
const idleFixture = require('../protocol/v1/fixtures/idle.json');

for (const capability of ['diagnosis', 'getApkStatus']) {
  test('native object boundary with ' + capability + ' requires matched handshake and full snapshot', () => {
    let id = 0, query;
    const timers = new Map(), intervals = new Map(), sent = [];
    const native = {
      send(options) {
        // Matches the documented native object -> JSON UTF-8 boundary, not a real device.
        assert.equal(typeof options.data, 'object');
        assert.ok(options.data && !Array.isArray(options.data));
        sent.push({ ...options, decoded: protocol.decodeMessage(JSON.stringify(options.data)) });
      },
    };
    native[capability] = capability === 'diagnosis'
      ? options => { query = options; }
      : () => 'CONNECTED';
    const scheduling = {
      setTimeout: fn => { timers.set(++id, fn); return id; },
      clearTimeout: timer => timers.delete(timer),
    };
    const transport = createTransport({ loadModule: () => ({ instance: () => native }), ...scheduling });
    const store = createCompanionStore({ transport, now: () => 100000, randomId: () => 'boundary-' + (++id),
      ...scheduling, setInterval: fn => { intervals.set(++id, fn); return id; },
      clearInterval: timer => intervals.delete(timer) });
    try {
      store.start();
      if (capability === 'diagnosis') {
        assert.equal(store.snapshot().body, null);
        assert.equal(sent.length, 0);
        query.success({ status: 0 });
      }
      assert.equal(sent.length, 1);
      const hello = sent[0].decoded;
      assert.equal(hello.type, 'HELLO');
      sent[0].success();
      assert.equal(store.snapshot().body, null);
      assert.equal(store.snapshot().freshness, 'unknown');
      native.onmessage({ data: protocol.encodeMessage({ ...ackFixture,
        clientInstanceId: hello.clientInstanceId, requestId: hello.requestId }) });
      assert.equal(sent.length, 2);
      const request = sent[1].decoded;
      assert.equal(request.type, 'GET_SNAPSHOT');
      sent[1].success();
      assert.equal(store.snapshot().body, null);
      const snapshot = { ...idleFixture, clientInstanceId: request.clientInstanceId,
        requestId: request.requestId, streamId: request.streamId };
      native.onmessage({ data: protocol.encodeMessage({ ...snapshot, requestId: 'foreign-request' }) });
      assert.equal(store.snapshot().body, null);
      native.onmessage({ data: protocol.encodeMessage(snapshot) });
      assert.equal(store.snapshot().freshness, 'fresh');
      assert.equal(store.snapshot().body.bookTitle, '观已：阅读与学习📖');
      assert.equal(store.snapshot().body.currentPage, 42);
      native.onclose();
      assert.equal(store.snapshot().freshness, 'expired');
      assert.equal(store.snapshot().body.currentPage, 42);
    } finally {
      store.destroy();
    }
    assert.equal(timers.size, 0);
    assert.equal(intervals.size, 0);
    assert.equal(native.onmessage, undefined);
  });
}

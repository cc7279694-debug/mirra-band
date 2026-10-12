const test = require('node:test');
const assert = require('node:assert/strict');
const { createProbeController } = require('../src/lib/probe-controller');

function harness() {
  let time = 1000;
  let factories = 0;
  const cells = { storage: [null, null], file: [null, null] };
  const events = [];
  const controller = createProbeController({ now: () => time, versionName: '0.1.0', versionCode: 1,
    backendFactory(kind) {
      factories++;
      return { read: async slot => cells[kind][slot], write: async (slot, text) => { events.push({ kind, slot, text }); cells[kind][slot] = text; },
        describe: () => ({ kind, uncertain: false }), close() {} };
    } });
  return { controller, cells, events, factories: () => factories, time: value => { time = value; } };
}

test('probe opens an empty journal and confirms Unicode only after persisted readback', async () => {
  const h = harness();
  assert.equal(h.controller.snapshot().canWrite, false);
  assert.equal(h.factories(), 0);
  await h.controller.open();
  assert.equal(h.controller.snapshot().status, 'EMPTY');
  await h.controller.saveSample();
  assert.equal(h.controller.snapshot().sequence, 1);
  assert.equal(h.controller.snapshot().recordCount, 1);
  assert.equal(h.controller.snapshot().status, 'READY');
  assert.match(h.controller.snapshot().sampleText, /中文恢复样本📖/);
  const { decodeRecord } = require('../src/lib/probe-journal');
  assert.equal(decodeRecord(h.cells.storage[0]).payload.records[0].text, '中文恢复样本📖');
});

test('bounded capacity probe reports 32 recovered records without unbounded files', async () => {
  const h = harness(); await h.controller.open();
  await h.controller.runCapacityProbe();
  assert.equal(h.controller.snapshot().recordCount, 32);
  assert.equal(h.events.length, 5);
  assert.equal(h.cells.storage.length, 2);
  await h.controller.open();
  assert.equal(h.controller.snapshot().recordCount, 32);
});

test('damage probe first preserves a second good slot then really recovers the older record', async () => {
  const h = harness(); await h.controller.open();
  await h.controller.runDamageRecovery();
  assert.equal(h.controller.snapshot().status, 'RECOVERED');
  assert.equal(h.controller.snapshot().sequence, 1);
  assert.equal(h.controller.snapshot().recordCount, 1);
  const recreated = createProbeController({ now: () => 2000, backendFactory: () => ({
    read: async slot => h.cells.storage[slot], write: async () => { throw Error('must not write during recovery'); }, describe: () => ({ uncertain: false }), close() {} }) });
  await recreated.open();
  assert.equal(recreated.snapshot().status, 'RECOVERED');
  assert.equal(recreated.snapshot().sequence, 1);
});

test('injected write failure never announces save and readback keeps previous committed sequence', async () => {
  const h = harness(); await h.controller.open(); await h.controller.saveSample();
  await h.controller.runWriteFailure();
  assert.equal(h.controller.snapshot().status, 'BLOCKED');
  assert.equal(h.controller.snapshot().canWrite, false);
  assert.equal(h.events.length, 1);
  await h.controller.open();
  assert.equal(h.controller.snapshot().sequence, 1);
  assert.equal(h.controller.snapshot().status, 'READY');
});

test('clock rollback preserves the checkpoint and never produces trusted elapsed time', async () => {
  const h = harness(); await h.controller.open(); await h.controller.saveSample();
  h.time(900); await h.controller.open();
  assert.match(h.controller.snapshot().clockText, /时间不确定/);
  assert.equal(h.controller.snapshot().sequence, 1);
  assert.equal(h.events.length, 1);
  assert.equal(h.controller.snapshot().trustedLearningMs, undefined);
});

test('a throwing view subscriber cannot turn a durable write into reported failure', async () => {
  const h = harness(); h.controller.subscribe(() => { throw Error('view failure'); });
  await h.controller.open(); await h.controller.saveSample();
  assert.equal(h.controller.snapshot().sequence, 1);
  assert.equal(h.controller.snapshot().status, 'READY');
});

test('uncertain IO cannot be bypassed by switching platform backend', async () => {
  let factories = 0;
  const c = createProbeController({ backendFactory() { factories++; return {
    read: async () => { throw Object.assign(Error('UNCERTAIN'), { code: 'UNCERTAIN' }); },
    write: async () => { throw Error('must not write'); }, describe: () => ({ uncertain: true }), close() {} }; } });
  await c.open(); assert.equal(c.snapshot().status, 'UNCERTAIN');
  await assert.rejects(c.useBackend('file'), /UNCERTAIN/);
  assert.equal(factories, 1); assert.equal(c.snapshot().canWrite, false);
});

test('closed owner cannot reacquire storage or change the page to a live state', async () => {
  const h = harness(); await h.controller.open(); h.controller.close();
  assert.equal(h.controller.snapshot().status, 'CLOSED');
  await assert.rejects(h.controller.saveSample(), /CLOSED/);
  await assert.rejects(h.controller.open(), /CLOSED/);
  assert.equal(h.factories(), 1); assert.equal(h.events.length, 0);
});

test('instance marker stays within one owner and is different after explicit recreation', async () => {
  const options = { newInstanceId: () => 'first-owner', now: () => 1000, backendFactory: () => ({
    read: async () => null, write: async () => {}, describe: () => ({ uncertain: false }), close() {} }) };
  const first = createProbeController(options);
  await first.open(); await first.useBackend('file');
  assert.equal(first.snapshot().instanceTag, 'first-owner');
  first.close();
  const second = createProbeController({ ...options, newInstanceId: () => 'new-owner' });
  assert.equal(second.snapshot().instanceTag, 'new-owner');
});

test('a forward clock jump during IO is not reported as measured write latency', async () => {
  let clock = 1000; const cells = [null, null];
  const c = createProbeController({ now: () => clock, backendFactory: () => ({
    read: async slot => cells[slot], write: async (slot, text) => { cells[slot] = text; clock = 9000; },
    describe: () => ({ uncertain: false }), close() {} }) });
  await c.open(); await c.saveSample();
  assert.equal(c.snapshot().status, 'READY');
  assert.equal(c.snapshot().lastWriteMs, null);
  assert.match(c.snapshot().clockText, /不计算可信学习时长/);
});

test('safe native capability code survives journal recovery failure without arbitrary error text', async () => {
  const c = createProbeController({ backendFactory: () => ({
    read: async () => { throw Object.assign(Error('private native detail'), { code: 'API_MISSING' }); },
    write: async () => {}, describe: () => ({ uncertain: false }), close() {} }) });
  await c.open();
  assert.equal(c.snapshot().status, 'BLOCKED');
  assert.match(c.snapshot().diagnostic, /API_MISSING/);
  assert.doesNotMatch(c.snapshot().diagnostic, /private native detail/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the real UX script. The native Vela storage boundary is owned by the
// app service and replaced here; these checks do not claim rendered pixels.
function harness() {
  let current = {
    busy: false, canWrite: true, backend: 'storage', status: 'READY', sequence: 2,
    recordCount: 1, diagnostic: 'READ_BACK_VERIFIED', lastWriteMs: 18,
    lastReadMs: 7, clockText: '时钟锚点待真机核对', historyRows: ['序列 2：实验记录'],
    versionName: '0.1.0', versionCode: 1,
  };
  const listeners = new Set();
  const savedListeners = [];
  const calls = [];
  const lifecycle = [];
  let closeCount = 0;
  let exitCount = 0;
  const pending = new Map();
  const service = {
    snapshot() { return current; },
    subscribe(listener) {
      listeners.add(listener); savedListeners.push(listener);
      return () => { listeners.delete(listener); };
    },
    noteLifecycle(event) { lifecycle.push(event); },
    close() { closeCount += 1; },
  };
  for (const method of ['open', 'saveSample', 'runCapacityProbe', 'runDamageRecovery', 'runWriteFailure', 'useBackend']) {
    service[method] = (argument) => {
      calls.push({ method, argument });
      return pending.has(method) ? pending.get(method).promise : Promise.resolve();
    };
  }
  const filename = path.resolve(__dirname, '../src/pages/StorageProbe/index.ux');
  assert.ok(fs.existsSync(filename), 'StorageProbe must have an actual UX implementation');
  const script = fs.readFileSync(filename, 'utf8').match(/<script\b[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(script, 'StorageProbe must expose the actual page script');
  const module = { exports: {} };
  vm.runInNewContext(script[1].replace(/\bexport\s+default\s+/, 'module.exports = '), { module, Promise, Array, Object, String, Number });
  const app = { $def: { getProbe: () => service }, exit() { exitCount += 1; } };
  const page = Object.assign({}, module.exports, module.exports.private, { $app: app });
  return {
    page, calls, lifecycle, listeners, savedListeners, app,
    closeCount: () => closeCount,
    exitCount: () => exitCount,
    patch(values, notify = true) {
      current = { ...current, ...values };
      if ('status' in values && !('canWrite' in values)) current.canWrite = ['EMPTY', 'READY', 'RECOVERED'].includes(values.status);
      if (notify) for (const listener of Array.from(listeners)) listener(current);
    },
    defer(method) {
      let resolve; let reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      // A failing assertion before the operation consumes this test boundary
      // must not leak an unrelated rejection into the next test.
      promise.catch(() => {});
      pending.set(method, { promise, resolve, reject });
      return { resolve, reject };
    },
  };
}

async function shown(h) {
  h.page.onInit();
  await h.page.onShow();
  // Show may return before the service's promise settles on the native engine.
  await Promise.resolve();
}

test('probe page obtains the app-owned service and presents its actual verified snapshot', async () => {
  const h = harness();
  h.page.onInit();
  assert.equal(h.calls.length, 0);
  assert.equal(h.page.sequence, 2);
  assert.equal(h.page.recordCount, 1);
  assert.equal(h.page.diagnostic, 'READ_BACK_VERIFIED');
  assert.equal(h.page.versionText, '0.1.0 / 1');
  assert.equal(h.page.lastWriteText, '18 ms');
  assert.equal(h.page.lastReadText, '7 ms');
  await h.page.onShow();
  assert.equal(h.listeners.size, 1);
  assert.deepEqual(h.calls.map(call => call.method), ['open']);
});

test('show is idempotent and hidden/destroyed pages release observers without closing the shared service', async () => {
  const h = harness(); await shown(h);
  h.page.onShow(); h.page.onShow();
  assert.equal(h.listeners.size, 1);
  assert.equal(h.calls.length, 1);
  h.page.onHide(); h.page.onHide();
  assert.equal(h.listeners.size, 0);
  assert.deepEqual(h.lifecycle, ['show', 'hide']);
  await h.page.onShow();
  assert.equal(h.listeners.size, 1);
  assert.equal(h.calls.filter(call => call.method === 'open').length, 2);
  h.page.onDestroy(); h.page.onDestroy(); h.page.onShow();
  assert.equal(h.listeners.size, 0);
  assert.equal(h.closeCount(), 0);
  assert.deepEqual(h.lifecycle, ['show', 'hide', 'show', 'hide', 'destroy']);
});

test('probe actions call only their specific isolated service operations', async () => {
  const h = harness(); await shown(h);
  await h.page.saveSample(); await h.page.runCapacityProbe();
  await h.page.runDamageRecovery(); await h.page.runWriteFailure();
  await h.page.switchBackend();
  assert.deepEqual(h.calls.slice(1), [
    { method: 'saveSample', argument: undefined },
    { method: 'runCapacityProbe', argument: undefined },
    { method: 'runDamageRecovery', argument: undefined },
    { method: 'runWriteFailure', argument: undefined },
    { method: 'useBackend', argument: 'file' },
  ]);
  h.patch({ backend: 'file' }); await h.page.switchBackend();
  assert.equal(h.calls[h.calls.length - 1].argument, 'storage');
});

test('rapid action taps and service busy status cannot issue concurrent experiments', async () => {
  const h = harness(); await shown(h);
  const write = h.defer('saveSample');
  const task = h.page.saveSample();
  h.page.saveSample(); h.page.runDamageRecovery(); h.page.switchBackend(); h.page.reload();
  assert.equal(h.page.busy, true);
  assert.deepEqual(h.calls.map(call => call.method), ['open', 'saveSample']);
  write.resolve(); await task;
  h.patch({ busy: true });
  h.page.saveSample(); h.page.runWriteFailure();
  assert.equal(h.calls.length, 2);
  h.patch({ busy: false }); await h.page.runWriteFailure();
  assert.equal(h.calls.length, 3);
});

test('blocked and unopened storage prevent experiments while uncertain state requires reopening the app', async () => {
  const h = harness(); await shown(h);
  for (const status of ['BLOCKED', 'UNOPENED']) {
    h.patch({ status });
    h.page.saveSample(); h.page.runCapacityProbe(); h.page.runDamageRecovery(); h.page.runWriteFailure();
    assert.equal(h.page.canWrite, false);
    const before = h.calls.length;
    await h.page.reload();
    assert.equal(h.calls.length, before + 1);
    assert.equal(h.calls[h.calls.length - 1].method, 'open');
  }
  h.patch({ status: 'UNCERTAIN', diagnostic: 'WRITE_CALLBACK_TIMEOUT' });
  const before = h.calls.length;
  h.page.reload(); h.page.saveSample(); h.page.switchBackend();
  assert.equal(h.calls.length, before);
  assert.equal(h.page.requiresReopen, true);
  assert.match(h.page.recoveryText, /重新打开/);
});

test('an unavailable storage backend can switch to isolated file storage without write admission', async () => {
  const h = harness(); await shown(h);
  h.patch({ status: 'BLOCKED', canWrite: false, diagnostic: 'STORAGE_API_UNAVAILABLE' });
  await h.page.switchBackend();
  assert.deepEqual(h.calls[h.calls.length - 1], { method: 'useBackend', argument: 'file' });
  for (const values of [{ status: 'UNCERTAIN' }, { status: 'CLOSED' }, { status: 'READY', busy: true }]) {
    h.patch({ busy: false, ...values });
    const before = h.calls.length;
    await h.page.switchBackend();
    assert.equal(h.calls.length, before);
  }
});

test('the displayed sample is the service readback and clears when no sample remains', async () => {
  const h = harness(); await shown(h);
  h.patch({ sampleText: '序列三：中文实验样本已从另一槽读回。' });
  assert.equal(h.page.sampleText, '序列三：中文实验样本已从另一槽读回。');
  h.patch({ sampleText: null });
  assert.equal(h.page.sampleText, '');
});

test('hardware back is blocked during an in-flight experiment and released after completion', async () => {
  const h = harness(); await shown(h);
  assert.equal(h.page.onBackPress(), false);
  const write = h.defer('saveSample'); const task = h.page.saveSample();
  assert.equal(h.page.onBackPress(), true);
  write.resolve(); await task;
  assert.equal(h.page.onBackPress(), false);
});

test('service rejection is contained and the page displays the service error without invented success', async () => {
  const h = harness(); await shown(h);
  const write = h.defer('saveSample');
  const task = h.page.saveSample();
  h.patch({ status: 'BLOCKED', diagnostic: 'WRITE_FAILED', sequence: 2, recordCount: 1 }, false);
  write.reject(new Error('storage write failed'));
  await task;
  assert.equal(h.page.busy, false);
  assert.equal(h.page.status, 'BLOCKED');
  assert.equal(h.page.diagnostic, 'WRITE_FAILED');
  assert.equal(h.page.sequence, 2);
  assert.equal(h.page.canWrite, false);
});

test('open rejection is handled and permits a later user initiated read', async () => {
  const h = harness(); h.page.onInit();
  const open = h.defer('open');
  const task = h.page.onShow();
  h.patch({ status: 'BLOCKED', diagnostic: 'READ_FAILED' }, false);
  open.reject(new Error('storage read failed'));
  await task; await Promise.resolve();
  assert.equal(h.page.diagnostic, 'READ_FAILED');
  assert.equal(h.page.busy, false);
  const task2 = h.page.reload();
  assert.equal(h.calls.filter(call => call.method === 'open').length, 2);
  await task2;
});

test('hidden page ignores late callbacks and pending writes while reentry reads the app-owned outcome', async () => {
  const h = harness(); await shown(h);
  const listener = h.savedListeners[0];
  const write = h.defer('saveSample'); const task = h.page.saveSample();
  h.page.onHide();
  h.patch({ sequence: 3, recordCount: 2, diagnostic: 'READ_BACK_VERIFIED' }, false);
  assert.equal(typeof listener, 'function');
  listener(); write.resolve(); await task;
  assert.equal(h.page.sequence, 2);
  assert.equal(h.closeCount(), 0);
  await h.page.onShow();
  assert.equal(h.page.sequence, 3);
  assert.equal(h.page.recordCount, 2);
});

test('destroy during an experiment neither updates the retired page nor cancels or closes app storage', async () => {
  const h = harness(); await shown(h);
  const write = h.defer('runCapacityProbe'); const task = h.page.runCapacityProbe();
  h.page.onDestroy();
  h.patch({ sequence: 9, recordCount: 32 }, false); write.resolve(); await task;
  assert.equal(h.page.sequence, 2);
  assert.equal(h.closeCount(), 0);
  h.page.saveSample(); h.page.onShow();
  assert.equal(h.calls.length, 2);
});

test('unavailable latency stays unknown and valid zero callback timings remain zero', async () => {
  const h = harness(); await shown(h);
  h.patch({ lastWriteMs: null, lastReadMs: -1 });
  assert.equal(h.page.lastWriteText, '未取得');
  assert.equal(h.page.lastReadText, '未取得');
  h.patch({ lastWriteMs: 0, lastReadMs: 0 });
  assert.equal(h.page.lastWriteText, '0 ms');
  assert.equal(h.page.lastReadText, '0 ms');
});

test('long Chinese experiment history is readable in bounded rows without dropping text', async () => {
  const h = harness(); await shown(h);
  const long = '损坏恢复：主槽校验失败，已从另一有效槽恢复实验记录。'.repeat(5);
  h.patch({ historyRows: [long, '第二条记录'] });
  assert.ok(Array.isArray(h.page.historyRows));
  assert.equal(h.page.historyRows.join(''), long + '第二条记录');
  assert.ok(h.page.historyRows.every(row => Array.from(row).length <= 36));
});

test('uncertain storage can request app exit once without closing storage from the page', async () => {
  const h = harness(); await shown(h);
  assert.equal(typeof h.page.exitProbe, 'function');
  h.patch({ status: 'UNCERTAIN', canWrite: false });
  h.page.exitProbe(); h.page.exitProbe();
  assert.equal(h.exitCount(), 1);
  assert.equal(h.closeCount(), 0);
});

test('busy, closed, hidden and retired experiment pages cannot request app exit', async () => {
  const h = harness(); await shown(h);
  assert.equal(typeof h.page.exitProbe, 'function');
  h.patch({ busy: true }); h.page.exitProbe();
  h.patch({ busy: false, status: 'CLOSED' }); h.page.exitProbe();
  h.patch({ status: 'READY' }); h.page.onHide(); h.page.exitProbe();
  await h.page.onShow(); h.page.onDestroy(); h.page.exitProbe();
  assert.equal(h.exitCount(), 0);
  assert.equal(h.closeCount(), 0);
});

test('missing or throwing platform exit reports an unconfirmed outcome and allows a later valid request', async () => {
  const h = harness(); await shown(h);
  assert.equal(typeof h.page.exitProbe, 'function');
  const actualExit = h.app.exit;
  h.app.exit = undefined; h.page.exitProbe();
  assert.match(h.page.exitNotice, /接口.*不可用/);
  assert.equal(h.exitCount(), 0);
  h.app.exit = () => { throw new Error('native exit failed'); };
  h.page.exitProbe();
  assert.match(h.page.exitNotice, /未确认/);
  assert.equal(h.exitCount(), 0);
  h.app.exit = actualExit; h.page.exitProbe();
  assert.equal(h.exitCount(), 1);
  assert.equal(h.closeCount(), 0);
});

test('the page displays the current in-memory instance identity without inventing an absent value', async () => {
  const h = harness(); await shown(h);
  assert.equal(h.page.instanceTag, '未取得');
  h.patch({ instanceTag: 'probe-memory-42' });
  assert.equal(h.page.instanceTag, 'probe-memory-42');
  h.patch({ instanceTag: null });
  assert.equal(h.page.instanceTag, '未取得');
});

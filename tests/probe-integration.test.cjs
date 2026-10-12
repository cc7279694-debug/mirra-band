const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createProbeBackend } = require('../src/platform/probe-storage');
const { createProbeController } = require('../src/lib/probe-controller');

test('real page and persistence owners cannot unblock a timed-out write with reentry or a late callback', async () => {
  const cells = {}; const timers = new Map(); let timerId = 0; let reads = 0; let pendingWrite;
  const native = { get(args) { reads++; args.success(cells[args.key] || ''); },
    set(args) { cells[args.key] = args.value; pendingWrite = args; } };
  const backend = createProbeBackend({ kind: 'storage', loadModule: () => native,
    schedule(fn) { const id = ++timerId; timers.set(id, fn); return id; }, cancelSchedule(id) { timers.delete(id); } });
  const controller = createProbeController({ now: () => 1000, backendFactory: () => backend });
  const file = fs.readFileSync(path.join(__dirname, '../src/pages/StorageProbe/index.ux'), 'utf8');
  const script = file.match(/<script>([\s\S]*?)<\/script>/)[1]; const module = { exports: {} };
  vm.runInNewContext(script.replace('export default', 'module.exports ='), { module, Promise, Array, Object, String, Number });
  const page = Object.assign({}, module.exports, module.exports.private, { $app: { $def: { getProbe: () => controller }, exit() {} } });
  page.onInit(); await page.onShow();
  assert.equal(page.status, 'EMPTY');
  const saving = page.saveSample();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(pendingWrite); const readsBeforeReentry = reads;
  page.onHide(); await page.onShow();
  assert.equal(reads, readsBeforeReentry); assert.equal(page.busy, true);
  for (const timer of Array.from(timers.values())) timer();
  await saving;
  assert.equal(page.status, 'UNCERTAIN'); assert.equal(page.canWrite, false);
  assert.equal(controller.snapshot().historyRows.some(row => row.startsWith('读回确认')), false);
  pendingWrite.success();
  assert.equal(controller.snapshot().status, 'UNCERTAIN');
  await assert.rejects(controller.useBackend('file'), /UNCERTAIN/);
  page.onHide(); await page.onShow();
  assert.equal(reads, readsBeforeReentry); assert.equal(page.status, 'UNCERTAIN');
  page.onDestroy(); controller.close();
  assert.equal(timers.size, 0);
});

test('real probe app recreation reads the same canonical data without loading Interconnect', async () => {
  const cells = {}; const loads = [];
  const native = { get(args) { args.success(cells[args.key] || ''); }, set(args) { cells[args.key] = args.value; args.success(); } };
  const file = fs.readFileSync(path.join(__dirname, '../src/probe-app.ux'), 'utf8');
  const script = file.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/import (\w+) from '([^']+)'/g, 'const $1 = require(\'$2\')').replace('export default', 'module.exports =');
  function app() {
    const module = { exports: {} };
    vm.runInNewContext(script, { module, Error, require(name) {
      if (name === './profile') return { mode: 'probe', versionName: '0.1.0', versionCode: 1 };
      if (name.startsWith('@system.')) { loads.push(name); if (name === '@system.storage') return native; throw Error('Unexpected feature'); }
      return require(path.resolve(__dirname, '../src', name));
    } });
    const value = Object.assign({}, module.exports); value.onCreate(); return value;
  }
  const first = app(); await first.getProbe().open(); await first.getProbe().saveSample();
  const original = Object.values(cells)[0]; first.onDestroy();
  const second = app(); await second.getProbe().open();
  assert.equal(second.getProbe().snapshot().sequence, 1);
  assert.equal(second.getProbe().snapshot().sampleText, '中文恢复样本📖');
  assert.equal(Object.values(cells)[0], original);
  assert.equal(loads.includes('@system.interconnect'), false);
  second.onDestroy();
});

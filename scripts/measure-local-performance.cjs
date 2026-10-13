const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = 'cf0328f5eade9427567647156d86b2503b6ad52e';
const round = value => Math.round(value * 1000) / 1000;
const plain = value => JSON.parse(JSON.stringify(value));

// The callback delay models a slow file service. It is explicitly NOT a
// measurement of firmware latency, Vela rendering or physical wrist touch.
function createMeasurement(options = {}) {
  const ref = options.ref || null;
  const delayMs = options.delayMs === undefined ? 20 : options.delayMs;
  const sources = new Map(); const modules = new Map();
  let active = null;
  function source(relative) {
    relative = relative.replace(/\\/g, '/');
    if (!sources.has(relative)) sources.set(relative, ref
      ? execFileSync('git', ['show', `${ref}:${relative}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
      : fs.readFileSync(path.join(ROOT, relative), 'utf8'));
    return sources.get(relative);
  }
  function stat(name, elapsed) {
    if (!active) return;
    const metric = active.functions[name] || (active.functions[name] = { calls: 0, totalMs: 0 });
    metric.calls++; metric.totalMs += elapsed;
  }
  const measuredJson = Object.create(JSON);
  ['parse', 'stringify'].forEach(name => {
    measuredJson[name] = function (...args) {
      const started = performance.now(); const result = JSON[name](...args);
      if (active) {
        active.json[name].calls++;
        active.json[name].bytes += Buffer.byteLength(name === 'stringify' ? result || '' : String(args[0]), 'utf8');
        active.json[name].totalMs += performance.now() - started;
      }
      return result;
    };
  });
  function wrapped(name, fn, objectMethods) {
    return function (...args) {
      const started = performance.now(); const value = fn.apply(this, args);
      if (value && typeof value.then === 'function') return value.then(result => {
        stat(name, performance.now() - started);
        if (active && name.endsWith('/local-owner.js.dispatch')) active.confirmations.push(round(performance.now() - active.started));
        return result;
      }, error => { stat(name, performance.now() - started); throw error; });
      stat(name, performance.now() - started);
      if (objectMethods && value && typeof value === 'object') Object.keys(value).forEach(key => {
        if (typeof value[key] === 'function') value[key] = wrapped(`${name.replace(/\.[^.]+$/, '')}.${key}`, value[key]);
      });
      return value;
    };
  }
  function load(relative) {
    relative = relative.replace(/\\/g, '/');
    if (!relative.endsWith('.js')) relative += '.js';
    if (modules.has(relative)) return modules.get(relative).exports;
    const module = { exports: {} }; modules.set(relative, module);
    vm.runInNewContext(source(relative), {
      module, exports: module.exports, JSON: measuredJson,
      Promise, Math, Date, Number, String, Array, Object, Set, Map, isFinite,
      setTimeout, clearTimeout,
      require(name) {
        if (!name.startsWith('.')) throw new Error('MEASURE_SOURCE_REQUIRE');
        return load(path.posix.join(path.posix.dirname(relative), name));
      },
    }, { filename: relative });
    Object.keys(module.exports).forEach(name => {
      if (typeof module.exports[name] === 'function') module.exports[name] = wrapped(`${relative}.${name}`, module.exports[name], /^create(?:LocalOwner|LocalUiFlow|Journal|LocalBackend|ProbeBackend)$/.test(name));
    });
    return module.exports;
  }
  function ux(relative, context) {
    const match = source(relative).match(/<script\b[^>]*>([\s\S]*?)<\/script>/);
    assert.ok(match, 'actual UX source must contain its script');
    const imports = {};
    for (const entry of match[1].matchAll(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/gm)) {
      if (!(entry[1] in context)) imports[entry[1]] = load(path.posix.join(path.posix.dirname(relative), entry[2]));
    }
    const script = match[1].replace(/^import .+$/gm, '').replace(/\bexport\s+default\s+/, 'module.exports = ');
    const module = { exports: {} };
    vm.runInNewContext(script, { module, JSON: measuredJson, ...imports, ...context }, { filename: relative });
    return module.exports;
  }
  const ownerLib = load('src/lib/local-owner');
  const storageLib = load('src/platform/local-storage');
  const domainLib = load('src/lib/local-session');
  const presentationLib = load('src/lib/local-presentation');
  const flowLib = load('src/lib/local-ui-flow');
  const codecLib = load('src/lib/local-codec');
  let rigOrdinal = 0;
  function createRig(seedPending) {
    const files = new Map(); const calls = []; const timers = new Map();
    let wallMs = 100000; let nextTimer = 0; let afterWrite = false;
    const fixedMath = Object.create(Math); fixedMath.random = () => (++rigOrdinal % 997 + 1) / 1000;
    if (seedPending) {
      let doc = domainLib.createDocument('perf-controlled-local');
      const observation = { wallMs: 1000, ownerId: 'perf-seed', monotonicMs: null, monotonicVerified: false };
      doc = domainLib.transition(doc, { type: 'SELECT_BOOK', bookId: domainLib.TEST_BOOKS[0].id }, observation);
      doc = domainLib.transition(doc, { type: 'SELECT_ACTION', firstActionId: domainLib.TEST_BOOKS[0].firstActions[0].id }, observation);
      doc = domainLib.transition(doc, { type: 'CONFIRM_START', confirmed: true }, observation);
      doc = domainLib.transition(doc, { type: 'FINISH', endPage: null }, { ...observation, wallMs: 2000 });
      files.set('internal://files/mirra_05b_test_sessions_a.json', codecLib.encodeRecord(4, doc));
    }
    function nativeCall(kind, request, complete) {
      const stage = kind === 'write' ? 'nativeWrite' : afterWrite ? 'exactReadback' : 'dualSlotRead';
      if (kind === 'write') afterWrite = true; else if (afterWrite) afterWrite = false;
      const started = performance.now(); const currentMetric = active;
      const record = { kind, stage, uri: request.uri }; calls.push(record);
      const done = () => {
        record.elapsedMs = performance.now() - started;
        if (currentMetric) currentMetric.native.push(record);
        complete();
      };
      if (delayMs > 0) setTimeout(done, delayMs); else done();
    }
    const native = {
      readText(request) { nativeCall('read', request, () => files.has(request.uri) ? request.success({ text: files.get(request.uri) }) : request.fail('', 301)); },
      writeText(request) { nativeCall('write', request, () => { files.set(request.uri, request.text); request.success(); }); },
    };
    const appDef = ux('src/local-app.ux', {
      ownerLib, storageLib, profile: { mode: 'local-session', storageQualified: true, storageBackend: 'file' },
      Date: { now: () => wallMs }, Math: fixedMath, Number, String,
      require(name) { assert.equal(name, '@system.file'); return native; },
    });
    appDef.onCreate(); const app = { $def: appDef, exit() { appDef.onDestroy(); } };
    const definition = ux('src/pages/LocalSession/index.ux', {
      domainLib, presentationLib, flowLib, profile: { versionName: 'measurement' },
      Promise, Array, Object, Number, String, Math: fixedMath,
      setTimeout, clearTimeout, Date: { now: () => wallMs },
      setInterval(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
      clearInterval(id) { timers.delete(id); },
    });
    const page = Object.assign({}, definition, { $app: app });
    Object.entries(definition.private).forEach(([key, initial]) => {
      let value = initial;
      Object.defineProperty(page, key, { enumerable: true, configurable: true, get: () => value, set(next) {
        if (active) {
          active.reactive.assignments++;
          if (value !== next) active.reactive.changedAssignments++;
          active.reactive.fields[key] = (active.reactive.fields[key] || 0) + 1;
          if (key === 'busy' && next === true && active.firstBusyMs === null) active.firstBusyMs = performance.now() - active.started;
          if (key === 'view') active.lastViewAssignmentMs = performance.now() - active.started;
        }
        value = next;
      } });
    });
    ['refresh', 'safeRefresh', 'refreshTimer', 'safeRefreshTimer', 'updateDiagnostic'].forEach(key => {
      if (typeof page[key] === 'function') page[key] = wrapped(`page.${key}`, page[key]);
    });
    page.onInit();
    return { page, owner: appDef.getLocalOwner(), files, calls,
      next(ms) { wallMs += ms; }, tick() { timers.forEach(callback => callback()); },
      close() { page.onDestroy(); appDef.onDestroy(); } };
  }
  async function measure(name, task) {
    assert.equal(active, null, 'measurements cannot overlap');
    const record = { name, started: performance.now(), firstBusyMs: null, lastViewAssignmentMs: null, confirmations: [],
      functions: {}, native: [], json: { parse: { calls: 0, bytes: 0, totalMs: 0 }, stringify: { calls: 0, bytes: 0, totalMs: 0 } },
      reactive: { assignments: 0, changedAssignments: 0, fields: {} } };
    active = record;
    try { await task(); } finally { record.elapsedMs = performance.now() - record.started; active = null; }
    delete record.started;
    record.nativeCounts = { reads: record.native.filter(call => call.kind === 'read').length, writes: record.native.filter(call => call.kind === 'write').length };
    record.nativeStageMs = {};
    record.native.forEach(call => { record.nativeStageMs[call.stage] = (record.nativeStageMs[call.stage] || 0) + call.elapsedMs; });
    record.nativeTotalMs = record.native.reduce((total, call) => total + call.elapsedMs, 0);
    record.nonNativeResidualMs = Math.max(0, record.elapsedMs - record.nativeTotalMs);
    Object.values(record.functions).forEach(metric => { metric.totalMs = round(metric.totalMs); });
    Object.values(record.json).forEach(metric => { metric.totalMs = round(metric.totalMs); });
    Object.keys(record.nativeStageMs).forEach(key => { record.nativeStageMs[key] = round(record.nativeStageMs[key]); });
    record.native.forEach(call => { call.elapsedMs = round(call.elapsedMs); });
    ['elapsedMs', 'firstBusyMs', 'lastViewAssignmentMs', 'nativeTotalMs', 'nonNativeResidualMs'].forEach(key => { if (record[key] !== null) record[key] = round(record[key]); });
    return record;
  }
  async function scenario(seedPending, tickCount) {
    const rig = createRig(seedPending);
    try {
      await rig.page.onShow();
      const pendingBefore = plain(rig.owner.snapshot().document && rig.owner.snapshot().document.pending || []);
      const start = await measure(seedPending ? 'START_AFTER_PENDING' : 'START_EMPTY', () => rig.page.confirmStart());
      assert.equal(rig.owner.snapshot().document.state, 'FOCUS');
      assert.equal(rig.owner.snapshot().document.counter, seedPending ? 2 : 1);
      assert.deepEqual(plain(rig.owner.snapshot().document.pending), pendingBefore);
      const id = rig.owner.snapshot().document.active.id;
      const ticks = await measure('FOREGROUND_TICKS', () => {
        for (let index = 0; index < tickCount; index++) { rig.next(1000); rig.tick(); }
      });
      ticks.tickCount = tickCount;
      assert.equal(ticks.nativeCounts.reads + ticks.nativeCounts.writes, 0);
      rig.page.openBreakPicker();
      const pause = await measure('BREAK', () => rig.page.beginBreak(5));
      assert.equal(rig.owner.snapshot().document.state, 'BREAK');
      rig.next(360000); rig.tick();
      assert.equal(rig.owner.snapshot().document.state, 'BREAK', 'expiry does not resume');
      const resume = await measure('RESUME', () => rig.page.resume());
      assert.equal(rig.owner.snapshot().document.state, 'FOCUS');
      rig.next(1000); rig.page.showFinish();
      const finish = await measure('FINISH', () => rig.page.finishSession());
      const saved = rig.owner.snapshot().document;
      assert.equal(saved.state, 'FINISHED_PENDING_SYNC');
      assert.equal(saved.pending.length, pendingBefore.length + 1);
      assert.equal(saved.pending[saved.pending.length - 1].id, id);
      assert.equal(saved.pending[saved.pending.length - 1].endPage, null);
      assert.deepEqual(plain(saved.pending.slice(0, -1)), pendingBefore);
      assert.equal(saved.counter, seedPending ? 2 : 1);
      return { seedPending, operations: [start, pause, resume, finish], ticks,
        preservation: { previousPendingCount: pendingBefore.length, previousPendingUnchanged: true, oneNewStableSession: true, nullableEndPage: true, breakDoesNotAutoResume: true } };
    } finally { rig.close(); }
  }
  return { scenario };
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
  return round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
}
async function benchmark(options = {}) {
  const samples = options.samples === undefined ? 3 : options.samples;
  const tickCount = options.tickCount === undefined ? 60 : options.tickCount;
  const delayMs = options.delayMs === undefined ? 20 : options.delayMs;
  assert.ok(Number.isSafeInteger(samples) && samples > 0 && samples <= 10);
  assert.ok(Number.isSafeInteger(tickCount) && tickCount > 0 && tickCount <= 1000);
  assert.ok(Number.isSafeInteger(delayMs) && delayMs >= 0 && delayMs <= 100);
  const measurement = createMeasurement({ ...options, delayMs }); const runs = [];
  for (let index = 0; index < samples; index++) {
    for (const seedPending of [false, true]) runs.push({ sample: index + 1, ...await measurement.scenario(seedPending, tickCount) });
  }
  const names = ['START_EMPTY', 'START_AFTER_PENDING', 'BREAK', 'RESUME', 'FINISH'];
  const summary = names.map(name => {
    const records = runs.flatMap(run => run.operations).filter(record => record.name === name);
    return { name, samples: records.length, elapsedMedianMs: median(records.map(record => record.elapsedMs)),
      busyAssignmentMedianMs: median(records.map(record => record.firstBusyMs === null ? record.elapsedMs : record.firstBusyMs)),
      nativeCounts: records[0].nativeCounts, nativeTotalMedianMs: median(records.map(record => record.nativeTotalMs)),
      nonNativeResidualMedianMs: median(records.map(record => record.nonNativeResidualMs)),
      reactiveAssignmentsMedian: median(records.map(record => record.reactive.assignments)),
      jsonCallsMedian: median(records.map(record => record.json.parse.calls + record.json.stringify.calls)) };
  });
  return { environment: 'NODE_CONTROLLED', node: process.version, platform: process.platform, sourceRef: options.ref || 'WORKTREE',
    modeledFileCallbackDelayMs: delayMs, samples, tickCount,
    limitations: ['File callback delays are modeled, not measured on 9 Pro.', 'Busy timing is a reactive property assignment, not the first painted frame.',
      'Inclusive function measurements overlap; they must not be added together.', 'Instrumentation overhead affects CPU values.',
      'Native residual includes callback scheduling and other work; it is not pure CPU time.', 'No device installation, data read or user session is performed.'],
    summary, tickSummary: { samples: runs.length, tickCountPerSample: tickCount,
      elapsedMedianMs: median(runs.map(run => run.ticks.elapsedMs)),
      reactiveAssignmentsMedian: median(runs.map(run => run.ticks.reactive.assignments)),
      jsonCallsMedian: median(runs.map(run => run.ticks.json.parse.calls + run.ticks.json.stringify.calls)),
      nativeCalls: 0 }, runs };
}

if (require.main === module) {
  const args = process.argv.slice(2); const options = {}; let output = null;
  for (let index = 0; index < args.length; index++) {
    const key = args[index]; const value = args[++index];
    if (key === '--ref') options.ref = value === 'baseline' ? BASELINE : value;
    else if (key === '--delay-ms') options.delayMs = Number(value);
    else if (key === '--samples') options.samples = Number(value);
    else if (key === '--tick-count') options.tickCount = Number(value);
    else if (key === '--output') output = path.resolve(value);
    else throw new Error('UNKNOWN_MEASURE_ARGUMENT');
  }
  benchmark(options).then(result => {
    const text = JSON.stringify(result, null, 2) + '\n';
    if (output) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, text); }
    process.stdout.write(JSON.stringify({ environment: result.environment, sourceRef: result.sourceRef,
      modeledFileCallbackDelayMs: result.modeledFileCallbackDelayMs, summary: result.summary, tickSummary: result.tickSummary, output }, null, 2) + '\n');
  }, error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
}
module.exports = { benchmark, createMeasurement, BASELINE };

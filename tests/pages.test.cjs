const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDemo } = require('../src/lib/demo');
const { createDemoCompanion } = require('../src/lib/demo-companion');

// Runs actual UX scripts with injected app boundaries; this is not Vela rendering.
test('connection help identifies the actual build without requiring a working phone channel', () => {
  const h = createHarness('live');
  const page = h.page('Connection');
  page.onInit();
  assert.equal(page.versionText, 'Mirra 0.3.0 / 8');
  const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/Connection/index.ux'), 'utf8');
  assert.ok(source.includes('{{versionText}}'));
});

function createHarness(mode = 'demo') {
  const root = path.resolve(__dirname, '../src');
  let time = 100000;
  let nextHandle = 0;
  let starts = 0;
  let refreshes = 0;
  let platformLoads = 0;
  const intervals = new Map();
  const savedCallbacks = new Map();
  const routeActions = [];
  const modules = new Map();
  const listeners = new Set();
  const controlCalls = [];
  const demo = createDemo({ now: () => time });
  const model = mode === 'demo' ? createDemoCompanion({ demo, now: () => time }) : null;
  let liveInput = { mode: 'live', connection: 'connecting', freshness: 'unknown', body: null, timer: {}, lastSyncedAgeMs: null };
  const companion = {
    start() { starts += 1; if (model) model.start(); },
    stop() { if (model) model.stop(); },
    requestRefresh() { refreshes += 1; if (model) model.requestRefresh(); },
    snapshot() { return model ? model.snapshot() : liveInput; },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    select(id, options) { assert.ok(model); model.select(id, options); },
    submitControl(action, values, owner) { controlCalls.push({ action, values, owner }); return true; },
  };
  const router = {
    push(options) { routeActions.push({ action: 'push', uri: options.uri }); },
    back() { routeActions.push({ action: 'back' }); },
  };
  const context = vm.createContext({
    Date, setInterval(callback, delay) {
      const handle = nextHandle++;
      intervals.set(handle, { callback, delay });
      savedCallbacks.set(handle, callback);
      return handle;
    },
    clearInterval(handle) { intervals.delete(handle); },
  });
  function resolveImport(specifier, from) {
    if (specifier === '@system.router') return router;
    if (specifier === '@system.interconnect') { platformLoads += 1; throw new Error('Pages must observe the sole app-owned transport'); }
    if (!specifier.startsWith('.')) throw new Error('Unexpected platform import: ' + specifier);
    const filename = path.resolve(path.dirname(from), specifier + '.js');
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    new vm.Script('(function(module,exports,require){\n' + fs.readFileSync(filename, 'utf8') + '\n})', { filename })
      .runInContext(context)(module, module.exports, (value) => resolveImport(value, filename));
    return module.exports;
  }
  function page(name) {
    const filename = path.join(root, 'pages', name, 'index.ux');
    assert.ok(fs.existsSync(filename), name + ' must have an actual UX implementation');
    const source = fs.readFileSync(filename, 'utf8');
    const script = source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/);
    const imports = {};
    const transformed = script[1].replace(/^\s*import\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
      (_line, variable, specifier) => { imports[variable] = resolveImport(specifier, filename); return 'const ' + variable + ' = imports.' + variable; })
      .replace(/\bexport\s+default\s+/, 'module.exports = ');
    const module = { exports: {} };
    new vm.Script('(function(module,imports,require){\n' + transformed + '\n})', { filename })
      .runInContext(context)(module, imports, (specifier) => resolveImport(specifier, filename));
    const definition = module.exports;
    return Object.assign({}, definition, definition.private, { $app: { $def: { getCompanion: () => companion, getDemo: () => demo } } });
  }
  return {
    page, companion, demo, intervals, savedCallbacks, routeActions, listeners, controlCalls,
    starts: () => starts, refreshes: () => refreshes, platformLoads: () => platformLoads,
    setTime(value) { time = value; },
    setLive(value) { liveInput = value; for (const listener of Array.from(listeners)) listener(value); },
    tick() { for (const timer of Array.from(intervals.values())) timer.callback(); },
  };
}

test('live Home starts without demo, idle, or sample book and requests a read-only refresh', () => {
  const h = createHarness('live');
  const home = h.page('Home');
  home.onInit(); home.onShow();
  assert.equal(home.title, '正在连接');
  assert.equal(home.showDemo, false);
  assert.equal(home.bookTitle, '');
  assert.equal(home.hasTimer, false);
  home.retry();
  assert.equal(h.refreshes(), 1);
  home.onHide(); home.onDestroy();
  assert.equal(h.platformLoads(), 0);
});

function controllable(segmentType = 'FOCUS', patch = {}) {
  return { mode: 'live', connection: 'connected', freshness: 'fresh', body: {
    phase: 'ACTIVE', sessionId: 'session-now', segmentType, bookTitle: '观已阅读', firstAction: null,
    currentPage: 32, totalPages: 400, elapsedMs: 5000, remainingMs: 300000,
    timerKind: segmentType === 'BREAK' ? 'BREAK_REMAINING' : 'SESSION_ELAPSED',
    coverage: 'FULL', monitorAvailability: 'AVAILABLE', ...patch }, timer: {},
    control: { negotiated: true, availableActions: segmentType === 'BREAK' ? ['FINISH_BREAK'] : ['START_BREAK'], busy: false } };
}

test('wrist control page chooses only five or ten minutes and releases hidden-page operation ownership', () => {
  const h = createHarness('live'); h.setLive(controllable());
  const page = h.page('Control'); page.onInit(); page.onShow();
  page.startFiveMinuteBreak(); page.startTenMinuteBreak();
  assert.deepEqual(h.controlCalls.map(call => [call.action, call.values.breakMinutes]), [['START_BREAK', 5], ['START_BREAK', 10]]);
  assert.equal(h.controlCalls[0].owner, page);
  h.setLive({ ...controllable(), control: { negotiated: true, availableActions: [], busy: true } });
  page.startFiveMinuteBreak(); assert.equal(h.controlCalls.length, 2);
  page.onHide(); page.finishBreak(); page.confirmStart(); assert.equal(h.controlCalls.length, 2);
  assert.equal(h.listeners.size, 0); assert.equal(h.intervals.size, 0); page.onDestroy();
});

test('preparation page shows the complete action and start requires an explicit visible confirmation', () => {
  const h = createHarness('live'); const firstAction = '翻到第32页，阅读第一段。'.repeat(8);
  const input = controllable(null, { phase: 'PREPARING', sessionId: null, intentId: 'intent-current', firstAction });
  input.control.availableActions = ['CONFIRM_PREPARATION_AND_START']; h.setLive(input);
  const page = h.page('Control'); page.onInit(); page.onShow();
  assert.equal(h.controlCalls.length, 0); assert.equal(page.firstActionRows.join(''), firstAction);
  page.confirmStart(); assert.equal(h.controlCalls.length, 1);
  assert.equal(h.controlCalls[0].action, 'CONFIRM_PREPARATION_AND_START');
  h.setLive({ ...input, body: { ...input.body, firstActionTruncated: true } });
  page.confirmStart(); assert.equal(h.controlCalls.length, 1); page.onDestroy();
});

test('demo cannot use the control route or send learning mutations', () => {
  const h = createHarness(); h.companion.select('focus');
  const page = h.page('Control'); page.onInit(); page.onShow();
  page.startFiveMinuteBreak(); page.finishBreak(); page.confirmStart();
  assert.equal(h.controlCalls.length, 0); assert.deepEqual(h.routeActions, [{ action: 'back' }]);
  page.onDestroy(); assert.equal(h.platformLoads(), 0);
});

test('Home directs real controls to the confirmation route and read-only/demo never opens it', () => {
  const h = createHarness('live'); const home = h.page('Home'); home.onInit(); home.onShow();
  assert.equal(typeof home.openControl, 'function'); home.openControl(); assert.equal(h.routeActions.length, 0);
  h.setLive(controllable()); home.openControl(); assert.deepEqual(h.routeActions, [{ action: 'push', uri: '/pages/Control' }]);
  h.setLive({ ...controllable(), freshness: 'expired' }); home.openControl(); assert.equal(h.routeActions.length, 1);
  home.onDestroy();
});

test('Home hide/show/destroy own one visual ticker and no stale subscription', () => {
  const h = createHarness();
  h.companion.select('focus');
  const home = h.page('Home');
  home.onInit(); home.onShow(); home.onShow();
  assert.equal(h.intervals.size, 1);
  assert.equal(h.listeners.size, 1);
  assert.equal(h.starts(), 1);
  h.setTime(104000); h.tick();
  assert.equal(home.timerText, '00:04');
  home.onHide(); home.onHide();
  assert.equal(h.intervals.size, 0);
  assert.equal(h.listeners.size, 0);
  h.setTime(165000); h.savedCallbacks.get(0)();
  assert.equal(home.timerText, '00:04');
  home.onShow();
  assert.equal(home.timerText, '01:05');
  assert.equal(h.intervals.size, 1);
  assert.equal(h.listeners.size, 1);
  home.onDestroy(); home.onDestroy();
  assert.equal(h.intervals.size, 0);
  assert.equal(h.listeners.size, 0);
  h.setTime(170000); home.onShow();
  assert.equal(h.intervals.size, 0);
});

test('demo States preserves selection, break zero, and long titles across navigation', () => {
  const h = createHarness();
  const states = h.page('States');
  assert.ok(states.states.some((state) => state.id === 'saving'));
  states.selectState('recovery');
  assert.deepEqual(h.routeActions[0], { action: 'back' });
  const home = h.page('Home'); home.onInit(); home.onShow();
  assert.equal(home.title, '正在回到学习');
  home.onHide(); states.quickBreak(); home.onShow();
  assert.equal(home.timerText, '00:05');
  h.setTime(105000); h.tick();
  assert.equal(home.timerText, '00:00');
  assert.equal(home.title, '休息中');
  assert.equal(home.hint, '休息时间已到');
  h.setTime(120000); h.tick();
  assert.equal(home.timerText, '00:00');
  home.onHide(); states.longTitle(); home.onShow();
  assert.ok(Array.from(home.bookTitle).length <= 24);
  assert.ok(home.bookTitle.endsWith('…'));
  assert.equal(home.showDemo, true);
  home.onDestroy();
});

test('formal States route cannot select or reset demo facts', () => {
  const h = createHarness('live');
  const states = h.page('States');
  states.onInit();
  assert.deepEqual(h.routeActions, [{ action: 'back' }]);
  assert.equal(h.demo.snapshot().stateId, 'idle');
});

test('Detail and Connection observe the app store and release their own subscriptions', () => {
  const h = createHarness();
  h.companion.select('preparing', { firstAction: '翻到第 32 页' });
  const home = h.page('Home'); home.onInit(); home.onShow(); home.openDetail(); home.onHide();
  assert.deepEqual(h.routeActions[0], { action: 'push', uri: '/pages/Detail' });
  for (const name of ['Detail', 'Connection']) {
    const page = h.page(name); page.onInit(); page.onShow(); page.onShow();
    assert.equal(h.listeners.size, 1);
    assert.equal(h.intervals.size, 1);
    assert.equal(page.showDemo, true);
    if (name === 'Detail') {
      assert.equal(page.firstAction, '翻到第 32 页');
      page.openConnection();
      assert.equal(h.routeActions[h.routeActions.length - 1].uri, '/pages/Connection');
    } else {
      page.retry();
      assert.equal(h.refreshes(), 1);
    }
    page.onHide(); page.onDestroy();
    assert.equal(h.listeners.size, 0);
    assert.equal(h.intervals.size, 0);
  }
  assert.equal(h.platformLoads(), 0);
});

test('late callbacks cannot update hidden pages or call disconnected data fresh', () => {
  const h = createHarness('live');
  const home = h.page('Home'); home.onInit(); home.onShow();
  const listener = Array.from(h.listeners)[0];
  home.onHide();
  listener({ mode: 'live', connection: 'connected', freshness: 'fresh', body: { phase: 'IDLE' } });
  assert.equal(home.title, '正在连接');
  home.onShow();
  h.setLive({ mode: 'live', connection: 'disconnected', freshness: 'expired', body: null });
  assert.equal(home.title, '连接已中断');
  assert.equal(home.hasTimer, false);
  home.onDestroy();
});

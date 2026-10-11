const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Executes the actual UX scripts with injected platform boundaries. It does not
// render templates or emulate Vela layout, touch events, firmware, or native APIs.
function createHarness() {
  const root = path.resolve(__dirname, '..', 'src');
  let currentTime = 100000;
  let nextHandle = 0;
  let platformLoads = 0;
  let sentCommands = 0;
  const activeIntervals = new Map();
  const activeTimeouts = new Map();
  const savedCallbacks = new Map();
  const clearedIntervals = [];
  const clearedTimeouts = [];
  const routeActions = [];
  const queries = [];
  const modules = new Map();

  function schedule(active, callback, delay) {
    const handle = nextHandle++;
    active.set(handle, { callback, delay });
    savedCallbacks.set(handle, callback);
    return handle;
  }

  const transport = {
    getReadyState(options) { queries.push(options); },
    send() { sentCommands += 1; },
    sendData() { sentCommands += 1; },
    open() { throw new Error('Read-only page must not open the transport'); },
    close() { throw new Error('Read-only page must not close the transport'); },
  };
  const platform = {
    instance() { return transport; },
    send() { sentCommands += 1; },
  };
  const router = {
    push(options) { routeActions.push({ action: 'push', uri: options.uri }); },
    back() { routeActions.push({ action: 'back' }); },
  };
  const context = vm.createContext({
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [currentTime])); }
      static now() { return currentTime; }
    },
    setInterval(callback, delay) { return schedule(activeIntervals, callback, delay); },
    clearInterval(handle) {
      activeIntervals.delete(handle);
      clearedIntervals.push(handle);
    },
    setTimeout(callback, delay) { return schedule(activeTimeouts, callback, delay); },
    clearTimeout(handle) {
      activeTimeouts.delete(handle);
      clearedTimeouts.push(handle);
    },
  });

  function loadModule(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const source = fs.readFileSync(filename, 'utf8');
    const execute = new vm.Script(`(function (module, exports, require) {\n${source}\n})`, {
      filename,
    }).runInContext(context);
    execute(module, module.exports, (specifier) => resolveImport(specifier, filename));
    return module.exports;
  }

  function resolveImport(specifier, from) {
    if (specifier === '@system.router') return router;
    if (specifier === '@system.interconnect') {
      platformLoads += 1;
      return platform;
    }
    if (!specifier.startsWith('.')) {
      throw new Error(`Unexpected platform import: ${specifier}`);
    }
    return loadModule(path.resolve(path.dirname(from), specifier + '.js'));
  }

  function loadUx(relative) {
    const filename = path.join(root, relative);
    const source = fs.readFileSync(filename, 'utf8');
    const script = source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/);
    assert.ok(script, `${relative} has a script to execute`);
    const imports = {};
    let transformed = script[1].replace(
      /^\s*import\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
      (_line, name, specifier) => {
        imports[name] = resolveImport(specifier, filename);
        return `const ${name} = imports.${name}`;
      },
    );
    transformed = transformed.replace(/\bexport\s+default\s+/, 'module.exports = ');
    const module = { exports: {} };
    const execute = new vm.Script(`(function (module, imports, require) {\n${transformed}\n})`, {
      filename,
    }).runInContext(context);
    execute(module, imports, (specifier) => resolveImport(specifier, filename));
    return module.exports;
  }

  const app = loadUx('app.ux');
  app.onCreate();

  function page(name) {
    const definition = loadUx(path.join('pages', name, 'index.ux'));
    // Vela exposes private data on the page instance. Lifecycle hooks themselves
    // remain the original functions extracted from the corresponding UX file.
    return Object.assign({}, definition, definition.private, { $app: { $def: app } });
  }

  return {
    app,
    page,
    transport,
    queries,
    routeActions,
    activeIntervals,
    activeTimeouts,
    savedCallbacks,
    clearedIntervals,
    clearedTimeouts,
    platformLoads: () => platformLoads,
    sentCommands: () => sentCommands,
    setTime(value) { currentTime = value; },
    tickIntervals() {
      for (const timer of Array.from(activeIntervals.values())) timer.callback();
    },
  };
}

test('app startup owns one idle demo and a new startup resets only simulation', () => {
  const harness = createHarness();
  const demo = harness.app.getDemo();
  assert.equal(demo.snapshot().stateId, 'idle');
  assert.equal(harness.app.getDemo(), demo);
  demo.select('focus');
  assert.equal(createHarness().app.getDemo().snapshot().stateId, 'idle');
  assert.equal(demo.snapshot().stateId, 'focus');
});

test('Home hide, show, and destroy own one interval and restore anchored time', () => {
  const h = createHarness();
  h.app.getDemo().select('focus');
  const home = h.page('Home');
  home.onInit();
  home.onShow();
  home.onShow();
  assert.equal(h.activeIntervals.size, 1);
  assert.equal(h.activeIntervals.get(0).delay, 1000);
  h.setTime(104000);
  h.tickIntervals();
  assert.equal(home.timerText, '00:04');

  home.onHide();
  home.onHide();
  assert.deepEqual(h.clearedIntervals, [0]);
  assert.equal(h.activeIntervals.size, 0);
  h.setTime(165000);
  h.savedCallbacks.get(0)();
  assert.equal(home.timerText, '00:04');
  home.onShow();
  assert.equal(home.timerText, '01:05');
  assert.equal(h.activeIntervals.size, 1);
  h.savedCallbacks.get(0)();
  assert.equal(home.timerText, '01:05');

  home.onDestroy();
  home.onDestroy();
  assert.equal(h.activeIntervals.size, 0);
  h.setTime(170000);
  h.savedCallbacks.get(1)();
  home.onShow();
  assert.equal(home.timerText, '01:05');
  assert.equal(h.activeIntervals.size, 0);

  const returningHome = h.page('Home');
  returningHome.onInit();
  returningHome.onShow();
  assert.equal(returningHome.stateId, 'focus');
  assert.equal(returningHome.timerText, '01:10');
  assert.equal(h.activeIntervals.size, 1);
  returningHome.onDestroy();
});

test('States selection returns through the router and preserves the app demo', () => {
  const h = createHarness();
  const home = h.page('Home');
  home.onInit();
  home.onShow();
  const demo = h.app.getDemo();
  home.openStates();
  home.onHide();
  const states = h.page('States');
  assert.deepEqual(Array.from(states.states, (state) => state.id), [
    'idle', 'preparing', 'focus', 'break', 'recovery', 'unmonitored', 'disconnected',
  ]);
  states.selectState('recovery');
  assert.deepEqual(h.routeActions, [
    { action: 'push', uri: '/pages/States' }, { action: 'back' },
  ]);
  assert.equal(h.app.getDemo(), demo);
  home.onShow();
  assert.equal(home.stateId, 'recovery');
  assert.match(home.message, /不计.*有效专注/);
  h.setTime(103000);
  states.back();
  home.onRefresh();
  assert.equal(home.stateId, 'recovery');
  assert.equal(home.timerText, '00:03');
  home.onDestroy();
});

test('Home preparation action enters simulated focus and reset restarts its anchor', () => {
  const h = createHarness();
  const states = h.page('States');
  states.selectState('preparing');
  const home = h.page('Home');
  home.onInit();
  home.onShow();
  assert.equal(home.canAct, true);
  assert.equal(home.hasTimer, false);
  h.setTime(180000);
  home.act();
  assert.equal(home.stateId, 'focus');
  assert.equal(home.timerText, '00:00');
  h.setTime(184000);
  h.tickIntervals();
  assert.equal(home.timerText, '00:04');
  home.act();
  assert.equal(home.stateId, 'focus');
  assert.equal(home.timerText, '00:00');
  assert.equal(h.sentCommands(), 0);
  home.onDestroy();
});

test('States quickBreak reaches zero on Home and stays in break until reset', () => {
  const h = createHarness();
  h.page('States').quickBreak();
  const home = h.page('Home');
  home.onInit();
  home.onShow();
  assert.equal(home.stateId, 'break');
  assert.equal(home.timerText, '00:05');
  h.setTime(104999);
  h.tickIntervals();
  assert.equal(home.timerText, '00:01');
  h.setTime(105000);
  h.tickIntervals();
  assert.equal(home.timerText, '00:00');
  h.setTime(120000);
  h.tickIntervals();
  assert.equal(home.stateId, 'break');
  assert.equal(home.timerText, '00:00');
  home.act();
  assert.equal(home.timerText, '00:05');
  assert.equal(h.sentCommands(), 0);
  home.onDestroy();
});

test('States long-title action reaches Home with bounded simulated book text', () => {
  const h = createHarness();
  h.page('States').longTitle();
  const home = h.page('Home');
  home.onInit();
  assert.equal(home.stateId, 'focus');
  assert.ok(home.bookTitle.length <= 24);
  assert.ok(home.bookTitle.endsWith('…'));
  assert.equal(h.routeActions[0].action, 'back');
  home.onDestroy();
});

test('Connection hide disposes callbacks and show reprobes without sending', () => {
  const h = createHarness();
  const home = h.page('Home');
  home.onInit();
  home.openConnection();
  assert.deepEqual(h.routeActions[0], { action: 'push', uri: '/pages/Connection' });

  const connection = h.page('Connection');
  connection.onInit();
  assert.equal(h.platformLoads(), 0);
  connection.onShow();
  assert.equal(h.platformLoads(), 1);
  assert.equal(h.queries.length, 1);
  assert.equal(h.activeTimeouts.size, 1);
  const firstQuery = h.queries[0];
  const firstOpen = h.transport.onopen;
  const firstTimer = Array.from(h.activeTimeouts.keys())[0];
  const waitingTitle = connection.title;
  connection.onHide();
  assert.equal(h.activeTimeouts.size, 0);
  assert.equal(h.transport.onopen, undefined);
  assert.equal(h.transport.onclose, undefined);
  assert.equal(h.transport.onerror, undefined);
  h.savedCallbacks.get(firstTimer)();
  firstQuery.success({ status: 1 });
  firstOpen();
  assert.equal(connection.title, waitingTitle);

  connection.onShow();
  assert.equal(h.platformLoads(), 2);
  assert.equal(h.queries.length, 2);
  assert.equal(h.activeTimeouts.size, 1);
  const freshTitle = connection.title;
  firstQuery.success({ status: 2 });
  firstOpen();
  assert.equal(connection.title, freshTitle);
  h.queries[1].success({ status: 2 });
  assert.match(connection.title, /未连接/);
  assert.equal(h.activeTimeouts.size, 0);
  assert.match(connection.detail, /独立演示签名未接入正式 Mirra/);
  assert.equal(h.sentCommands(), 0);
  connection.back();
  assert.equal(h.routeActions[1].action, 'back');
  connection.onDestroy();
  assert.equal(h.transport.onopen, undefined);
  home.onDestroy();
});

test('Connection manual reprobe cancels the old query and destroy blocks late updates', () => {
  const h = createHarness();
  const connection = h.page('Connection');
  connection.onInit();
  connection.onShow();
  const firstTimer = Array.from(h.activeTimeouts.keys())[0];
  connection.probe();
  assert.ok(h.clearedTimeouts.includes(firstTimer));
  assert.equal(h.activeTimeouts.size, 1);
  assert.equal(h.platformLoads(), 2);
  h.queries[0].success({ status: 1 });
  assert.match(connection.title, /查询/);
  const lastQuery = h.queries[1];
  const lastOpen = h.transport.onopen;
  const lastTimer = Array.from(h.activeTimeouts.keys())[0];
  const titleBeforeDestroy = connection.title;
  connection.onDestroy();
  connection.onDestroy();
  assert.equal(h.activeTimeouts.size, 0);
  lastQuery.success({ status: 1 });
  lastOpen();
  h.savedCallbacks.get(lastTimer)();
  assert.equal(connection.title, titleBeforeDestroy);
  assert.equal(h.sentCommands(), 0);
});

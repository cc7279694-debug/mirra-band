const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const domainLib = require('../src/lib/local-session');
const presentationLib = require('../src/lib/local-presentation');
const flowLib = require('../src/lib/local-ui-flow');
const { rig, start } = require('./fixtures/local-ui-rig.cjs');

const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/LocalSession/index.ux'), 'utf8');
const template = source.match(/<template>([\s\S]*?)<\/template>/)[1];
const script = source.match(/<script>([\s\S]*?)<\/script>/)[1]
  .replace(/^import .+$/gm, '').replace(/\bexport\s+default\s+/, 'module.exports = ');

// A property-descriptor boundary, unlike the old Object.assign page harness.
// It deliberately admits only primitive fields or flat repeat arrays. This is
// a compatibility contract test, not an emulation of a device's renderer.
function harness(options = {}) {
  const r = options.r || rig(); const timers = new Map(); const assignments = [];
  let nextTimer = 0;
  const module = { exports: {} };
  vm.runInNewContext(script, { module, domainLib, presentationLib: options.presentation || presentationLib,
    flowLib: options.flow || flowLib, profile: { versionName: '0.1.4' }, Promise, Array, Object, Number, String, Math, JSON,
    setInterval(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearInterval(id) { timers.delete(id); } });
  const data = {};
  const page = Object.assign({}, module.exports, { $app: { $def: { getLocalOwner: () => r.owner }, exit() {} } });
  for (const [key, initial] of Object.entries(module.exports.private)) {
    data[key] = Array.isArray(initial) ? [] : initial;
    Object.defineProperty(page, key, { enumerable: true, configurable: true,
      get() { return data[key]; },
      set(value) {
        assert.ok(value === null || typeof value !== 'object' || Array.isArray(value), key + ' must not hand an object graph to the native observer');
        if (Array.isArray(value)) for (const row of value) {
          if (row && typeof row === 'object') for (const cell of Object.values(row)) {
            assert.ok(cell === null || typeof cell !== 'object', key + ' repeat rows must stay flat');
          }
        }
        data[key] = value; assignments.push(key);
      } });
  }
  page.onInit();
  return { r, page, data, assignments, timers, tick() { for (const callback of timers.values()) callback(); },
    cleanup() { page.onDestroy(); r.realOwner.close(); } };
}

test('native main bindings use declared primitive fields and flat arrays', () => {
  const module = { exports: {} };
  vm.runInNewContext(script, { module, domainLib, presentationLib, flowLib, profile: {} });
  assert.doesNotMatch(template, /\bvm\.|_projection|viewModel/);
  assert.equal(Object.hasOwn(module.exports.private, 'vm'), false);
  for (const [key, value] of Object.entries(module.exports.private)) {
    assert.ok(value === null || typeof value !== 'object' || Array.isArray(value), key);
  }
  for (const binding of template.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    assert.doesNotMatch(binding[1], /(?:timer|notice|primary|secondary|details|preview)\./);
  }
});

test('descriptor setters receive reading timer and a read-only Details tap without writes', async () => {
  const r = rig(); await start(r); const h = harness({ r });
  try {
    await h.page.onShow(); const writes = r.writes.length;
    assert.equal(h.page.view, 'READING');
    r.next(65000); h.tick();
    assert.equal(h.page.timerText, '01:05');
    assert.equal(typeof Object.getOwnPropertyDescriptor(h.page, 'timerText').set, 'function');
    assert.ok(h.assignments.includes('timerText'));
    h.page.showDetails();
    assert.equal(h.page.view, 'DETAILS'); assert.equal(h.page.tapCount, 1);
    assert.match(h.page.diagnosticText, /showDetails/);
    assert.equal(r.writes.length, writes);
  } finally { h.cleanup(); }
});

test('unknown time remains a visible placeholder through direct Details navigation and reentry', async () => {
  const r = rig(); await start(r); const h = harness({ r });
  try {
    await h.page.onShow(); r.next(domainLib.MAX_OBSERVED_GAP_MS + 1); h.tick();
    const writes = r.writes.length;
    assert.equal(h.page.timerText, '--:--'); assert.equal(h.page.timerQualifier, '时间待核对');
    h.page.showDetails(); h.page.backView();
    assert.equal(h.page.timerText, '--:--');
    h.page.onHide(); await h.page.onShow();
    assert.equal(h.page.timerText, '--:--'); assert.equal(r.writes.length, writes);
  } finally { h.cleanup(); }
});

test('projection failures are observable using a fixed code and can recover without writes', async () => {
  let fail = false;
  const presentation = { presentLocal(...args) {
    if (fail) throw new Error('private path and device fact must never appear');
    return presentationLib.presentLocal(...args);
  } };
  const h = harness({ presentation });
  try {
    await h.page.onShow(); const writes = h.r.writes.length;
    fail = true; h.tick();
    assert.equal(h.page.refreshError, 'UI_REFRESH');
    assert.equal(h.page.timerText, '--:--');
    assert.match(h.page.diagnosticText, /UI_REFRESH/);
    assert.doesNotMatch(JSON.stringify(h.data), /private path|device fact/);
    h.page.confirmStart(); assert.equal(h.r.writes.length, writes, 'failed refresh cannot dispatch from the old preview');
    h.page.showDetails(); assert.equal(h.page.tapCount, 2); assert.equal(h.page.view, 'DETAILS');
    fail = false; h.tick();
    assert.equal(h.page.refreshError, ''); assert.equal(h.page.view, 'DETAILS');
    assert.equal(h.r.writes.length, writes);
  } finally { h.cleanup(); }
});

test('persistent projection failure still permits Details and current-flow Back without any write', async () => {
  const r = rig(); await start(r); let fail = false;
  const presentation = { presentLocal(...args) {
    if (fail) throw new Error('private persistent renderer detail');
    return presentationLib.presentLocal(...args);
  } };
  const h = harness({ r, presentation });
  try {
    await h.page.onShow(); const writes = r.writes.length;
    fail = true; h.tick();
    h.page.showDetails(); assert.equal(h.page.view, 'DETAILS');
    assert.equal(h.page.refreshError, 'UI_REFRESH'); assert.equal(h.page.primaryEnabled, false);
    assert.equal(h.page.onBackPress(), true); assert.equal(h.page.view, 'READING');
    h.page.showDetails(); assert.equal(h.page.view, 'DETAILS');
    h.page.backView(); h.page.showFinish(); h.page.finishSession();
    assert.equal(h.page.refreshError, 'UI_REFRESH'); assert.equal(r.writes.length, writes);
    assert.doesNotMatch(JSON.stringify(h.data), /private persistent renderer detail/);
  } finally { h.cleanup(); }
});

test('initial owner access failure leaves an observable safe local page', async () => {
  const badFlow = { createLocalUiFlow() { throw new Error('raw init detail'); } };
  const h = harness({ flow: badFlow });
  try {
    await h.page.onShow();
    assert.equal(h.page.refreshError, 'UI_INIT'); assert.equal(h.page.canWrite, false);
    assert.match(h.page.diagnosticText, /UI_INIT/);
    assert.doesNotMatch(JSON.stringify(h.data), /raw init detail/);
    assert.equal(h.r.writes.length, 0);
    h.page.showDetails(); assert.equal(h.page.view, 'DETAILS');
    assert.match(h.page.diagnosticRefresh, /UI_INIT/);
  } finally { h.cleanup(); }
});

test('show failures record a fixed lifecycle code without raw exception facts', async () => {
  let attempts = 0;
  const flow = { createLocalUiFlow(options) {
    const actual = flowLib.createLocalUiFlow(options);
    return Object.assign({}, actual, { show() {
      if (++attempts === 1) throw new Error('private lifecycle fact');
      return actual.show();
    } });
  } };
  const h = harness({ flow });
  try {
    await h.page.onShow();
    assert.equal(h.page.showCount, 1); assert.equal(h.page.refreshError, 'UI_SHOW');
    assert.match(h.page.diagnosticLifecycle, /VISIBLE/);
    assert.match(h.page.diagnosticRefresh, /UI_SHOW/);
    assert.doesNotMatch(JSON.stringify(h.data), /private lifecycle fact/);
    h.tick();
    assert.equal(h.page.refreshError, 'UI_SHOW'); assert.equal(h.page.canWrite, false);
    h.page.showDetails(); assert.equal(h.page.view, 'DETAILS');
    h.page.confirmStart(); assert.equal(h.r.writes.length, 0);
    assert.equal(h.page.refreshError, 'UI_SHOW');
    h.page.onHide(); await h.page.onShow();
    assert.equal(h.page.refreshError, ''); assert.equal(h.page.view, 'READY'); assert.equal(h.page.canWrite, true);
    assert.equal(h.page.showCount, 2); assert.equal(h.r.writes.length, 0);
  } finally { h.cleanup(); }
});

test('delayed owner reading stays non-actionable and publishes flat fields only after readback', async () => {
  const r = rig(); const open = r.owner.open; let release;
  const gate = new Promise(resolve => { release = resolve; });
  r.owner.open = async () => { await gate; return open(); };
  const h = harness({ r });
  try {
    const showing = h.page.onShow();
    assert.equal(h.page.view, 'STORAGE_NOTICE'); assert.equal(h.page.primaryEnabled, false);
    h.page.showDetails(); assert.equal(h.page.tapCount, 1); assert.equal(r.writes.length, 0);
    release(); await showing;
    assert.equal(h.page.view, 'READY'); assert.equal(h.page.primaryEnabled, true);
    assert.equal(r.writes.length, 0);
  } finally { release(); h.cleanup(); }
});

for (const field of ['actionRows', 'actionChoices']) {
  test('native repeat assignment retries ' + field + ' before enabling a changed visible preview', async () => {
    const h = harness();
    try {
      await h.page.onShow();
      const before = JSON.stringify(h.page[field]);
      const property = Object.getOwnPropertyDescriptor(h.page, field);
      let failed = false;
      Object.defineProperty(h.page, field, Object.assign({}, property, { set(value) {
        if (!failed && JSON.stringify(value) !== before) {
          failed = true;
          throw new Error('private transient native setter detail');
        }
        property.set.call(this, value);
      } }));
      const book = domainLib.TEST_BOOKS.find(item => item.id === 'test-long-title');
      h.page.showBooks(); h.page.selectBook(book.id); h.tick();
      assert.equal(failed, true);
      assert.equal(h.page.actionRows.join(''), book.firstActions[0].text);
      assert.equal(JSON.stringify(h.page.actionChoices.map(item => ({ id: item.id, text: item.text }))),
        JSON.stringify(h.page._projection.actionChoices.map(item => ({ id: item.id, text: item.text }))));
      assert.equal(h.page.refreshError, ''); assert.equal(h.page.primaryEnabled, true);
      assert.equal(h.r.writes.length, 0, 'changing the preview and retrying rendering cannot write a Session');
      assert.doesNotMatch(JSON.stringify(h.data), /private transient native setter detail/);
      await h.page.confirmStart();
      assert.equal(h.r.realOwner.snapshot().document.active.bookSnapshot.id, book.id);
      assert.equal(h.r.realOwner.snapshot().document.active.firstActionSnapshot.text, h.page.actionRows.join(''));
    } finally { h.cleanup(); }
  });
}

test('light theme preserves a visible reading budget and a 40-unit Details/back target', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../src/common/local-theme.css'), 'utf8');
  const rules = {};
  for (const match of css.matchAll(/\.([\w-]+)\s*\{([^}]+)\}/g)) {
    rules[match[1]] = Object.fromEntries(match[2].split(';').filter(value => value.trim()).map(value => value.trim().split(/:\s*/)));
  }
  assert.equal(rules.page['background-color'], '#FFFFFF');
  assert.equal(rules.button['background-color'], '#386FBE');
  assert.equal(rules['button-label'].color, '#FFFFFF');
  assert.ok(parseFloat(rules['light-button'].width) >= 40);
  assert.ok(parseFloat(rules['light-button'].height) >= 40);
  const sum = names => names.reduce((total, name) => total + parseFloat(rules[name].height) + parseFloat(rules[name]['margin-top'] || 0), 0);
  assert.ok(sum(['toolbar', 'timer-book', 'timer-hero', 'timer-status', 'split-actions']) <= 208);
  assert.ok(sum(['editor-toolbar', 'page-value', 'page-error', 'key-row', 'key-row', 'key-row', 'key-row']) <= 208);
  const card = rules['first-action-card'];
  assert.ok(parseFloat(card.height) - 2 * parseFloat(card['border-width']) >= parseFloat(rules['first-action-heading'].height) + parseFloat(rules['first-action-text'].height));
  const innerWidth = parseFloat(card.width) - 2 * parseFloat(card['border-width']) - parseFloat(card['padding-left']) - parseFloat(card['padding-right']);
  assert.ok(innerWidth >= parseFloat(rules['first-action-heading'].width));
  assert.ok(innerWidth >= parseFloat(rules['first-action-text'].width));
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'src/pages/ClickProbe/index.ux');
const appPath = path.join(root, 'src/click-probe-app.ux');
const cssPath = path.join(root, 'src/common/click-probe.css');

function readRequired(filename) {
  assert.ok(fs.existsSync(filename), 'The isolated click probe must provide ' + path.relative(root, filename));
  return fs.readFileSync(filename, 'utf8');
}

function definition(source, boundary) {
  const match = source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(match, 'The probe must expose its actual Vela script');
  const module = { exports: {} };
  vm.runInNewContext(match[1].replace(/\bexport\s+default\s+/, 'module.exports = '), { module, ...boundary });
  return module.exports;
}

// Execute the actual page script. The controlled interval is a native boundary,
// not a rendered page or evidence of delivery of events by the Vela engine.
function harness() {
  const active = new Map();
  const callbacks = [];
  let nextId = 1;
  const forbidden = new Proxy({}, { get() { throw new Error('CLICK_PROBE_MUST_NOT_ACCESS_APP_SERVICES'); } });
  const pageDef = definition(readRequired(pagePath), {
    setInterval(callback, delay) {
      assert.equal(delay, 1000);
      const id = nextId++;
      active.set(id, callback);
      callbacks.push(callback);
      return id;
    },
    clearInterval(id) { active.delete(id); },
  });
  const page = Object.assign({}, pageDef, pageDef.private, { $app: forbidden });
  return {
    page, pageDef, active, callbacks,
    tick() { for (const callback of Array.from(active.values())) callback(); },
  };
}

test('isolated app lifecycle does not instantiate an owner or access native services', () => {
  const app = definition(readRequired(appPath), {});
  app.onCreate();
  assert.equal(app.phase, 'CREATED');
  app.onDestroy();
  assert.equal(app.phase, 'DESTROYED');
  assert.equal(Object.keys(app).some(key => /owner|probe|storage|interconnect/i.test(key)), false);
});

test('initial page state exposes only primitive fields and creates no refresh timer', () => {
  const h = harness();
  for (const value of Object.values(h.pageDef.private)) {
    assert.ok(['string', 'number', 'boolean'].includes(typeof value), 'Reactive probe state must be primitive');
  }
  h.page.onInit();
  assert.equal(h.page.phase, 'INIT');
  assert.equal(h.page.viewMode, 'HOME');
  assert.equal(h.page.clickText, '点按 0');
  assert.equal(h.page.foregroundTicks, 0);
  assert.equal(h.active.size, 0);
});

test('show announces its lifecycle phase and keeps exactly one foreground refresh timer', () => {
  const h = harness();
  h.page.onInit();
  h.page.onShow();
  h.page.onShow();
  h.page.onShow();
  assert.equal(h.page.phase, 'SHOW');
  assert.equal(h.page.showCount, 1);
  assert.equal(h.active.size, 1);
  h.tick();
  h.tick();
  assert.equal(h.page.foregroundTicks, 2);
  assert.equal(h.page.tickText, '前台刷新 2');
  assert.equal(h.page.clickCount, 0);
});

test('each independent click handler immediately updates the total and its own target label', () => {
  const h = harness();
  h.page.onInit();
  h.page.onShow();
  h.page.tapTop();
  assert.equal(h.page.clickText, '点按 1');
  assert.equal(h.page.topText, '顶部 div · 1');
  assert.equal(h.page.targetText, '最近：顶部 div');
  h.page.tapMiddle();
  assert.equal(h.page.clickText, '点按 2');
  assert.equal(h.page.middleText, '中部 text · 1');
  assert.equal(h.page.targetText, '最近：中部 text');
  h.page.tapBottom();
  assert.equal(h.page.clickText, '点按 3');
  assert.equal(h.page.bottomText, '底部 div · 1');
  assert.equal(h.page.targetText, '最近：底部 div');
  assert.equal(h.page.topCount, 1);
  assert.equal(h.page.middleCount, 1);
  assert.equal(h.page.bottomCount, 1);
});

test('rapid direct click entries are not collapsed by a flow or busy guard', () => {
  const h = harness();
  h.page.onInit();
  h.page.onShow();
  for (let index = 0; index < 20; index += 1) {
    h.page.tapTop();
    h.page.tapMiddle();
    h.page.tapBottom();
  }
  assert.equal(h.page.clickCount, 60);
  assert.equal(h.page.clickText, '点按 60');
  assert.equal(h.page.topCount, 20);
  assert.equal(h.page.middleCount, 20);
  assert.equal(h.page.bottomCount, 20);
  assert.equal(h.active.size, 1);
});

test('details and its clickable return change only scalar view state and direct click diagnostics', () => {
  const h = harness();
  h.page.onInit();
  h.page.onShow();
  h.page.showDetails();
  assert.equal(h.page.viewMode, 'DETAILS');
  assert.equal(h.page.clickText, '点按 1');
  assert.equal(h.page.targetText, '最近：打开详情');
  h.page.backHome();
  assert.equal(h.page.viewMode, 'HOME');
  assert.equal(h.page.clickText, '点按 2');
  assert.equal(h.page.targetText, '最近：详情返回');
  assert.equal(h.page.topCount + h.page.middleCount + h.page.bottomCount, 0);
  assert.equal(h.active.size, 1);
});

test('physical back returns from details without inventing a delivered click', () => {
  const h = harness();
  h.page.onInit();
  h.page.onShow();
  assert.equal(h.page.onBackPress(), false);
  h.page.showDetails();
  assert.equal(h.page.onBackPress(), true);
  assert.equal(h.page.viewMode, 'HOME');
  assert.equal(h.page.clickCount, 1);
  assert.equal(h.page.onBackPress(), false);
});

test('hide stops foreground refresh and ignores an already queued native callback', () => {
  const h = harness();
  h.page.onInit();
  h.page.onShow();
  h.tick();
  const queued = h.callbacks[0];
  h.page.onHide();
  h.page.onHide();
  queued();
  assert.equal(h.page.phase, 'HIDE');
  assert.equal(h.page.foregroundTicks, 1);
  assert.equal(h.active.size, 0);
  assert.equal(h.page.clickCount, 0);
  h.page.onShow();
  assert.equal(h.page.phase, 'SHOW');
  assert.equal(h.page.showCount, 2);
  assert.equal(h.active.size, 1);
  h.tick();
  assert.equal(h.page.foregroundTicks, 2);
});

test('a queued callback from an earlier showing cannot add refresh ticks after reentry', () => {
  const h = harness();
  h.page.onInit();
  h.page.onShow();
  const oldCallback = h.callbacks[0];
  h.tick();
  h.page.onHide();
  h.page.onShow();
  oldCallback();
  assert.equal(h.page.foregroundTicks, 1);
  h.tick();
  assert.equal(h.page.foregroundTicks, 2);
  assert.equal(h.active.size, 1);
});

test('destroy releases the foreground timer and prevents a later show from restarting it', () => {
  const h = harness();
  h.page.onInit();
  h.page.onShow();
  h.tick();
  const queued = h.callbacks[0];
  h.page.onDestroy();
  h.page.onDestroy();
  h.page.onShow();
  queued();
  assert.equal(h.page.phase, 'DESTROY');
  assert.equal(h.page.foregroundTicks, 1);
  assert.equal(h.active.size, 0);
  assert.equal(h.page.onBackPress(), false);
});

test('native probe routes known click primitives to independent handlers with flat visible bindings', () => {
  const source = readRequired(pagePath);
  assert.match(source, /<div\b[^>]*class="probe-target top-target"[^>]*onclick="tapTop"/);
  assert.match(source, /<text\b[^>]*class="probe-target middle-target"[^>]*onclick="tapMiddle"/);
  assert.match(source, /<div\b[^>]*class="probe-target bottom-target"[^>]*onclick="tapBottom"/);
  assert.match(source, /if="\{\{viewMode === 'DETAILS'\}\}"/);
  assert.match(source, /刷新探针，不是阅读计时/);
  assert.match(source, /独立测试 · 不保存记录/);
  assert.match(source, /原生触控尚未验证/);
  assert.doesNotMatch(source, /<button\b|\brequire\s*\(|Object\.freeze|\bvm\s*:|\{\{[^}]*\bvm\./);
  assert.doesNotMatch(source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1], /\bimport\b/);
  for (const binding of ['phase', 'clickText', 'targetText', 'tickText', 'topText', 'middleText', 'bottomText']) {
    assert.match(source, new RegExp('\\{\\{' + binding + '\\}\\}'));
  }
});

test('probe native boxes fit 168 by 240 design units with independent 40-unit touch targets', () => {
  const css = readRequired(cssPath);
  const source = readRequired(pagePath);
  const pageBox = css.match(/\.click-probe-page\s*\{([^}]+)\}/);
  const targetBox = css.match(/\.probe-target\s*\{([^}]+)\}/);
  assert.ok(pageBox);
  assert.ok(targetBox);
  assert.match(pageBox[1], /width:\s*168px/);
  assert.match(pageBox[1], /height:\s*240px/);
  assert.match(targetBox[1], /width:\s*144px/);
  assert.match(targetBox[1], /height:\s*40px/);
  const heightOf = name => Number(css.match(new RegExp('\\.' + name + '\\s*\\{[^}]*?height:\\s*(\\d+)px'))[1]);
  const diagnosticHeight = ['probe-title', 'phase-text', 'click-count', 'target-text', 'tick-text', 'refresh-hint']
    .reduce((sum, name) => sum + heightOf(name), 0);
  assert.equal(diagnosticHeight + 4 * heightOf('probe-target') + 12, 240);
  assert.doesNotMatch(css, /position:\s*(?:absolute|fixed)|z-index|transform|box-sizing/);
  assert.doesNotMatch(source, /<list\b|<stack\b|<canvas\b/);
  const colors = Array.from(css.matchAll(/#[0-9a-fA-F]{6}\b/g), match => match[0].toUpperCase());
  assert.deepEqual(Array.from(new Set(colors)).sort(), ['#181A1D', '#386FBE', '#626873', '#F2F4F7', '#FFFFFF']);
});

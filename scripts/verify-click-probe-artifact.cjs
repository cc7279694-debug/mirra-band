'use strict';
// Execute signed, compiled RPK code and its real template click bindings.
// aiot helpers and intervals are controlled in Node; no firmware event delivery
// or pixels are simulated, and no storage/phone/learning service is provided.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const toolkitRequire = createRequire(require.resolve('aiot-toolkit/package.json'));
const packRequire = createRequire(toolkitRequire.resolve('@aiot-toolkit/aiotpack/package.json'));
const JSZip = packRequire('jszip');
const { inspect } = require('./inspect-rpk.cjs');

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node scripts/verify-click-probe-artifact.cjs CLICK_PROBE_RPK');
  const checked = await inspect(file, path.resolve(__dirname, '../sign/certificate.pem'), 'click-probe');
  const zip = await JSZip.loadAsync(fs.readFileSync(file), { checkCRC32: true });
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  const intervals = new Map();
  const savedCallbacks = [];
  const nativeRequests = [];
  let intervalRequests = 0;
  let evaluatedTextBindings = 0;
  let deliveredCompiledClickBindings = 0;
  const runtime = {
    setTimeout() { throw new Error('Unexpected background timeout in click probe'); },
    clearTimeout() { throw new Error('Unexpected background timeout cleanup in click probe'); },
    setInterval(callback, delay) {
      assert.equal(delay, 1000, 'The diagnostic refresh must use its declared foreground cadence');
      const key = ++intervalRequests;
      intervals.set(key, callback);
      savedCallbacks.push(callback);
      return key;
    },
    clearInterval(key) { intervals.delete(key); },
    $app_require$(name) {
      nativeRequests.push(name);
      throw new Error('No native service may be loaded by the isolated click probe: ' + name);
    },
  };
  const aiot = {
    __ce__(type, boundary, children) {
      return { type, options: boundary.__opts__, children: (children || []).flat(Infinity) };
    },
    __ci__(boundary, render) { return boundary.__opts__.shown() ? render() : []; },
    __cf__() { throw new Error('Unexpected repeated or nested model in baseline click probe'); },
  };
  function execute(script) {
    const context = { aiot, $app_require$: runtime.$app_require$ };
    const compiled = vm.runInNewContext('(' + script.replace(/^export default\s*/, '') + ')', context);
    assert.equal(typeof compiled, 'function', 'RPK must contain the actual compiled entry');
    const output = {};
    compiled(runtime, runtime, runtime, output, {});
    if (typeof output.entry === 'function') {
      const entry = {};
      output.entry(entry);
      return entry.default;
    }
    return output.default;
  }
  const app = execute(await zip.file('app.js').async('string'));
  app.onCreate();
  assert.equal(app.phase, 'CREATED');
  const definition = execute(await zip.file('pages/ClickProbe/index.js').async('string'));
  assert.equal(typeof definition.template, 'function', 'The compiled page must provide its template');
  for (const value of Object.values(definition.private)) {
    assert.ok(['string', 'number', 'boolean'].includes(typeof value), 'Compiled reactive fields must stay primitive');
  }
  const unavailableServices = new Proxy({}, { get() { throw new Error('Click probe accessed an app service'); } });
  const page = Object.assign({}, definition, definition.private, { $app: unavailableServices });
  const templateSnapshots = [];
  function render(label) {
    const nodes = [];
    const texts = [];
    function walk(node) {
      if (!node) return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      nodes.push(node);
      if (node.type === 'text') {
        const bound = typeof node.options.value === 'function';
        const value = bound ? node.options.value() : node.options.value;
        assert.equal(typeof value, 'string', 'Every actual compiled text binding must resolve to a flat string');
        if (bound) evaluatedTextBindings += 1;
        texts.push(value);
      }
      (node.children || []).forEach(walk);
    }
    walk(page.template.call(page));
    templateSnapshots.push({ label, viewMode: page.viewMode, texts });
    return { nodes, texts };
  }
  function target(view, className) {
    const matches = view.nodes.filter(node => (node.options.classList || []).includes(className));
    assert.equal(matches.length, 1, 'Visible compiled target must be unique: ' + className);
    assert.equal(typeof matches[0].options.events.click, 'function', 'Compiled onclick must expose a click binding: ' + className);
    return matches[0];
  }
  function click(className, expectedType) {
    const found = target(render('before-' + className), className);
    assert.equal(found.type, expectedType, 'The compiled target must retain the selected native primitive');
    // This delivers an event to the compiler-generated binding, not directly to
    // a page handler. Node does not prove that a physical tap delivers it.
    found.options.events.click({ type: 'click' });
    deliveredCompiledClickBindings += 1;
  }
  function assertTexts(label, values) {
    const view = render(label);
    for (const value of values) assert.ok(view.texts.includes(value), 'Actual compiled template did not return: ' + value);
    return view;
  }
  function tick() { for (const callback of Array.from(intervals.values())) callback(); }

  page.onInit();
  assert.equal(page.phase, 'INIT');
  assert.equal(intervals.size, 0);
  assertTexts('init', ['点按 0', '顶部 div · 0', '中部 text · 0', '底部 div · 0', '阶段 INIT · 显示 0']);
  page.onShow(); page.onShow();
  assert.equal(page.phase, 'SHOW');
  assert.equal(page.showCount, 1);
  assert.equal(intervals.size, 1);
  assert.equal(intervalRequests, 1);
  assertTexts('shown', ['阶段 SHOW · 显示 1', '前台刷新 0', '刷新探针，不是阅读计时']);

  click('top-target', 'div');
  assert.equal(page.clickCount, 1);
  assert.equal(page.topCount, 1);
  assertTexts('top', ['点按 1', '顶部 div · 1', '最近：顶部 div']);
  click('middle-target', 'text');
  assert.equal(page.clickCount, 2);
  assert.equal(page.middleCount, 1);
  assertTexts('middle', ['点按 2', '中部 text · 1', '最近：中部 text']);
  click('bottom-target', 'div');
  assert.equal(page.clickCount, 3);
  assert.equal(page.bottomCount, 1);
  assertTexts('bottom', ['点按 3', '底部 div · 1', '最近：底部 div']);

  click('details-target', 'div');
  assert.equal(page.viewMode, 'DETAILS');
  const details = assertTexts('details', ['点按 4', '最近：打开详情', '返回点击探针', '独立测试 · 不保存记录', '原生触控尚未验证']);
  assert.equal(details.nodes.some(node => (node.options.classList || []).includes('top-target')), false);
  assert.equal(intervals.size, 1);
  click('details-target', 'div');
  assert.equal(page.viewMode, 'HOME');
  assertTexts('back', ['点按 5', '最近：详情返回', '顶部 div · 1', '中部 text · 1', '底部 div · 1']);
  click('details-target', 'div');
  assert.equal(page.onBackPress(), true);
  assert.equal(page.viewMode, 'HOME');
  assert.equal(page.clickCount, 6, 'Physical Back must not be misreported as a delivered onclick');
  assert.equal(page.onBackPress(), false);
  for (let index = 0; index < 10; index += 1) {
    click('top-target', 'div');
    click('middle-target', 'text');
    click('bottom-target', 'div');
  }
  assert.equal(page.clickCount, 36);
  assert.equal(deliveredCompiledClickBindings, 36);
  assert.equal(page.topCount, 11);
  assert.equal(page.middleCount, 11);
  assert.equal(page.bottomCount, 11);
  assertTexts('rapid-clicks', ['点按 36', '顶部 div · 11', '中部 text · 11', '底部 div · 11']);
  tick(); tick();
  assertTexts('refresh', ['前台刷新 2']);
  const oldCallback = savedCallbacks[0];
  page.onHide(); page.onHide();
  assert.equal(page.phase, 'HIDE');
  assert.equal(intervals.size, 0);
  oldCallback();
  assert.equal(page.foregroundTicks, 2);
  assert.equal(page.clickCount, 36);
  assertTexts('hidden', ['阶段 HIDE · 显示 1', '点按 36', '前台刷新 2']);
  page.onShow();
  assert.equal(page.showCount, 2);
  assert.equal(intervals.size, 1);
  oldCallback();
  assert.equal(page.foregroundTicks, 2, 'Old-show callback must remain retired after reentry');
  tick();
  assertTexts('reshown', ['阶段 SHOW · 显示 2', '点按 36', '前台刷新 3']);
  const lastCallback = savedCallbacks[1];
  page.onDestroy(); page.onDestroy(); page.onShow();
  oldCallback(); lastCallback();
  assert.equal(page.phase, 'DESTROY');
  assert.equal(page.foregroundTicks, 3);
  assert.equal(page.clickCount, 36);
  assert.equal(intervals.size, 0);
  assert.equal(page.onBackPress(), false);
  app.onDestroy();
  assert.equal(app.phase, 'DESTROYED');
  assert.equal(nativeRequests.length, 0, 'Compiled probe must perform zero native module loads or file/storage calls');
  const result = {
    status: 'PASS',
    boundary: 'actual signed RPK app/page and compiled onclick/template bindings in Node-controlled aiot helpers and intervals; no firmware event delivery or native pixels',
    package: manifest.package, version: manifest.versionName, sha256: checked.sha256,
    sameExistingExperimentCertificate: true,
    primitiveFieldsOnly: true, evaluatedTextBindings, deliveredCompiledClickBindings,
    topClicks: page.topCount, middleClicks: page.middleCount, bottomClicks: page.bottomCount,
    totalClickEntries: page.clickCount, foregroundRefreshCallbacks: page.foregroundTicks,
    visibleIntervals: 1, hiddenIntervals: 0, destroyedIntervals: intervals.size,
    detailsViaCompiledClick: true, backViaCompiledClick: true, physicalBackWithoutFakeClick: true,
    retiredCallbackIgnored: true, nativeModuleLoads: nativeRequests.length, fileStorageCalls: 0,
    compiledTemplateSnapshots: templateSnapshots.filter(snapshot => ['shown', 'top', 'middle', 'bottom', 'details', 'back', 'rapid-clicks', 'reshown'].includes(snapshot.label)),
    nativeTouch: 'NOT_RUN', nativePixels: 'NOT_RUN',
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });

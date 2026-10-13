'use strict';
// Execute the actual signed RPK scripts at a controlled firmware boundary.
// This proves compilation and callback contracts, never native layout or durability.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const toolkitRequire = createRequire(require.resolve('aiot-toolkit/package.json'));
const packRequire = createRequire(toolkitRequire.resolve('@aiot-toolkit/aiotpack/package.json'));
const JSZip = packRequire('jszip');
const { inspect, verifyBuffer } = require('./inspect-rpk.cjs');

async function main() {
  const latest = process.argv[2];
  const previous = process.argv[3];
  if (!latest || !previous) throw new Error('Usage: node scripts/verify-local-ui-artifact.cjs NEW_RPK OLD_05B_RPK');
  await inspect(latest, path.resolve(__dirname, '../sign/certificate.pem'), 'local-session');
  const oldBytes = fs.readFileSync(previous);
  const newBytes = fs.readFileSync(latest);
  assert.equal(verifyBuffer(oldBytes).certificate.fingerprint256, verifyBuffer(newBytes).certificate.fingerprint256);
  const oldZip = await JSZip.loadAsync(oldBytes, { checkCRC32: true });
  const newZip = await JSZip.loadAsync(newBytes, { checkCRC32: true });
  const oldManifest = JSON.parse(await oldZip.file('manifest.json').async('string'));
  const newManifest = JSON.parse(await newZip.file('manifest.json').async('string'));
  assert.equal(oldManifest.package, newManifest.package);
  assert(newManifest.versionCode > oldManifest.versionCode);
  let wallMs = 100000;
  const files = new Map();
  const nativeCalls = [];
  const native = {
    readText(request) {
      nativeCalls.push({ type: 'read', uri: request.uri });
      if (files.has(request.uri)) request.success({ text: files.get(request.uri) });
      else request.fail('fixture absent', 301);
    },
    writeText(request) {
      nativeCalls.push({ type: 'write', uri: request.uri });
      files.set(request.uri, request.text); request.success();
    }
  };
  const viewTimers = new Map(); let nextTimer = 0;
  const runtime = {
    setTimeout, clearTimeout,
    setInterval(callback) { const key = ++nextTimer; viewTimers.set(key, callback); return key; },
    clearInterval(key) { viewTimers.delete(key); },
    $app_require$(name) { assert.equal(name, '@app-module/system.file'); return native; }
  };
  function execute(script) {
    const aiot = {
      __ce__(type, boundary, children) { return { type, options: boundary.__opts__, children: (children || []).flat(Infinity) }; },
      __ci__(boundary, render) { return boundary.__opts__.shown() ? render() : []; },
      __cf__(boundary, render) { return boundary.__opts__.exp().map((item, index) => render(index, item)).flat(Infinity); }
    };
    const context = { $app_require$: runtime.$app_require$, Date: { now: () => wallMs },
      setTimeout, clearTimeout, console, aiot };
    const fn = vm.runInNewContext('(' + script.replace(/^export default\s*/, '') + ')', context);
    const output = {}; fn(runtime, runtime, runtime, output, {});
    if (typeof output.entry === 'function') { const entry = {}; output.entry(entry); return entry.default; }
    return output.default;
  }
  const oldApp = execute(await oldZip.file('app.js').async('string')); oldApp.onCreate();
  const oldOwner = oldApp.getLocalOwner(); await oldOwner.open();
  await oldOwner.dispatch({ type: 'SELECT_BOOK', bookId: 'test-reading-1' });
  await oldOwner.dispatch({ type: 'SELECT_ACTION', firstActionId: 'read-first-paragraph' });
  await oldOwner.dispatch({ type: 'CONFIRM_START', confirmed: true }); wallMs += 10000;
  await oldOwner.dispatch({ type: 'FINISH', endPage: null });
  const oldPending = JSON.stringify(oldOwner.snapshot().document.pending);
  await oldOwner.dispatch({ type: 'NEW_SESSION' });
  await oldOwner.dispatch({ type: 'SELECT_BOOK', bookId: 'test-reading-1' });
  await oldOwner.dispatch({ type: 'SELECT_ACTION', firstActionId: 'read-first-paragraph' });
  await oldOwner.dispatch({ type: 'CONFIRM_START', confirmed: true });
  const activeId = oldOwner.snapshot().document.active.id;
  const sequence = oldOwner.snapshot().sequence; oldApp.onDestroy();
  wallMs += 65000; // Cross-app wall difference is a reference, never trusted.
  const newApp = execute(await newZip.file('app.js').async('string')); newApp.onCreate();
  const newOwner = newApp.getLocalOwner(); await newOwner.open();
  assert.equal(newOwner.snapshot().document.active.id, activeId);
  assert.equal(JSON.stringify(newOwner.snapshot().document.pending), oldPending);
  assert.equal(newOwner.snapshot().sequence, sequence);
  const pageDefinition = execute(await newZip.file('pages/LocalSession/index.js').async('string'));
  const page = Object.assign({}, pageDefinition, pageDefinition.private, {
    $app: { $def: newApp, exit() { newApp.onDestroy(); } }
  });
  page.onInit(); await page.onShow();
  assert.equal(newOwner.snapshot().sequence, sequence, 'Opening the UI must not write a restoration event');
  assert.equal(newOwner.snapshot().document.active.id, activeId);
  // Flow and page VM assertions are performed using their public page handlers.
  const view = () => page._projection || page.viewModel || page.vm || page;
  assert.equal(page.vm, undefined, 'The native page must not bind a nested projection graph');
  assert.equal(page.view, 'READING');
  assert.equal(page.timerText, '01:05', 'The actual bound timer restores a wall reference');
  assert.equal(page.timerQualifier, '参考值');
  assert.equal(newOwner.snapshot().summary.trustedFocusMs, 0);
  assert(newOwner.snapshot().summary.reasons.includes('OWNER_CHANGED'));
  assert.equal(view().view, 'READING');
  assert.equal(view().timer.valueText, '01:05', 'Cross-owner time is explicitly unverified reference');
  wallMs += 5000;
  for (const refresh of viewTimers.values()) refresh();
  assert.equal(page.timerText, '01:10'); assert.equal(page.timerQualifier, '参考值');
  assert.equal(newOwner.snapshot().sequence, sequence);
  let evaluatedTextBindings = 0; let deliveredCompiledClickBindings = 0;
  const classes = () => {
    const tree = page.template.call(page); const result = [];
    function walk(node) { if (!node) return; if (Array.isArray(node)) { node.forEach(walk); return; }
      result.push(...(node.options.classList || []));
      if (typeof node.options.value === 'function') { assert.equal(typeof node.options.value(), 'string'); evaluatedTextBindings++; }
      (node.children || []).forEach(walk); }
    walk(tree); return result;
  };
  function click(className) {
    const nodes = [];
    function walk(node) { if (!node) return; if (Array.isArray(node)) { node.forEach(walk); return; }
      if ((node.options.classList || []).includes(className) && typeof (node.options.events || {}).click === 'function') nodes.push(node);
      (node.children || []).forEach(walk); }
    walk(page.template.call(page));
    assert.equal(nodes.length, 1, 'Expected one compiled native click target: ' + className);
    deliveredCompiledClickBindings++;
    return nodes[0].options.events.click({ type: 'click' });
  }
  assert(classes().includes('timer-hero'));
  assert(classes().includes('split-actions'));
  const navigationWrites = nativeCalls.filter(call => call.type === 'write').length;
  click('light-button'); assert.equal(page.view, 'DETAILS'); assert.equal(view().view, 'DETAILS');
  assert(classes().includes('diagnostic-line')); // fixed, flat diagnostic bindings
  click('light-button'); assert.equal(page.view, 'READING');
  assert.equal(nativeCalls.filter(call => call.type === 'write').length, navigationWrites);
  click('split-secondary'); assert.equal(view().view, 'FINISH_REVIEW');
  assert(!classes().includes('digit-key'), 'Default finish must have no keypad');
  assert.equal(newOwner.snapshot().sequence, sequence, 'End review is not FINISH');
  click('page-option'); page.appendDigit('2'); page.appendDigit('7');
  assert.equal(view().pageDigits, '27'); assert.equal(classes().filter(name => name === 'digit-key').length, 12);
  for (const refresh of viewTimers.values()) refresh(); assert.equal(view().pageDigits, '27');
  page.backView(); assert.equal(view().view, 'FINISH_REVIEW'); assert.equal(view().pageDigits, '');
  page.backView(); assert.equal(view().view, 'READING');
  click('split-primary'); assert.equal(view().view, 'BREAK_PICKER');
  assert.equal(newOwner.snapshot().document.state, 'FOCUS');
  page.backView(); assert.equal(view().view, 'READING');
  page.onHide(); assert.equal(viewTimers.size, 0);
  await page.onShow(); assert.equal(view().view, 'READING');
  assert.equal(newOwner.snapshot().sequence, sequence);
  page.openBreakPicker(); await page.beginBreak(5); assert.equal(view().view, 'RESTING');
  assert.equal(newOwner.snapshot().document.state, 'BREAK');
  const focusBeforeBreak = newOwner.snapshot().summary.observedFocusMs;
  wallMs += 360000;
  for (const refresh of viewTimers.values()) refresh();
  assert.equal(page.timerText, '休息时间已到');
  assert.equal(newOwner.snapshot().document.state, 'BREAK', 'A reference deadline cannot resume learning');
  assert.equal(newOwner.snapshot().summary.observedFocusMs, focusBeforeBreak);
  await page.resume(); assert.equal(view().view, 'READING');
  wallMs += 20000;
  for (const refresh of viewTimers.values()) refresh();
  assert.equal(newOwner.snapshot().summary.observedFocusMs, focusBeforeBreak + 20000, 'BREAK must stay excluded');
  assert.equal(newOwner.snapshot().summary.trustedFocusMs, 0);
  page.showFinish(); const saving = page.finishSession(); const duplicate = page.finishSession();
  await saving; await duplicate; assert.equal(view().view, 'SAVED');
  assert.equal(newOwner.snapshot().document.pending.length, 2);
  assert.equal(newOwner.snapshot().document.pending[1].id, activeId);
  assert.equal(newOwner.snapshot().document.pending[1].endPage, null);
  const savedSequence = newOwner.snapshot().sequence;
  page.done(); assert.equal(view().view, 'READY'); assert.equal(newOwner.snapshot().sequence, savedSequence);
  assert.equal(newOwner.snapshot().document.pending.length, 2);
  page.onDestroy(); newApp.onDestroy();
  assert.equal(viewTimers.size, 0);
  assert(nativeCalls.every(call => /^internal:\/\/files\/mirra_05b_test_sessions_[ab]\.json$/.test(call.uri)));
  const result = { status: 'PASS', boundary: 'actual old/new signed RPK app and new page scripts in Node; firmware file callbacks controlled; no native pixels',
    package: newManifest.package, fromVersion: oldManifest.versionName, toVersion: newManifest.versionName,
    sameCertificate: true, oldPendingRetained: true, oldActiveIdRetained: true, reentryWithoutWrites: true,
    crossOwnerWallReference: true, crossOwnerTrustedFocusMs: 0, wallReferenceLabel: '参考值',
    breakExcludedFromFocus: true, breakDeadlineWithoutAutoResume: true,
    compiledTemplate: 'evaluated all real conditional/repeat bindings',
    optionalKeypadKeys: 12, nullableEnd: true, duplicateFinishRecords: 1, finalPendingRecords: 2,
    evaluatedTextBindings, deliveredCompiledClickBindings, flatNativeTimer: true, readOnlyDetailsWithoutWrites: true,
    doneWithoutWrites: true, nativeCalls: nativeCalls.length, fileSlots: files.size, hiddenTimers: viewTimers.size };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });

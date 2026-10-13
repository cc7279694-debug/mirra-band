'use strict';
// Signed Vela code executes in Node with controlled file/SDK callbacks. This
// verifies the compiled contract, not hardware pixels, durability or radio IO.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const toolkit = createRequire(require.resolve('aiot-toolkit/package.json'));
const pack = createRequire(toolkit.resolve('@aiot-toolkit/aiotpack/package.json'));
const JSZip = pack('jszip');
const { inspect, verifyBuffer } = require('./inspect-rpk.cjs');
const catalogWire = require('../src/lib/catalog-protocol');

async function main() {
  const [latest, previous] = process.argv.slice(2);
  if (!latest || !previous) throw new Error('Usage: node scripts/verify-formal-catalog-artifact.cjs NEW_RPK OLD_FORMAL_RPK');
  const report = await inspect(latest, path.resolve(__dirname, '../sign/live/certificate.pem'), 'live');
  const oldBytes = fs.readFileSync(previous), newBytes = fs.readFileSync(latest);
  assert.equal(verifyBuffer(oldBytes).certificate.fingerprint256, verifyBuffer(newBytes).certificate.fingerprint256);
  const oldZip = await JSZip.loadAsync(oldBytes, { checkCRC32: true }), zip = await JSZip.loadAsync(newBytes, { checkCRC32: true });
  const oldManifest = JSON.parse(await oldZip.file('manifest.json').async('string'));
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  assert.equal(manifest.package, 'com.guanyi.mirra'); assert.equal(manifest.package, oldManifest.package);
  assert(manifest.versionCode > oldManifest.versionCode);
  let wallMs = 100000, online = true, nextTimer = 0, instanceStarts = 0, clicks = 0, bindings = 0, held = null;
  let holdReadback = false, lastCatalogWrite = null;
  const files = new Map(), calls = [], intervals = new Map(), messages = [], routes = [];
  const nativeFile = {
    readText(request) {
      calls.push({ type: 'read', uri: request.uri });
      if (holdReadback && request.uri === lastCatalogWrite) { held = request; return; }
      if (files.has(request.uri)) request.success({ text: files.get(request.uri) }); else request.fail(null, 301);
    },
    writeText(request) {
      calls.push({ type: 'write', uri: request.uri }); files.set(request.uri, request.text);
      if (/mirra_catalog_live/.test(request.uri)) lastCatalogWrite = request.uri;
      request.success();
    }
  };
  const nativeChannel = { getReadyState(request) { request.success({ status: online ? 1 : 2 }); },
    send(request) { messages.push(JSON.parse(JSON.stringify(request.data))); request.success(); } };
  const runtime = { setTimeout, clearTimeout,
    setInterval(callback, delay) { intervals.set(++nextTimer, { callback, delay }); return nextTimer; },
    clearInterval(handle) { intervals.delete(handle); },
    $app_require$(name) {
      if (name === '@app-module/system.file') return nativeFile;
      if (name === '@app-module/system.interconnect') return { instance() { instanceStarts++; return nativeChannel; } };
      if (name === '@app-module/system.router') return { push(value) { routes.push(value.uri); }, back() { routes.push('back'); } };
      throw new Error('Unexpected compiled platform dependency: ' + name);
    } };
  const aiot = { __ce__(type, boundary, children) { return { type, options: boundary.__opts__, children: (children || []).flat(Infinity) }; },
    __ci__(boundary, render) { return boundary.__opts__.shown() ? render() : []; },
    __cf__(boundary, render) { return boundary.__opts__.exp().map((item, index) => render(index, item)).flat(Infinity); } };
  async function execute(name) {
    const code = await zip.file(name).async('string');
    const factory = vm.runInNewContext('(' + code.replace(/^export default\s*/, '') + ')',
      { Date: { now: () => wallMs }, setTimeout, clearTimeout, aiot, console, $app_require$: runtime.$app_require$ });
    const output = {}; factory(runtime, runtime, runtime, output, {});
    if (typeof output.entry === 'function') { const entry = {}; output.entry(entry); return entry.default; }
    return output.default;
  }
  function page(definition, app) { return Object.assign({}, definition, definition.private, { $app: { $def: app, exit() { app.onDestroy(); } } }); }
  function nodes(view) {
    const result = [];
    function walk(node) {
      if (!node) return; if (Array.isArray(node)) { node.forEach(walk); return; }
      result.push(node);
      if (typeof node.options.value === 'function') { assert.equal(typeof node.options.value(), 'string'); bindings++; }
      (node.children || []).forEach(walk);
    }
    walk(view.template.call(view)); return result;
  }
  function click(view, name, index = 0, expected = 1) {
    const targets = nodes(view).filter(node => (node.options.classList || []).includes(name) && typeof (node.options.events || {}).click === 'function');
    assert.equal(targets.length, expected, 'Compiled click target ' + name); clicks++;
    return targets[index].options.events.click({ type: 'click' });
  }
  function inbound(message) { assert.equal(typeof nativeChannel.onmessage, 'function'); nativeChannel.onmessage({ data: JSON.stringify(message) }); }
  async function drain(condition) { for (let n = 0; n < 300 && !condition(); n++) await Promise.resolve(); assert(condition(), 'Async callback did not settle'); }
  const writes = () => calls.filter(call => call.type === 'write' && /mirra_local_sessions_live/.test(call.uri)).length;
  const app = await execute('app.js'); app.onCreate(); await app._ready;
  const mode = page(await execute('pages/Mode/index.js'), app); mode.onInit(); mode.onShow();
  const hello = messages.findLast(message => message.type === 'HELLO'); assert.equal(hello.protocolVersion, 3);
  inbound({ ...hello, type: 'HELLO_ACK', streamId: 'compiled-formal-stream' });
  const snapshotRequest = messages.findLast(message => message.type === 'GET_SNAPSHOT');
  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../protocol/v1/fixtures/idle.json'), 'utf8'));
  const snapshot = { ...snapshotRequest, type: 'SNAPSHOT', sequence: 1, sourceObservedAtUnixMs: 2000000,
    body: fixture.body, control: { activeSegmentId: null, allowedActions: [], controlGrant: null, grantExpiresAtUnixMs: null, expectedFirstAction: null } };
  delete snapshot.lastSeenSessionId; inbound(snapshot);
  assert.equal(app.getCompanion().snapshot().freshness, 'fresh');
  const request = messages.findLast(message => message.type === 'GET_CATALOG');
  const catalog = { schemaVersion: 1, books: [{ id: 'compiled-real-book', title: '真实离线目录', totalPages: 300,
    currentPage: 12, firstAction: null, isMainline: true }] };
  const transfer = catalogWire.buildTransfer(request, catalog); holdReadback = true;
  transfer.frames.forEach(inbound); await drain(() => !!held);
  assert.equal(messages.filter(message => message.type === 'CATALOG_ACK').length, 0);
  assert.equal(app.getCatalogOwner().snapshot().catalog, null);
  holdReadback = false; const readback = held; held = null; readback.success({ text: files.get(readback.uri) });
  await drain(() => messages.some(message => message.type === 'CATALOG_ACK'));
  assert.equal(messages.at(-1).revision, transfer.revision); assert.equal(app.getCatalogOwner().snapshot().canonical, transfer.canonical);
  const local = page(await execute('pages/LocalSession/index.js'), app); local.onInit();
  click(mode, 'mode-primary'); assert.equal(routes.at(-1), '/pages/LocalSession');
  await local.onShow(); mode.onHide(); assert.equal(instanceStarts, 1, 'Navigation must share one native transport context');
  assert.equal(local.previewBookTitle, catalog.books[0].title); assert.equal(local.experimentLabel, '独立'); assert.equal(writes(), 0);
  const start = click(local, 'ready-submit'); const repeated = local.confirmStart(); await start; await repeated;
  assert.equal(writes(), 1); assert.equal(local.view, 'READING');
  const id = app.getLocalOwner().snapshot().document.active.id; assert.equal(app.getLocalOwner().snapshot().document.counter, 1);
  local.onDestroy(); mode.onDestroy(); app.onDestroy(); assert.equal(intervals.size, 0);
  online = false; wallMs += 65000;
  const restored = await execute('app.js'); restored.onCreate(); await restored._ready;
  const reading = page(await execute('pages/LocalSession/index.js'), restored); reading.onInit(); const beforeReentry = writes();
  await reading.onShow(); assert.equal(writes(), beforeReentry); assert.equal(reading.timerText, '01:05'); assert.equal(reading.timerQualifier, '参考值');
  assert.equal(restored.getLocalOwner().snapshot().document.active.id, id); assert.equal(restored.getLocalOwner().snapshot().summary.trustedFocusMs, 0);
  const timer = [...intervals.values()].find(value => value.callback.toString().includes('refreshTimer'));
  assert(timer, 'Compiled visible timer callback'); const ioBeforeTick = calls.length; wallMs += 5000; timer.callback();
  assert.equal(reading.timerText, '01:10'); assert.equal(calls.length, ioBeforeTick);
  click(reading, 'split-primary'); await click(reading, 'break-option', 0, 2); assert.equal(reading.view, 'RESTING');
  const focus = restored.getLocalOwner().snapshot().summary.observedFocusMs; wallMs += 360000; timer.callback();
  assert.equal(reading.timerText, '休息时间已到'); assert.equal(restored.getLocalOwner().snapshot().document.state, 'BREAK');
  assert.equal(restored.getLocalOwner().snapshot().summary.observedFocusMs, focus);
  await click(reading, 'split-primary'); wallMs += 20000; timer.callback();
  assert.equal(restored.getLocalOwner().snapshot().summary.observedFocusMs, focus + 20000);
  click(reading, 'split-secondary'); const finish = click(reading, 'review-submit'); const duplicate = reading.finishSession(); await finish; await duplicate;
  assert.equal(reading.view, 'SAVED'); const pending = restored.getLocalOwner().snapshot().document.pending;
  assert.equal(pending.length, 1); assert.equal(pending[0].id, id); assert.equal(pending[0].endPage, null);
  const saved = JSON.stringify(pending), empty = { schemaVersion: 1, books: [] }, canonical = catalogWire.canonicalCatalog(empty);
  await restored.getCatalogOwner().save({ revision: catalogWire.revisionFor(canonical), catalog: empty, canonical });
  assert.equal(JSON.stringify(restored.getLocalOwner().snapshot().document.pending), saved);
  click(reading, 'saved-submit'); assert.equal(reading.primaryEnabled, false); assert.match(reading.noticeText, /启用目录同步/);
  reading.onDestroy(); restored.onDestroy(); assert.equal(intervals.size, 0);
  assert(calls.every(call => /^internal:\/\/files\/mirra_(?:catalog|local_sessions)_live_[ab]\.json$/.test(call.uri)));
  process.stdout.write(JSON.stringify({ status: 'PASS', boundary: 'Actual signed formal RPK app/Mode/LocalSession templates in Node; firmware file and SDK callbacks controlled, fixture phone; no radio, hardware pixels or firmware durability proof',
    package: manifest.package, fromVersion: oldManifest.versionName, toVersion: manifest.versionName, versionCode: manifest.versionCode,
    bytes: report.bytes, sha256: report.sha256, sameCertificate: true, versionIncreases: true,
    nativeFixtureCatalogFrames: transfer.frames.length, persistedAckWaitsExactReadback: true, independentAtomicStartWrites: 1,
    oneSessionDespiteRepeatedTap: true, singletonCompanionPerApp: true, sharedNativeContextAcrossNavigation: true,
    offlineCatalogRecovery: true, crossAppSameSessionRecovery: true, referenceTime: '01:05 → 01:10', trustedFocusMs: 0,
    breakExcludedFromLearning: true, breakDeadlineRequiresExplicitResume: true, nullableFinish: true, pendingRetainedAcrossDirectoryRemoval: true,
    timerFileIoCalls: 0, experimentalFilesAccessed: 0, compiledClickBindings: clicks, evaluatedTextBindings: bindings,
    fileCallbacks: calls.length, formalFileSlots: files.size, hiddenIntervals: intervals.size }, null, 2) + '\n');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });

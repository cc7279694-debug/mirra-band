'use strict';
const fs = require('node:fs'), vm = require('node:vm'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { verifyBuffer } = require('./inspect-rpk.cjs');
const catalog = require('../src/lib/catalog-protocol'), model = require('../src/lib/record-model');
async function check(file) {
  const bytes = fs.readFileSync(file), signature = verifyBuffer(bytes);
  const toolkit = createRequire(require.resolve('aiot-toolkit/package.json')), pack = createRequire(toolkit.resolve('@aiot-toolkit/aiotpack/package.json'));
  const zip = await pack('jszip').loadAsync(bytes, { checkCRC32: true }), code = await zip.file('app.js').async('string');
  const files = new Map(), phone = new Map(), sent = [], timers = new Map(); let clock = 100000, timer = 0, listenerOwners = 0, incoming, heldAck;
  const sha = raw => crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  const native = { getApkStatus() { return 'CONNECTED'; }, send(q) {
    const m = q.data; sent.push(m); q.success();
    function reply(value) { queueMicrotask(() => native.onmessage && native.onmessage({ data: JSON.stringify(value) })); }
    if (m.type === 'HELLO') reply({ ...m, type: 'HELLO_ACK', streamId: 'compiled-stream', recordSyncEnabled: true });
    else if (m.type === 'GET_CATALOG') { const value = { ...m, type: 'CATALOG_ERROR', code: 'CATALOG_DISABLED' }; delete value.knownRevision; reply(value); }
    else if (m.type === 'GET_SNAPSHOT') {
      const value = require('../protocol/v1/fixtures/idle.json');
      reply({ ...value, protocolVersion: 4, clientInstanceId: m.clientInstanceId, requestId: m.requestId, streamId: m.streamId, sourceObservedAtUnixMs: clock,
        control: { activeSegmentId: null, allowedActions: [], controlGrant: null, grantExpiresAtUnixMs: null, expectedFirstAction: null } });
    } else if (m.type === 'LOCAL_RECORD_OFFER') {
      incoming = { offer: m, parts: [] }; const value = { ...m, type: 'LOCAL_RECORD_NEED', code: 'NEED' }; delete value.schemaVersion; delete value.partCount; reply(value);
    } else if (m.type === 'LOCAL_RECORD_PART') incoming.parts[m.index] = m.data;
    else if (m.type === 'LOCAL_RECORD_COMMIT') {
      const raw = incoming.parts.join(''), record = model.parseCanonical(raw); assert.equal(sha(raw), m.recordDigest); assert.equal(Buffer.byteLength(raw), m.totalBytes);
      const previous = phone.get(record.session.id); if (previous) assert.equal(previous, raw); else phone.set(record.session.id, raw);
      heldAck = { ...m, type: 'LOCAL_RECORD_ACK', code: previous ? 'ALREADY_IMPORTED' : 'IMPORTED' };
    }
  } };
  const modules = {
    '@app-module/system.file': { readText(q) { files.has(q.uri) ? q.success({ text: files.get(q.uri) }) : q.fail(null, 301); }, writeText(q) { files.set(q.uri, q.text); q.success(); } },
    '@app-module/system.crypto': { hashDigest(q) { assert.equal(q.algo, 'SHA256'); return sha(q.data); } },
    '@app-module/system.interconnect': { instance() { listenerOwners++; return native; } }
  };
  const requireModule = name => { assert.ok(modules[name], name); return modules[name]; };
  const runtime = { setTimeout(fn) { timers.set(++timer, fn); return timer; }, clearTimeout(n) { timers.delete(n); }, setInterval(fn) { timers.set(++timer, fn); return timer; }, clearInterval(n) { timers.delete(n); }, $app_require$: requireModule };
  class ClockDate extends Date { static now() { return clock; } }
  const factory = vm.runInNewContext('(' + code.replace(/^export default\s*/, '') + ')', { $app_require$: requireModule, Date: ClockDate, console }, { timeout: 2000 });
  const exported = {}; factory(runtime, runtime, runtime, exported, {}); const app = exported.default;
  assert.equal(app.manifest.versionName, '0.5.0'); app.onCreate(); await app._ready;
  const books = { schemaVersion: 1, books: [{ id: 'compiled-book', title: '编译包合成样本', totalPages: 20, currentPage: 1, firstAction: null, isMainline: true }] };
  const canonical = catalog.canonicalCatalog(books), revision = catalog.revisionFor(canonical);
  await app.getCatalogOwner().save({ catalog: books, canonical, revision });
  await app.getLocalOwner().dispatch({ type: 'START_CONFIRMED', bookId: 'compiled-book', firstActionId: 'preset-read', confirmed: true, catalogRevision: revision });
  clock += 1000; await app.getLocalOwner().dispatch({ type: 'FINISH', endPage: null });
  const lease = {}; app.getCompanion().start(lease);
  for (let n = 0; n < 24; n++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(heldAck, 'Complete phone commit must occur before acknowledgement');
  assert.ok(sent.findIndex(m => m.type === 'GET_SNAPSHOT') < sent.findIndex(m => m.type === 'LOCAL_RECORD_OFFER'), 'Initial snapshot precedes record upload');
  assert.equal(app.getLocalOwner().snapshot().pendingCount, 1, 'Phone commit alone cannot release wrist record');
  assert.equal(app.getCompanion().snapshot().control.busy, true, 'Upload excludes competing control commands');
  assert.deepEqual(Array.from(app.getCompanion().snapshot().control.availableActions), []);
  native.onmessage({ data: JSON.stringify(heldAck) });
  for (let n = 0; n < 24; n++) await new Promise(resolve => setImmediate(resolve));
  const local = app.getLocalOwner().snapshot(); assert.equal(phone.size, 1); assert.equal(local.pendingCount, 0); assert.equal(local.retainedRecords.length, 1);
  assert.equal(app.getLocalRuntime().archive.snapshot().sealed, true); assert.equal(app.getCompanion().snapshot().records.confirmedCount, 1); assert.equal(listenerOwners, 1);
  const archiveCopies = [...files].filter(([name]) => name.includes('local_record_archive_live')); assert.equal(archiveCopies.length, 2); assert.equal(archiveCopies[0][1], archiveCopies[1][1]);
  app.onDestroy(); assert.equal(timers.size, 0);
  return { status: 'PASS', version: '0.5.0/code11', certificate: signature.certificate.fingerprint256,
    checks: ['signed compiled app owner', 'native-shaped file and SHA oracle', 'initial snapshot before upload', 'competing controls blocked during record commit', 'phone commit without ACK retains pending', 'v4 HELLO/NEED/full record/ACK', 'one Interconnect instance', 'dual sealed raw archive before pending release', 'retired resources'],
    boundary: 'Actual signed RPK JavaScript in Node with synthetic native callbacks and phone commit; no firmware, wireless or real Room proof' };
}
if (require.main === module) check(process.argv[2]).then(value => process.stdout.write(JSON.stringify(value, null, 2) + '\n')).catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
module.exports = { check };

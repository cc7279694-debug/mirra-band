const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createCompanionStore } = require('../src/lib/companion-store');
const protocol = require('../src/lib/companion-protocol');
const path = require('node:path');
const vm = require('node:vm');

function rig(receiverOverride) {
  let clock = 100000, id = 0, listener, allowed = true, completed = null;
  const sent = [], timers = new Map(), repeats = new Map(), begins = [];
  let cancelled = 0, status = 'idle';
  const fakeReceiver = {
    begin(context) { begins.push(context); status = 'receiving'; },
    receive(message) {
      if (message.type === 'CATALOG_ERROR') { status = 'failed'; return Promise.resolve(null); }
      status = 'persisting';
      return new Promise(resolve => { completed = () => { status = 'persisted'; resolve({ ...begins.at(-1), type: 'CATALOG_ACK', revision: 'catalog-12345678-12', code: 'PERSISTED' }); }; });
    },
    expire() { status = 'failed'; return null; },
    cancel() { cancelled++; status = 'idle'; },
    snapshot() { return { status, code: null, revision: null, receivedParts: 0, partCount: 0 }; },
  };
  const receiver = receiverOverride || fakeReceiver;
  const transport = { subscribe(fn) { listener = fn; return () => { listener = null; }; },
    start() { listener({ kind: 'connection', status: 'connected' }); }, stop() {},
    send(payload) { sent.push(JSON.parse(payload)); return true; } };
  const store = createCompanionStore({ transport, catalogReceiver: receiver, controlAllowed: () => allowed,
    catalogRevision: () => 'catalog-aaaaaaaa-10', now: () => clock, randomId: () => 'v3-' + (++id),
    setTimeout(fn, delay) { timers.set(++id, { fn, delay }); return id; }, clearTimeout(handle) { timers.delete(handle); },
    setInterval(fn) { repeats.set(++id, fn); return id; }, clearInterval(handle) { repeats.delete(handle); } });
  const owner = {};
  function reply(message) { listener({ kind: 'message', payload: JSON.stringify(message) }); }
  function ack(version = 3) {
    const hello = sent.at(-1);
    reply({ ...hello, type: 'HELLO_ACK', protocolVersion: version, streamId: 'stream-v3' });
  }
  function snapshot() {
    const request = sent.findLast(message => message.type === 'GET_SNAPSHOT');
    const fixture = JSON.parse(fs.readFileSync('protocol/v1/fixtures/active.json', 'utf8'));
    const message = { ...request, type: 'SNAPSHOT', sequence: 1, sourceObservedAtUnixMs: 2000000,
      body: fixture.body, control: { activeSegmentId: 'segment-1', allowedActions: ['START_BREAK'],
        controlGrant: 'grant-1', grantExpiresAtUnixMs: 2010000, expectedFirstAction: null } };
    delete message.lastSeenSessionId; reply(message);
  }
  return { store, owner, sent, begins, timers, repeats, receiver, reply, ack, snapshot,
    cancelled: () => cancelled, allow(value) { allowed = value; },
    finish() { completed(); }, event(event) { listener(event); },
    advance(ms) { clock += ms; [...repeats.values()].forEach(fn => fn()); },
    fire(delay) { const selected = [...timers.values()].find(timer => timer.delay === delay); assert(selected); selected.fn(); } };
}

test('v3 strict negotiation adds catalog without changing v1/v2 capability rules', () => {
  const hello = { protocolVersion: 3, type: 'HELLO', clientInstanceId: 'client-3', requestId: 'request-3',
    capabilities: ['READ_ONLY_SNAPSHOT', 'SESSION_CONTROL', 'BOOK_CATALOG'] };
  assert.deepEqual(protocol.decodeMessage(protocol.encodeMessage(hello)), hello);
  assert.throws(() => protocol.encodeMessage({ ...hello, protocolVersion: 2 }), /CAPABILITY/);
  assert.throws(() => protocol.encodeMessage({ ...hello, capabilities: ['BOOK_CATALOG', 'READ_ONLY_SNAPSHOT'] }), /CAPABILITY/);
});

test('catalog and authoritative snapshot have independent bounded requests on one store', () => {
  const r = rig(); r.store.start(r.owner);
  assert.equal(r.sent[0].protocolVersion, 3); r.ack();
  assert.deepEqual(r.sent.slice(1).map(message => message.type).sort(), ['GET_CATALOG', 'GET_SNAPSHOT']);
  assert.equal(r.begins.length, 1); assert.equal(r.sent.find(message => message.type === 'GET_CATALOG').knownRevision, 'catalog-aaaaaaaa-10');
  assert.equal(r.store.requestCatalog(), false);
  r.snapshot(); assert.equal(r.store.snapshot().freshness, 'fresh');
  assert.equal(r.store.snapshot().catalog.status, 'receiving');
  r.store.stop(r.owner); assert.equal(r.timers.size, 0); assert.equal(r.repeats.size, 0); assert(r.cancelled() > 0);
});

test('catalog ACK requires receiver persistence and old contexts cannot acknowledge after hide', async () => {
  const r = rig(); r.store.start(r.owner); r.ack(); r.snapshot();
  const request = r.sent.find(message => message.type === 'GET_CATALOG');
  r.reply({ protocolVersion: 3, type: 'CATALOG_MANIFEST', clientInstanceId: request.clientInstanceId,
    requestId: request.requestId, streamId: request.streamId, revision: 'catalog-12345678-12', schemaVersion: 1,
    totalBytes: 12, partCount: 1, bookCount: 0, checksum: '12345678' });
  assert.equal(r.sent.filter(message => message.type === 'CATALOG_ACK').length, 0);
  r.store.stop(r.owner); r.finish(); await Promise.resolve(); await Promise.resolve();
  assert.equal(r.sent.filter(message => message.type === 'CATALOG_ACK').length, 0);
});

test('catalog commit ACK and repeated synchronization reuse the negotiated stream', async () => {
  const r = rig(); r.store.start(r.owner); r.ack();
  const request = r.sent.find(message => message.type === 'GET_CATALOG');
  r.reply({ protocolVersion: 3, type: 'CATALOG_MANIFEST', clientInstanceId: request.clientInstanceId,
    requestId: request.requestId, streamId: request.streamId, revision: 'catalog-12345678-12', schemaVersion: 1,
    totalBytes: 12, partCount: 1, bookCount: 0, checksum: '12345678' });
  r.finish(); await Promise.resolve(); await Promise.resolve();
  assert.equal(r.sent.at(-1).type, 'CATALOG_ACK'); assert.equal(r.sent.at(-1).code, 'PERSISTED');
  assert.equal(r.store.requestCatalog(), true); assert.equal(r.sent.at(-1).type, 'GET_CATALOG');
  assert.equal(r.sent.filter(message => message.type === 'HELLO').length, 1);
});

test('v3 fallback tries v2 then v1 without enabling catalog on old peers', () => {
  const r = rig(); r.store.start(r.owner); r.fire(3000);
  assert.equal(r.sent.at(-1).protocolVersion, 2); assert.equal(r.sent.at(-1).type, 'HELLO');
  r.fire(3000); assert.equal(r.sent.at(-1).protocolVersion, 1);
  r.ack(1); assert.equal(r.sent.at(-1).type, 'GET_SNAPSHOT');
  assert.equal(r.sent.filter(message => message.type === 'GET_CATALOG').length, 0);
  assert.equal(r.store.requestCatalog(), false);
});

test('local mode or active local work denies even current v3 phone grants', () => {
  const r = rig(); r.store.start(r.owner); r.ack(); r.snapshot();
  assert.deepEqual(r.store.snapshot().control.availableActions, ['START_BREAK']);
  r.allow(false); assert.deepEqual(r.store.snapshot().control.availableActions, []);
  assert.equal(r.store.submitControl('START_BREAK', { breakMinutes: 5, expected: r.store.snapshot().control.subject }, r.owner), false);
  assert.equal(r.sent.filter(message => message.type === 'COMMAND').length, 0);
  r.allow(true); assert.equal(r.store.submitControl('START_BREAK', { breakMinutes: 5, expected: r.store.snapshot().control.subject }, r.owner), true);
  assert.equal(r.sent.at(-1).protocolVersion, 3);
});

test('catalog fixed deadline and disconnect retire work without replacing snapshot freshness', () => {
  const r = rig(); r.store.start(r.owner); r.ack(); r.snapshot();
  r.fire(30000); assert.equal(r.store.snapshot().catalog.status, 'failed');
  assert.equal(r.store.snapshot().freshness, 'fresh');
  assert.equal(r.store.requestCatalog(), true);
  const request = r.sent.at(-1); r.event({ kind: 'connection', status: 'disconnected' });
  const count = r.sent.length;
  r.reply({ protocolVersion: 3, type: 'CATALOG_ERROR', clientInstanceId: request.clientInstanceId,
    requestId: request.requestId, streamId: request.streamId, code: 'TIMEOUT' });
  assert.equal(r.sent.length, count); assert.notEqual(r.store.snapshot().freshness, 'fresh');
});

test('v3 catalog envelopes retain duplicate-key and context rejection', () => {
  const source = '{"protocolVersion":3,"type":"GET_CATALOG","clientInstanceId":"c","requestId":"r","streamId":"s","knownRevision":null}';
  assert.equal(protocol.decodeMessage(source).type, 'GET_CATALOG');
  assert.throws(() => protocol.decodeMessage(source.replace('"knownRevision":null', '"knownRevision":null,"knownRevision":null')), /DUPLICATE/);
  assert.throws(() => protocol.decodeMessage(source, { streamId: 'different' }), /CONTEXT/);
});

function appRig() {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/formal-app.ux'), 'utf8');
  const script = source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1];
  let runtimeCount = 0, transportCount = 0, companionCount = 0, localClosed = 0, destroyed = 0;
  const local = { status: 'EMPTY', busy: false, document: null };
  const phone = { freshness: 'unknown', body: null, control: { busy: false } };
  const catalog = { status: 'empty', revision: null, catalog: null };
  const owner = { open: () => Promise.resolve(), snapshot: () => local, close() { localClosed++; }, subscribe: () => () => {} };
  const catalogOwner = { open: () => Promise.resolve(), snapshot: () => catalog, subscribe: () => () => {}, save: async input => ({ status: 'ready', ...input }) };
  const runtime = { owner, catalogOwner, getBooks: () => [], close() { localClosed++; } };
  const companion = { snapshot: () => phone, destroy() { destroyed++; } };
  const modules = {
    './lib/formal-local-runtime': { createFormalLocalRuntime(options) { runtimeCount++; assert.equal(typeof options.getMode, 'function'); return runtime; } },
    './lib/catalog-protocol': { createCatalogReceiver(options) { assert.equal(typeof options.persist, 'function'); return { snapshot: () => ({ status: 'idle' }) }; } },
    './platform/interconnect-transport': { createTransport() { transportCount++; return {}; } },
    './lib/record-sync': { createRecordSync(options) { assert.equal(typeof options.listRecords, 'function'); assert.equal(typeof options.acknowledge, 'function'); return {}; } },
    './lib/companion-store': { createCompanionStore(options) { companionCount++; assert.equal(typeof options.controlAllowed, 'function'); return companion; } },
    './profile': { mode: 'live', standalone: true },
  };
  const imports = {};
  const transformed = script.replace(/^\s*import\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
    (_line, name, specifier) => { assert(modules[specifier], specifier); imports[name] = modules[specifier]; return 'const ' + name + ' = imports.' + name; })
    .replace(/\bexport\s+default\s+/, 'module.exports = ');
  const module = { exports: {} };
  new vm.Script('(function(module,imports,require){\n' + transformed + '\n})').runInNewContext()(module, imports, () => { throw new Error('No native load required in app creation'); });
  const app = Object.assign({}, module.exports);
  return { app, local, phone, catalog, counts: () => ({ runtimeCount, transportCount, companionCount, localClosed, destroyed }) };
}

test('formal application owns one local engine, catalog and transport across modes', async () => {
  const r = appRig(); r.app.onCreate(); await Promise.resolve();
  assert.equal(r.app.getMode(), 'LOCAL');
  assert.equal(r.app.getLocalOwner(), r.app.getLocalOwner());
  assert.equal(r.app.getCatalogOwner(), r.app.getCatalogOwner());
  assert.equal(r.app.getCompanion(), r.app.getCompanion());
  assert.deepEqual(r.counts(), { runtimeCount: 1, transportCount: 1, companionCount: 1, localClosed: 0, destroyed: 0 });
  assert.equal(r.app.setMode('PHONE'), true); assert.equal(r.app.canUsePhoneControl(), true);
  r.local.document = { state: 'FOCUS', active: { id: 'same-local-session' }, preparation: null };
  assert.equal(r.app.canUsePhoneControl(), false); assert.equal(r.app.setMode('PHONE'), false);
  assert.equal(r.app.setMode('LOCAL'), true);
  assert.equal(r.app.setMode('PHONE'), false);
  r.app.onDestroy(); r.app.onDestroy();
  assert.equal(r.counts().localClosed, 1); assert.equal(r.counts().destroyed, 1);
  assert.throws(() => r.app.getLocalOwner(), /RETIRED/);
});

test('formal mode switches fail closed during uncertain storage and pending phone commands', () => {
  const r = appRig(); r.app.onCreate();
  for (const status of ['UNOPENED', 'OPENING', 'BLOCKED', 'UNCERTAIN', 'CLOSED']) {
    r.local.status = status; assert.equal(r.app.setMode('PHONE'), false);
  }
  r.local.status = 'READY'; r.local.busy = true; assert.equal(r.app.setMode('PHONE'), false);
  r.local.busy = false; assert.equal(r.app.setMode('PHONE'), true);
  r.phone.control.busy = true; assert.equal(r.app.setMode('LOCAL'), false);
});

test('real catalog receiver sends no persisted ACK before exact durable receipt', async () => {
  const codec = require('../src/lib/catalog-protocol');
  let commit, writes = 0;
  const receiver = codec.createCatalogReceiver({ now: () => 100000, persist(input) {
    writes++; return new Promise(resolve => { commit = () => resolve({ status: 'ready', ...input }); });
  } });
  const r = rig(receiver); r.store.start(r.owner); r.ack(); r.snapshot();
  const request = r.sent.find(message => message.type === 'GET_CATALOG');
  const catalog = { schemaVersion: 1, books: [{ id: 'real-book', title: '真实书籍', totalPages: 200,
    currentPage: 32, firstAction: '翻到第32页，读第一段。', isMainline: true }] };
  const transfer = codec.buildTransfer(request, catalog);
  transfer.frames.forEach(frame => r.reply(frame));
  await Promise.resolve(); assert.equal(writes, 1);
  assert.equal(r.sent.filter(message => message.type === 'CATALOG_ACK').length, 0);
  assert.equal(r.store.snapshot().catalog.status, 'persisting');
  commit(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(r.sent.at(-1).type, 'CATALOG_ACK'); assert.equal(r.sent.at(-1).revision, transfer.revision);
  assert.equal(r.store.snapshot().freshness, 'fresh'); assert.equal(r.store.snapshot().catalog.busy, false);
});

test('formal mode UX shows cached catalog offline and owns only its transport lease', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/Mode/index.ux'), 'utf8');
  const script = source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1];
  const routes = [], subscriptions = new Set(), leases = new Set();
  let mode = 'LOCAL', allowPhone = false, starts = 0, stops = 0;
  const catalog = { snapshot: () => ({ status: 'ready', errorCode: null, catalog: { books: [{ id: 'real' }] } }),
    subscribe(fn) { subscriptions.add(fn); return () => subscriptions.delete(fn); } };
  const local = { snapshot: () => ({ status: 'READY', busy: false, document: null }),
    subscribe(fn) { subscriptions.add(fn); return () => subscriptions.delete(fn); } };
  const companion = { snapshot: () => ({ connection: 'disconnected', catalog: { busy: false, errorCode: null } }),
    subscribe(fn) { subscriptions.add(fn); return () => subscriptions.delete(fn); },
    start(page) { starts++; leases.add(page); }, stop(page) { stops++; leases.delete(page); },
    requestCatalog: () => false, requestRefresh() {} };
  const app = { getCompanion: () => companion, getCatalogOwner: () => catalog, getLocalOwner: () => local,
    setMode(next) { if (next === 'PHONE' && !allowPhone) return false; mode = next; return true; } };
  const transformed = script.replace(/import router from '@system.router'/, 'const router = imports.router')
    .replace(/\bexport\s+default\s+/, 'module.exports = ');
  const module = { exports: {} };
  new vm.Script('(function(module,imports){\n' + transformed + '\n})').runInNewContext()(module,
    { router: { push(args) { routes.push(args.uri); } } });
  const page = Object.assign({}, module.exports, module.exports.private, { $app: { $def: app } });
  page.onInit(); page.onShow(); page.onShow();
  assert.match(page.catalogText, /1 本书，可离线学习/); assert.equal(starts, 1); assert.equal(subscriptions.size, 3);
  page.openPhone(); assert.deepEqual(routes, []); assert.equal(mode, 'LOCAL');
  page.openLocal(); assert.deepEqual(routes, ['/pages/LocalSession']);
  allowPhone = true; page.openPhone(); assert.equal(mode, 'PHONE'); assert.equal(routes.at(-1), '/pages/Home');
  page.onHide(); page.onDestroy(); assert.equal(stops, 1); assert.equal(leases.size, 0); assert.equal(subscriptions.size, 0);
  page.openLocal(); assert.equal(routes.length, 2);
});

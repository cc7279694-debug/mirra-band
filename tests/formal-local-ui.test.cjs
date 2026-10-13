const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const domainLib = require('../src/lib/local-session');
const presentationLib = require('../src/lib/local-presentation');
const flowLib = require('../src/lib/local-ui-flow');
const { createLocalOwner } = require('../src/lib/local-owner');

function rig(options = {}) {
  let books = options.empty ? [] : [{ id: 'real-book', title: options.title || '真实主线书籍', startPage: options.pendingPage || 12,
    pendingPage: options.pendingPage || null, totalPages: 200, currentPage: 12, isMainline: true,
    firstActions: [{ id: 'phone-default', text: options.action || '翻到第12页，读第一段。' }] }];
  let revision = 'catalog-12345678-256', now = 100000, writes = 0, reads = 0, releaseYield;
  const slots = [null, null], intervals = new Map(), catalogListeners = new Set(), leases = new Set();
  let mode = options.mode || 'LOCAL', nextTimer = 0;
  const owner = createLocalOwner({ storageQualified: true, sessionContext: { profile: 'formal' },
    catalogProvider: () => books, catalogRevisionProvider: () => revision,
    beforeDispatch: action => action.type === 'START_CONFIRMED' && mode !== 'LOCAL' ? 'PHONE_MODE_ACTIVE' : null,
    backendFactory: () => ({ async read(slot) { reads++; return slots[slot]; }, async write(slot, raw) { writes++; slots[slot] = raw; } }),
    clock: () => ({ wallMs: now, ownerId: 'formal-ui-owner', monotonicMs: null, monotonicVerified: false }),
    installationIdFactory: () => 'formal-ui-install' });
  const app = { getLocalOwner: () => owner, getLocalCatalog: () => books,
    getCatalogOwner: () => ({ snapshot: () => ({ revision }) }),
    subscribeCatalog(fn) { catalogListeners.add(fn); return () => catalogListeners.delete(fn); },
    getCompanion: () => ({ start(page) { leases.add(page); }, stop(page) { leases.delete(page); } }), getMode: () => mode };
  const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/LocalSession/index.ux'), 'utf8');
  const script = source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm, '').replace(/\bexport\s+default\s+/, 'module.exports = ');
  const module = { exports: {} };
  const context = { module, domainLib, presentationLib, flowLib, profile: { mode: 'live', standalone: true, versionName: '0.4.0' },
    Promise, Array, Object, Number, String, Math, JSON,
    setInterval(callback) { intervals.set(++nextTimer, callback); return nextTimer; }, clearInterval(handle) { intervals.delete(handle); } };
  if (options.holdYield) context.setTimeout = callback => { releaseYield = callback; return 1; };
  vm.runInNewContext(script, context);
  const page = Object.assign({}, module.exports, module.exports.private, { $app: { $def: app, exit() {} } });
  page.onInit();
  return { page, owner, leases, catalogListeners, slots, intervals, writes: () => writes, reads: () => reads,
    release: () => releaseYield(), next(ms) { now += ms; }, tick() { [...intervals.values()].forEach(fn => fn()); },
    changeCatalog(next) { books = next; revision = 'catalog-87654321-256'; [...catalogListeners].forEach(fn => fn()); },
    cleanup() { page.onDestroy(); owner.close(); } };
}

test('formal UI with no confirmed catalog has no TEST_BOOKS fallback or start write', async () => {
  const r = rig({ empty: true }); try {
    await r.page.onShow();
    assert.equal(r.page.experimentLabel, '独立'); assert.equal(r.page.primaryEnabled, false);
    assert.match(r.page.noticeText, /暂无离线书籍|启用目录同步/);
    assert.equal(r.page.bookChoices.length, 0); assert.equal(r.page._projection.preview, null);
    assert.doesNotMatch(r.page.detailSourceText, /测试|实验/);
    await r.page.confirmStart(); assert.equal(r.writes(), 0); assert.equal(r.owner.snapshot().document, null);
  } finally { r.cleanup(); }
});

test('formal UI uses cached real book and one owner; explicit confirmation starts one atomic session', async () => {
  const r = rig(); try {
    await r.page.onShow(); r.page.onShow();
    assert.equal(r.leases.size, 1); assert.equal(r.catalogListeners.size, 1);
    assert.equal(r.page.previewBookTitle, '真实主线书籍'); assert.equal(r.page.primaryEnabled, true);
    assert.equal(r.writes(), 0); assert.equal(r.owner.snapshot().document, null);
    await r.page.confirmStart(); assert.equal(r.page.view, 'READING'); assert.equal(r.writes(), 1);
    assert.equal(r.owner.snapshot().document.active.bookSnapshot.id, 'real-book');
    assert.equal(r.owner.snapshot().document.active.firstActionSnapshot.text, '翻到第12页，读第一段。');
    r.next(15000); r.tick(); assert.equal(r.page.timerText, '00:15'); assert.equal(r.page.timerQualifier, '参考值');
    const reads = r.reads(), writes = r.writes(); r.tick(); assert.equal(r.reads(), reads); assert.equal(r.writes(), writes);
    r.page.onHide(); assert.equal(r.leases.size, 0); assert.equal(r.catalogListeners.size, 0);
  } finally { r.cleanup(); }
});

test('formal ready and details preserve full120/160 title/action semantic text', async () => {
  const title = '书'.repeat(120), action = '读'.repeat(160);
  const r = rig({ title, action }); try {
    await r.page.onShow();
    assert.equal(r.page.previewLongAction, true); assert.equal(r.page.bookRows.join(''), title);
    assert.equal(r.page.actionRows.join(''), action); assert.equal(r.page._projection.preview.bookTitle, title);
    r.page.showDetails(); assert.equal(r.page.bookRows.join(''), title); assert.equal(r.page.actionRows.join(''), action);
    assert.match(r.page.detailSyncText, /仅同步目录.*学习记录未上传/);
    r.page.backView(); await r.page.confirmStart(); assert.equal(r.page.view, 'READING');
    assert.equal(r.owner.snapshot().document.active.firstActionSnapshot.text, action);
  } finally { r.cleanup(); }
});

test('long real book alone selects full ready rows instead of clipping its name', async () => {
  const title = '完整书籍名称'.repeat(18); const r = rig({ title, action: '读第一段。' }); try {
    await r.page.onShow(); assert.equal(r.page.previewLongAction, true); assert.equal(r.page.bookRows.join(''), title);
    const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/LocalSession/index.ux'), 'utf8');
    assert.match(source, /for="\{\{bookRows\}\}" type="ready-full-book"/);
  } finally { r.cleanup(); }
});

test('directory updates preserve active/pending snapshots and null page completion', async () => {
  const r = rig(); try {
    await r.page.onShow(); await r.page.confirmStart();
    const active = JSON.parse(JSON.stringify(r.owner.snapshot().document.active));
    r.changeCatalog([]); assert.deepEqual(r.owner.snapshot().document.active, active);
    assert.equal(r.page.bookTitle, '真实主线书籍'); assert.equal(r.page.view, 'READING');
    r.page.showFinish(); await r.page.finishSession();
    assert.equal(r.owner.snapshot().document.pending[0].endPage, null); const pending = r.owner.snapshot().document.pending[0];
    assert.equal(r.page.view, 'SAVED'); assert.match(r.page.detailSyncText, /学习记录未上传/);
    r.changeCatalog([]); assert.deepEqual(r.owner.snapshot().document.pending[0], pending);
  } finally { r.cleanup(); }
});

test('catalog changes during busy-yield reject captured first-step confirmation before file writing', async () => {
  const r = rig({ holdYield: true }); try {
    await r.page.onShow(); const starting = r.page.confirmStart();
    r.changeCatalog([{ id: 'new-real', title: '更新后书籍', startPage: 20, firstActions: [{ id: 'preset-read', text: '读第一段。' }] }]);
    r.release(); await starting;
    assert.equal(r.writes(), 0); assert.equal(r.owner.snapshot().document, null);
    assert.notEqual(r.page.view, 'READING'); assert.equal(r.page._projection.preview.bookId, 'new-real');
  } finally { r.cleanup(); }
});

test('pending wrist page is explicitly unconfirmed and never claims phone progress changed', async () => {
  const r = rig({ pendingPage: 32 }); try {
    await r.page.onShow();
    assert.match(r.page._projection.startPageText, /待确认.*未更新手机/);
    assert.match(r.page.noticeText, /待确认进度.*未更新手机/);
    assert.equal(r.writes(), 0);
  } finally { r.cleanup(); }
});

test('formal next-session recommendation prefers mainline over a different completed book', () => {
  const books = [{ id: 'mainline-real', title: '当前主线', startPage: 10, isMainline: true,
    firstActions: [{ id: 'preset-read', text: '读第一段。' }] },
  { id: 'other-real', title: '此前阅读', startPage: 20, isMainline: false,
    firstActions: [{ id: 'preset-read', text: '读第一段。' }] }];
  const context = { profile: 'formal', catalog: books, catalogRevision: 'catalog-12345678-256' };
  const clock = { wallMs: 1000, ownerId: 'priority-owner', monotonicMs: null, monotonicVerified: false };
  const active = domainLib.transition(domainLib.createDocument('priority-install'),
    { type: 'START_CONFIRMED', bookId: 'other-real', firstActionId: 'preset-read', confirmed: true,
      catalogRevision: context.catalogRevision }, clock, context);
  const finished = domainLib.transition(active, { type: 'FINISH', endPage: null }, { ...clock, wallMs: 2000 }, context);
  const preview = presentationLib.resolveReadyPreview({ document: finished, sequence: 2 },
    { formal: true, catalogRevision: context.catalogRevision }, books);
  assert.equal(preview.bookId, 'mainline-real');
  const deliberatelySelected = presentationLib.resolveReadyPreview({ document: finished, sequence: 2 },
    { formal: true, catalogRevision: context.catalogRevision, bookId: 'other-real' }, books);
  assert.equal(deliberatelySelected.bookId, 'other-real');
  assert.equal(finished.pending[0].bookSnapshot.id, 'other-real');
});

test('actual formal app, catalog journal and file boundary retain a real local session across directory replacement', async () => {
  const runtimeLib = require('../src/lib/formal-local-runtime');
  const storeLib = require('../src/lib/companion-store');
  const catalogLib = require('../src/lib/catalog-protocol');
  const files = new Map(), calls = [], pageTimers = new Map(), yieldCallbacks = [];
  let nextTimer = 0, transportOwners = 0;
  const nativeFile = { readText(request) {
    calls.push({ kind: 'read', uri: request.uri });
    if (files.has(request.uri)) request.success({ text: files.get(request.uri) }); else request.fail(null, 301);
  }, writeText(request) { calls.push({ kind: 'write', uri: request.uri }); files.set(request.uri, request.text); request.success(); } };
  const transportLib = { createTransport() {
    transportOwners++; let listener;
    return { subscribe(fn) { listener = fn; return () => { listener = null; }; },
      start() { if (listener) listener({ kind: 'connection', status: 'unsupported' }); }, stop() {}, send() { return false; } };
  } };
  function evaluate(relative, context) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8');
    const script = source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1]
      .replace(/^import .+$/gm, '').replace(/\bexport\s+default\s+/, 'module.exports = ');
    const module = { exports: {} }; vm.runInNewContext(script, { module, ...context }); return module.exports;
  }
  const app = evaluate('src/formal-app.ux', { runtimeLib, storeLib, catalogLib, transportLib, Promise,
    require(name) { assert.equal(name, '@system.file'); return nativeFile; } });
  app.onCreate(); await app._ready;
  const raw = { schemaVersion: 1, books: [{ id: 'actual-real', title: '真实离线目录', totalPages: 300,
    currentPage: 12, firstAction: null, isMainline: true }] };
  const canonical = catalogLib.canonicalCatalog(raw);
  await app.getCatalogOwner().save({ revision: catalogLib.revisionFor(canonical), catalog: raw, canonical });
  const definition = evaluate('src/pages/LocalSession/index.ux', { domainLib, presentationLib, flowLib,
    profile: { mode: 'live', standalone: true, versionName: '0.4.0' }, Promise, Array, Object, Number, String, Math, JSON,
    setTimeout(callback) { yieldCallbacks.push(callback); return 1; },
    setInterval(callback) { pageTimers.set(++nextTimer, callback); return nextTimer; }, clearInterval(handle) { pageTimers.delete(handle); } });
  const page = Object.assign({}, definition, definition.private, { $app: { $def: app, exit() {} } });
  try {
    page.onInit(); await page.onShow();
    assert.equal(page.previewBookTitle, '真实离线目录');
    assert.equal(page.actionText, '翻到第12页，读这一页的第一段。');
    const before = calls.filter(call => call.kind === 'write' && /mirra_local_sessions_live/.test(call.uri)).length;
    const staleStart = page.confirmStart(); assert.equal(yieldCallbacks.length, 1);
    const changed = { schemaVersion: 1, books: [{ ...raw.books[0], title: '目录已更新', currentPage: 20 }] };
    const changedRaw = catalogLib.canonicalCatalog(changed);
    await app.getCatalogOwner().save({ revision: catalogLib.revisionFor(changedRaw), catalog: changed, canonical: changedRaw });
    yieldCallbacks.shift()(); await staleStart;
    assert.equal(app.getLocalOwner().snapshot().document, null);
    assert.equal(calls.filter(call => call.kind === 'write' && /mirra_local_sessions_live/.test(call.uri)).length, before);
    assert.notEqual(page.view, 'READING'); assert.equal(page.previewBookTitle, '目录已更新');
    await app.getCatalogOwner().save({ revision: catalogLib.revisionFor(canonical), catalog: raw, canonical });
    await page.reload();
    const start = page.confirmStart(); yieldCallbacks.shift()(); await start; assert.equal(page.view, 'READING');
    assert.equal(calls.filter(call => call.kind === 'write' && /mirra_local_sessions_live/.test(call.uri)).length, before + 1);
    const active = JSON.parse(JSON.stringify(app.getLocalOwner().snapshot().document.active));
    const replacement = { schemaVersion: 1, books: [] }, replacementRaw = catalogLib.canonicalCatalog(replacement);
    await app.getCatalogOwner().save({ revision: catalogLib.revisionFor(replacementRaw), catalog: replacement, canonical: replacementRaw });
    assert.deepEqual(app.getLocalOwner().snapshot().document.active, active); assert.equal(page.bookTitle, '真实离线目录');
    page.showFinish(); const finish = page.finishSession(); yieldCallbacks.shift()(); await finish; assert.equal(page.view, 'SAVED');
    const finished = app.getLocalOwner().snapshot().document.pending[0];
    assert.equal(finished.id, active.id); assert.equal(finished.endPage, null); assert.equal(finished.bookSnapshot.title, '真实离线目录');
    assert.equal(transportOwners, 1);
    assert(calls.every(call => /^internal:\/\/files\/mirra_(?:catalog|local_sessions)_live_[ab]\.json$/.test(call.uri)));
  } finally { page.onDestroy(); app.onDestroy(); }
  assert.equal(pageTimers.size, 0);
});

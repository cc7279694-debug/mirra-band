const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ownerLib = require('../src/lib/local-owner');
const storageLib = require('../src/platform/local-storage');
const domainLib = require('../src/lib/local-session');

// Only the firmware callback boundary is substituted. The real app and UX
// scripts, adapter, journal, codec, owner and state machine execute here.
// This test does not prove Vela rendering, firmware durability or real time.
function evaluate(relative, context) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8');
  const script = source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm, '').replace(/\bexport\s+default\s+/, 'module.exports = ');
  const module = { exports: {} }; vm.runInNewContext(script, { module, ...context }); return module.exports;
}
function rig(options = {}) {
  const values = options.values || new Map(); const nativeCalls = []; const timers = new Map();
  let wallMs = options.wallMs || 100000; let nextTimer = 0; let writeFailure = false; let holdReadback = false; let pendingReadback = null;
  const native = {
    get(request) {
      nativeCalls.push({ kind: 'get', key: request.key });
      if (holdReadback && pendingReadback === request.key) { pendingReadback = request; return; }
      request.success(values.has(request.key) ? values.get(request.key) : '');
    },
    set(request) {
      nativeCalls.push({ kind: 'set', key: request.key });
      if (writeFailure) { request.fail('private firmware text', 300); return; }
      values.set(request.key, request.value); if (holdReadback) pendingReadback = request.key;
      request.success();
    },
  };
  const appDef = evaluate('src/local-app.ux', {
    ownerLib, storageLib, profile: { mode: 'local-session', storageQualified: options.qualified !== false, storageBackend: 'storage' },
    Date: { now: () => wallMs }, Math, Number, String,
    require(name) { assert.equal(name, '@system.storage'); return native; },
  });
  appDef.onCreate(); const app = { $def: appDef, exit() { appDef.onDestroy(); } };
  function newPage() {
    const definition = evaluate('src/pages/LocalSession/index.ux', {
      domainLib, Promise, Array, Object, Number, String, Math,
      setInterval(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
      clearInterval(id) { timers.delete(id); },
    });
    const page = Object.assign({}, definition, definition.private, { $app: app }); page.onInit(); return page;
  }
  const page = newPage();
  return { page, newPage, app, values, nativeCalls, owner: appDef.getLocalOwner(), timers,
    next(ms) { wallMs += ms; },
    tick() { for (const callback of timers.values()) callback(); },
    hold() { holdReadback = true; },
    waiting() { return Boolean(pendingReadback && typeof pendingReadback === 'object'); },
    release() { const request = pendingReadback; holdReadback = false; pendingReadback = null; request.success(values.get(request.key)); },
    failWrites() { writeFailure = true; },
    cleanup() { page.onDestroy(); appDef.onDestroy(); },
  };
}
async function prepare(r) {
  await r.page.onShow(); r.page.showBooks(); await r.page.selectBook(domainLib.TEST_BOOKS[0].id);
  r.page.showActions(); await r.page.selectAction(domainLib.TEST_BOOKS[0].firstActions[0].id);
}

test('a non-qualified compiled-entry setting performs native reads but zero identity or session writes', async () => {
  const r = rig({ qualified: false }); try {
    await r.page.onShow(); r.page.showBooks(); await r.page.selectBook(domainLib.TEST_BOOKS[0].id); await r.page.confirmStart();
    assert.equal(r.owner.snapshot().document, null); assert.equal(r.page.canWrite, false);
    assert.ok(r.nativeCalls.some(call => call.kind === 'get')); assert.equal(r.nativeCalls.filter(call => call.kind === 'set').length, 0);
    assert.equal(r.values.size, 0); assert.match(r.page.recoveryHint, /损坏恢复.*覆盖升级.*重启/);
  } finally { r.cleanup(); }
});

test('actual app, native adapter and page complete a durable local loop with one session, explicit resume and nullable finish', async () => {
  const r = rig(); try {
    await prepare(r); assert.equal(r.page.state, 'PREPARING'); assert.equal(r.owner.snapshot().document.active, null);
    r.hold(); const starting = r.page.confirmStart();
    while (!r.waiting()) await Promise.resolve();
    r.page.confirmStart(); assert.equal(r.page.state, 'PREPARING'); assert.equal(r.page.busy, true);
    r.release(); await starting;
    const firstId = r.owner.snapshot().document.active.id; assert.equal(r.page.sessionId, firstId);
    r.next(65000); r.tick(); assert.equal(r.page.focusText, '观察 01:05');
    r.page.onHide(); const secondPage = r.newPage(); await secondPage.onShow();
    assert.equal(secondPage.sessionId, firstId); assert.equal(r.owner.snapshot().document.counter, 1);
    await secondPage.beginBreak(5); const writes = r.nativeCalls.filter(call => call.kind === 'set').length;
    r.next(360000); r.tick(); assert.equal(secondPage.state, 'BREAK'); assert.match(secondPage.breakText, /已到.*主动继续/);
    assert.equal(r.nativeCalls.filter(call => call.kind === 'set').length, writes);
    await secondPage.resume(); assert.equal(secondPage.state, 'FOCUS');
    r.next(15000); secondPage.showFinish(); await secondPage.finishSession();
    assert.equal(secondPage.state, 'FINISHED_PENDING_SYNC'); assert.equal(secondPage.pendingCount, 1);
    const document = r.owner.snapshot().document; assert.equal(document.pending[0].id, firstId); assert.equal(document.pending[0].endPage, null);
    assert.equal(document.pending[0].intervals.length, 3); assert.equal(r.owner.snapshot().summary.observedFocusMs, 80000);
    await secondPage.newSession(); secondPage.showBooks(); await secondPage.selectBook(domainLib.TEST_BOOKS[1].id);
    assert.equal(r.owner.snapshot().document.pending.length, 1); assert.equal(r.owner.snapshot().document.pending[0].id, firstId);
    assert.ok(r.nativeCalls.every(call => /^mirra_05b_test_sessions_[ab]$/.test(call.key)));
    secondPage.onDestroy();
  } finally { r.cleanup(); }
});

test('a new app process recovers the same session and keeps uncertain raw boundaries before saving the completion', async () => {
  const original = rig(); await prepare(original); await original.page.confirmStart();
  const id = original.owner.snapshot().document.active.id; original.next(10000); const values = original.values;
  original.page.exitLocal(); original.page.onDestroy();
  const recovered = rig({ values, wallMs: 120000 }); try {
    await recovered.page.onShow(); assert.equal(recovered.page.sessionId, id); assert.equal(recovered.page.state, 'FOCUS');
    assert.equal(recovered.owner.snapshot().summary.observedFocusMs, null); assert.match(recovered.page.timeHint, /时间不确定.*原始/);
    assert.equal(recovered.nativeCalls.filter(call => call.kind === 'set').length, 0);
    recovered.page.showFinish(); await recovered.page.finishSession();
    assert.equal(recovered.owner.snapshot().document.pending[0].id, id); assert.equal(recovered.owner.snapshot().document.pending[0].endPage, null);
    assert.equal(recovered.owner.snapshot().document.pending[0].intervals[0].start.ownerId === recovered.owner.snapshot().document.pending[0].finishedAt.ownerId, false);
  } finally { recovered.cleanup(); original.cleanup(); }
});

test('an actual native write failure cannot make the page show started or erase its last preparation', async () => {
  const r = rig(); try {
    await prepare(r); const prior = new Map(r.values); r.failWrites(); await r.page.confirmStart();
    assert.equal(r.page.state, 'PREPARING'); assert.equal(r.owner.snapshot().document.active, null);
    assert.equal(r.page.canWrite, false); assert.equal(r.page.status, 'BLOCKED');
    assert.deepEqual(r.values, prior); assert.match(r.page.recoveryHint, /未确认.*重新读取/);
  } finally { r.cleanup(); }
});

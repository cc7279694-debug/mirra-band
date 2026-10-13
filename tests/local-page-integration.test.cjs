const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ownerLib = require('../src/lib/local-owner');
const storageLib = require('../src/platform/local-storage');
const domainLib = require('../src/lib/local-session');
const presentationLib = require('../src/lib/local-presentation');
const flowLib = require('../src/lib/local-ui-flow');

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
      domainLib, presentationLib, flowLib, profile: { versionName: '0.1.3' }, Promise, Array, Object, Number, String, Math, JSON,
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
    assert.equal(r.owner.snapshot().document, null); assert.equal(r.page._projection.canWrite, false);
    assert.ok(r.nativeCalls.some(call => call.kind === 'get')); assert.equal(r.nativeCalls.filter(call => call.kind === 'set').length, 0);
    assert.equal(r.values.size, 0); assert.match(r.page.recoveryRows.join(''), /损坏恢复.*覆盖升级.*重启/);
  } finally { r.cleanup(); }
});

test('actual app, native adapter and page complete a durable local loop with one session, explicit resume and nullable finish', async () => {
  const r = rig(); try {
    await prepare(r); assert.equal(r.page._projection.state, 'IDLE'); assert.equal(r.owner.snapshot().document, null);
    assert.equal(r.nativeCalls.filter(call => call.kind === 'set').length, 0);
    r.hold(); const starting = r.page.confirmStart();
    for (let count = 0; count < 100 && !r.waiting(); count++) await Promise.resolve();
    assert.equal(r.waiting(), true, 'actual adapter readback must be held');
    r.page.confirmStart(); assert.equal(r.page._projection.state, 'IDLE'); assert.equal(r.page._projection.busy, true);
    r.release(); await starting;
    const firstId = r.owner.snapshot().document.active.id; assert.equal(r.page._projection.details.sessionId, firstId);
    r.next(65000); r.tick(); assert.equal(r.page._projection.timer.valueText, '01:05'); assert.match(r.page._projection.timer.qualifier, /参考值/);
    r.page.onHide(); const secondPage = r.newPage(); await secondPage.onShow();
    assert.equal(secondPage._projection.details.sessionId, firstId); assert.equal(secondPage._projection.view, 'READING'); assert.equal(r.owner.snapshot().document.counter, 1);
    secondPage.openBreakPicker(); await secondPage.beginBreak(5); const writes = r.nativeCalls.filter(call => call.kind === 'set').length;
    r.next(360000); r.tick(); assert.equal(secondPage._projection.state, 'BREAK'); assert.equal(secondPage._projection.timer.valueText, '休息时间已到');
    assert.equal(r.nativeCalls.filter(call => call.kind === 'set').length, writes);
    await secondPage.resume(); assert.equal(secondPage._projection.state, 'FOCUS');
    r.next(15000); secondPage.showFinish(); await secondPage.finishSession();
    assert.equal(secondPage._projection.state, 'FINISHED_PENDING_SYNC'); assert.equal(secondPage._projection.view, 'SAVED'); assert.equal(secondPage._projection.pendingCount, 1);
    const document = r.owner.snapshot().document; assert.equal(document.pending[0].id, firstId); assert.equal(document.pending[0].endPage, null);
    assert.equal(document.pending[0].intervals.length, 3); assert.equal(r.owner.snapshot().summary.observedFocusMs, 80000);
    const finishedWrites = r.nativeCalls.filter(call => call.kind === 'set').length;
    secondPage.done(); secondPage.showBooks(); secondPage.selectBook(domainLib.TEST_BOOKS[1].id);
    assert.equal(r.nativeCalls.filter(call => call.kind === 'set').length, finishedWrites);
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
    await recovered.page.onShow(); assert.equal(recovered.page._projection.details.sessionId, id); assert.equal(recovered.page._projection.state, 'FOCUS'); assert.equal(recovered.page._projection.view, 'READING');
    assert.equal(recovered.owner.snapshot().summary.observedFocusMs, 20000); assert.equal(recovered.page.timerText, '00:20'); assert.equal(recovered.page.timerQualifier, '参考值');
    assert.equal(recovered.owner.snapshot().summary.trustedFocusMs, 0); assert.match(recovered.page._projection.details.timeReasonText, /OWNER_CHANGED/);
    assert.equal(recovered.nativeCalls.filter(call => call.kind === 'set').length, 0);
    recovered.page.showFinish(); await recovered.page.finishSession();
    assert.equal(recovered.owner.snapshot().document.pending[0].id, id); assert.equal(recovered.owner.snapshot().document.pending[0].endPage, null);
    assert.equal(recovered.owner.snapshot().document.pending[0].intervals[0].start.ownerId === recovered.owner.snapshot().document.pending[0].finishedAt.ownerId, false);
  } finally { recovered.cleanup(); original.cleanup(); }
});

test('an actual native write failure cannot make the page show started or erase its last preparation', async () => {
  const r = rig(); try {
    await r.owner.open(); await r.owner.dispatch({ type: 'SELECT_BOOK', bookId: domainLib.TEST_BOOKS[0].id });
    await r.owner.dispatch({ type: 'SELECT_ACTION', firstActionId: domainLib.TEST_BOOKS[0].firstActions[0].id });
    await r.page.onShow(); const prior = new Map(r.values); r.failWrites(); await r.page.confirmStart();
    assert.equal(r.page._projection.state, 'PREPARING'); assert.equal(r.owner.snapshot().document.active, null);
    assert.equal(r.page._projection.canWrite, false); assert.equal(r.page._projection.status, 'BLOCKED'); assert.equal(r.page._projection.view, 'STORAGE_NOTICE');
    assert.deepEqual(r.values, prior); assert.match(r.page.recoveryRows.join(''), /未确认.*重新读取/);
  } finally { r.cleanup(); }
});

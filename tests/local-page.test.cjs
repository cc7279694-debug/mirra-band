const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const domainLib = require('../src/lib/local-session');
const presentationLib = require('../src/lib/local-presentation');
const flowLib = require('../src/lib/local-ui-flow');
const { rig, prepare, start, finished, TEST_BOOKS } = require('./fixtures/local-ui-rig.cjs');
const { encodeRecord } = require('../src/lib/local-codec');

function scriptFrom(relative) {
  return fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8').match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .+$/gm, '').replace(/\bexport\s+default\s+/, 'module.exports = ');
}
function pageHarness(options = {}) {
  const r = options.r || rig(options); const timers = new Map(); const listeners = new Set(); const retiredListeners = [];
  let nextTimer = 0; let exits = 0;
  const owner = Object.assign({}, r.owner, { subscribe(listener) {
    listeners.add(listener); retiredListeners.push(listener); const off = r.owner.subscribe(listener);
    return () => { listeners.delete(listener); off(); };
  } });
  const app = { $def: { getLocalOwner: () => owner }, exit() { exits++; } };
  const module = { exports: {} };
  vm.runInNewContext(scriptFrom('src/pages/LocalSession/index.ux'), {
    module, domainLib, presentationLib, flowLib, profile: { versionName: '0.1.4' }, Promise, Array, Object, Number, String, Math, JSON,
    setInterval(callback, delay) { assert.equal(delay, 1000); const id = ++nextTimer; timers.set(id, callback); return id; },
    clearInterval(id) { timers.delete(id); },
  });
  const page = Object.assign({}, module.exports, module.exports.private, { $app: app }); page.onInit();
  return { page, owner, app, r, timers, listeners, retiredListeners, exits: () => exits,
    tick() { for (const callback of timers.values()) callback(); },
    cleanup() { page.onDestroy(); r.realOwner.close(); } };
}
async function shown(options) { const h = pageHarness(options); await h.page.onShow(); return h; }

test('cold ready retains visible local-record count and the nullable test starting page without writes', async () => {
  const r = rig(); await finished(r); const writes = r.writes.length;
  const h = await shown({ r }); try {
    assert.equal(h.page._projection.view, 'READY');
    assert.equal(h.page.recordLabel, '本地1条');
    assert.equal(h.page.bookPageLabel, '第1页');
    assert.equal(r.writes.length, writes);
    h.page.showBooks(); h.page.selectBook(TEST_BOOKS[1].id);
    assert.equal(h.page.bookPageLabel, '未设置页码');
    assert.equal(h.page.recordLabel, '本地1条');
  } finally { h.cleanup(); }
});

test('before reading the native page shows a non-actionable reading notice and obtains the app owner once', () => {
  const h = pageHarness(); try {
    assert.equal(h.page._projection.view, 'STORAGE_NOTICE'); assert.equal(h.page._projection.title, '正在读取');
    assert.equal(h.page._projection.canWrite, false); assert.equal(h.r.writes.length, 0); assert.equal(h.listeners.size, 0);
  } finally { h.cleanup(); }
});
test('empty show renders the recommended book and action without creating identity, preparation or session', async () => {
  const h = await shown(); try {
    assert.equal(h.page._projection.view, 'READY'); assert.equal(h.page._projection.state, 'IDLE'); assert.equal(h.page._projection.canWrite, true);
    assert.equal(h.page._projection.preview.bookId, TEST_BOOKS[0].id); assert.equal(h.page._projection.preview.text, TEST_BOOKS[0].firstActions[0].text);
    assert.equal(h.r.writes.length, 0); assert.equal(h.r.identities(), 0); assert.equal(h.listeners.size, 1);
  } finally { h.cleanup(); }
});
test('storage qualification prevents all business mutations and preserves the missing-proof hint in details', async () => {
  const h = await shown({ storageQualified: false }); try {
    h.page.showBooks(); h.page.selectBook(TEST_BOOKS[0].id); await h.page.confirmStart(); await h.page.beginBreak(5); await h.page.resume(); await h.page.finishSession();
    assert.equal(h.page._projection.canWrite, false); assert.equal(h.page._projection.view, 'STORAGE_NOTICE'); assert.equal(h.r.writes.length, 0);
    h.page.showDetails(); assert.equal(h.page._projection.view, 'DETAILS'); assert.match(h.page.recoveryRows.join(''), /损坏恢复.*覆盖升级.*重启/);
  } finally { h.cleanup(); }
});
test('book and concrete action selectors change UI drafts only and keep original text', async () => {
  const h = await shown(); try {
    h.page.showBooks(); assert.equal(h.page._projection.view, 'BOOK_PICKER'); h.page.selectBook('unknown'); assert.equal(h.page._projection.view, 'BOOK_PICKER');
    h.page.selectBook(TEST_BOOKS[2].id); assert.equal(h.page._projection.view, 'READY'); assert.equal(h.page._projection.preview.bookId, TEST_BOOKS[2].id);
    h.page.showActions(); h.page.selectAction('unknown'); assert.equal(h.page._projection.view, 'ACTION_PICKER');
    h.page.selectAction(TEST_BOOKS[2].firstActions[0].id); assert.equal(h.page._projection.view, 'READY');
    assert.equal(h.page._projection.actionText, TEST_BOOKS[2].firstActions[0].text); assert.equal(h.r.writes.length, 0);
  } finally { h.cleanup(); }
});
test('the actual start binding accepts exactly the visible preview and keeps one pending chain on repeated taps', async () => {
  const h = await shown(); try {
    const visible = h.page._projection.preview; h.r.holdAt(1); const operation = h.page.confirmStart(); await h.r.untilHeld();
    h.page.confirmStart(); h.page.openBreakPicker(); assert.equal(h.page._projection.busy, true); assert.equal(h.page._projection.view, 'READY');
    assert.equal(h.page._projection.primary.label, '正在开始…'); h.r.release(); await operation;
    assert.equal(h.page._projection.view, 'READING'); assert.equal(h.page._projection.state, 'FOCUS'); assert.equal(h.r.realOwner.snapshot().document.counter, 1);
    assert.equal(h.r.realOwner.snapshot().document.active.firstActionSnapshot.text, visible.text);
    assert.deepEqual(h.r.commands.map(action => action.type), ['START_CONFIRMED']);
  } finally { h.cleanup(); }
});
test('a failed durable start keeps the last confirmation state and displays a blocking storage task', async () => {
  const r = rig(); await prepare(r); const h = await shown({ r }); try {
    h.r.failAt(h.r.writes.length + 1); await h.page.confirmStart();
    assert.equal(h.page._projection.state, 'PREPARING'); assert.equal(h.page._projection.view, 'STORAGE_NOTICE'); assert.equal(h.page._projection.canWrite, false);
    assert.equal(h.r.realOwner.snapshot().document.active, null); assert.match(h.page._projection.notice.text, /未确认.*核对/);
  } finally { h.cleanup(); }
});
test('FOCUS reopen has zero extra resume clicks and BREAK zero remains a resting task', async () => {
  const r = rig(); await start(r); const before = r.commands.length; const h = await shown({ r }); try {
    assert.equal(h.page._projection.view, 'READING'); assert.equal(r.commands.length, before);
    h.page.openBreakPicker(); assert.equal(h.page._projection.view, 'BREAK_PICKER'); assert.equal(r.realOwner.snapshot().document.state, 'FOCUS');
    h.page.backView(); assert.equal(h.page._projection.view, 'READING'); assert.equal(r.commands.length, before);
    h.page.openBreakPicker(); await h.page.beginBreak(5); const writes = r.writes.length; r.next(360000); h.tick();
    assert.equal(h.page._projection.view, 'RESTING'); assert.equal(h.page._projection.timer.valueText, '休息时间已到'); assert.equal(r.writes.length, writes);
    await h.page.resume(); assert.equal(h.page._projection.view, 'READING'); assert.equal(r.commands.at(-1).type, 'RESUME');
  } finally { h.cleanup(); }
});
test('finish review from focus or break is read only and its explicit save sends a nullable page', async () => {
  for (const resting of [false, true]) {
    const r = rig(); await start(r); if (resting) await r.owner.dispatch({ type: 'BEGIN_BREAK', minutes: 10 });
    const h = await shown({ r }); try {
      const writes = r.writes.length; h.page.showFinish(); assert.equal(h.page._projection.view, 'FINISH_REVIEW'); assert.equal(h.page._projection.pageDigits, '');
      assert.equal(r.writes.length, writes); r.next(); await h.page.finishSession(); assert.equal(r.commands.at(-1).endPage, null);
      assert.equal(h.page._projection.view, 'SAVED'); assert.equal(h.page._projection.pendingCount, 1);
    } finally { h.cleanup(); }
  }
});
test('optional editor accepts bounded positive digits, rejects invalid values, and leaves null by explicit choice', async () => {
  const r = rig(); await start(r); const h = await shown({ r }); try {
    h.page.showFinish(); h.page.showPageEditor(); assert.equal(h.page._projection.pageDigits, ''); h.page.appendDigit('0');
    const writes = r.writes.length; await h.page.savePage(); assert.equal(r.writes.length, writes); assert.match(h.page._projection.pageError, /1.*999999/);
    h.page.clearEndPage(); h.page.appendDigit('1'); h.page.appendDigit('2'); h.page.appendDigit('a'); h.page.appendDigit('１'); h.page.appendDigit('📖');
    assert.equal(h.page._projection.pageDigits, '12'); h.page.clearEndPage(); for (let count = 0; count < 7; count++) h.page.appendDigit('9');
    assert.equal(h.page._projection.pageDigits, '999999'); h.page.eraseDigit(); assert.equal(h.page._projection.pageDigits, '99999');
    await h.page.savePage(); assert.equal(r.commands.at(-1).endPage, 99999);
  } finally { h.cleanup(); }
});
test('editor back discards its unsaved digits and every second tick keeps drafts and picker row identity stable', async () => {
  const r = rig(); await start(r); const h = await shown({ r }); try {
    h.page.showFinish(); h.page.showPageEditor(); h.page.appendDigit('1'); h.page.appendDigit('2');
    const bookRows = h.page.bookRows; const choices = h.page.bookChoices; const writes = r.writes.length;
    r.next(10000); h.tick(); assert.equal(h.page._projection.pageDigits, '12'); assert.equal(h.page.bookRows, bookRows); assert.equal(h.page.bookChoices, choices);
    h.page.backView(); assert.equal(h.page._projection.view, 'FINISH_REVIEW'); assert.equal(h.page._projection.pageDigits, ''); assert.equal(r.writes.length, writes);
    await h.page.finishSession(); assert.equal(r.commands.at(-1).endPage, null);
  } finally { h.cleanup(); }
});
test('Done and cold FINISHED both return ready without NEW_SESSION or deleting pending', async () => {
  const r = rig(); await start(r); const h = await shown({ r }); try {
    h.page.showFinish(); await h.page.finishSession(); const writes = r.writes.length; const record = r.realOwner.snapshot().document.pending[0];
    h.page.done(); assert.equal(h.page._projection.view, 'READY'); assert.equal(r.writes.length, writes); assert.deepEqual(r.realOwner.snapshot().document.pending[0], record);
    h.page.onHide(); await h.page.onShow(); assert.equal(h.page._projection.view, 'READY'); assert.equal(r.writes.length, writes);
    await h.page.confirmStart(); assert.equal(r.realOwner.snapshot().document.pending.length, 1); assert.equal(r.realOwner.snapshot().document.counter, 2);
  } finally { h.cleanup(); }
});
test('page hide and destroy retire only observers and visible ticks, never the application owner', async () => {
  const r = rig(); await start(r); const h = await shown({ r }); try {
    h.page.onShow(); assert.equal(h.timers.size, 1); assert.equal(h.listeners.size, 1);
    h.page.onHide(); h.page.onHide(); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
    await h.page.onShow(); assert.equal(h.timers.size, 1); h.page.onDestroy(); h.page.onDestroy(); await h.page.onShow();
    assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0); assert.equal(r.closes(), 0); assert.equal(r.realOwner.snapshot().document.state, 'FOCUS');
  } finally { h.cleanup(); }
});
test('late atomic-start readback cannot refresh a hidden page and reentry restores the single confirmed Session', async () => {
  const h = await shown(); try {
    h.r.holdAt(1); const operation = h.page.confirmStart(); await h.r.untilHeld(); const before = h.page._projection;
    h.page.onHide(); h.r.release(); await operation; h.retiredListeners[0](h.owner.snapshot()); h.tick();
    assert.equal(h.page._projection, before); assert.deepEqual(h.r.commands.map(action => action.type), ['START_CONFIRMED']);
    await h.page.onShow(); assert.equal(h.page._projection.state, 'FOCUS'); assert.equal(h.page._projection.view, 'READING');
    assert.equal(h.r.realOwner.snapshot().document.counter, 1);
  } finally { h.cleanup(); }
});
test('unexpected owner failures remain unconfirmed and block further writes instead of showing success', async () => {
  const h = await shown(); try {
    h.owner.dispatch = () => Promise.reject(new Error('private diagnostic'));
    await h.page.confirmStart(); assert.equal(h.page._projection.view, 'STORAGE_NOTICE'); assert.equal(h.page._projection.canWrite, false);
    assert.match(h.page._projection.notice.title, /待核对/); assert.doesNotMatch(h.page._projection.notice.text, /private/);
    await h.page.confirmStart(); assert.equal(h.r.writes.length, 0);
  } finally { h.cleanup(); }
});
test('exit is one-shot and an unavailable native interface leaves an honest actionable view', async () => {
  const h = await shown(); try {
    h.page.exitLocal(); h.page.exitLocal(); await h.page.confirmStart(); assert.equal(h.exits(), 1); assert.equal(h.r.writes.length, 0); assert.equal(h.r.closes(), 0);
  } finally { h.cleanup(); }
  const noExit = await shown(); try {
    delete noExit.app.exit; noExit.page.exitLocal(); assert.equal(noExit.exits(), 0); assert.match(noExit.page._projection.notice.title, /未保存/);
  } finally { noExit.cleanup(); }
});
test('finite wall-only values are visibly qualified and unavailable metrics never become zero', async () => {
  const r = rig(); await start(r); const h = await shown({ r }); try {
    r.next(65000); h.tick(); assert.equal(h.page._projection.timer.valueText, '01:05'); assert.match(h.page._projection.timer.qualifier, /参考值/);
    const snapshot = h.owner.snapshot; h.owner.snapshot = () => Object.assign({}, snapshot(), { summary: { observedFocusMs: null, observedBreakMs: null, reasons: ['CLOCK_UNAVAILABLE'] } });
    h.tick(); assert.equal(h.page._projection.timer.valueText, '--:--'); assert.equal(h.page.statusLabel, '时间待核对');
  } finally { h.cleanup(); }
});
test('recovered snapshots require visible UI acknowledgement with no business writes and keep the limitation', async () => {
  const r = rig({ slots: [encodeRecord(1, domainLib.createDocument('ui-installation')), 'corrupt'] }); const h = await shown({ r }); try {
    assert.equal(h.page._projection.view, 'STORAGE_NOTICE'); assert.equal(h.page._projection.notice.title, '已读取上一份记录'); assert.equal(h.page._projection.canWrite, false);
    const writes = r.writes.length; h.page.noticeAction(); assert.equal(h.page._projection.view, 'READY'); assert.equal(r.writes.length, writes);
    assert.equal(h.page._projection.recoveryNotice.visible, true); assert.match(h.page.statusLabel, /上一份记录/);
  } finally { h.cleanup(); }
});
test('long original Chinese and emoji content remains complete in native row bindings', async () => {
  const h = await shown(); try {
    h.page.showBooks(); h.page.selectBook(TEST_BOOKS[1].id); assert.equal(h.page._projection.preview.isLongAction, true);
    assert.equal(h.page.bookRows.join(''), TEST_BOOKS[1].title); assert.equal(h.page.actionRows.join(''), TEST_BOOKS[1].firstActions[0].text);
    const text = '打开书本📚，读第一段，然后确认实际完成。'.repeat(12);
    const rows = h.page.wrapText(text); assert.equal(rows.join(''), text); assert.ok(rows.every(row => Array.from(row).length <= 18));
    assert.equal(h.page.bookChoices.find(book => book.id === TEST_BOOKS[1].id).startPage, null);
  } finally { h.cleanup(); }
});

test('the application owns one local service and only global retirement closes it', () => {
  const created = []; const loaded = []; let closed = 0; const module = { exports: {} };
  vm.runInNewContext(scriptFrom('src/local-app.ux'), { module,
    ownerLib: { createLocalOwner(options) { created.push(options); return { close() { closed++; }, snapshot() { return {}; } }; } },
    storageLib: { createLocalBackend(options) { loaded.push(options); return { read() {}, write() {} }; } },
    profile: { mode: 'local-session', storageQualified: false }, Date, Math, Number, String,
    require(name) { if (name === '@system.storage' || name === '@system.file') return {}; throw new Error('forbidden ' + name); },
  });
  const app = module.exports; app.onCreate(); const first = app.getLocalOwner();
  assert.equal(app.getLocalOwner(), first); assert.equal(created.length, 1); assert.equal(created[0].storageQualified, false);
  assert.equal(created[0].clock().monotonicVerified, false); app.onDestroy(); app.onDestroy(); assert.equal(closed, 1);
  assert.throws(() => app.getLocalOwner(), /RETIRED/); assert.equal(created.length, 1);
});
test('the entry keeps signed wall facts and turns invalid or throwing clocks into unavailable observations', () => {
  let wall; let options; const module = { exports: {} };
  vm.runInNewContext(scriptFrom('src/local-app.ux'), { module,
    ownerLib: { createLocalOwner(value) { options = value; return { close() {} }; } }, storageLib: {}, profile: { storageQualified: false }, Math, Number, String,
    Date: { now() { if (wall === 'throw') throw new Error('private clock'); return wall; } },
  });
  const app = module.exports; app.onCreate();
  for (const invalid of [NaN, Infinity, -Infinity, undefined, null, 1.5, '1000', 9007199254740992, 'throw']) {
    wall = invalid; const observed = options.clock(); assert.equal(observed.wallMs, null); assert.equal(observed.monotonicMs, null); assert.equal(observed.monotonicVerified, false);
  }
  wall = -100; assert.equal(options.clock().wallMs, -100); wall = 0; assert.equal(options.clock().wallMs, 0); wall = 1000; assert.equal(options.clock().wallMs, 1000);
});

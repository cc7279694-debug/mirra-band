const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const books = [
  { id: 'test-book-1', title: '测试书籍：慢慢读📖', startPage: 1, firstActions: [{ id: 'first-paragraph', text: '翻到第 1 页，读这一页的第一段。' }, { id: 'one-sentence', text: '打开书本，读一句话。' }] },
  { id: 'test-book-2', title: '测试书籍：很长的中文书名，用来检查完整文字可以在小屏滚动阅读', startPage: null, firstActions: [{ id: 'read-heading', text: '打开书本，读本页标题。' }] },
];
const plain = value => JSON.parse(JSON.stringify(value));
function scriptFrom(relative) {
  const filename = path.resolve(__dirname, '..', relative);
  assert.ok(fs.existsSync(filename), relative + ' must implement the requested behavior');
  return fs.readFileSync(filename, 'utf8').match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm, '').replace(/\bexport\s+default\s+/, 'module.exports = ');
}
function pageHarness(patch = {}) {
  let current = {
    document: { state: 'IDLE', preparation: null, active: null, pending: [] },
    status: 'READY', busy: false, canWrite: true, storageQualified: true,
    errorCode: null, recoveryHint: '', summary: null, timeHint: '墙钟未核验', pendingCount: 0, sequence: 1,
    ...patch,
  };
  const listeners = new Set(); const savedListeners = []; const calls = [];
  const timers = new Map(); let nextTimer = 0; let closeCount = 0; let exitCount = 0;
  let pending = null;
  const owner = {
    snapshot() { return current; },
    subscribe(listener) { listeners.add(listener); savedListeners.push(listener); listener(current); return () => listeners.delete(listener); },
    open() { calls.push({ method: 'open' }); return Promise.resolve(current); },
    dispatch(action) { calls.push({ method: 'dispatch', action: plain(action) }); return pending ? pending.promise : Promise.resolve(current); },
    close() { closeCount += 1; },
  };
  const module = { exports: {} };
  vm.runInNewContext(scriptFrom('src/pages/LocalSession/index.ux'), {
    module, domainLib: { TEST_BOOKS: books }, Promise, Array, Object, Number, String, Math,
    setInterval(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearInterval(id) { timers.delete(id); },
  });
  const app = { $def: { getLocalOwner: () => owner }, exit() { exitCount += 1; } };
  const page = Object.assign({}, module.exports, module.exports.private, { $app: app });
  return { page, app, owner, calls, timers, listeners, savedListeners,
    closeCount: () => closeCount, exitCount: () => exitCount,
    patch(values, notify = true) { current = { ...current, ...values }; if (notify) for (const callback of listeners) callback(current); },
    tick() { for (const callback of timers.values()) callback(); },
    defer() { let resolve; const promise = new Promise(yes => { resolve = yes; }); pending = { promise }; return { resolve }; },
  };
}
async function shown(h) { h.page.onInit(); await h.page.onShow(); }
function preparing() { return { state: 'PREPARING', preparation: { bookSnapshot: plain(books[0]), firstActionSnapshot: plain(books[0].firstActions[0]) }, active: null, pending: [] }; }
function active(state = 'FOCUS') { return { state, preparation: null, active: { id: 'install-1/session-1', bookSnapshot: plain(books[0]), firstActionSnapshot: plain(books[0].firstActions[0]), intervals: [] }, pending: [] }; }

test('the page obtains the application owner and shows the actual stored state without creating a session', async () => {
  const h = pageHarness(); await shown(h);
  assert.equal(h.page.state, 'IDLE'); assert.equal(h.page.viewMode, 'home');
  assert.equal(h.page.canWrite, true); assert.equal(h.listeners.size, 1);
  assert.deepEqual(h.calls, [{ method: 'open' }]);
});

test('storage qualification prevents every mutation and leaves the exact missing-proof hint visible', async () => {
  const h = pageHarness({ storageQualified: false, canWrite: false, recoveryHint: '尚缺损坏恢复、覆盖升级和重启保留证据' }); await shown(h);
  h.page.showBooks(); await h.page.selectBook('test-book-1');
  await h.page.selectAction('first-paragraph'); await h.page.confirmStart();
  await h.page.beginBreak(5); await h.page.resume(); await h.page.finishSession(); await h.page.newSession();
  assert.equal(h.page.canWrite, false); assert.match(h.page.recoveryHint, /损坏恢复.*覆盖升级.*重启/);
  assert.deepEqual(h.calls, [{ method: 'open' }]);
});

test('book and concrete action selection validate the declared test catalog and persist only the selection', async () => {
  const h = pageHarness(); await shown(h); h.page.showBooks();
  await h.page.selectBook('unknown-book'); await h.page.selectBook('test-book-1');
  h.patch({ document: preparing() }); h.page.showActions();
  await h.page.selectAction('unknown-action'); await h.page.selectAction('one-sentence');
  assert.deepEqual(h.calls.slice(1), [
    { method: 'dispatch', action: { type: 'SELECT_BOOK', bookId: 'test-book-1' } },
    { method: 'dispatch', action: { type: 'SELECT_ACTION', firstActionId: 'one-sentence' } },
  ]);
  assert.equal(h.page.state, 'PREPARING'); assert.equal(h.page.sessionId, '');
});

test('the first action requires its explicit completion and rapid taps await one durable acknowledgement', async () => {
  const h = pageHarness({ document: preparing() }); await shown(h);
  const wait = h.defer(); const operation = h.page.confirmStart();
  h.page.confirmStart(); h.page.beginBreak(5); h.page.newSession();
  assert.equal(h.page.state, 'PREPARING'); assert.equal(h.page.busy, true);
  assert.deepEqual(h.calls.slice(1), [{ method: 'dispatch', action: { type: 'CONFIRM_START', confirmed: true } }]);
  h.patch({ document: active(), busy: false }); wait.resolve(); await operation;
  assert.equal(h.page.state, 'FOCUS'); assert.equal(h.page.sessionId, 'install-1/session-1');
});

test('a failed durable start stays in preparation and shows the owner failure rather than success', async () => {
  const h = pageHarness({ document: preparing() }); await shown(h);
  const wait = h.defer(); const operation = h.page.confirmStart();
  h.patch({ status: 'BLOCKED', canWrite: false, errorCode: 'CAPACITY_EXCEEDED', recoveryHint: '容量不足，现有记录保留' });
  wait.resolve(); await operation;
  assert.equal(h.page.state, 'PREPARING'); assert.equal(h.page.canWrite, false);
  assert.equal(h.page.errorCode, 'CAPACITY_EXCEEDED'); assert.match(h.page.recoveryHint, /容量不足.*保留/);
});

test('five and ten minute breaks dispatch explicitly and a finished countdown never auto-resumes', async () => {
  const h = pageHarness({ document: active() }); await shown(h);
  await h.page.beginBreak(5); await h.page.beginBreak(10); await h.page.beginBreak(0);
  assert.deepEqual(h.calls.slice(1), [
    { method: 'dispatch', action: { type: 'BEGIN_BREAK', minutes: 5 } },
    { method: 'dispatch', action: { type: 'BEGIN_BREAK', minutes: 10 } },
  ]);
  h.patch({ document: active('BREAK'), summary: { observedFocusMs: 60000, observedBreakMs: 600000, breakRemainingMs: 0, timeUncertain: false } });
  for (let count = 0; count < 5; count += 1) h.tick();
  assert.equal(h.page.state, 'BREAK'); assert.match(h.page.breakText, /已到.*主动继续/);
  assert.equal(h.calls.length, 3);
  await h.page.resume(); assert.deepEqual(h.calls.at(-1).action, { type: 'RESUME' });
});

test('finish from focus or break leaves optional page empty as null and never invents progress', async () => {
  for (const state of ['FOCUS', 'BREAK']) {
    const h = pageHarness({ document: active(state) }); await shown(h); h.page.showFinish();
    assert.equal(h.page.endPageDigits, ''); await h.page.finishSession();
    assert.deepEqual(h.calls.at(-1).action, { type: 'FINISH', endPage: null });
  }
});

test('optional page keypad accepts positive bounded integers and prevents zero or excess digits', async () => {
  const h = pageHarness({ document: active() }); await shown(h); h.page.showFinish();
  h.page.appendDigit('0'); await h.page.finishSession(); assert.equal(h.calls.length, 1);
  h.page.clearEndPage(); h.page.appendDigit('1'); h.page.appendDigit('2'); h.page.appendDigit('a');
  await h.page.finishSession(); assert.deepEqual(h.calls.at(-1).action, { type: 'FINISH', endPage: 12 });
  h.page.clearEndPage(); for (let i = 0; i < 7; i += 1) h.page.appendDigit('9');
  assert.equal(h.page.endPageDigits, '999999'); h.page.eraseDigit(); assert.equal(h.page.endPageDigits, '99999');
});

test('pending completion and new preparation depend on acknowledged owner state, not a finish button', async () => {
  const h = pageHarness({ document: active() }); await shown(h); h.page.showFinish();
  const wait = h.defer(); const operation = h.page.finishSession();
  assert.equal(h.page.state, 'FOCUS'); assert.equal(h.page.pendingCount, 0);
  h.patch({ document: { state: 'FINISHED_PENDING_SYNC', preparation: null, active: null, pending: [{ id: 'install-1/session-1' }] }, pendingCount: 1 });
  wait.resolve(); await operation;
  assert.equal(h.page.viewMode, 'result'); assert.equal(h.page.pendingCount, 1);
  await h.page.newSession(); assert.deepEqual(h.calls.at(-1).action, { type: 'NEW_SESSION' });
});

test('page back exits subviews without ending or recreating the current session', async () => {
  const h = pageHarness({ document: active() }); await shown(h); h.page.showFinish();
  assert.equal(h.page.onBackPress(), true); assert.equal(h.page.viewMode, 'focus');
  assert.equal(h.page.onBackPress(), false); assert.equal(h.page.sessionId, 'install-1/session-1');
  assert.deepEqual(h.calls, [{ method: 'open' }]);
});

test('hide or destroy retires only page observers and display ticks, never the application owner or session', async () => {
  const h = pageHarness({ document: active() }); await shown(h); h.page.onShow();
  assert.equal(h.timers.size, 1); assert.equal(h.listeners.size, 1);
  h.page.onHide(); h.page.onHide(); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
  await h.page.onShow(); assert.equal(h.page.sessionId, 'install-1/session-1');
  h.page.onDestroy(); h.page.onDestroy(); h.page.onShow();
  assert.equal(h.closeCount(), 0); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
  assert.ok(h.calls.every(call => call.method === 'open'));
});

test('late saves and retired subscriptions cannot update a hidden or destroyed page', async () => {
  const h = pageHarness({ document: preparing() }); await shown(h);
  const wait = h.defer(); const operation = h.page.confirmStart(); h.page.onHide();
  h.patch({ document: active() }); h.savedListeners[0](); wait.resolve(); await operation;
  assert.equal(h.page.state, 'PREPARING');
  await h.page.onShow(); assert.equal(h.page.state, 'FOCUS');
  h.page.onDestroy(); h.patch({ document: active('BREAK') }); h.savedListeners[1]();
  assert.equal(h.page.state, 'FOCUS');
});

test('uncertain, closed or busy owners prevent mutations and uncertainty cannot be cleared by page reloading', async () => {
  const h = pageHarness({ document: active() }); await shown(h);
  for (const status of ['UNCERTAIN', 'CLOSED']) { h.patch({ status, canWrite: true }); await h.page.beginBreak(5); await h.page.reload(); }
  h.patch({ status: 'READY', busy: true, canWrite: true }); await h.page.beginBreak(10);
  assert.deepEqual(h.calls, [{ method: 'open' }]);
});

test('unexpected owner exceptions or rejections show an unconfirmed outcome and block additional writes', async () => {
  for (const rejects of [false, true]) {
    const h = pageHarness({ document: preparing() }); await shown(h);
    h.owner.dispatch = () => rejects ? Promise.reject(new Error('private diagnostic')) : (() => { throw new Error('private diagnostic'); })();
    await h.page.confirmStart();
    assert.equal(h.page.state, 'PREPARING'); assert.equal(h.page.canWrite, false);
    assert.match(h.page.operationNotice, /未确认.*退出.*重新打开/);
    assert.doesNotMatch(h.page.operationNotice, /private/);
    await h.page.confirmStart(); await h.page.reload(); assert.deepEqual(h.calls, [{ method: 'open' }]);
  }
});

test('an exit request is one-shot, cannot finish a session and never permits new page actions before retirement', async () => {
  const h = pageHarness({ document: active() }); await shown(h);
  h.page.exitLocal(); h.page.exitLocal(); await h.page.beginBreak(5); await h.page.reload();
  assert.equal(h.exitCount(), 1); assert.equal(h.closeCount(), 0); assert.equal(h.page.sessionId, 'install-1/session-1');
  assert.deepEqual(h.calls, [{ method: 'open' }]);
});

test('unverified or invalid time is shown conservatively without producing trusted focus or negative displays', async () => {
  const h = pageHarness({ document: active(), summary: { observedFocusMs: 65000, observedBreakMs: 10000, breakRemainingMs: null, trustedFocusMs: null, timeConfidence: 'UNVERIFIED', timeUncertain: false }, timeHint: '墙钟观察，不能证明重启连续性' }); await shown(h);
  assert.equal(h.page.focusText, '观察 01:05'); assert.match(h.page.timeHint, /墙钟/);
  h.patch({ summary: { observedFocusMs: -1, observedBreakMs: null, breakRemainingMs: -4, timeUncertain: true }, timeHint: '时间不确定，原始边界已保留' });
  assert.equal(h.page.focusText, '时间不确定'); assert.equal(h.page.restText, '时间不确定');
  assert.match(h.page.timeHint, /原始边界已保留/); assert.equal(h.calls.length, 1);
});

test('a finite wall-clock candidate remains an explicitly observed timer even while its reliability is unverified', async () => {
  const h = pageHarness({ document: active('BREAK'), summary: { observedFocusMs: 65000, observedBreakMs: 9000, breakRemainingMs: 291000, timeUncertain: true, reasons: ['WALL_ONLY'], timeConfidence: 'UNVERIFIED' }, timeHint: '墙钟观察，未经核验' }); await shown(h);
  assert.equal(h.page.focusText, '观察 01:05'); assert.equal(h.page.restText, '观察 00:09');
  assert.match(h.page.breakText, /观察剩余 04:51/); assert.match(h.page.timeHint, /未经核验/);
  assert.equal(h.calls.length, 1);
});

test('the catalog never invents a starting page when a test book has no page snapshot', async () => {
  const h = pageHarness(); await shown(h); h.page.showBooks();
  const unknown = h.page.bookChoices.find(book => book.id === 'test-book-2');
  assert.equal(unknown.startPage, null); assert.match(unknown.startPageText, /页码未设定/);
  assert.match(h.page.bookChoices[0].startPageText, /第 1 页/);
});

test('full long Chinese and emoji text is split into bounded readable rows without dropping code points', async () => {
  const h = pageHarness(); await shown(h);
  const title = '长中文书名📖测试阅读'.repeat(15);
  const action = '请打开书本📚，读第一段，然后确认实际完成。'.repeat(12);
  h.patch({ document: { state: 'PREPARING', preparation: { bookSnapshot: { id: 'test-book-1', title, startPage: 1 }, firstActionSnapshot: { id: 'first-paragraph', text: action } }, active: null, pending: [] } });
  assert.equal(h.page.bookRows.join(''), title); assert.equal(h.page.actionRows.join(''), action);
  assert.ok([...h.page.bookRows, ...h.page.actionRows].every(row => Array.from(row).length <= 24));
});

test('the application owns one local service and only global retirement closes it', () => {
  const created = []; const loaded = []; let closed = 0;
  const module = { exports: {} };
  vm.runInNewContext(scriptFrom('src/local-app.ux'), {
    module,
    ownerLib: { createLocalOwner(options) { created.push(options); return { close() { closed += 1; }, snapshot() { return {}; } }; } },
    storageLib: { createLocalBackend(options) { loaded.push(options); return { read() {}, write() {} }; } },
    profile: { mode: 'local-session', storageQualified: false }, Date, Math, Number, String,
    require(name) { if (name === '@system.storage' || name === '@system.file') return {}; throw new Error('forbidden ' + name); },
  });
  const app = module.exports; app.onCreate(); const first = app.getLocalOwner();
  assert.equal(app.getLocalOwner(), first); assert.equal(created.length, 1);
  assert.equal(created[0].storageQualified, false);
  const stamp = created[0].clock(); assert.equal(stamp.monotonicVerified, false);
  app.onDestroy(); app.onDestroy(); assert.equal(closed, 1);
  assert.throws(() => app.getLocalOwner(), /RETIRED/); assert.equal(created.length, 1);
});

test('the entry retains valid signed wall facts and converts invalid or throwing clocks to an unavailable observation', () => {
  let wall; let options;
  const module = { exports: {} };
  vm.runInNewContext(scriptFrom('src/local-app.ux'), {
    module,
    ownerLib: { createLocalOwner(value) { options = value; return { close() {} }; } },
    storageLib: {}, profile: { storageQualified: false }, Math, Number, String,
    Date: { now() { if (wall === 'throw') throw new Error('private clock'); return wall; } },
  });
  const app = module.exports; app.onCreate();
  for (const invalid of [NaN, Infinity, -Infinity, undefined, null, 1.5, '1000', 9007199254740992, 'throw']) {
    wall = invalid; const observed = options.clock();
    assert.equal(observed.wallMs, null); assert.equal(observed.monotonicMs, null); assert.equal(observed.monotonicVerified, false);
  }
  wall = -100; assert.equal(options.clock().wallMs, -100);
  wall = 0; assert.equal(options.clock().wallMs, 0);
  wall = 1000; assert.equal(options.clock().wallMs, 1000);
});

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

// Only device file callbacks, Date.now and foreground tick delivery are
// controlled. The actual app/page scripts and complete persistence chain run.
// These checks do not prove firmware rendering, clock accuracy or durability.
function evaluate(relative, context) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8');
  const script = source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .+$/gm, '').replace(/\bexport\s+default\s+/, 'module.exports = ');
  const module = { exports: {} };
  vm.runInNewContext(script, { module, ...context });
  return module.exports;
}

let applicationOrdinal = 0;
function rig(t, options = {}) {
  const files = options.files || new Map();
  const calls = []; const timers = new Map(); const pages = [];
  let wallMs = options.wallMs === undefined ? 100000 : options.wallMs;
  let nextTimer = 0;
  const appMath = Object.create(Math);
  const randomValue = ++applicationOrdinal / 1001;
  appMath.random = () => randomValue;
  const nativeFile = {
    readText(request) {
      calls.push({ kind: 'read', uri: request.uri });
      if (files.has(request.uri)) request.success({ text: files.get(request.uri) });
      else request.fail('', 301);
    },
    writeText(request) {
      calls.push({ kind: 'write', uri: request.uri });
      files.set(request.uri, request.text);
      request.success();
    },
  };
  const appDef = evaluate('src/local-app.ux', {
    ownerLib, storageLib,
    profile: { mode: 'local-session', storageQualified: true, storageBackend: 'file' },
    Date: { now: () => wallMs }, Math: appMath, Number, String,
    require(name) { assert.equal(name, '@system.file'); return nativeFile; },
  });
  appDef.onCreate();
  const app = { $def: appDef, exit() { appDef.onDestroy(); } };
  const owner = appDef.getLocalOwner();
  function newPage() {
    const definition = evaluate('src/pages/LocalSession/index.ux', {
      domainLib, presentationLib, flowLib, profile: { versionName: '0.1.2' },
      Promise, Array, Object, Number, String, Math, JSON,
      setInterval(callback, delay) {
        assert.equal(delay, 1000);
        const id = ++nextTimer; timers.set(id, callback); return id;
      },
      clearInterval(id) { timers.delete(id); },
    });
    const page = Object.assign({}, definition, definition.private, { $app: app });
    pages.push(page); page.onInit(); return page;
  }
  const page = newPage();
  function destroy() {
    pages.forEach(current => current.onDestroy()); appDef.onDestroy();
  }
  t.after(destroy);
  return { page, newPage, owner, files, calls, timers, destroy,
    setTime(value) { wallMs = value; },
    next(ms) { wallMs += ms; },
    tick() { for (const callback of Array.from(timers.values())) callback(); },
    writes() { return calls.filter(call => call.kind === 'write').length; },
  };
}

async function start(r) {
  await r.page.onShow();
  r.page.showBooks(); await r.page.selectBook('test-reading-1');
  r.page.showActions(); await r.page.selectAction('read-first-paragraph');
  await r.page.confirmStart();
  assert.equal(r.page.state, 'FOCUS');
}

test('a saved FOCUS reopens in a new app with a bounded reference timer and the same raw session', async t => {
  const original = rig(t); await start(original);
  const raw = original.owner.snapshot().document;
  const savedFiles = new Map(original.files);
  const id = raw.active.id;
  original.destroy();

  const recovered = rig(t, { files: original.files, wallMs: 165000 });
  await recovered.page.onShow();
  assert.equal(recovered.page.state, 'FOCUS');
  assert.equal(recovered.page.view, 'READING');
  assert.equal(recovered.page.detailSessionId, id);
  assert.equal(recovered.page.timerText, '01:05');
  assert.match(recovered.page.timerQualifier, /参考值/);
  assert.equal(recovered.owner.snapshot().summary.trustedFocusMs, 0);
  assert.match(recovered.page.detailTimeReason, /OWNER_CHANGED/);
  assert.equal(recovered.writes(), 0, 'recovery must not re-save or start another session');
  assert.deepEqual(recovered.owner.snapshot().document, raw);
  assert.deepEqual(recovered.files, savedFiles);

  const io = recovered.calls.length;
  recovered.next(5000); recovered.tick();
  assert.equal(recovered.page.timerText, '01:10');
  assert.equal(recovered.calls.length, io, 'foreground ticks cannot read or write files');
  recovered.page.onHide();
  await recovered.page.onShow();
  assert.equal(recovered.page.timerText, '01:10');
  assert.equal(recovered.page.detailSessionId, id);
  recovered.page.onDestroy();
  const replacement = recovered.newPage(); await replacement.onShow();
  assert.equal(replacement.timerText, '01:10');
  assert.equal(replacement.detailSessionId, id);
  assert.equal(recovered.owner.snapshot().document.counter, 1);
  assert.equal(recovered.owner.snapshot().document.active.intervals.length, 1);
  assert.equal(recovered.writes(), 0);
  assert.deepEqual(recovered.files, savedFiles);
});

test('a saved BREAK reopens from its timestamp, freezes focus and needs explicit resume before nullable finish', async t => {
  const original = rig(t); await start(original);
  original.next(10000); original.page.showFinish(); await original.page.finishSession();
  const oldPending = original.owner.snapshot().document.pending[0];
  original.page.done(); await start(original);
  original.next(30000); original.page.openBreakPicker(); await original.page.beginBreak(5);
  const raw = original.owner.snapshot().document;
  const id = raw.active.id; const savedFiles = new Map(original.files);
  original.destroy();

  const recovered = rig(t, { files: original.files, wallMs: 205000 });
  await recovered.page.onShow();
  assert.equal(recovered.page.state, 'BREAK');
  assert.equal(recovered.page.view, 'RESTING');
  assert.equal(recovered.page.detailSessionId, id);
  assert.equal(recovered.page.timerText, '03:55');
  assert.match(recovered.page.timerQualifier, /参考值/);
  assert.equal(recovered.page.focusText, '00:30');
  assert.equal(recovered.page.restText, '01:05');
  assert.equal(recovered.owner.snapshot().summary.trustedFocusMs, 0);
  assert.match(recovered.page.detailTimeReason, /OWNER_CHANGED/);
  assert.deepEqual(recovered.owner.snapshot().document, raw);
  assert.equal(recovered.writes(), 0);

  const io = recovered.calls.length;
  recovered.setTime(440000); recovered.tick();
  assert.equal(recovered.page.timerText, '休息时间已到');
  assert.equal(recovered.page.focusText, '00:30');
  assert.equal(recovered.page.state, 'BREAK');
  assert.equal(recovered.owner.snapshot().summary.breakRemainingMs, 0);
  recovered.next(5000); recovered.tick();
  assert.equal(recovered.page.state, 'BREAK', 'deadline does not create a FOCUS interval');
  assert.equal(recovered.page.focusText, '00:30');
  assert.equal(recovered.calls.length, io);
  assert.deepEqual(recovered.files, savedFiles);
  assert.deepEqual(recovered.owner.snapshot().document, raw);

  await recovered.page.resume();
  assert.equal(recovered.page.state, 'FOCUS');
  recovered.next(15000); recovered.page.showFinish(); await recovered.page.finishSession();
  const completed = recovered.owner.snapshot().document;
  assert.equal(recovered.page.view, 'SAVED');
  assert.equal(completed.state, 'FINISHED_PENDING_SYNC');
  assert.equal(completed.active, null);
  assert.equal(completed.counter, 2);
  assert.equal(completed.pending.length, 2);
  assert.deepEqual(completed.pending[0], oldPending, 'the older unsynced record must survive unchanged');
  assert.equal(completed.pending.filter(record => record.id === id).length, 1);
  assert.equal(completed.pending[1].endPage, null);
  assert.equal(completed.pending[1].intervals.length, 3);
  assert.equal(recovered.page.focusText, '00:45', 'break elapsed time never joins the reading total');
  assert.equal(recovered.page.restText, '05:05');
  assert.equal(recovered.owner.snapshot().summary.trustedFocusMs, 0);
});

test('missing, rollback and excessive current clocks keep cross-owner raw sessions and unknown timers', async t => {
  const original = rig(t); await start(original);
  const raw = original.owner.snapshot().document;
  const savedFiles = new Map(original.files);
  original.destroy();
  const cases = [
    { name: 'missing current clock', wallMs: null, reason: 'CLOCK_UNAVAILABLE' },
    { name: 'current clock before start', wallMs: 99999, reason: 'CLOCK_ROLLBACK' },
    { name: 'current clock more than six hours after start', wallMs: 21700001, reason: 'CLOCK_JUMP' },
  ];
  for (const entry of cases) {
    await t.test(entry.name, async child => {
      const recovered = rig(child, { files: new Map(savedFiles), wallMs: entry.wallMs });
      await recovered.page.onShow();
      assert.equal(recovered.page.state, 'FOCUS');
      assert.equal(recovered.page.detailSessionId, raw.active.id);
      assert.equal(recovered.page.timerText, '--:--');
      assert.equal(recovered.page.timerUnknown, true);
      assert.equal(recovered.owner.snapshot().summary.trustedFocusMs, 0);
      assert.ok(recovered.owner.snapshot().summary.reasons.includes(entry.reason));
      const io = recovered.calls.length;
      recovered.tick();
      assert.equal(recovered.page.timerText, '--:--');
      assert.equal(recovered.calls.length, io);
      assert.equal(recovered.writes(), 0);
      assert.deepEqual(recovered.owner.snapshot().document, raw);
      assert.deepEqual(recovered.files, savedFiles);
    });
  }
});

test('a live-owner rollback within the open interval stays unknown after time returns and the page is replaced', async t => {
  const r = rig(t); await start(r);
  const raw = r.owner.snapshot().document; const savedFiles = new Map(r.files);
  const writes = r.writes(); const io = r.calls.length;
  r.setTime(165000); r.tick();
  assert.equal(r.page.timerText, '01:05');
  r.setTime(164000); r.tick();
  assert.equal(r.page.timerText, '--:--', 'a rollback after the last live observation is still a clock anomaly');
  assert.ok(r.owner.snapshot().summary.reasons.includes('CLOCK_ROLLBACK'));
  r.setTime(170000); r.tick();
  assert.equal(r.page.timerText, '--:--', 'later valid-looking values do not erase a known anomaly');
  assert.equal(r.calls.length, io, 'remembering an observation needs no native read or write');
  r.page.onDestroy();
  const replacement = r.newPage(); await replacement.onShow();
  assert.equal(replacement.detailSessionId, raw.active.id);
  assert.equal(replacement.timerText, '--:--', 'replacement pages share the live owner knowledge');
  assert.ok(r.owner.snapshot().summary.reasons.includes('CLOCK_ROLLBACK'));
  assert.equal(r.writes(), writes);
  assert.deepEqual(r.owner.snapshot().document, raw);
  assert.deepEqual(r.files, savedFiles);
});

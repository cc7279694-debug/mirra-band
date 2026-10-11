const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const presentationPath = path.resolve(__dirname, '../src/lib/companion-presentation.js');
const library = fs.existsSync(presentationPath) ? require(presentationPath) : null;
function render(input = {}) {
  assert.ok(library && typeof library.present === 'function', 'Companion presentation must exist');
  return library.present(input);
}
function active(overrides = {}) {
  return {
    mode: 'live', connection: 'connected', freshness: 'fresh', lastSyncedAgeMs: 0,
    body: {
      phase: 'ACTIVE', intentId: null, sessionId: 7, learningItemId: 3,
      bookTitle: '思考，快与慢', currentPage: 32, totalPages: 400, firstAction: null,
      segmentType: 'FOCUS', coverage: 'FULL', monitorAvailability: 'AVAILABLE',
      elapsedMs: 65000, remainingMs: null, timerKind: 'SESSION_ELAPSED', endType: null,
    },
    timer: { elapsedMs: 68000, remainingMs: null, interpolated: true }, ...overrides,
  };
}

test('no snapshot means waiting for the phone, never idle or sample book', () => {
  const view = render({ mode: 'live', connection: 'connecting', freshness: 'unknown', body: null });
  assert.equal(view.title, '正在连接');
  assert.equal(view.bookTitle, '');
  assert.equal(view.hasTimer, false);
  assert.equal(view.showDemo, false);
  assert.equal(view.canRetry, true);
  assert.doesNotMatch(JSON.stringify(view), /怪诞行为学|测试模式|未开始/);
});

test('only a fresh observed focus with current monitoring is presented as focus', () => {
  const view = render(active());
  assert.equal(view.title, '专注中');
  assert.equal(view.timerText, '01:08');
  assert.equal(view.timerLabel, '本次已进行');
  assert.equal(view.pageText, '第 32 页 / 400 页');
  const interrupted = active();
  interrupted.body.coverage = 'PARTIAL';
  assert.equal(render(interrupted).title, '阅读中 · 监测已中断');
  interrupted.body.coverage = 'FULL';
  interrupted.body.monitorAvailability = 'UNKNOWN';
  assert.equal(render(interrupted).title, '阅读中 · 监测待确认');
  interrupted.body.coverage = 'NONE';
  assert.equal(render(interrupted).title, '阅读中 · 未监测');
});

test('disconnection and stale data freeze phone-confirmed time and label the previous sync', () => {
  for (const override of [
    { connection: 'disconnected', freshness: 'stale' },
    { connection: 'connected', freshness: 'expired' },
  ]) {
    const view = render(active({ ...override, lastSyncedAgeMs: 27000 }));
    assert.ok(['连接已中断', '状态待更新'].includes(view.title));
    assert.equal(view.timerText, '01:05');
    assert.equal(view.timerLabel, '上次确认时长');
    assert.match(view.syncText, /上次同步/);
    assert.equal(view.canRetry, true);
    assert.equal(view.tone, 'warning');
  }
});

test('preparing uses phone first action and puts preparation time only in details', () => {
  const input = active();
  Object.assign(input.body, { phase: 'PREPARING', firstAction: '翻到第 32 页，读第一段', timerKind: 'PREPARATION_ELAPSED' });
  const view = render(input);
  assert.equal(view.title, '先完成这一步');
  assert.equal(view.heroText, '翻到第 32 页，读第一段');
  assert.equal(view.hasTimer, false);
  assert.equal(view.detailTimerText, '01:08');
  assert.equal(view.detailTimerLabel, '准备已进行');
});

test('break expiry and allowance stay in their phone-confirmed state', () => {
  for (const [segmentType, title] of [['BREAK', '休息中'], ['TEMPORARY_ALLOWANCE', '临时处理事情']]) {
    const input = active();
    Object.assign(input.body, { segmentType, timerKind: segmentType === 'BREAK' ? 'BREAK_REMAINING' : 'ALLOWANCE_REMAINING', remainingMs: 3000 });
    input.timer.remainingMs = 0;
    const view = render(input);
    assert.equal(view.title, title);
    assert.equal(view.timerText, '00:00');
    assert.equal(view.hint, segmentType === 'BREAK' ? '休息时间已到' : '临时用途时间已到');
  }
});

test('saving and ended use confirmed boundaries, never extend the elapsed time', () => {
  const input = active();
  input.body.phase = 'SAVING';
  const saving = render(input);
  assert.equal(saving.title, '正在保存本次阅读');
  assert.equal(saving.timerText, '01:05');
  input.body.phase = 'ENDED';
  input.body.endType = 'NORMAL';
  assert.equal(render(input).title, '记录已保存');
  assert.equal(render(input).timerText, '01:05');
  input.body.endType = 'UNFAMILIAR_END';
  assert.equal(render(input).title, '本次学习已中断');
});

test('source maintenance and disabled do not expose retained personal content', () => {
  for (const connection of ['source_busy', 'disabled', 'source_unavailable']) {
    const view = render(active({ connection }));
    assert.equal(view.bookTitle, '');
    assert.equal(view.hasTimer, false);
    assert.equal(view.pageText, '');
    assert.doesNotMatch(JSON.stringify(view), /思考，快与慢/);
  }
  assert.equal(render(active({ connection: 'source_busy' })).title, '手机正在处理数据');
});

test('Unicode and long times are bounded without broken surrogate pairs or invented values', () => {
  const input = active();
  input.body.bookTitle = '书📚'.repeat(30);
  input.body.firstAction = '读📖'.repeat(40);
  input.body.currentPage = null;
  input.body.totalPages = null;
  input.timer.elapsedMs = 85 * 60000;
  const view = render(input);
  assert.equal(view.timerText, '1小时25分');
  assert.equal(view.timerClass, 'timer timer-long');
  assert.equal(view.pageText, '');
  assert.equal(Array.from(view.bookTitle).length, 24);
  assert.ok(view.bookTitle.endsWith('…'));
  assert.doesNotMatch(view.bookTitle, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  input.timer.elapsedMs = null;
  input.body.elapsedMs = null;
  assert.equal(render(input).hasTimer, false);
  assert.equal(render(input).timerText, '');
});

test('valid active snapshots without timer values explain the missing time without inventing zero', () => {
  const { decodeMessage } = require('../src/lib/companion-protocol');
  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../protocol/v1/fixtures/active.json'), 'utf8'));
  Object.assign(fixture.body, { elapsedMs: null, remainingMs: null, timerKind: 'NONE' });
  const body = decodeMessage(JSON.stringify(fixture)).body;
  const input = active({ body, timer: { elapsedMs: null, remainingMs: null, interpolated: false } });
  const view = render(input);
  assert.equal(view.title, '专注中');
  assert.equal(view.monitorText, '手机当前监测可用');
  assert.equal(view.bookTitle, body.bookTitle);
  assert.equal(view.hasTimer, false);
  assert.equal(view.timerText, '');
  assert.equal(view.detailTimerText, '');
  assert.equal(view.heroText, '时间暂不可用');
  assert.doesNotMatch(JSON.stringify(view), /00:00/);
  input.body.coverage = 'PARTIAL';
  assert.equal(render(input).title, '阅读中 · 监测已中断');
  assert.equal(render(input).heroText, '时间暂不可用');
});

test('demo uses the same structured states and an explicit marker', () => {
  const view = render(active({ mode: 'demo' }));
  assert.equal(view.showDemo, true);
  assert.equal(view.demoLabel, '演示数据');
  assert.equal(view.title, '专注中');
});

test('timing without interpolation discloses that only confirmed values are shown', () => {
  const view = render(active({ timer: { elapsedMs: 65000, remainingMs: null, interpolated: false } }));
  assert.equal(view.precisionText, '仅显示手机确认值');
});

test('demo companion projects the existing model into isolated structured state', () => {
  const companionPath = path.resolve(__dirname, '../src/lib/demo-companion.js');
  assert.ok(fs.existsSync(companionPath), 'Structured demo companion must exist');
  const { createDemoCompanion } = require(companionPath);
  const { createDemo } = require('../src/lib/demo');
  let now = 100000;
  const companion = createDemoCompanion({ demo: createDemo({ now: () => now }), now: () => now });
  companion.select('focus');
  now += 4000;
  assert.equal(companion.snapshot().mode, 'demo');
  assert.equal(companion.snapshot().body.phase, 'ACTIVE');
  assert.equal(companion.snapshot().body.segmentType, 'FOCUS');
  assert.equal(render(companion.snapshot()).timerText, '00:04');
  companion.select('preparing', { firstAction: '打开第 32 页' });
  now += 65000;
  assert.equal(render(companion.snapshot()).heroText, '打开第 32 页');
  assert.equal(render(companion.snapshot()).detailTimerText, '01:05');
  companion.select('saving', { elapsedMs: 840000 });
  now += 65000;
  assert.equal(render(companion.snapshot()).title, '正在保存本次阅读');
  assert.equal(render(companion.snapshot()).timerText, '14:00');
  companion.select('partial');
  assert.equal(render(companion.snapshot()).title, '阅读中 · 监测已中断');
  companion.select('disconnected');
  assert.equal(render(companion.snapshot()).title, '连接已中断');
});

test('demo subscription and refresh own no platform or background timers', () => {
  const companionPath = path.resolve(__dirname, '../src/lib/demo-companion.js');
  assert.ok(fs.existsSync(companionPath), 'Structured demo companion must exist');
  const { createDemoCompanion } = require(companionPath);
  const { createDemo } = require('../src/lib/demo');
  const companion = createDemoCompanion({ demo: createDemo() });
  let updates = 0;
  const off = companion.subscribe(() => { updates += 1; });
  companion.start();
  companion.start();
  companion.requestRefresh();
  assert.equal(updates, 2);
  companion.stop();
  companion.requestRefresh();
  assert.equal(updates, 2);
  off();
  companion.start();
  assert.equal(updates, 2);
  companion.destroy();
});

test('demo product UI keeps long elapsed time bounded instead of wrapping to zero', () => {
  const { createDemoCompanion } = require('../src/lib/demo-companion');
  const { createDemo } = require('../src/lib/demo');
  let now = 100000;
  const companion = createDemoCompanion({ demo: createDemo({ now: () => now }), now: () => now });
  companion.select('focus');
  now += 100 * 3600000;
  assert.equal(render(companion.snapshot()).timerText, '99小时+');
});

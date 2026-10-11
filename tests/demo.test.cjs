const test = require('node:test');
const assert = require('node:assert/strict');

let createDemo;
let STATES;
test.before(() => {
  assert.doesNotThrow(() => {
    ({ createDemo, STATES } = require('../src/lib/demo.js'));
  }, 'The demo module must exist before its public behavior can be verified');
});

function clock(start = 100000) {
  let value = start;
  return { now: () => value, set: (next) => { value = next; } };
}

test('fresh startup is an idle simulation with no focus timer', () => {
  const model = createDemo({ now: () => 0 });
  const view = model.snapshot();
  assert.equal(view.stateId, 'idle');
  assert.equal(view.hasTimer, false);
  assert.equal(view.canAct, false);
  assert.match(view.simulationLabel, /测试模式.*模拟数据/);
  assert.equal(view.bookTitle, '怪诞行为学');
});

test('all seven selectable states remain visibly simulated', () => {
  const model = createDemo({ now: () => 0 });
  assert.deepEqual(STATES.map((state) => state.id), [
    'idle', 'preparing', 'focus', 'break', 'recovery', 'unmonitored', 'disconnected',
  ]);
  for (const state of STATES) {
    model.select(state.id);
    const view = model.snapshot();
    assert.equal(view.stateId, state.id);
    assert.ok(view.stateLabel.length > 0);
    assert.match(view.simulationLabel, /测试模式.*模拟数据/);
  }
});

test('focus time comes from its anchor, including hidden-page gaps', () => {
  const time = clock();
  const model = createDemo({ now: time.now });
  model.select('focus');
  time.set(161999);
  assert.equal(model.snapshot().timerText, '01:01');
  assert.equal(model.snapshot().timerText, '01:01');
  time.set(3700000);
  assert.equal(model.snapshot().timerText, '01:00:00');
});

test('a clock rollback cannot create negative or decreasing elapsed time', () => {
  const time = clock();
  const model = createDemo({ now: time.now });
  model.select('focus');
  time.set(109000);
  assert.equal(model.snapshot().timerText, '00:09');
  time.set(99000);
  assert.equal(model.snapshot().timerText, '00:09');
  time.set(110000);
  assert.equal(model.snapshot().timerText, '00:10');
});

test('selecting a timer state starts a fresh demonstration', () => {
  const time = clock();
  const model = createDemo({ now: time.now });
  model.select('focus');
  time.set(115000);
  assert.equal(model.snapshot().timerText, '00:15');
  model.select('focus');
  assert.equal(model.snapshot().timerText, '00:00');
});

test('break countdown uses seconds rounded up and stays at zero', () => {
  const time = clock();
  const model = createDemo({ now: time.now });
  model.select('break', { breakDurationMs: 5000 });
  assert.equal(model.snapshot().timerText, '00:05');
  time.set(104999);
  assert.equal(model.snapshot().timerText, '00:01');
  time.set(105000);
  assert.equal(model.snapshot().timerText, '00:00');
  time.set(999999);
  assert.equal(model.snapshot().timerText, '00:00');
  assert.equal(model.snapshot().stateId, 'break');
});

test('clock rollback cannot make break remaining time increase', () => {
  const time = clock();
  const model = createDemo({ now: time.now });
  model.select('break', { breakDurationMs: 5000 });
  time.set(104000);
  assert.equal(model.snapshot().timerText, '00:01');
  time.set(100500);
  assert.equal(model.snapshot().timerText, '00:01');
});

test('reset restores the selected break duration and its elapsed anchor', () => {
  const time = clock();
  const model = createDemo({ now: time.now });
  model.select('break', { breakDurationMs: 5000 });
  time.set(105000);
  assert.equal(model.snapshot().timerText, '00:00');
  model.reset();
  assert.equal(model.snapshot().timerText, '00:05');
  time.set(106000);
  assert.equal(model.snapshot().timerText, '00:04');
});

test('a new break selection defaults to five minutes after a short test', () => {
  const model = createDemo({ now: () => 0 });
  model.select('break', { breakDurationMs: 5000 });
  model.select('break');
  assert.equal(model.snapshot().timerText, '05:00');
});

test('reset restarts elapsed time without changing the selected state', () => {
  const time = clock();
  const model = createDemo({ now: time.now });
  model.select('recovery');
  time.set(163000);
  assert.equal(model.snapshot().timerText, '01:03');
  model.reset();
  assert.equal(model.snapshot().stateId, 'recovery');
  assert.equal(model.snapshot().timerText, '00:00');
});

test('completion enters focus only from preparation with a fresh timer', () => {
  const time = clock();
  const model = createDemo({ now: time.now });
  assert.equal(model.completePreparation(), false);
  assert.equal(model.snapshot().stateId, 'idle');
  model.select('preparing', { bookTitle: '示例书' });
  time.set(180000);
  assert.equal(model.completePreparation(), true);
  assert.equal(model.snapshot().stateId, 'focus');
  assert.equal(model.snapshot().bookTitle, '示例书');
  assert.equal(model.snapshot().timerText, '00:00');
  time.set(181000);
  assert.equal(model.completePreparation(), false);
  assert.equal(model.snapshot().timerText, '00:01');
});

test('recovery and unmonitored timers explicitly deny verified focus', () => {
  const model = createDemo({ now: () => 0 });
  model.select('recovery');
  assert.match(model.snapshot().message, /不计.*有效专注/);
  model.select('unmonitored');
  assert.match(model.snapshot().message, /未.*验证.*专注/);
  assert.match(model.snapshot().timerLabel, /会话.*演示/);
});

test('disconnected state exposes no updating live phone timer', () => {
  const time = clock();
  const model = createDemo({ now: time.now });
  model.select('focus');
  time.set(120000);
  model.select('disconnected');
  const view = model.snapshot();
  time.set(180000);
  assert.equal(model.snapshot().timerText, view.timerText);
  assert.equal(view.hasTimer, false);
  assert.equal(view.canAct, false);
  assert.match(view.message, /无.*实时.*手机数据/);
});

test('time beyond 99 hours has an explicit bounded display', () => {
  const time = clock(0);
  const model = createDemo({ now: time.now });
  model.select('focus');
  time.set(359999000);
  assert.equal(model.snapshot().timerText, '99:59:59');
  time.set(360000000);
  assert.equal(model.snapshot().timerText, '99小时+');
});

test('book names trim, fall back when unusable, and cap long display text', () => {
  const model = createDemo({ now: () => 0 });
  model.select('focus', { bookTitle: '  示例书名  ' });
  assert.equal(model.snapshot().bookTitle, '示例书名');
  for (const bookTitle of ['', '  ', null, 12]) {
    model.select('focus', { bookTitle });
    assert.equal(model.snapshot().bookTitle, '怪诞行为学');
  }
  model.select('focus', { bookTitle: '很长的中文书名'.repeat(20) });
  assert.ok(model.snapshot().bookTitle.length <= 24);
  assert.ok(model.snapshot().bookTitle.endsWith('…'));
  model.select('focus', { bookTitle: '中'.repeat(22) + '📖更多内容' });
  assert.doesNotMatch(model.snapshot().bookTitle, /[\uD800-\uDBFF]$/);
});

test('invalid selection inputs cannot replace the active demonstration', () => {
  const time = clock();
  const model = createDemo({ now: time.now });
  model.select('focus');
  time.set(103000);
  for (const id of ['other', '__proto__', 'toString', null, ['focus'], { toString: () => 'focus' }]) {
    assert.throws(() => model.select(id), RangeError);
  }
  for (const breakDurationMs of [0, -1, 1.5, NaN, Infinity, '5000', null]) {
    assert.throws(() => model.select('break', { breakDurationMs }), RangeError);
  }
  assert.equal(model.snapshot().stateId, 'focus');
  assert.equal(model.snapshot().timerText, '00:03');
});

test('bad clock values are rejected instead of rendered as corrupted time', () => {
  assert.throws(() => createDemo({ now: 5 }), TypeError);
  const time = clock();
  const model = createDemo({ now: time.now });
  model.select('focus');
  time.set(NaN);
  assert.throws(() => model.snapshot(), TypeError);
  time.set(102000);
  assert.equal(model.snapshot().timerText, '00:02');
});

test('mutating a returned snapshot cannot alter the model', () => {
  const model = createDemo({ now: () => 0 });
  model.select('focus');
  const view = model.snapshot();
  view.stateId = 'disconnected';
  view.bookTitle = 'changed';
  assert.equal(model.snapshot().stateId, 'focus');
  assert.equal(model.snapshot().bookTitle, '怪诞行为学');
});

test('truncating a title never leaves a split Unicode surrogate', () => {
  const model = createDemo({ now: () => 0 });
  model.select('focus', { bookTitle: '中'.repeat(22) + '📖更多内容' });
  assert.equal(model.snapshot().bookTitle.isWellFormed(), true);
});

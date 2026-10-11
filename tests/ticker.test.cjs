const test = require('node:test');
const assert = require('node:assert/strict');

let createTicker;
test.before(() => {
  assert.doesNotThrow(() => {
    ({ createTicker } = require('../src/lib/ticker.js'));
  }, 'The lifecycle ticker must exist before its public behavior can be verified');
});

function scheduler(firstHandle = 0) {
  let nextHandle = firstHandle;
  const callbacks = new Map();
  const active = new Set();
  const intervals = [];
  const cleared = [];
  return {
    callbacks,
    active,
    intervals,
    cleared,
    setInterval(callback, interval) {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      active.add(handle);
      intervals.push(interval);
      return handle;
    },
    clearInterval(handle) {
      active.delete(handle);
      cleared.push(handle);
    },
  };
}

function setup(intervalMs) {
  const timer = scheduler();
  let count = 0;
  const ticker = createTicker({
    refresh: () => { count += 1; },
    setInterval: timer.setInterval,
    clearInterval: timer.clearInterval,
    ...(intervalMs === undefined ? {} : { intervalMs }),
  });
  return { timer, ticker, count: () => count };
}

test('show immediately refreshes and repeated show owns only one interval', () => {
  const { timer, ticker, count } = setup();
  ticker.show();
  assert.equal(count(), 1);
  ticker.show();
  assert.equal(count(), 1);
  assert.equal(timer.active.size, 1);
  assert.deepEqual(timer.intervals, [1000]);
  timer.callbacks.get(0)();
  assert.equal(count(), 2);
});

test('hide clears even a zero-valued timer handle and blocks queued callbacks', () => {
  const { timer, ticker, count } = setup();
  ticker.show();
  ticker.hide();
  ticker.hide();
  assert.deepEqual(timer.cleared, [0]);
  assert.equal(timer.active.size, 0);
  timer.callbacks.get(0)();
  assert.equal(count(), 1);
});

test('a returning page refreshes once and stale callbacks stay guarded', () => {
  const { timer, ticker, count } = setup();
  ticker.show();
  ticker.hide();
  ticker.show();
  assert.equal(count(), 2);
  assert.equal(timer.active.size, 1);
  timer.callbacks.get(0)();
  assert.equal(count(), 2);
  timer.callbacks.get(1)();
  assert.equal(count(), 3);
});

test('destroy clears the active interval and permanently prevents refresh', () => {
  const { timer, ticker, count } = setup();
  ticker.show();
  ticker.destroy();
  ticker.destroy();
  ticker.show();
  ticker.hide();
  assert.deepEqual(timer.cleared, [0]);
  assert.equal(timer.active.size, 0);
  timer.callbacks.get(0)();
  assert.equal(count(), 1);
});

test('destroy before show allocates no interval', () => {
  const { timer, ticker, count } = setup();
  ticker.destroy();
  ticker.show();
  assert.equal(timer.active.size, 0);
  assert.equal(count(), 0);
});

test('a refresh that hides the page cannot leak a new timer', () => {
  const timer = scheduler();
  let ticker;
  ticker = createTicker({
    refresh: () => ticker.hide(),
    setInterval: timer.setInterval,
    clearInterval: timer.clearInterval,
  });
  ticker.show();
  assert.equal(timer.active.size, 0);
});

test('a refresh that destroys the page cannot leak a new timer', () => {
  const timer = scheduler();
  let ticker;
  ticker = createTicker({
    refresh: () => ticker.destroy(),
    setInterval: timer.setInterval,
    clearInterval: timer.clearInterval,
  });
  ticker.show();
  assert.equal(timer.active.size, 0);
});

test('invalid scheduling inputs fail before allocating resources', () => {
  assert.throws(() => createTicker({ refresh: null }), TypeError);
  assert.throws(() => createTicker({ refresh() {}, setInterval: null }), TypeError);
  assert.throws(() => createTicker({ refresh() {}, clearInterval: null }), TypeError);
  for (const intervalMs of [0, -1, NaN, Infinity, '1000', 0.5]) {
    assert.throws(() => setup(intervalMs), RangeError);
  }
});

test('the requested interval controls scheduling cadence', () => {
  const { timer, ticker } = setup(250);
  ticker.show();
  assert.deepEqual(timer.intervals, [250]);
  ticker.destroy();
});

test('a failed immediate refresh can be retried without losing scheduling', () => {
  const timer = scheduler();
  let shouldThrow = true;
  let count = 0;
  const ticker = createTicker({
    refresh() {
      if (shouldThrow) throw new Error('render failure');
      count += 1;
    },
    setInterval: timer.setInterval,
    clearInterval: timer.clearInterval,
  });
  assert.throws(() => ticker.show(), /render failure/);
  assert.equal(timer.active.size, 0);
  shouldThrow = false;
  ticker.show();
  assert.equal(count, 1);
  assert.equal(timer.active.size, 1);
  ticker.destroy();
});

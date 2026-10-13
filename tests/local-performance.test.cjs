const test = require('node:test');
const assert = require('node:assert/strict');
const { createPerformance } = require('../src/lib/local-performance');
test('disabled timing never samples clock or changes task results', async () => {
  let calls = 0; const trace = createPerformance({ clock() { calls++; throw Error('clock'); } });
  trace.begin('start'); assert.equal(trace.measure('transition', () => 42), 42);
  assert.equal(await trace.measureAsync('native_write', async () => 24), 24);
  trace.mark('busy_bound'); trace.finish(); assert.equal(calls, 0); assert.equal(trace.snapshot().last, null);
});
test('bounded timing records fixed numeric stages and first marks only, with no business payload', async () => {
  let now = 100; const trace = createPerformance({ enabled: true, clock: () => now });
  trace.begin('confirmStart'); trace.mark('click_enter'); now += 2; trace.mark('busy_bound'); now += 2; trace.mark('busy_bound');
  trace.measure('transition', () => { now += 5; });
  await trace.measureAsync('native_write', async () => { now += 20; }); trace.mark('state_confirmed'); trace.finish();
  const state = trace.snapshot(); assert.equal(state.last.name, 'confirmStart'); assert.equal(state.last.totalMs, 29);
  assert.equal(state.last.marks.busy_bound, 2); assert.deepEqual(state.last.stages.transition, { count: 1, totalMs: 5 });
  state.last.stages.transition.count = 99; assert.equal(trace.snapshot().last.stages.transition.count, 1);
  trace.begin('PRIVATE_BOOK'); trace.mark('PRIVATE_SESSION'); trace.measure('PRIVATE_DATA', () => 1); trace.finish();
  assert.equal(trace.snapshot().last.name, 'operation'); assert.equal(JSON.stringify(trace.snapshot()).includes('PRIVATE'), false);
});
test('clock rollback/throw gives unknown elapsed without swallowing operation failure', () => {
  let now = 100; const trace = createPerformance({ enabled: true, clock: () => now }); trace.begin('resume');
  assert.throws(() => trace.measure('encode_validate', () => { now = 90; throw Error('business failure'); }), /business failure/);
  trace.finish(); assert.equal(trace.snapshot().last.totalMs, null); assert.equal(trace.snapshot().last.stages.encode_validate.totalMs, null);
  trace.setEnabled(false); assert.equal(trace.snapshot().last, null); assert.equal(trace.active, false);
});

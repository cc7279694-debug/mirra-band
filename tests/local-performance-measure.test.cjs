const test = require('node:test');
const assert = require('node:assert/strict');
const { benchmark, BASELINE } = require('../scripts/measure-local-performance.cjs');

test('current page measurement keeps a single confirmed start and zero IO/full JSON work on ordinary ticks', async () => {
  const result = await benchmark({ delayMs: 0, samples: 1, tickCount: 3 });
  assert.equal(result.environment, 'NODE_CONTROLLED');
  for (const operation of result.summary) assert.deepEqual(operation.nativeCounts, { reads: 3, writes: 1 });
  assert.equal(result.tickSummary.nativeCalls, 0); assert.equal(result.tickSummary.jsonCallsMedian, 0);
  for (const run of result.runs) assert.equal(run.preservation.previousPendingUnchanged, true);
});

test('controlled performance harness executes the frozen delivered page and persistence chain without device claims', async () => {
  const result = await benchmark({ ref: BASELINE, delayMs: 0, samples: 1, tickCount: 3 });
  assert.equal(result.environment, 'NODE_CONTROLLED');
  assert.equal(result.sourceRef, BASELINE);
  assert.equal(result.modeledFileCallbackDelayMs, 0);
  assert.ok(result.limitations.some(text => text.includes('not measured on 9 Pro')));
  assert.ok(result.limitations.some(text => text.includes('not the first painted frame')));
  assert.deepEqual(result.summary.map(entry => entry.name), ['START_EMPTY', 'START_AFTER_PENDING', 'BREAK', 'RESUME', 'FINISH']);
  assert.deepEqual(result.summary[0].nativeCounts, { reads: 9, writes: 3 });
  assert.deepEqual(result.summary[1].nativeCounts, { reads: 12, writes: 4 });
  for (const operation of result.summary.slice(2)) assert.deepEqual(operation.nativeCounts, { reads: 3, writes: 1 });
  assert.equal(result.runs.length, 2);
  for (const run of result.runs) {
    assert.equal(run.preservation.previousPendingUnchanged, true);
    assert.equal(run.preservation.oneNewStableSession, true);
    assert.equal(run.preservation.nullableEndPage, true);
    assert.equal(run.preservation.breakDoesNotAutoResume, true);
    assert.equal(run.ticks.nativeCounts.reads + run.ticks.nativeCounts.writes, 0);
    assert.equal(run.ticks.tickCount, 3);
    for (const operation of run.operations) {
      assert.ok(operation.elapsedMs >= 0);
      assert.ok(operation.firstBusyMs !== null);
      assert.ok(operation.firstBusyMs <= operation.elapsedMs);
      assert.equal(operation.confirmations.length, operation.nativeCounts.writes);
      assert.equal(operation.native.filter(call => call.stage === 'exactReadback').length, operation.nativeCounts.writes);
      assert.equal(operation.native.filter(call => call.stage === 'dualSlotRead').length, operation.nativeCounts.writes * 2);
      assert.ok(operation.json.parse.calls > 0);
      assert.ok(operation.json.stringify.calls > 0);
      assert.ok(operation.reactive.assignments > 0);
    }
  }
});

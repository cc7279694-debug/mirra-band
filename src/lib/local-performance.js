// Optional, bounded, memory-only diagnostics. Durations use the local wall
// clock and describe callback/field submission, never verified device paint.
const NAMES = ['confirmStart', 'beginBreak', 'resume', 'finishSession', 'savePage', 'START_CONFIRMED', 'BEGIN_BREAK', 'RESUME', 'FINISH'];
const STAGES = ['transition', 'capacity', 'dual_read', 'dual_validate', 'encode_validate', 'native_write', 'exact_readback', 'readback_validate', 'state_confirm', 'ui_refresh'];
const MARKS = ['click_enter', 'busy_bound', 'state_confirmed', 'view_bound'];
function createPerformance(options) {
  options = options || {}; let enabled = options.enabled === true; let active = false;
  let last = null; let start = null; let invalid = false;
  function now() {
    try { const value = (options.clock || Date.now)(); return Number.isFinite(value) && value >= 0 ? value : null; }
    catch (_) { return null; }
  }
  function difference(from) {
    const to = now(); if (from === null || to === null || to < from) invalid = true;
    return invalid ? null : to - from;
  }
  function begin(name) {
    if (!enabled || active) return;
    invalid = false; start = now(); active = true;
    last = { name: NAMES.indexOf(name) >= 0 ? name : 'operation', totalMs: null, marks: {}, stages: {} };
  }
  function mark(name) {
    if (active && MARKS.indexOf(name) >= 0 && !Object.prototype.hasOwnProperty.call(last.marks, name)) last.marks[name] = difference(start);
  }
  function record(name, from) {
    if (!active || STAGES.indexOf(name) < 0) return;
    const elapsed = difference(from); const stage = last.stages[name] || { count: 0, totalMs: 0 };
    stage.count = Math.min(stage.count + 1, 999999);
    stage.totalMs = elapsed === null || stage.totalMs === null ? null : stage.totalMs + elapsed; last.stages[name] = stage;
  }
  function measure(name, task) {
    if (!active || STAGES.indexOf(name) < 0) return task();
    const from = now(); try { return task(); } finally { record(name, from); }
  }
  async function measureAsync(name, task) {
    if (!active || STAGES.indexOf(name) < 0) return task();
    const from = now(); try { return await task(); } finally { record(name, from); }
  }
  function finish() { if (!active) return; last.totalMs = difference(start); active = false; }
  function setEnabled(value) { enabled = value === true; active = false; last = null; start = null; }
  function snapshot() {
    const result = last ? { name: last.name, totalMs: active ? difference(start) : last.totalMs,
      marks: Object.assign({}, last.marks), stages: {} } : null;
    if (result) Object.keys(last.stages).forEach(name => { result.stages[name] = Object.assign({}, last.stages[name]); });
    return { enabled, active, last: result };
  }
  return { begin, mark, measure, measureAsync, finish, setEnabled, snapshot, get active() { return active; } };
}
module.exports = { createPerformance };

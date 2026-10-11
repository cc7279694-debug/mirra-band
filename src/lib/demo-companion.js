const STATES = [
  { id: 'idle', label: '等待开始' },
  { id: 'preparing', label: '准备动作' },
  { id: 'focus', label: '专注' },
  { id: 'deep', label: '深度专注' },
  { id: 'break', label: '休息' },
  { id: 'allowance', label: '临时用途' },
  { id: 'distraction', label: '暂时离开' },
  { id: 'recovery', label: '恢复' },
  { id: 'unmonitored', label: '未监测' },
  { id: 'partial', label: '监测中断' },
  { id: 'saving', label: '正在保存' },
  { id: 'ended', label: '阅读结束' },
  { id: 'disconnected', label: '断连' },
];

function parseDemoTime(text) {
  if (text === '99小时+') return 100 * 3600000;
  if (typeof text !== 'string' || !/^\d{2}:\d{2}(:\d{2})?$/.test(text)) return 0;
  const parts = text.split(':').map(Number);
  return (parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1]) * 1000;
}

function createDemoCompanion({ demo, now = Date.now } = {}) {
  if (!demo || typeof demo.snapshot !== 'function' || typeof demo.select !== 'function') {
    throw new TypeError('An explicit demonstration model is required');
  }
  let selected = null;
  let options = {};
  let anchor = now();
  let preparationElapsed = 0;
  let visible = false;
  let destroyed = false;
  let listeners = [];

  function snapshot() {
    const original = demo.snapshot();
    const id = selected || original.stateId;
    const elapsed = parseDemoTime(original.timerText);
    const remaining = original.stateId === 'break' ? elapsed : null;
    if (id === 'preparing') preparationElapsed = Math.max(preparationElapsed, 0, now() - anchor);
    const body = {
      phase: id === 'idle' ? 'IDLE' : id === 'preparing' ? 'PREPARING'
        : id === 'saving' ? 'SAVING' : id === 'ended' ? 'ENDED' : 'ACTIVE',
      intentId: id === 'preparing' ? 'demo-intent' : null,
      sessionId: id === 'idle' || id === 'preparing' ? null : 'demo-session',
      learningItemId: 'demo-book', bookTitle: original.bookTitle,
      bookTitleTruncated: original.bookTitle.slice(-1) === '…',
      currentPage: 32, totalPages: 400,
      firstAction: id === 'preparing' ? options.firstAction || '翻到第 32 页，读第一段' : null,
      firstActionTruncated: false,
      segmentType: id === 'idle' || id === 'preparing' || id === 'saving' || id === 'ended' ? null
        : id === 'deep' ? 'DEEP_FOCUS' : id === 'break' ? 'BREAK'
        : id === 'allowance' ? 'TEMPORARY_ALLOWANCE' : id === 'distraction' ? 'DISTRACTION'
        : id === 'recovery' ? 'RECOVERY' : id === 'unmonitored' ? 'UNMONITORED' : 'FOCUS',
      coverage: id === 'idle' || id === 'preparing' ? null : id === 'unmonitored' ? 'NONE' : id === 'partial' ? 'PARTIAL' : 'FULL',
      monitorAvailability: id === 'unmonitored' || id === 'partial' ? 'UNAVAILABLE' : 'AVAILABLE',
      elapsedMs: id === 'idle' ? null : id === 'preparing' ? preparationElapsed
        : id === 'saving' || id === 'ended' ? options.elapsedMs === undefined ? 840000 : options.elapsedMs : elapsed,
      remainingMs: id === 'break' ? remaining : id === 'allowance' ? Math.max(0, 120000 - elapsed) : null,
      timerKind: id === 'idle' ? 'NONE' : id === 'preparing' ? 'PREPARATION_ELAPSED'
        : id === 'break' ? 'BREAK_REMAINING' : id === 'allowance' ? 'ALLOWANCE_REMAINING'
        : id === 'saving' || id === 'ended' ? 'FINAL_SESSION_DURATION' : 'SESSION_ELAPSED',
      endType: id === 'ended' ? options.endType || 'NORMAL' : null,
    };
    return {
      mode: 'demo', connection: id === 'disconnected' ? 'disconnected' : 'connected',
      freshness: id === 'disconnected' ? 'stale' : 'fresh', body,
      timer: { elapsedMs: body.elapsedMs, remainingMs: body.remainingMs, interpolated: true },
      lastSyncedAgeMs: id === 'disconnected' ? 20000 : 0, errorCode: null,
    };
  }

  function emit() {
    if (!visible || destroyed) return;
    const view = snapshot();
    listeners.slice().forEach((listener) => listener(view));
  }

  function select(id, nextOptions) {
    if (destroyed) return;
    if (!STATES.some((state) => state.id === id)) throw new RangeError('Unknown demonstration state');
    options = nextOptions || {};
    selected = id;
    anchor = now();
    preparationElapsed = 0;
    const base = id === 'deep' || id === 'allowance' || id === 'distraction'
      || id === 'partial' || id === 'saving' || id === 'ended' ? 'focus' : id;
    demo.select(base, options);
    emit();
  }

  function start() {
    if (destroyed || visible) return;
    visible = true;
    emit();
  }

  function stop() { visible = false; }
  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    if (destroyed) return () => {};
    listeners.push(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      listeners = listeners.filter((value) => value !== listener);
    };
  }
  function destroy() { stop(); destroyed = true; listeners = []; }
  return { start, stop, snapshot, requestRefresh: emit, subscribe, destroy, select };
}

module.exports = { createDemoCompanion, STATES };

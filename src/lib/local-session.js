const MAX_INTEGER = 9007199254740991;
const MAX_PENDING = 8;
const MAX_INTERVALS = 32;
const MAX_OBSERVED_GAP_MS = 6 * 3600000;
const TEST_BOOKS = [
  { id: 'test-reading-1', title: '测试书籍 · 阅读练习', startPage: 1, firstActions: [{ id: 'read-first-paragraph', text: '翻到第1页，读这一页的第一段。' }, { id: 'open-book', text: '打开这本测试书籍，找到准备阅读的一页。' }] },
  { id: 'test-long-title', title: '测试书籍 · 关于日常阅读、注意力与重新开始的长中文标题排版练习', startPage: null, firstActions: [{ id: 'read-first-paragraph', text: '打开准备阅读的一页，读第一段。完成后亲自确认，开始本次独立阅读。' }] },
  { id: 'test-review-1', title: '测试书籍 · 复习练习', startPage: 12, firstActions: [{ id: 'read-next-page', text: '翻到第12页，读这一页的第一段。' }] }
];
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function integer(value, minimum, maximum) { return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= minimum && value <= maximum; }
function fields(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('FIELD');
  const keys = Object.keys(value);
  if (keys.length !== names.length || keys.some(key => names.indexOf(key) < 0)) fail('UNKNOWN_FIELD');
  names.forEach(name => { const descriptor = Object.getOwnPropertyDescriptor(value, name); if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail('FIELD'); });
}
function textInfo(value) {
  if (typeof value !== 'string') fail('TEXT');
  let points = 0; let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index); points++;
    if (code >= 0xd800 && code <= 0xdbff) { const low = value.charCodeAt(++index); if (!(low >= 0xdc00 && low <= 0xdfff)) fail('UNICODE'); bytes += 4; }
    else if (code >= 0xdc00 && code <= 0xdfff) fail('UNICODE');
    else bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
  }
  return { points, bytes };
}
function text(value, maximum) { const info = textInfo(value); if (info.points < 1 || info.points > maximum || /[\x00-\x1f\x7f]/.test(value)) fail('TEXT'); return value; }
function identifier(value, maximum) { if (typeof value !== 'string' || !new RegExp('^[A-Za-z0-9_-]{1,' + maximum + '}$').test(value)) fail('ID'); return value; }
function array(value, maximum) { if (!Array.isArray(value) || value.length > maximum) fail('ARRAY'); for (let n = 0; n < value.length; n++) if (!Object.prototype.hasOwnProperty.call(value, n)) fail('ARRAY'); return value; }
function page(value) { if (value !== null && !integer(value, 1, 999999)) fail('END_PAGE'); return value; }
function observation(value) {
  fields(value, ['wallMs', 'ownerId', 'monotonicMs', 'monotonicVerified']);
  if (value.wallMs !== null && !integer(value.wallMs, -MAX_INTEGER, MAX_INTEGER)) fail('CLOCK');
  identifier(value.ownerId, 64);
  if (value.monotonicMs !== null && !(typeof value.monotonicMs === 'number' && isFinite(value.monotonicMs) && value.monotonicMs >= 0 && value.monotonicMs <= MAX_INTEGER)) fail('CLOCK');
  if (typeof value.monotonicVerified !== 'boolean' || (value.monotonicVerified && value.monotonicMs === null)) fail('CLOCK');
  return { wallMs: value.wallMs, ownerId: value.ownerId, monotonicMs: value.monotonicMs, monotonicVerified: value.monotonicVerified };
}
function bookCopy(value) { fields(value, ['id', 'title', 'startPage']); return { id: identifier(value.id, 48), title: text(value.title, 64), startPage: page(value.startPage) }; }
function actionCopy(value) { fields(value, ['id', 'text']); return { id: identifier(value.id, 48), text: text(value.text, 128) }; }
function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function sessionCopy(value, installationId, counter, completed) {
  fields(value, ['id', 'ordinal', 'bookSnapshot', 'firstActionSnapshot', 'confirmedAt', 'startAt', 'intervals', 'finishedAt', 'endPage']);
  if (!integer(value.ordinal, 1, counter) || value.id !== installationId + ':' + value.ordinal) fail('SESSION');
  const confirmedAt = observation(value.confirmedAt); const startAt = observation(value.startAt);
  if (!equal(confirmedAt, startAt)) fail('SESSION');
  const intervals = array(value.intervals, MAX_INTERVALS).map((entry, index) => {
    fields(entry, ['kind', 'start', 'end', 'plannedMinutes']);
    if (entry.kind !== (index % 2 === 0 ? 'FOCUS' : 'BREAK')) fail('INTERVAL');
    if (entry.kind === 'FOCUS' ? entry.plannedMinutes !== null : entry.plannedMinutes !== 5 && entry.plannedMinutes !== 10) fail('INTERVAL');
    const start = observation(entry.start); const end = entry.end === null ? null : observation(entry.end);
    if (end === null && (completed || index !== value.intervals.length - 1)) fail('INTERVAL');
    if (!completed && index === value.intervals.length - 1 && end !== null) fail('INTERVAL');
    return { kind: entry.kind, start, end, plannedMinutes: entry.plannedMinutes };
  });
  if (intervals.length < 1 || !equal(intervals[0].start, startAt)) fail('SESSION');
  for (let n = 1; n < intervals.length; n++) if (!equal(intervals[n - 1].end, intervals[n].start)) fail('INTERVAL');
  const finishedAt = value.finishedAt === null ? null : observation(value.finishedAt);
  if (completed ? finishedAt === null || !equal(finishedAt, intervals[intervals.length - 1].end) : finishedAt !== null || value.endPage !== null) fail('SESSION');
  return { id: value.id, ordinal: value.ordinal, bookSnapshot: bookCopy(value.bookSnapshot), firstActionSnapshot: actionCopy(value.firstActionSnapshot), confirmedAt, startAt, intervals, finishedAt, endPage: page(value.endPage) };
}
function createDocument(installationId) { return { schemaVersion: 1, installationId: identifier(installationId, 64), counter: 0, state: 'IDLE', preparation: null, active: null, pending: [] }; }
function createEmptyDocument(options) { return createDocument(options.installationId); }
function validateDocument(value) {
  fields(value, ['schemaVersion', 'installationId', 'counter', 'state', 'preparation', 'active', 'pending']);
  if (value.schemaVersion !== 1) fail('UNKNOWN_SCHEMA');
  const installationId = identifier(value.installationId, 64);
  if (!integer(value.counter, 0, MAX_INTEGER)) fail('COUNTER');
  if (['IDLE', 'PREPARING', 'FOCUS', 'BREAK', 'FINISHED_PENDING_SYNC'].indexOf(value.state) < 0) fail('STATE');
  let preparation = null;
  if (value.preparation !== null) { fields(value.preparation, ['bookSnapshot', 'firstActionSnapshot']); preparation = { bookSnapshot: bookCopy(value.preparation.bookSnapshot), firstActionSnapshot: value.preparation.firstActionSnapshot === null ? null : actionCopy(value.preparation.firstActionSnapshot) }; }
  const active = value.active === null ? null : sessionCopy(value.active, installationId, value.counter, false);
  const pending = array(value.pending, MAX_PENDING).map(entry => sessionCopy(entry, installationId, value.counter, true));
  const ids = [];
  pending.concat(active ? [active] : []).forEach(entry => { if (ids.indexOf(entry.id) >= 0) fail('DUPLICATE_ID'); ids.push(entry.id); });
  for (let n = 1; n < pending.length; n++) if (pending[n].ordinal <= pending[n - 1].ordinal) fail('SESSION');
  if (active && pending.some(entry => entry.ordinal >= active.ordinal)) fail('SESSION');
  if (value.state === 'PREPARING' ? !preparation || active : preparation !== null) fail('STATE');
  if (value.state === 'FOCUS' || value.state === 'BREAK') { if (!active || active.intervals[active.intervals.length - 1].kind !== value.state) fail('STATE'); }
  else if (active) fail('STATE');
  if (value.state === 'FINISHED_PENDING_SYNC' && pending.length === 0) fail('STATE');
  return { schemaVersion: 1, installationId, counter: value.counter, state: value.state, preparation, active, pending };
}
function transition(value, action, time) {
  const doc = validateDocument(value); const now = observation(time);
  if (!action || typeof action.type !== 'string') fail('ACTION');
  const expect = state => { if (doc.state !== state) fail('STATE'); };
  if (action.type === 'SELECT_BOOK') {
    fields(action, ['type', 'bookId']); if (doc.state !== 'IDLE' && doc.state !== 'FINISHED_PENDING_SYNC') fail('STATE');
    const selected = TEST_BOOKS.find(book => book.id === action.bookId); if (!selected) fail('BOOK');
    doc.preparation = { bookSnapshot: { id: selected.id, title: selected.title, startPage: selected.startPage }, firstActionSnapshot: null }; doc.state = 'PREPARING';
  } else if (action.type === 'SELECT_ACTION') {
    fields(action, ['type', 'firstActionId']); expect('PREPARING');
    const book = TEST_BOOKS.find(entry => entry.id === doc.preparation.bookSnapshot.id);
    const selected = book && book.firstActions.find(entry => entry.id === action.firstActionId); if (!selected) fail('FIRST_ACTION');
    doc.preparation.firstActionSnapshot = { id: selected.id, text: selected.text };
  } else if (action.type === 'CANCEL_PREPARATION') { fields(action, ['type']); expect('PREPARING'); doc.preparation = null; doc.state = 'IDLE';
  } else if (action.type === 'CONFIRM_START') {
    fields(action, ['type', 'confirmed']); expect('PREPARING'); if (action.confirmed !== true) fail('CONFIRM_REQUIRED');
    if (!doc.preparation.firstActionSnapshot) fail('FIRST_ACTION'); if (doc.pending.length >= MAX_PENDING) fail('PENDING_CAPACITY');
    if (doc.counter === MAX_INTEGER) fail('COUNTER_CAPACITY'); doc.counter++;
    doc.active = { id: doc.installationId + ':' + doc.counter, ordinal: doc.counter, bookSnapshot: doc.preparation.bookSnapshot, firstActionSnapshot: doc.preparation.firstActionSnapshot, confirmedAt: now, startAt: now, intervals: [{ kind: 'FOCUS', start: now, end: null, plannedMinutes: null }], finishedAt: null, endPage: null };
    doc.preparation = null; doc.state = 'FOCUS';
  } else if (action.type === 'BEGIN_BREAK' || action.type === 'RESUME') {
    fields(action, action.type === 'BEGIN_BREAK' ? ['type', 'minutes'] : ['type']); expect(action.type === 'BEGIN_BREAK' ? 'FOCUS' : 'BREAK');
    if (action.type === 'BEGIN_BREAK' && action.minutes !== 5 && action.minutes !== 10) fail('BREAK_MINUTES');
    if (doc.active.intervals.length >= MAX_INTERVALS) fail('INTERVAL_CAPACITY');
    doc.active.intervals[doc.active.intervals.length - 1].end = now;
    doc.state = action.type === 'BEGIN_BREAK' ? 'BREAK' : 'FOCUS';
    doc.active.intervals.push({ kind: doc.state, start: now, end: null, plannedMinutes: doc.state === 'BREAK' ? action.minutes : null });
  } else if (action.type === 'FINISH') {
    fields(action, ['type', 'endPage']); if (doc.state !== 'FOCUS' && doc.state !== 'BREAK') fail('STATE'); page(action.endPage);
    if (doc.pending.length >= MAX_PENDING) fail('PENDING_CAPACITY');
    doc.active.intervals[doc.active.intervals.length - 1].end = now; doc.active.finishedAt = now; doc.active.endPage = action.endPage;
    doc.pending.push(doc.active); doc.active = null; doc.state = 'FINISHED_PENDING_SYNC';
  } else if (action.type === 'NEW_SESSION') { fields(action, ['type']); expect('FINISHED_PENDING_SYNC'); doc.state = 'IDLE';
  } else fail('ACTION');
  return validateDocument(doc);
}
function duration(start, end) {
  const reasons = []; let observed = null; let trusted = 0;
  if (!end || start.wallMs === null || end.wallMs === null) reasons.push('CLOCK_UNAVAILABLE');
  else if (start.ownerId !== end.ownerId) reasons.push('OWNER_CHANGED');
  else if (end.wallMs < start.wallMs) reasons.push('CLOCK_ROLLBACK');
  else if (end.wallMs - start.wallMs > MAX_OBSERVED_GAP_MS) reasons.push('CLOCK_JUMP');
  else {
    observed = end.wallMs - start.wallMs;
    if (start.monotonicVerified && end.monotonicVerified && start.monotonicMs !== null && end.monotonicMs !== null) {
      const monotonic = end.monotonicMs - start.monotonicMs;
      if (monotonic >= 0 && monotonic <= MAX_OBSERVED_GAP_MS && Math.abs(monotonic - observed) <= 2000) trusted = monotonic;
      else { observed = null; reasons.push('CLOCK_DIVERGENCE'); }
    } else reasons.push('WALL_ONLY');
  }
  return { observed, trusted, reasons };
}
function summarizeSession(session, time) {
  const now = observation(time); let observedFocusMs = 0; let observedBreakMs = 0; let trustedFocusMs = 0; const reasons = [];
  session.intervals.forEach(interval => {
    const part = duration(interval.start, interval.end === null ? now : interval.end);
    if (interval.kind === 'FOCUS') { observedFocusMs = observedFocusMs === null || part.observed === null ? null : observedFocusMs + part.observed; trustedFocusMs += part.trusted; }
    else observedBreakMs = observedBreakMs === null || part.observed === null ? null : observedBreakMs + part.observed;
    part.reasons.forEach(reason => { if (reasons.indexOf(reason) < 0) reasons.push(reason); });
  });
  const last = session.intervals[session.intervals.length - 1]; let breakRemainingMs = null;
  if (last.kind === 'BREAK' && last.end === null) { const elapsed = duration(last.start, now); if (elapsed.observed !== null) breakRemainingMs = Math.max(0, last.plannedMinutes * 60000 - elapsed.observed); }
  return { observedFocusMs, observedBreakMs, trustedFocusMs, breakRemainingMs, timeUncertain: reasons.length > 0, reasons, timeConfidence: reasons.length > 0 ? 'UNVERIFIED' : 'VERIFIED_MONOTONIC' };
}
function summarize(value, time) {
  const doc = validateDocument(value); const session = doc.active || (doc.pending.length ? doc.pending[doc.pending.length - 1] : null);
  return session ? summarizeSession(session, time) : { observedFocusMs: 0, observedBreakMs: 0, trustedFocusMs: 0, breakRemainingMs: null, timeUncertain: false, reasons: [], timeConfidence: 'NO_SESSION' };
}
// 05B has no ACK/deletion/edit path: every previously saved fact must survive.
function historyError(previous, next) {
  let old; let newer;
  try { old = validateDocument(previous); newer = validateDocument(next); } catch (_) { return 'INVALID_HISTORY'; }
  if (old.installationId !== newer.installationId) return 'IDENTITY_CONFLICT';
  if (newer.counter < old.counter) return 'COUNTER_ROLLBACK';
  for (let n = 0; n < old.pending.length; n++) {
    const retained = newer.pending.find(session => session.id === old.pending[n].id);
    if (!retained) return 'PENDING_DISAPPEARED';
    if (!equal(retained, old.pending[n])) return 'PENDING_CHANGED';
  }
  if (old.active) {
    const retained = newer.active && newer.active.id === old.active.id ? newer.active : newer.pending.find(session => session.id === old.active.id);
    if (!retained) return 'ACTIVE_DISAPPEARED';
    for (const name of ['id', 'ordinal', 'bookSnapshot', 'firstActionSnapshot', 'confirmedAt', 'startAt']) if (!equal(retained[name], old.active[name])) return 'ACTIVE_CHANGED';
    if (retained.intervals.length < old.active.intervals.length) return 'ACTIVE_CHANGED';
    for (let n = 0; n < old.active.intervals.length; n++) {
      const before = old.active.intervals[n]; const after = retained.intervals[n];
      if (before.end !== null) { if (!equal(before, after)) return 'ACTIVE_CHANGED'; }
      else if (before.kind !== after.kind || before.plannedMinutes !== after.plannedMinutes || !equal(before.start, after.start)) return 'ACTIVE_CHANGED';
    }
  }
  return null;
}
module.exports = { TEST_BOOKS, MAX_PENDING, MAX_INTERVALS, MAX_OBSERVED_GAP_MS, createDocument, createEmptyDocument, validateDocument, transition, summarize, summarizeSession, textInfo, historyError };

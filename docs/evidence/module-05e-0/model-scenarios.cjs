/*
 * MODEL_ONLY: executable synthetic architecture reasoning for 05E-0.
 * This file is not imported by either application. No Room, device, SDK, or
 * production API is exercised; passing proves these model semantics only.
 * No real record is granted clock comparability by this model.
 */
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAX_INTERVAL_MS = 6 * 60 * 60 * 1000;
const cases = [];

function identity(record) {
  if (record.source === 'PHONE' && typeof record.sessionId === 'string') {
    return JSON.stringify(['PHONE', record.sessionId]);
  }
  if (record.source === 'WRIST' && typeof record.installationId === 'string' &&
      typeof record.sessionId === 'string') {
    return JSON.stringify(['WRIST', record.installationId, record.sessionId]);
  }
  throw new Error('INVALID_IDENTITY');
}

function contentDigest(record) {
  return crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

function syntheticRecord(source, sessionId, segments, extra = {}) {
  return {
    source, sessionId, installationId: source === 'WRIST' ? 'fixture-installation' : null,
    clockProof: 'SYNTHETIC_COMPARABLE_ONLY', timeUncertain: false,
    segments, ...extra
  };
}

function unionReference(records, window = { start: 0, end: Number.MAX_SAFE_INTEGER }) {
  function unknown(reason) { return { duration: null, reason, verifiedWristFocus: 0 }; }
  if (!Number.isSafeInteger(window.start) || !Number.isSafeInteger(window.end) ||
      window.start < 0 || window.end <= window.start) return unknown('INVALID_WINDOW');
  const seen = new Map();
  const candidates = [];
  for (const record of records) {
    const id = identity(record);
    const digest = contentDigest(record);
    if (seen.has(id)) {
      if (seen.get(id) !== digest) return unknown('IDENTITY_CONTENT_CONFLICT');
      continue;
    }
    seen.set(id, digest);
    if (record.clockProof !== 'SYNTHETIC_COMPARABLE_ONLY') return unknown('CLOCK_DOMAIN_UNPROVEN');
    if (record.hardAnomaly || !Array.isArray(record.segments) || !record.segments.length) {
      return unknown('INCOMPLETE_OR_ANOMALOUS_TIME');
    }
    let previousEnd = null;
    for (const segment of record.segments) {
      const { start, end, kind } = segment;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
        return unknown('INVALID_TIME_BOUNDARY');
      }
      const delta = end - start;
      if (!Number.isSafeInteger(delta) || delta > MAX_INTERVAL_MS) return unknown('UNSAFE_TIME_DELTA');
      if (previousEnd !== null && start !== previousEnd) return unknown('INCOMPLETE_TIMELINE');
      previousEnd = end;
      const allowed = record.source === 'PHONE'
        ? ['READING', 'BREAK', 'ALLOWANCE', 'DISTRACTION', 'RECOVERY', 'UNMONITORED']
        : ['FOCUS', 'BREAK'];
      if (!allowed.includes(kind)) return unknown('UNKNOWN_SEGMENT_KIND');
      const reading = (record.source === 'PHONE' && kind === 'READING') ||
        (record.source === 'WRIST' && kind === 'FOCUS');
      if (reading) {
        const clipped = { start: Math.max(start, window.start), end: Math.min(end, window.end) };
        if (clipped.end > clipped.start) candidates.push(clipped);
      }
    }
  }
  candidates.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const candidate of candidates) {
    const previous = merged[merged.length - 1];
    if (previous && candidate.start <= previous.end) previous.end = Math.max(previous.end, candidate.end);
    else merged.push({ ...candidate });
  }
  let duration = 0;
  for (const segment of merged) {
    const delta = segment.end - segment.start;
    const next = duration + delta;
    if (!Number.isSafeInteger(next)) return unknown('UNSAFE_TOTAL');
    duration = next;
  }
  return { duration, reason: 'MODEL_COMPARABLE_REFERENCE', verifiedWristFocus: 0, merged };
}

function compareHistory(a, b) {
  const bucketA = a.endedAt === null ? 1 : 0;
  const bucketB = b.endedAt === null ? 1 : 0;
  if (bucketA !== bucketB) return bucketA - bucketB;
  if (bucketA === 0 && a.endedAt !== b.endedAt) return b.endedAt - a.endedAt;
  const sourceOrder = { PHONE: 0, WRIST: 1 };
  if (a.source !== b.source) return sourceOrder[a.source] - sourceOrder[b.source];
  for (const field of ['installationId', 'sessionId']) {
    const left = a[field] || '';
    const right = b[field] || '';
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

function freezeView(records, generation) {
  // Synthetic metadata snapshot; source reads/transactions/performance are not modeled.
  return { generation, members: records.map(record => ({ ...record })).sort(compareHistory) };
}

function page(view, cursor = null, size = 50) {
  if (cursor && cursor.generation !== view.generation) throw new Error('STALE_VIEW_CURSOR');
  let start = 0;
  if (cursor) {
    const index = view.members.findIndex(member => identity(member) === cursor.identity &&
      member.endedAt === cursor.endedAt && (member.endedAt === null ? 1 : 0) === cursor.timeBucket);
    if (index < 0) throw new Error('INVALID_VIEW_CURSOR');
    start = index + 1;
  }
  const lookahead = view.members.slice(start, start + size + 1);
  const items = lookahead.slice(0, size);
  const tail = items[items.length - 1];
  return {
    items,
    next: lookahead.length > size ? {
      generation: view.generation, identity: identity(tail), endedAt: tail.endedAt,
      timeBucket: tail.endedAt === null ? 1 : 0
    } : null
  };
}

function coordinatePage(raw, currentBook, workflow) {
  // Model of a single guarded transaction with CURRENT facts, not SQL or Room.
  const deferred = reason => ({ decision: 'DEFERRED', reason, writes: 0, book: currentBook });
  if (raw.endPage === null) return { decision: 'NO_PAGE', writes: 0, book: currentBook };
  if (!currentBook || currentBook.id !== raw.bookId) return deferred('BOOK_MISSING');
  if (currentBook.status !== 'IN_PROGRESS') return deferred('BOOK_STATUS');
  if (!Number.isSafeInteger(currentBook.totalPages) || currentBook.totalPages <= 0) return deferred('PAGE_RANGE');
  const valid = value => Number.isInteger(value) && value >= 1 && value <= currentBook.totalPages;
  if (!valid(currentBook.currentPage) || !valid(raw.startPage) || !valid(raw.endPage) ||
      raw.endPage < raw.startPage) return deferred('PAGE_RANGE');
  if (workflow && (workflow.activeIntent || workflow.activeSession)) return deferred('ACTIVE_WORKFLOW');
  if (raw.endPage <= currentBook.currentPage) return { decision: 'NO_ADVANCE', writes: 0, book: currentBook };
  return {
    decision: 'ADVANCED', writes: 1,
    book: { ...currentBook, currentPage: Math.max(currentBook.currentPage, raw.endPage), updatedAt: 'MODEL_COMMIT' }
  };
}

function test(id, description, run) { cases.push({ id, description, run }); }
const focus = (start, end) => ({ kind: 'FOCUS', start, end });
const reading = (start, end) => ({ kind: 'READING', start, end });
const rest = (start, end) => ({ kind: 'BREAK', start, end });
const wrist = (id, segments, extra) => syntheticRecord('WRIST', id, segments, extra);
const phone = (id, segments, extra) => syntheticRecord('PHONE', id, segments, extra);
const raw = { bookId: 'book-1', startPage: 10, endPage: 20 };
const book = { id: 'book-1', status: 'IN_PROGRESS', totalPages: 100, currentPage: 10, updatedAt: 'UNCHANGED' };

test('identity_source', 'Same session ID on phone and wrist remains distinct.', () => {
  assert.notEqual(identity(phone('same', [])), identity(wrist('same', [])));
});
test('identity_installation_and_delimiters', 'Installation and delimiter-containing IDs cannot collide.', () => {
  assert.notEqual(identity(wrist('same', [], { installationId: 'one' })), identity(wrist('same', [], { installationId: 'two' })));
  assert.notEqual(identity(wrist('b:c', [], { installationId: 'a' })), identity(wrist('c', [], { installationId: 'a:b' })));
});
test('union_overlap', 'Two overlapping ten-unit intervals yield fifteen, not twenty.', () => {
  assert.equal(unionReference([phone('p', [reading(0, 10)]), wrist('w', [focus(5, 15)])]).duration, 15);
});
test('union_adjacent_and_contained', 'Adjacent intervals merge; a contained interval adds no duration.', () => {
  assert.equal(unionReference([phone('p', [reading(0, 10)]), wrist('w', [focus(10, 20)])]).duration, 20);
  assert.equal(unionReference([phone('p', [reading(0, 10)]), wrist('w', [focus(2, 8)])]).duration, 10);
});
test('union_window_clip', 'Reference intervals are clipped to the requested half-open window.', () => {
  assert.equal(unionReference([phone('p', [reading(0, 10)]), wrist('w', [focus(5, 15)])], { start: 4, end: 12 }).duration, 8);
});
test('same_content_dedup', 'Duplicate source identity and content is counted once.', () => {
  const record = wrist('w', [focus(0, 10)]);
  assert.equal(unionReference([record, structuredClone(record)]).duration, 10);
});
test('different_content_conflict', 'Same source identity with different content rejects the total.', () => {
  assert.equal(unionReference([wrist('w', [focus(0, 10)]), wrist('w', [focus(0, 11)])]).reason, 'IDENTITY_CONTENT_CONFLICT');
});
test('break_excluded', 'Complete reading/rest timelines retain rest facts but exclude rest duration.', () => {
  const record = wrist('w', [focus(0, 5), rest(5, 15), focus(15, 20)]);
  assert.equal(unionReference([record]).duration, 10);
  assert.equal(record.segments[1].kind, 'BREAK');
});
test('unproven_clock', 'Wall clock-only input cannot generate a dual-device total.', () => {
  const result = unionReference([phone('p', [reading(0, 10)]), wrist('w', [focus(5, 15)], { clockProof: null })]);
  assert.equal(result.duration, null);
  assert.equal(result.reason, 'CLOCK_DOMAIN_UNPROVEN');
});
test('missing_rollback_jump', 'Missing endpoint, rollback, and excessive single-interval jump reject totals.', () => {
  for (const segment of [focus(1, null), focus(2, 1), focus(0, MAX_INTERVAL_MS + 1)]) {
    assert.equal(unionReference([wrist('w', [segment])]).duration, null);
  }
});
test('incomplete_timeline', 'Gaps, overlapping segments, and unknown kinds are not silently skipped.', () => {
  for (const segments of [[focus(0, 5), focus(6, 10)], [focus(0, 6), focus(5, 10)], [{ kind: 'UNKNOWN', start: 0, end: 1 }]]) {
    assert.equal(unionReference([wrist('w', segments)]).duration, null);
  }
});
test('unsafe_boundary', 'Unsafe integer boundaries and invalid windows reject calculations.', () => {
  assert.equal(unionReference([wrist('w', [focus(0, Number.MAX_SAFE_INTEGER + 1)])]).duration, null);
  assert.equal(unionReference([wrist('w', [focus(0, 1)])], { start: 2, end: 1 }).duration, null);
  const farBoundary = Number.MAX_SAFE_INTEGER - 20;
  assert.equal(unionReference([wrist('w', [focus(farBoundary, farBoundary + 10)])]).duration, 10);
});
test('unknown_is_not_zero_or_partial_total', 'A calculable subset cannot masquerade as a complete total.', () => {
  const result = unionReference([phone('good', [reading(0, 10)]), wrist('bad', [], { hardAnomaly: true })]);
  assert.equal(result.duration, null);
  assert.notEqual(result.duration, 0);
});
test('reference_never_effective_focus', 'Synthetic reference remains reference even when uncertain wall time is calculable.', () => {
  const result = unionReference([wrist('w', [focus(0, 10)], { timeUncertain: true, uncertaintyReason: 'OWNER_CHANGED' })]);
  assert.equal(result.duration, 10);
  assert.equal(result.verifiedWristFocus, 0);
});
test('coverage_not_clock_proof', 'FULL is not calibration; PARTIAL does not invalidate a separately qualified reference interval.', () => {
  assert.equal(unionReference([phone('p', [reading(0, 10)], { coverage: 'FULL', clockProof: null })]).duration, null);
  assert.equal(unionReference([phone('p', [reading(0, 10)], { coverage: 'PARTIAL' })]).duration, 10);
});
test('non_reading_phone_segments', 'Phone non-reading classifications remain excluded from the new reference model.', () => {
  const segments = [reading(0, 5), { kind: 'RECOVERY', start: 5, end: 10 }, { kind: 'UNMONITORED', start: 10, end: 15 }, reading(15, 20)];
  assert.equal(unionReference([phone('p', segments)]).duration, 10);
});
test('paging_50_and_51', '50+1 lookahead detects an additional member and traverses it once.', () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({ source: 'PHONE', sessionId: String(i).padStart(3, '0'), endedAt: 100 - i }));
  const fifty = page(freezeView(rows.slice(0, 50), 'fifty'));
  assert.equal(fifty.items.length, 50);
  assert.equal(fifty.next, null);
  const view = freezeView(rows, 'fifty-one');
  const first = page(view);
  const second = page(view, first.next);
  assert.equal(first.items.length, 50);
  assert.equal(second.items.length, 1);
  assert.equal(new Set([...first.items, ...second.items].map(identity)).size, 51);
});
test('paging_equal_end_identity', 'Source and installation tie-breakers remain deterministic across a page boundary.', () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({ source: 'WRIST', installationId: i % 2 ? 'b' : 'a', sessionId: String(i).padStart(3, '0'), endedAt: 100 }));
  rows.push({ source: 'PHONE', sessionId: 'same', endedAt: 100 });
  const view = freezeView(rows.reverse(), 'ties');
  assert.equal(view.members[0].source, 'PHONE');
  const first = page(view);
  const second = page(view, first.next);
  assert.deepEqual([...first.items, ...second.items].map(identity), view.members.map(identity));
});
test('unknown_end_bucket', 'Unknown end time stays unknown and receivedAt cannot determine completion order.', () => {
  const view = freezeView([
    { source: 'WRIST', installationId: 'i', sessionId: 'unknown', endedAt: null, receivedAt: 999999 },
    { source: 'PHONE', sessionId: 'known', endedAt: 1, receivedAt: 0 }
  ], 'unknown');
  assert.equal(view.members[0].sessionId, 'known');
  assert.equal(view.members[1].endedAt, null);
});
test('late_import_requires_refresh', 'A late historical import appears only in a new fixed-membership view.', () => {
  const rows = [{ source: 'PHONE', sessionId: 'initial', endedAt: 10 }];
  const old = freezeView(rows, 'old');
  rows.push({ source: 'WRIST', installationId: 'i', sessionId: 'late', endedAt: 9 });
  assert.equal(page(old).items.length, 1);
  assert.equal(page(freezeView(rows, 'new')).items.length, 2);
});
test('stale_cursor_rejected', 'A cursor from before source retirement or restore cannot continue a new view.', () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({ source: 'PHONE', sessionId: String(i), endedAt: i }));
  const old = freezeView(rows, 'before-restore');
  const cursor = page(old).next;
  assert.throws(() => page(freezeView(rows, 'after-restore'), cursor), /STALE_VIEW_CURSOR/);
});
test('active_finish_does_not_change_open_view', 'An active phone record ending later does not silently alter existing membership.', () => {
  const source = [{ source: 'PHONE', sessionId: 'ended', endedAt: 10 }];
  const view = freezeView(source, 'opened');
  source.push({ source: 'PHONE', sessionId: 'previously-active', endedAt: 8 });
  assert.deepEqual(page(view).items.map(item => item.sessionId), ['ended']);
});
test('null_page_no_side_effect', 'An absent end page does not invent progress or write updatedAt.', () => {
  const result = coordinatePage({ ...raw, endPage: null }, book, null);
  assert.equal(result.writes, 0);
  assert.equal(result.book.updatedAt, 'UNCHANGED');
});
test('equal_lower_page_no_side_effect', 'Equal or lower valid end pages never regress or write updatedAt.', () => {
  for (const endPage of [10, 15]) {
    const current = { ...book, currentPage: 15 };
    const result = coordinatePage({ ...raw, endPage }, current, null);
    assert.equal(result.writes, 0);
    assert.equal(result.book.currentPage, 15);
    assert.equal(result.book.updatedAt, 'UNCHANGED');
  }
});
test('max_progress_idempotent', 'A valid advance writes once; repeating the same raw record has no side effect.', () => {
  const first = coordinatePage(raw, book, null);
  assert.equal(first.book.currentPage, 20);
  assert.equal(first.writes, 1);
  assert.equal(coordinatePage(raw, first.book, null).writes, 0);
});
test('global_active_and_pending_defer', 'Any active workflow, including another book and PENDING closeout, defers progress.', () => {
  for (const workflow of [{ activeIntent: 'other-book' }, { activeSession: 'FOCUS' }, { activeSession: 'BREAK' }, { activeSession: 'PENDING' }]) {
    const result = coordinatePage(raw, book, workflow);
    assert.equal(result.reason, 'ACTIVE_WORKFLOW');
    assert.equal(result.writes, 0);
  }
});
test('missing_book_preserves_raw', 'Missing or mismatched stable book ID defers without mutating raw facts.', () => {
  const original = JSON.stringify(raw);
  assert.equal(coordinatePage(raw, null, null).reason, 'BOOK_MISSING');
  assert.equal(coordinatePage(raw, { ...book, id: 'different' }, null).writes, 0);
  assert.equal(JSON.stringify(raw), original);
});
test('range_and_status_defer', 'Invalid current ranges, backward end pages, and non-IN_PROGRESS statuses defer.', () => {
  for (const [candidateRaw, candidateBook] of [
    [{ ...raw, endPage: 101 }, book], [{ ...raw, endPage: 5 }, book],
    [{ ...raw, startPage: 0 }, book], [raw, { ...book, totalPages: 0 }],
    [raw, { ...book, currentPage: 101 }], [raw, { ...book, status: 'PAUSED' }],
    [raw, { ...book, status: 'COMPLETED' }]
  ]) assert.equal(coordinatePage(candidateRaw, candidateBook, null).writes, 0);
});
test('restore_rereads_current_facts', 'After an older backup restore, admission is recalculated from current book and workflow.', () => {
  assert.equal(coordinatePage(raw, { ...book, currentPage: 20 }, null).writes, 0);
  const restored = { ...book, currentPage: 10 };
  assert.equal(coordinatePage(raw, restored, null).book.currentPage, 20);
  assert.equal(coordinatePage(raw, { ...restored, totalPages: 15 }, null).writes, 0);
  assert.equal(coordinatePage(raw, restored, { activeSession: 'PENDING' }).writes, 0);
});
test('serialized_max_does_not_regress', 'Synthetic serialized guarded transactions preserve maximum progress in either order.', () => {
  const high = { ...raw, endPage: 30 };
  const low = { ...raw, endPage: 20 };
  for (const sequence of [[high, low], [low, high]]) {
    let current = book;
    for (const candidate of sequence) current = coordinatePage(candidate, current, null).book;
    assert.equal(current.currentPage, 30);
  }
});
test('closed_zero_interval_is_not_unknown', 'A complete closed zero-length interval contributes zero while an unknown endpoint rejects the total.', () => {
  assert.equal(unionReference([wrist('zero', [focus(5, 5)])]).duration, 0);
  assert.equal(unionReference([wrist('zero-and-reading', [focus(5, 5), focus(5, 10)])]).duration, 5);
  assert.equal(unionReference([wrist('unknown', [focus(5, null)])]).duration, null);
});
test('unknown_start_page_defers', 'A nullable or missing start page prevents progress admission without changing raw facts.', () => {
  for (const startPage of [null, undefined]) {
    const candidate = { ...raw, startPage };
    const before = JSON.stringify(candidate);
    const result = coordinatePage(candidate, book, null);
    assert.equal(result.decision, 'DEFERRED');
    assert.equal(result.writes, 0);
    assert.equal(JSON.stringify(candidate), before);
  }
});
test('unknown_total_pages_defers', 'Unknown, non-positive, fractional, or unsafe current total pages cannot authorize an advance.', () => {
  for (const totalPages of [null, undefined, 0, -1, 100.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const result = coordinatePage(raw, { ...book, totalPages }, null);
    assert.equal(result.decision, 'DEFERRED');
    assert.equal(result.writes, 0);
    assert.equal(result.book.currentPage, book.currentPage);
  }
});

const outcomes = cases.map(({ id, description, run }) => {
  try { run(); return { id, description, status: 'PASS' }; }
  catch (error) { return { id, description, status: 'FAIL', error: String(error.message) }; }
});
const failed = outcomes.filter(outcome => outcome.status === 'FAIL');
const results = {
  evidenceKind: 'MODEL_ONLY',
  phase: '05E-0',
  executedAtUtc: new Date().toISOString(),
  environment: { runtime: 'Node.js', version: process.version, platform: process.platform, architecture: process.arch },
  scope: 'Synthetic architecture semantics only; no production API, Room, backup, SDK, device, or performance verification.',
  clockBoundary: 'SYNTHETIC_COMPARABLE_ONLY is a fixture assumption; it cannot grant comparability or effective focus to real wrist records.',
  total: outcomes.length,
  passed: outcomes.length - failed.length,
  failed: failed.length,
  status: failed.length ? 'MODEL_FAILURE' : 'MODEL_SCENARIOS_PASS',
  applicationImplementationStatus: 'NOT_IMPLEMENTED',
  notRun: ['Production implementation/regression', 'Real SQLite transaction/isolation', 'Room migration', 'Full Backup restore', 'Native performance', 'Physical wireless/device use', 'APK/RPK build/install'],
  cases: outcomes
};
fs.writeFileSync(path.join(__dirname, 'model-results.json'), JSON.stringify(results, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ evidenceKind: results.evidenceKind, runtime: process.version, total: results.total, passed: results.passed, failed: results.failed, status: results.status }));
for (const failure of failed) console.error(failure.id + ': ' + failure.error);
process.exitCode = failed.length ? 1 : 0;

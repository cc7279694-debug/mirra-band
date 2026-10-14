const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../src/lib/local-session');
const { presentLocal } = require('../src/lib/local-presentation');
const { createLocalUiFlow } = require('../src/lib/local-ui-flow');
function completed(ordinal = 1, title = '已结束的真实书') {
  const observation = wallMs => ({ wallMs, ownerId: 'display-owner', monotonicMs: null, monotonicVerified: false });
  let doc = domain.createDocument('display-install'); doc.counter = ordinal - 1;
  doc = domain.transition(doc, { type: 'START_CONFIRMED', bookId: 'test-reading-1', firstActionId: 'read-first-paragraph', confirmed: true }, observation(1000));
  doc = domain.transition(doc, { type: 'FINISH', endPage: 20 }, observation(16000)); doc.pending[0].bookSnapshot.title = title;
  return doc.pending[0];
}
function snapshot(session) { const doc = domain.createDocument('display-install'); doc.counter = session.ordinal;
  return { document: doc, status: 'READY', canWrite: true, busy: false, storageQualified: true, sequence: 3,
    retainedRecords: [session], summary: domain.summarizeSession(session, { wallMs: null, ownerId: 'display-owner', monotonicMs: null, monotonicVerified: false }) }; }
const catalog = [{ id: 'next-book', title: '下一本真实书', startPage: 1, firstActions: [{ id: 'next-action', text: '读第一段。' }] }];
test('ACK-retired saved screen shows the same archived raw book page and reference duration', () => {
  const session = completed(); const state = snapshot(session); const vm = presentLocal(state, { view: 'SAVED', savedRecordId: session.id }, catalog, { formal: true });
  assert.equal(vm.view, 'SAVED'); assert.equal(vm.bookTitle, '已结束的真实书'); assert.equal(vm.endPageText, '结束页码 · 第 20 页'); assert.equal(vm.timer.valueText, '00:15');
  assert.equal(vm.sourceLabel, '曾获手机保存确认'); assert.match(vm.details.syncText, /未计为有效专注/); assert.equal(vm.details.sessionId, 'display-install:1');
});
test('a newer retained saved record is not replaced by an older pending tail', () => {
  const session = completed(2); const state = snapshot(session); state.document.pending = [completed(1, '较旧待同步书')]; state.document.state = 'FINISHED_PENDING_SYNC';
  const vm = presentLocal(state, { view: 'SAVED', savedRecordId: session.id }, catalog, { formal: true });
  assert.equal(vm.bookTitle, '已结束的真实书'); assert.equal(vm.sourceLabel, '曾获手机保存确认');
});
test('flow keeps the explicit saved record when an external confirmed ACK moves main state to IDLE', async () => {
  const session = completed(); let current = { ...snapshot(session), document: { ...snapshot(session).document, pending: [session], state: 'FINISHED_PENDING_SYNC' }, retainedRecords: [] }; const listeners = [];
  const owner = { sessionContext: { profile: 'formal' }, async open() { return current; }, snapshot() { return current; }, subscribe(listener) { listeners.push(listener); return () => {}; }, async dispatch() { return current; } };
  const flow = createLocalUiFlow({ owner, catalog, sessionContext: { profile: 'formal' } }); await flow.show();
  // Enter SAVED by an actual FINISH command receipt, rather than forcing a view.
  let active = domain.createDocument('display-install'); active = domain.transition(active, { type: 'START_CONFIRMED', bookId: 'test-reading-1', firstActionId: 'read-first-paragraph', confirmed: true }, { wallMs: 1000, ownerId: 'display-owner', monotonicMs: null, monotonicVerified: false });
  current = { ...current, document: active, sequence: 4 }; listeners.forEach(listener => listener(current));
  owner.dispatch = async action => { current = { ...current, document: domain.transition(active, action, { wallMs: 16000, ownerId: 'display-owner', monotonicMs: null, monotonicVerified: false }), sequence: 5 }; return current; };
  flow.openFinishReview(); await flow.finish(20); assert.equal(flow.getState().view, 'SAVED');
  const finished = current.document.pending[0]; current = { ...current, document: { ...current.document, pending: [], state: 'IDLE' }, retainedRecords: [finished], sequence: 6 };
  listeners.forEach(listener => listener(current)); assert.equal(flow.getState().view, 'SAVED'); assert.equal(flow.getState().savedRecordId, finished.id);
  flow.openDetails(); assert.equal(flow.getState().view, 'DETAILS'); flow.back(); assert.equal(flow.getState().view, 'SAVED'); flow.done(); assert.equal(flow.getState().view, 'READY');
  flow.dispose();
});

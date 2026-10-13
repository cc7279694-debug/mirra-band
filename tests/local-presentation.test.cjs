const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../src/lib/local-session');
const presentation = require('../src/lib/local-presentation');

const obs = wallMs => ({ wallMs, ownerId: 'presentation-owner', monotonicMs: null, monotonicVerified: false });
const change = (doc, type, wallMs, fields = {}) => domain.transition(doc, { type, ...fields }, obs(wallMs));
function preparation(bookId = 'test-reading-1', actionId = 'read-first-paragraph') {
  const selected = change(domain.createDocument('presentation-install'), 'SELECT_BOOK', 1000, { bookId });
  return actionId === null ? selected : change(selected, 'SELECT_ACTION', 1100, { firstActionId: actionId });
}
const focused = () => change(preparation(), 'CONFIRM_START', 2000, { confirmed: true });
const finished = () => change(focused(), 'FINISH', 17000, { endPage: null });
function snapshot(document = domain.createDocument('presentation-install'), overrides = {}) {
  return { document, status: 'READY', busy: false, canWrite: true, storageQualified: true,
    errorCode: null, recoveryHint: '', summary: domain.summarize(document, obs(17000)),
    timeHint: '', pendingCount: document.pending.length, sequence: 5, ...overrides };
}
const project = (owner, ui = {}, catalog = domain.TEST_BOOKS, brand = {}) => presentation.presentLocal(owner, ui, catalog, brand);

test('existing FOCUS opens directly as reading with actual observed time and no resume gate', () => {
  const vm = project(snapshot(focused()));
  assert.equal(vm.view, 'READING');
  assert.equal(vm.title, '阅读中');
  assert.equal(vm.timer.valueText, '00:15');
  assert.equal(vm.timer.qualifier, '参考值');
  assert.equal(vm.primary.action, 'openBreakPicker');
  assert.equal(vm.primary.label, '休息');
  assert.equal(vm.secondary.label, '结束');
  assert.equal(vm.bookTitle, '测试书籍 · 阅读练习');
  assert.equal(vm.sourceLabel, '仅本地 · 未监测');
});

test('expired break stays RESTING and only explicit continue is a business action', () => {
  const doc = change(focused(), 'BEGIN_BREAK', 3000, { minutes: 5 });
  const vm = project(snapshot(doc, { summary: domain.summarize(doc, obs(400000)) }));
  assert.equal(vm.view, 'RESTING');
  assert.equal(vm.timer.valueText, '休息时间已到');
  assert.equal(vm.timer.label, '计划剩余');
  assert.equal(vm.timer.qualifier, '参考值');
  assert.equal(vm.primary.action, 'resume');
  assert.equal(vm.primary.label, '继续学习');
});

test('critical storage notice permits explicit read-only details without enabling business writes', () => {
  for (const status of ['BLOCKED', 'UNCERTAIN', 'CLOSED', 'RECOVERED']) {
    const owner = snapshot(focused(), { status, canWrite: status === 'RECOVERED', errorCode: status === 'BLOCKED' ? 'UNKNOWN_SCHEMA' : null });
    const detail = project(owner, { view: 'DETAILS' });
    assert.equal(detail.view, 'DETAILS');
    assert.equal(detail.canWrite, false);
    assert.equal(detail.notice.visible, true);
    assert.equal(detail.details.status, status);
    assert.equal(detail.details.errorCode, owner.errorCode || '');
  }
});

test('first storage read exposes a disabled button shape safe for native template bindings', () => {
  const loading = project({ status: 'UNOPENED', document: null, storageQualified: true });
  assert.equal(loading.view, 'STORAGE_NOTICE');
  assert.equal(loading.primary.enabled, false);
  assert.equal(typeof loading.primary.label, 'string');
  assert.equal(loading.primary.action, '');
});

test('finished cold launch suggests ready while newly verified finish can show only one done action', () => {
  const saved = snapshot(finished());
  const cold = project(saved);
  assert.equal(cold.view, 'READY');
  assert.equal(cold.pendingCount, 1);
  assert.equal(cold.recordCountText, '已有 1 条本地记录');
  const fresh = project(saved, { view: 'SAVED' });
  assert.equal(fresh.view, 'SAVED');
  assert.equal(fresh.title, '已存到手环');
  assert.equal(fresh.primary.label, '完成');
  assert.equal(fresh.primary.action, 'done');
  assert.equal(fresh.secondary, null);
  assert.equal(fresh.endPageText, '未填写页码');
  assert.equal(fresh.sourceLabel, '仅本地 · 尚未同步');
});

test('finish review is navigation with nullable page rather than a prefilled editor', () => {
  const vm = project(snapshot(focused()), { view: 'FINISH_REVIEW' });
  assert.equal(vm.view, 'FINISH_REVIEW');
  assert.equal(vm.pageDigits, '');
  assert.equal(vm.endPageText, '页码：不填写');
  assert.equal(vm.primary.label, '结束并保存');
  assert.equal(vm.secondary.action, 'openPageEditor');
});

test('navigation is constrained by the persisted business state and preserves valid editor drafts', () => {
  assert.equal(project(snapshot(focused()), { view: 'READY' }).view, 'READING');
  assert.equal(project(snapshot(), { view: 'READING' }).view, 'READY');
  const vm = project(snapshot(focused()), { view: 'PAGE_EDITOR', pageDigits: '123', pageError: '输入错误' });
  assert.equal(vm.view, 'PAGE_EDITOR');
  assert.equal(vm.pageDigits, '123');
  assert.equal(vm.pageError, '输入错误');
});

test('unknown and invalid durations never become zero, while hour formatting adapts without truncation', () => {
  for (const value of [null, undefined, NaN, Infinity, -1]) {
    assert.deepEqual(presentation.formatObservedDuration(value), { valueText: '--:--', qualifier: '时间待核对', isUnknown: true, isLong: false, label: '' });
  }
  assert.equal(presentation.formatObservedDuration(0).valueText, '00:00');
  assert.equal(presentation.formatObservedDuration(3599999).valueText, '59:59');
  const hour = presentation.formatObservedDuration(3601000);
  assert.equal(hour.valueText, '1:00:01');
  assert.equal(hour.isLong, true);
  assert.equal(presentation.formatObservedDuration(360000000).valueText, '100:00:00');
});

test('current null metric and independent uncertain intervals retain distinct adjacent warnings', () => {
  const owner = snapshot(focused(), { summary: { observedFocusMs: 24000, observedBreakMs: null, breakRemainingMs: null, trustedFocusMs: 0, reasons: ['WALL_ONLY', 'OWNER_CHANGED', 'CLOCK_UNAVAILABLE'], timeUncertain: true } });
  const vm = project(owner);
  assert.equal(vm.timer.valueText, '00:24');
  assert.equal(vm.timer.qualifier, '参考值');
  assert.equal(vm.restTimer.valueText, '--:--');
  assert.equal(vm.restTimer.qualifier, '时间待核对');
  assert.equal(vm.notice.title, '记录含不确定区间');
  assert.equal(vm.details.timeReasonText, 'WALL_ONLY / OWNER_CHANGED / CLOCK_UNAVAILABLE');
  const unknown = project({ ...owner, summary: { ...owner.summary, observedFocusMs: null } });
  assert.equal(unknown.timer.valueText, '--:--');
  assert.equal(unknown.notice.title, '时间待核对');
});

test('restored reading reference stays visibly unverified and retains owner-change reasons', () => {
  const owner = snapshot(focused(), { summary: { observedFocusMs: 65000, observedBreakMs: 10000, breakRemainingMs: null,
    trustedFocusMs: 0, reasons: ['OWNER_CHANGED', 'WALL_ONLY'], timeUncertain: true, timeConfidence: 'UNVERIFIED' } });
  const before = JSON.stringify(owner);
  const vm = project(owner);
  assert.equal(vm.view, 'READING');
  assert.equal(vm.timer.valueText, '01:05');
  assert.equal(vm.timer.qualifier, '参考值');
  assert.equal(vm.timer.isUnknown, false);
  assert.equal(vm.notice.title, '恢复后参考计时');
  assert.equal(vm.notice.level, 'info');
  assert.match(vm.notice.text, /系统时钟.*估算.*未验证/);
  assert.match(vm.notice.text, /休息不计入阅读/);
  assert.deepEqual(vm.details.timeReasons, ['OWNER_CHANGED', 'WALL_ONLY']);
  assert.equal(vm.details.timeReasonText, 'OWNER_CHANGED / WALL_ONLY');
  assert.equal(vm.sourceLabel, '仅本地 · 未监测');
  assert.doesNotMatch(JSON.stringify(vm), /已验证专注|有效专注/);
  assert.equal(JSON.stringify(owner), before);
  assert.equal(owner.summary.trustedFocusMs, 0);
  assert.equal(owner.summary.timeConfidence, 'UNVERIFIED');
});

test('restored break reference keeps the explicit continue action and excludes rest from reading', () => {
  const document = change(focused(), 'BEGIN_BREAK', 3000, { minutes: 5 });
  const vm = project(snapshot(document, { summary: { observedFocusMs: 1000, observedBreakMs: 65000, breakRemainingMs: 235000,
    trustedFocusMs: 0, reasons: ['WALL_ONLY', 'OWNER_CHANGED'], timeUncertain: true, timeConfidence: 'UNVERIFIED' } }));
  assert.equal(vm.view, 'RESTING');
  assert.equal(vm.state, 'BREAK');
  assert.equal(vm.timer.valueText, '03:55');
  assert.equal(vm.timer.qualifier, '参考值');
  assert.equal(vm.focusTimer.valueText, '00:01');
  assert.equal(vm.restTimer.valueText, '01:05');
  assert.equal(vm.notice.title, '恢复后参考计时');
  assert.equal(vm.primary.action, 'resume');
  assert.equal(vm.primary.label, '继续学习');
  assert.deepEqual(vm.details.timeReasons, ['WALL_ONLY', 'OWNER_CHANGED']);
});

test('saved cross-owner reference preserves the unverified label and retained local record', () => {
  const vm = project(snapshot(finished(), { summary: { observedFocusMs: 65000, observedBreakMs: 10000, breakRemainingMs: null,
    trustedFocusMs: 0, reasons: ['OWNER_CHANGED', 'WALL_ONLY'], timeUncertain: true, timeConfidence: 'UNVERIFIED' } }), { view: 'SAVED' });
  assert.equal(vm.view, 'SAVED');
  assert.equal(vm.focusTimer.valueText, '01:05');
  assert.equal(vm.focusTimer.qualifier, '参考值');
  assert.equal(vm.restTimer.valueText, '00:10');
  assert.equal(vm.restTimer.qualifier, '参考值');
  assert.equal(vm.notice.title, '恢复后参考计时');
  assert.equal(vm.pendingCount, 1);
  assert.equal(vm.sourceLabel, '仅本地 · 尚未同步');
  assert.deepEqual(vm.details.timeReasons, ['OWNER_CHANGED', 'WALL_ONLY']);
});

test('actual missing, rollback and jump summaries remain unknown beside retained owner-change reasons', () => {
  for (const [wallMs, reason] of [[null, 'CLOCK_UNAVAILABLE'], [1000, 'CLOCK_ROLLBACK'], [2000 + domain.MAX_OBSERVED_GAP_MS + 1, 'CLOCK_JUMP']]) {
    const document = focused();
    const summary = domain.summarize(document, obs(wallMs));
    summary.reasons.push('OWNER_CHANGED');
    const vm = project(snapshot(document, { summary }));
    assert.equal(vm.timer.valueText, '--:--');
    assert.equal(vm.timer.qualifier, '时间待核对');
    assert.equal(vm.timer.isUnknown, true);
    assert.equal(vm.notice.title, '时间待核对');
    assert.ok(vm.details.timeReasons.includes(reason));
    assert.ok(vm.details.timeReasons.includes('OWNER_CHANGED'));
    assert.equal(summary.trustedFocusMs, 0);
  }
});

test('saved unknown metrics say undetermined instead of a made-up zero', () => {
  const vm = project(snapshot(finished(), { summary: { observedFocusMs: null, observedBreakMs: null, breakRemainingMs: null, reasons: ['OWNER_CHANGED', 'CLOCK_UNAVAILABLE'] } }), { view: 'SAVED' });
  assert.equal(vm.focusTimer.valueText, '--:--');
  assert.equal(vm.focusTimer.qualifier, '未能确定');
  assert.equal(vm.restTimer.qualifier, '未能确定');
});

test('unread storage never flashes ready or allows a start', () => {
  for (const status of ['UNOPENED', 'OPENING']) {
    const vm = project({ ...snapshot(), status, document: null, canWrite: false, busy: status === 'OPENING' });
    assert.equal(vm.view, 'STORAGE_NOTICE');
    assert.equal(vm.storageNotice.title, '正在读取');
    assert.equal(vm.canWrite, false);
    assert.equal(vm.primary.enabled, false);
    assert.equal(vm.primary.action, '');
  }
});

test('acknowledged EMPTY slot enables a recommendation without allocating an installation identity', async () => {
  const { createLocalOwner } = require('../src/lib/local-owner');
  let writes = 0; let identities = 0;
  const service = createLocalOwner({ storageQualified: true,
    backendFactory: () => ({ read: async () => null, write: async () => { writes++; }, close() {} }),
    clock: () => obs(17000), installationIdFactory: () => { identities++; return 'presentation-install'; } });
  const owner = await service.open();
  assert.equal(owner.status, 'EMPTY');
  assert.equal(owner.document, null);
  const before = JSON.stringify(owner);
  const vm = project(owner);
  assert.equal(vm.view, 'READY');
  assert.equal(vm.primary.enabled, true);
  assert.equal(vm.preview.bookId, 'test-reading-1');
  assert.equal(vm.preview.installationId, null);
  assert.equal(vm.preview.sequence, 0);
  assert.equal(JSON.stringify(owner), before);
  assert.equal(writes, 0);
  assert.equal(identities, 0);
  assert.equal(project({ ...owner, status: 'READY' }).view, 'STORAGE_NOTICE');
});

test('completed record details retain original snapshot book and action after cold launch', () => {
  const owner = snapshot(finished());
  owner.document.pending[0].bookSnapshot.title = '已保存的原始书名';
  owner.document.pending[0].firstActionSnapshot.text = '已保存的原始第一步😀';
  const vm = project(owner, { view: 'DETAILS' });
  assert.equal(vm.details.bookTitle, '已保存的原始书名');
  assert.equal(vm.details.actionText, '已保存的原始第一步😀');
  assert.equal(vm.details.sessionId, 'presentation-install:1');
});

test('dangerous or unqualified storage overrides stale success and keeps safe recovery instructions', () => {
  for (const [status, title] of [['BLOCKED', '暂时无法读取'], ['UNCERTAIN', '保存结果待核对'], ['CLOSED', '存储已关闭'], ['UNQUALIFIED', '存储暂未准入']]) {
    const vm = project(snapshot(finished(), { status, canWrite: true }), { view: 'SAVED' });
    assert.equal(vm.view, 'STORAGE_NOTICE');
    assert.equal(vm.storageNotice.title, title);
    assert.equal(vm.canWrite, false);
    assert.equal(vm.storageNotice.canReload, status === 'BLOCKED');
    assert.doesNotMatch(vm.storageNotice.text, /清除|卸载|去同步/);
  }
  assert.equal(project(snapshot(focused(), { storageQualified: false })).view, 'STORAGE_NOTICE');
  assert.equal(project(snapshot(focused()), { operationUncertain: true }).storageNotice.title, '保存结果待核对');
});

test('recovered snapshot asks for state inspection and retains a limited recovery notice after acknowledgment', () => {
  const owner = snapshot(focused(), { status: 'RECOVERED', recoveryHint: '上一份有效记录' });
  const prompt = project(owner);
  assert.equal(prompt.view, 'STORAGE_NOTICE');
  assert.equal(prompt.recoveryNotice.title, '已读取上一份记录');
  assert.equal(prompt.primary.action, 'acknowledgeRecovery');
  assert.equal(prompt.canWrite, false);
  assert.match(prompt.recoveryNotice.text, /最近变化可能未保留/);
  const acknowledged = project(owner, { recoveryAcknowledged: true });
  assert.equal(acknowledged.view, 'READING');
  assert.equal(acknowledged.canWrite, true);
  assert.equal(acknowledged.recoveryNotice.visible, true);
  assert.equal(acknowledged.notice.title, '已读取上一份记录');
});

test('acknowledged recovery cannot hide a later capacity failure or unknown current time', () => {
  const owner = snapshot(focused(), { status: 'RECOVERED', errorCode: 'CAPACITY_REQUIRED' });
  const failed = project(owner, { recoveryAcknowledged: true });
  assert.equal(failed.notice.title, '本地空间预算不足');
  assert.equal(failed.recoveryNotice.visible, true);
  const unknown = project({ ...owner, errorCode: null, summary: { ...owner.summary, observedFocusMs: null, reasons: ['OWNER_CHANGED', 'CLOCK_UNAVAILABLE'] } }, { recoveryAcknowledged: true });
  assert.equal(unknown.notice.title, '时间待核对');
  assert.equal(unknown.recoveryNotice.visible, true);
});

test('capacity failure stays visible and never offers fake synchronization or record deletion', () => {
  const vm = project(snapshot(focused(), { errorCode: 'CAPACITY_REQUIRED' }));
  assert.equal(vm.view, 'READING');
  assert.equal(vm.notice.title, '本地空间预算不足');
  assert.match(vm.notice.text, /已有记录不删除/);
  assert.doesNotMatch(JSON.stringify(vm), /已同步到手机|主线已同步|正在上传|立即同步/);
});

test('whole command-chain busy state fixes labels and disables all business actions until confirmation', () => {
  const ready = project(snapshot(), { busy: true, operation: 'start' });
  assert.equal(ready.primary.label, '正在开始…');
  assert.equal(ready.primary.enabled, false);
  const saving = project(snapshot(focused()), { view: 'FINISH_REVIEW', busy: true, operation: 'finish' });
  assert.equal(saving.primary.label, '正在保存…');
  assert.equal(saving.primary.enabled, false);
  assert.equal(saving.secondary.enabled, false);
  const editor = project(snapshot(focused()), { view: 'PAGE_EDITOR', busy: true, operation: 'finish' });
  assert.equal(editor.primary.label, '保存中');
  assert.equal(editor.primary.enabled, false);
});

test('ready preview priority is valid UI draft, preparation, recent known record, then catalog', () => {
  const prep = snapshot(preparation('test-review-1', 'read-next-page'));
  assert.equal(presentation.resolveReadyPreview(prep, {}, domain.TEST_BOOKS).bookId, 'test-review-1');
  const draft = presentation.resolveReadyPreview(prep, { bookId: 'test-reading-1', actionId: 'open-book' }, domain.TEST_BOOKS);
  assert.equal(draft.bookId, 'test-reading-1');
  assert.equal(draft.actionId, 'open-book');
  assert.equal(draft.text, '打开这本测试书籍，找到准备阅读的一页。');
  const recent = finished();
  recent.pending[0].bookSnapshot.id = 'test-review-1';
  const recentPreview = presentation.resolveReadyPreview(snapshot(recent), { bookId: 'unknown', actionId: 'unknown' }, domain.TEST_BOOKS);
  assert.equal(recentPreview.bookId, 'test-review-1');
  assert.equal(recentPreview.actionId, 'read-next-page');
  assert.equal(presentation.resolveReadyPreview(snapshot(), {}, domain.TEST_BOOKS).bookId, 'test-reading-1');
});

test('saved preparation text remains original when catalog wording differs and preview is immutable', () => {
  const prep = snapshot(preparation());
  prep.document.preparation.bookSnapshot.title = '已经保存的书名';
  prep.document.preparation.firstActionSnapshot.text = '已经保存的动作😀，读第1段。';
  const preview = presentation.resolveReadyPreview(prep, {}, domain.TEST_BOOKS);
  assert.equal(preview.bookTitle, '已经保存的书名');
  assert.equal(preview.text, '已经保存的动作😀，读第1段。');
  assert.equal(preview.sequence, 5);
  assert.equal(preview.installationId, 'presentation-install');
  assert.equal(Object.isFrozen(preview), true);
  assert.equal(Object.isFrozen(preview.bookSnapshot), true);
  assert.equal(Object.isFrozen(preview.firstActionSnapshot), true);
  assert.notEqual(preview.bookSnapshot, prep.document.preparation.bookSnapshot);
});

test('missing or stale catalog cannot invent a startable preview', () => {
  assert.equal(presentation.resolveReadyPreview(snapshot(), {}, []), null);
  const vm = project(snapshot(), {}, []);
  assert.equal(vm.view, 'READY');
  assert.equal(vm.primary.enabled, false);
  assert.equal(vm.bookChoices.length, 0);
  assert.equal(vm.startPageText, '未设置页码');
});

test('long book/action text survives the projection unchanged and nullable page remains explicit', () => {
  const long = project(snapshot(), { bookId: 'test-long-title' });
  assert.equal(long.preview.bookTitle, '测试书籍 · 关于日常阅读、注意力与重新开始的长中文标题排版练习');
  assert.equal(long.preview.text, '打开准备阅读的一页，读第一段。完成后亲自确认，开始本次独立阅读。');
  assert.equal(long.preview.isLongAction, true);
  assert.equal(long.preview.startPage, null);
  assert.equal(long.preview.startPageText, '未设置页码');
  const catalog = [{ id: 'emoji-book', title: '第12章😀书', startPage: null, firstActions: [{ id: 'emoji-action', text: '读第12段😀，完成后确认。' }] }];
  assert.equal(project(snapshot(), {}, catalog).actionText, '读第12段😀，完成后确认。');
});

test('projection neither mutates frozen input nor reads a fresh clock, and brand never removes experiment identity', () => {
  const owner = snapshot(focused());
  const ui = { view: 'DETAILS', pageDigits: '18' };
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  freeze(owner); freeze(ui);
  const original = Date.now;
  Date.now = () => { throw new Error('projection must not read the clock'); };
  try {
    const vm = project(owner, ui, domain.TEST_BOOKS, { logoPath: '/common/local-brand/logo.png', versionText: '0.1.1' });
    assert.equal(vm.view, 'DETAILS');
    assert.equal(vm.experimentLabel, '实验');
    assert.equal(vm.details.versionText, '0.1.1');
    assert.equal(vm.details.brandStatus, 'LOGO_READY');
    assert.equal(vm.details.sourceText, '腕端独立测试记录');
    assert.equal(vm.details.syncText, '本实验尚未接入手机同步');
  } finally { Date.now = original; }
  assert.equal(project(owner).details.brandStatus, 'LOGO_PENDING');
});

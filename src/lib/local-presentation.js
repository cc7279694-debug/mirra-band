// Pure projection of acknowledged storage facts and in-memory UI drafts.
// This layer never observes a clock, performs IO, or changes a Session.
const WRITABLE_STATUSES = ['EMPTY', 'READY', 'RECOVERED'];
const CAPACITY_ERRORS = ['CAPACITY_REQUIRED', 'CAPACITY', 'PENDING_CAPACITY', 'INTERVAL_CAPACITY', 'COUNTER_CAPACITY', 'SIZE', 'ARCHIVE_CAPACITY'];

function positivePage(value) { return Number.isSafeInteger(value) && value > 0 && value <= 999999 ? value : null; }
function pageText(value, formal, pendingPage) {
  if (positivePage(value) === null) return '未设置页码';
  if (formal && positivePage(pendingPage) !== null) return '待确认进度 · 第 ' + value + ' 页 · 未更新手机';
  return (formal ? '起始页 · 第 ' : '测试起始页 · 第 ') + value + ' 页';
}
function validBooks(catalog) {
  return Array.isArray(catalog) ? catalog.filter(book => book && typeof book.id === 'string' && book.id
    && typeof book.title === 'string' && book.title && Array.isArray(book.firstActions)) : [];
}
function actionsFor(book) {
  return book ? book.firstActions.filter(action => action && typeof action.id === 'string' && action.id
    && typeof action.text === 'string' && action.text) : [];
}
function resolveReadyPreview(snapshot, ui, catalog) {
  snapshot = snapshot || {}; ui = ui || {};
  const doc = snapshot.document || {};
  const books = validBooks(catalog);
  const preparation = doc.state === 'PREPARING' && doc.preparation ? doc.preparation : null;
  const savedBook = preparation && preparation.bookSnapshot;
  const draftBook = books.find(book => book.id === ui.bookId);
  let book = draftBook || books.find(item => savedBook && item.id === savedBook.id);
  // The formal runtime orders its confirmed directory with mainline first.
  // A previous completed book is history, not a new implicit selection.
  if (!book && ui.formal !== true && Array.isArray(doc.pending)) {
    for (let index = doc.pending.length - 1; index >= 0 && !book; index--) {
      const entry = doc.pending[index];
      book = books.find(item => entry && entry.bookSnapshot && item.id === entry.bookSnapshot.id);
    }
  }
  book = book || books[0];
  if (!book) return null;
  const samePreparation = savedBook && savedBook.id === book.id;
  const savedAction = samePreparation && preparation.firstActionSnapshot;
  const available = actionsFor(book);
  const draftAction = available.find(action => action.id === ui.actionId);
  const action = draftAction || available.find(item => savedAction && item.id === savedAction.id) || available[0];
  if (!action) return null;
  const title = samePreparation && typeof savedBook.title === 'string' ? savedBook.title : book.title;
  const startPage = positivePage(samePreparation ? savedBook.startPage : book.startPage);
  const text = savedAction && savedAction.id === action.id && typeof savedAction.text === 'string' ? savedAction.text : action.text;
  const bookSnapshot = Object.freeze({ id: book.id, title, startPage });
  const firstActionSnapshot = Object.freeze({ id: action.id, text });
  const preview = { bookId: book.id, actionId: action.id, text, actionText: text, bookTitle: title, bookText: title,
    startPage, startPageText: pageText(startPage, ui.formal === true, book.pendingPage), isLongAction: Array.from(text).length > 18,
    bookSnapshot, firstActionSnapshot, sequence: snapshot.sequence, installationId: doc.installationId || null,
    state: doc.state || 'IDLE' };
  if (typeof ui.catalogRevision === 'string') preview.catalogRevision = ui.catalogRevision;
  return Object.freeze(preview);
}

function pad2(value) { return value < 10 ? '0' + value : String(value); }
function formatObservedDuration(valueMs, options) {
  options = options || {};
  const label = typeof options.label === 'string' ? options.label : '';
  if (typeof valueMs !== 'number' || !Number.isFinite(valueMs) || valueMs < 0) {
    return { valueText: '--:--', qualifier: options.unknownLabel || '时间待核对', isUnknown: true, isLong: false, label };
  }
  const totalSeconds = Math.floor(valueMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  return { valueText: hours > 0 ? hours + ':' + pad2(minutes) + ':' + pad2(seconds) : pad2(minutes) + ':' + pad2(seconds),
    qualifier: options.qualifier || '参考值', isUnknown: false, isLong: hours > 0, label };
}

function notice(title, text, level, action, actionLabel) {
  return { visible: !!title, level: level || 'info', title: title || '', text: text || '',
    action: action || '', actionLabel: actionLabel || '', canReload: action === 'reload' };
}
// A second tick needs only acknowledged time facts. No catalog, pending rows,
// immutable preview or business controls are rebuilt by this projection.
function presentTime(summary, view, state) {
  summary = summary || {};
  const unknownLabel = view === 'SAVED' ? '未能确定' : '时间待核对';
  const focusTimer = formatObservedDuration(summary.observedFocusMs, { label: '阅读计时', unknownLabel });
  const restTimer = formatObservedDuration(summary.observedBreakMs, { label: '休息计时', unknownLabel });
  const breakTimer = formatObservedDuration(summary.breakRemainingMs, { label: '计划剩余' });
  if (!breakTimer.isUnknown && summary.breakRemainingMs === 0) breakTimer.valueText = '休息时间已到';
  const timer = view === 'RESTING' ? breakTimer : focusTimer;
  const reasons = Array.isArray(summary.reasons) ? summary.reasons.filter(reason => typeof reason === 'string') : [];
  const hardAnomaly = reasons.some(reason => reason !== 'WALL_ONLY' && reason !== 'OWNER_CHANGED' && reason !== 'NO_LOCAL_SESSION');
  let timeNotice = notice();
  if (hardAnomaly || ((state === 'FOCUS' || state === 'BREAK' || view === 'READING' || view === 'RESTING') && timer.isUnknown)) {
    timeNotice = timer.isUnknown ? notice('时间待核对', '阅读状态保留，时长暂不确定。', 'warning')
      : notice('记录含不确定区间', '当前数字为参考值；部分阅读或休息区间时长待核对。', 'warning');
  } else if (!timer.isUnknown && reasons.indexOf('OWNER_CHANGED') >= 0) {
    timeNotice = notice('恢复后参考计时', '按系统时钟估算，未验证；休息不计入阅读。', 'info');
  }
  return { timer, focusTimer, restTimer, breakTimer, reasons, reasonText: reasons.join(' / ') || '无异常原因', hardAnomaly, notice: timeNotice };
}
function storageProblem(snapshot, ui) {
  const status = snapshot.status || 'UNOPENED';
  if (ui.operationUncertain || status === 'UNCERTAIN') return notice('保存结果待核对', '请退出后重开查看；暂不继续写入。原记录保留。', 'danger', 'exit', '退出应用');
  if (status === 'CLOSED') return notice('存储已关闭', '请退出后重开查看；当前记录不会自动结束。', 'danger', 'exit', '退出应用');
  if (status === 'UNOPENED' || status === 'OPENING') return notice('正在读取', '正在核对手环本地记录。', 'info');
  if (status === 'BLOCKED') return notice('暂时无法读取', '本次操作未确认。重新读取并核对当前记录，暂不继续写入。', 'danger', 'reload', '重新读取');
  if (snapshot.storageQualified !== true || status === 'UNQUALIFIED') return notice('存储暂未准入', '存储保留证据尚未准入，暂不能开始或继续写入。', 'warning', 'exit', '退出应用');
  // A verified empty journal has no document or identity until the first
  // deliberate selection. Null under READY/RECOVERED is still unsafe.
  if (WRITABLE_STATUSES.indexOf(status) < 0 || (!snapshot.document && status !== 'EMPTY')) return notice('状态待核对', '尚未取得可靠本地状态，暂不继续写入。', 'danger', 'reload', '重新读取');
  return notice();
}
function taskView(state, ui, snapshot, formal) {
  const defaults = { IDLE: 'READY', PREPARING: 'READY', FOCUS: 'READING', BREAK: 'RESTING', FINISHED_PENDING_SYNC: 'READY' };
  const allowed = { IDLE: ['READY', 'BOOK_PICKER', 'ACTION_PICKER', 'DETAILS'],
    PREPARING: ['READY', 'BOOK_PICKER', 'ACTION_PICKER', 'DETAILS'],
    FOCUS: ['READING', 'BREAK_PICKER', 'FINISH_REVIEW', 'PAGE_EDITOR', 'DETAILS'],
    BREAK: ['RESTING', 'FINISH_REVIEW', 'PAGE_EDITOR', 'DETAILS'],
    FINISHED_PENDING_SYNC: ['READY', 'BOOK_PICKER', 'ACTION_PICKER', 'SAVED', 'DETAILS'] };
  if (!defaults[state]) return 'STORAGE_NOTICE';
  const retained = formal && Array.isArray(snapshot.retainedRecords) ? snapshot.retainedRecords : [];
  const savedRetained = retained.some(record => record.id === ui.savedRecordId);
  if (ui.view === 'SAVED' && (snapshot.errorCode || ui.errorCode || (!snapshot.document.pending.length && !savedRetained))) return 'READY';
  if (state === 'IDLE' && ui.view === 'SAVED' && savedRetained) return 'SAVED';
  return (allowed[state].indexOf(ui.view) >= 0 ? ui.view : defaults[state]);
}
function button(label, action, role, enabled) { return { label, action, role, enabled: !!enabled, disabled: !enabled }; }
function buttonsFor(view, canWrite, busy, preview, storageNotice) {
  let primary = null; let secondary = null;
  if (view === 'READY') primary = button(busy ? '正在开始…' : '已完成，开始', 'confirmStart', 'primary', canWrite && !!preview);
  if (view === 'READING') { primary = button('休息', 'openBreakPicker', 'primary', canWrite); secondary = button('结束', 'openFinishReview', 'secondary', canWrite); }
  if (view === 'RESTING') { primary = button(busy ? '正在继续…' : '继续学习', 'resume', 'primary', canWrite); secondary = button('结束', 'openFinishReview', 'secondary', canWrite); }
  if (view === 'FINISH_REVIEW') { primary = button(busy ? '正在保存…' : '结束并保存', 'finish', 'primary', canWrite); secondary = button('补充页码', 'openPageEditor', 'secondary', canWrite); }
  if (view === 'PAGE_EDITOR') primary = button(busy ? '保存中' : '保存', 'finish', 'primary', canWrite);
  if (view === 'SAVED') primary = button('完成', 'done', 'primary', !busy);
  if (view === 'STORAGE_NOTICE' && storageNotice.action) primary = button(storageNotice.actionLabel, storageNotice.action, 'primary', !busy);
  if (view === 'STORAGE_NOTICE' && !primary) primary = button('正在读取…', '', 'primary', false);
  return { primary, secondary };
}

function presentLocal(snapshot, ui, catalog, brand) {
  snapshot = snapshot || {}; ui = ui || {}; brand = brand || {};
  const doc = snapshot.document || {};
  const state = doc.state || 'IDLE';
  const status = snapshot.status || 'UNOPENED';
  const busy = snapshot.busy === true || ui.busy === true;
  const pending = Array.isArray(doc.pending) ? doc.pending : [];
  const pendingCount = pending.length;
  const formal = brand.formal === true;
  const retained = formal && Array.isArray(snapshot.retainedRecords) ? snapshot.retainedRecords : [];
  const preview = resolveReadyPreview(snapshot, formal ? Object.assign({}, ui, { formal: true }) : ui, catalog);
  const storageNotice = storageProblem(snapshot, ui);
  const recoveryNotice = status === 'RECOVERED'
    ? notice('已读取上一份记录', '请核对当前书籍和状态，最近变化可能未保留。', 'warning', 'acknowledgeRecovery', '已核对，继续') : notice();
  const recoveryRequired = recoveryNotice.visible && ui.recoveryAcknowledged !== true;
  let view = storageNotice.visible || recoveryRequired ? 'STORAGE_NOTICE' : taskView(state, ui, snapshot, formal);
  if (ui.view === 'DETAILS') view = 'DETAILS';
  if (view === 'STORAGE_NOTICE' && !storageNotice.visible && !recoveryRequired) Object.assign(storageNotice, notice('状态待核对', '本地状态未知，暂不继续写入。', 'danger', 'reload', '重新读取'));
  let canWrite = snapshot.storageQualified === true && snapshot.canWrite === true
    && WRITABLE_STATUSES.indexOf(status) >= 0 && !busy && !storageNotice.visible && !recoveryRequired && ui.exitRequested !== true;
  const completed = pending.concat(retained).filter((record, index, all) => all.findIndex(value => value.id === record.id) === index).sort((a, b) => a.ordinal - b.ordinal);
  const savedSource = ui.savedRecordId ? completed.find(record => record.id === ui.savedRecordId) : completed[completed.length - 1];
  const source = doc.active || ((view === 'SAVED' || view === 'DETAILS' && (state === 'FINISHED_PENDING_SYNC' || formal && completed.length)) ? savedSource : null);
  const sourceArchived = !!source && retained.some(record => record.id === source.id);
  const catalogNotice = formal && !source && !preview && !storageNotice.visible && !recoveryRequired
    ? notice('暂无离线书籍', '暂无离线书籍，请在手机手环伴侣启用目录同步。', 'info') : notice();
  if (catalogNotice.visible) { canWrite = false; if (view !== 'DETAILS') view = 'STORAGE_NOTICE'; }
  const bookTitle = source && source.bookSnapshot ? source.bookSnapshot.title : (preview ? preview.bookTitle : formal ? '暂无离线书籍' : '暂无测试书籍');
  const actionText = source && source.firstActionSnapshot ? source.firstActionSnapshot.text : (preview ? preview.text : '暂无可用第一步');
  const startPage = source && source.bookSnapshot ? source.bookSnapshot.startPage : (preview ? preview.startPage : null);
  const summary = snapshot.summary || {};
  const time = presentTime(summary, view, state);
  const { timer, focusTimer, restTimer, breakTimer, reasons } = time;
  let currentNotice = storageNotice.visible ? storageNotice : (recoveryRequired ? recoveryNotice : catalogNotice);
  const errorCode = ui.errorCode || snapshot.errorCode || '';
  if (!currentNotice.visible && CAPACITY_ERRORS.indexOf(errorCode) >= 0) currentNotice = notice('本地空间预算不足', '已有记录不删除；本次操作未保存。', 'warning');
  else if (!currentNotice.visible && (errorCode || ui.notice)) currentNotice = notice('操作未保存', typeof ui.notice === 'string' && ui.notice ? ui.notice : '本次操作未确认，请核对当前状态后再操作。', 'warning');
  else if (!currentNotice.visible && time.notice.visible) currentNotice = time.notice;
  if (!currentNotice.visible && recoveryNotice.visible) currentNotice = recoveryNotice;
  const titles = { READY: '先完成这一步', BOOK_PICKER: formal ? '选择真实书籍' : '选择测试书籍', ACTION_PICKER: '更换第一步', READING: '阅读中',
    BREAK_PICKER: '休息多久？', RESTING: '休息中', FINISH_REVIEW: '确认后结束', PAGE_EDITOR: '补充页码', SAVED: '已存到手环', DETAILS: '记录详情' };
  const activeNotice = recoveryRequired && !storageNotice.visible ? recoveryNotice : storageNotice.visible ? storageNotice : catalogNotice;
  const actions = buttonsFor(view, canWrite, busy, preview, activeNotice);
  if (catalogNotice.visible && view === 'STORAGE_NOTICE') actions.primary = button('等待书籍目录', '', 'primary', false);
  const books = validBooks(catalog);
  const selectedBook = books.find(book => preview && book.id === preview.bookId);
  const bookChoices = books.map(book => ({ id: book.id, title: book.title, startPage: positivePage(book.startPage),
    startPageText: formal && positivePage(book.pendingPage) !== null ? '待确认' + book.startPage + '页 · 未更新手机'
      : pageText(book.startPage, formal), selected: !!preview && book.id === preview.bookId }));
  const actionChoices = actionsFor(selectedBook).map(action => ({ id: action.id, text: action.text, selected: !!preview && action.id === preview.actionId }));
  const pageDigits = typeof ui.pageDigits === 'string' ? ui.pageDigits : '';
  const endPageText = view === 'SAVED' ? (source && positivePage(source.endPage) !== null ? '结束页码 · 第 ' + source.endPage + ' 页' : '未填写页码')
    : (pageDigits ? '页码：' + pageDigits : '页码：不填写');
  const brandStatus = brand.logoAvailable === true || (typeof brand.logoPath === 'string' && brand.logoPath) ? 'LOGO_READY' : 'LOGO_PENDING';
  const pendingPage = selectedBook && positivePage(selectedBook.pendingPage);
  if (formal && !source && pendingPage !== null && pendingPage !== undefined && !currentNotice.visible) {
    currentNotice = notice('待确认 · 未更新手机', '手环结束页码仅为待确认进度，未更新手机。', 'info');
  }
  return { view, state, status, busy, canWrite, title: view === 'STORAGE_NOTICE' ? activeNotice.title : titles[view],
    experimentLabel: formal ? '独立' : '实验', sourceLabel: view === 'SAVED'
      ? sourceArchived ? '曾获手机保存确认' : formal && source && positivePage(source.endPage) !== null ? '页码待确认 · 未更新手机' : formal ? '仅本地 · 尚未上传' : '仅本地 · 尚未同步'
      : '仅本地 · 未监测',
    recordCountText: retained.length ? '待同步 ' + pendingCount + ' 条 · 已确认档案 ' + retained.length + ' 条'
      : pendingCount ? '已有 ' + pendingCount + ' 条本地记录' : formal ? '独立记录仅在手环保存' : '本实验仅在手环保存', pendingCount,
    preview, bookTitle, actionText, actionLong: Array.from(actionText).length > 18, startPageText: pageText(startPage, formal, pendingPage),
    bookChoices, actionChoices, timer, focusTimer, restTimer, breakTimer, focus: focusTimer, rest: restTimer, break: breakTimer,
    storageNotice, recoveryNotice, notice: currentNotice, primary: actions.primary, secondary: actions.secondary,
    pageDigits, pageError: typeof ui.pageError === 'string' ? ui.pageError : '', endPageText,
    brand: { name: typeof brand.name === 'string' && brand.name ? brand.name : 'Mirra', logoPath: typeof brand.logoPath === 'string' ? brand.logoPath : '', status: brandStatus },
    details: { status, state, bookTitle, actionText, sourceText: formal ? '腕端独立学习记录' : '腕端独立测试记录', timeReasons: reasons.slice(), timeReasonText: reasons.join(' / ') || '无异常原因',
      pendingCount, sequence: snapshot.sequence, sessionId: doc.active && doc.active.id ? doc.active.id : (source && source.id ? source.id : ''),
      versionText: brand.versionText || brand.versionName || '', brandStatus, syncText: formal ? sourceArchived
        ? '手机曾确认原始记录；重连会核对。参考时间未计为有效专注，页码未更新手机。'
        : retained.length ? '部分原始记录曾获确认；待同步记录仍保留，重连会核对。参考时间未计为有效专注，页码未更新手机。'
          : '仅同步目录，学习记录未上传；手环页码为待确认进度，未更新手机。' : '本实验尚未接入手机同步',
      recoveryText: snapshot.recoveryHint || recoveryNotice.text, errorCode,
      records: completed.slice(-8).map(record => ({ id: record.id, bookTitle: record.bookSnapshot.title, endPage: record.endPage })) } };
}
module.exports = { presentLocal, presentTime, resolveReadyPreview, formatObservedDuration };

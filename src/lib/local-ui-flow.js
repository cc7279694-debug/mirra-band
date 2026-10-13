const { validateDocument, historyError } = require('./local-session');
const { resolveReadyPreview } = require('./local-presentation');

function copy(value) { return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value)); }
function equal(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function businessView(snapshot) {
  const state = snapshot && snapshot.document && snapshot.document.state;
  return state === 'FOCUS' ? 'READING' : state === 'BREAK' ? 'RESTING' : 'READY';
}
function sameCheckpoint(left, right) {
  return left && right && left.sequence === right.sequence && equal(left.document, right.document);
}
function sameReceipt(left, right) {
  return sameCheckpoint(left, right) && ['status', 'errorCode', 'busy', 'canWrite', 'storageQualified']
    .every(name => left[name] === right[name]);
}
function immutableSession(before, after) {
  return before && after && ['id', 'ordinal', 'bookSnapshot', 'firstActionSnapshot', 'confirmedAt', 'startAt']
    .every(name => equal(before[name], after[name]));
}

// This layer owns transient UI drafts only. The application's existing owner
// remains the only writer; each command has its own persisted acknowledgement.
function createLocalUiFlow(options) {
  options = options || {};
  const owner = options.owner; const catalog = options.catalog || [];
  if (!owner || ['open', 'dispatch', 'snapshot', 'subscribe'].some(name => typeof owner[name] !== 'function')) throw new Error('UI_OWNER');
  let visible = false; let disposed = false; let epoch = 0; let pending = false;
  let unsubscribeOwner = null; let rereadAfterOperation = false; const listeners = []; const returnViews = [];
  let ownerSnapshot = copy(owner.snapshot());
  const ui = { view: businessView(ownerSnapshot), bookId: null, actionId: null,
    pageDigits: '', pageError: '', recoveryAcknowledged: false,
    operationUncertain: false, operation: null, errorCode: null, notice: '', returnView: null, exitRequested: false };
  let recoveryCheckpoint = null; let finishSessionId = null;

  function getState() {
    const state = Object.assign(copy(ui), { ownerSnapshot: copy(ownerSnapshot), snapshot: copy(ownerSnapshot),
      busy: pending || Boolean(ownerSnapshot && ownerSnapshot.busy), visible });
    state.preview = resolveReadyPreview(state.ownerSnapshot, state, catalog);
    return state;
  }
  function publish() {
    if (disposed) return;
    listeners.slice().forEach(listener => { try { listener(getState()); } catch (_) { /* A view cannot change business state. */ } });
  }
  function uncertainty() {
    ui.operationUncertain = true; ui.errorCode = 'UI_OPERATION_UNCONFIRMED';
    ui.notice = '操作结果待核对，请退出整个实验应用后重新打开；暂不继续写入。';
  }
  function accept(snapshot, force) {
    if (!snapshot || typeof snapshot !== 'object') { uncertainty(); return; }
    const previous = ownerSnapshot; ownerSnapshot = copy(snapshot);
    if (snapshot.status === 'RECOVERED') {
      const checkpoint = snapshot.sequence + ':' + JSON.stringify(snapshot.document);
      if (checkpoint !== recoveryCheckpoint) { recoveryCheckpoint = checkpoint; ui.recoveryAcknowledged = false; }
    }
    if (force || (!pending && previous && previous.document && snapshot.document && previous.document.state !== snapshot.document.state)) {
      ui.view = businessView(snapshot); returnViews.length = 0; ui.returnView = null;
      if (force) { ui.bookId = null; ui.actionId = null; ui.pageDigits = ''; ui.pageError = ''; finishSessionId = null; }
    }
  }
  function live(token) { return visible && !disposed && !ui.exitRequested && token === epoch; }
  function navigable() { return visible && !disposed && !pending && !ui.exitRequested && !ownerSnapshot.busy && ownerSnapshot.status !== 'CLOSED'; }
  function interact() { return navigable() && !ui.operationUncertain; }
  function writeAllowed(snapshot) {
    return snapshot && snapshot.canWrite === true && snapshot.storageQualified === true && !snapshot.busy
      && ['EMPTY', 'READY', 'RECOVERED'].indexOf(snapshot.status) >= 0
      && (snapshot.status !== 'RECOVERED' || ui.recoveryAcknowledged);
  }
  function refreshSnapshot() { accept(owner.snapshot(), false); return ownerSnapshot; }
  function navigate(view) {
    if (!navigable()) return getState();
    returnViews.push(ui.view); ui.returnView = ui.view; ui.view = view; publish(); return getState();
  }
  function baseReady() { return ui.view === 'READY' || ui.view === 'BOOK_PICKER' || ui.view === 'ACTION_PICKER'; }
  function resetReady() { ui.view = 'READY'; ui.returnView = null; returnViews.length = 0; publish(); return getState(); }
  function subscribe(listener) {
    if (typeof listener !== 'function') throw new Error('UI_LISTENER');
    if (disposed) return () => {};
    listeners.push(listener); try { listener(getState()); } catch (_) { /* The UI subscriber owns its errors. */ }
    let removed = false;
    return () => { if (removed) return; removed = true; const index = listeners.indexOf(listener); if (index >= 0) listeners.splice(index, 1); };
  }
  function attachOwner() {
    if (unsubscribeOwner) return;
    unsubscribeOwner = owner.subscribe(snapshot => {
      if (!visible || disposed) return;
      accept(snapshot, false);
      // A replacement page can arrive while an earlier page's native IO is
      // still outstanding. It owns no cancellation, but must re-read once free.
      if (rereadAfterOperation && !pending && !snapshot.busy) {
        rereadAfterOperation = false;
        reload().catch(() => { uncertainty(); if (visible && !disposed) publish(); });
      } else publish();
    });
  }
  async function readOwner(token, resetView) {
    if (!live(token)) return getState();
    try {
      const result = await owner.open();
      if (live(token)) {
        if (!sameReceipt(result, owner.snapshot())) uncertainty();
        else {
          accept(result, resetView);
          if (!ui.operationUncertain && !result.errorCode && ['READY', 'RECOVERED', 'EMPTY'].indexOf(result.status) >= 0) {
            ui.errorCode = null; ui.notice = '';
          }
        }
      }
    } catch (_) { if (live(token)) uncertainty(); }
    if (live(token)) publish(); return getState();
  }
  async function show() {
    if (disposed) return getState();
    visible = true; ui.exitRequested = false; const token = ++epoch;
    accept(owner.snapshot(), true);
    const alreadyPending = pending || ownerSnapshot.busy;
    if (!alreadyPending) { pending = true; ui.operation = 'read'; }
    attachOwner(); publish();
    if (alreadyPending) { rereadAfterOperation = true; return getState(); }
    try { await readOwner(token, true); }
    finally {
      if (rereadAfterOperation && visible && !disposed) { rereadAfterOperation = false; await readOwner(epoch, true); }
      pending = false; ui.operation = null; if (visible && !disposed) publish();
    }
    return getState();
  }
  function hide() {
    visible = false; epoch++; rereadAfterOperation = false;
    if (unsubscribeOwner) { unsubscribeOwner(); unsubscribeOwner = null; }
    return getState();
  }
  function acknowledgeRecovery() {
    if (!interact() || ownerSnapshot.status !== 'RECOVERED') return getState();
    ui.recoveryAcknowledged = true; publish(); return getState();
  }

  function verifyCommand(action, before, result, preview) {
    if (!result || result.busy || !result.canWrite || !result.storageQualified || result.errorCode
      || ['READY', 'RECOVERED'].indexOf(result.status) < 0 || result.sequence !== before.sequence + 1) return false;
    let next;
    try { next = validateDocument(result.document); } catch (_) { return false; }
    const prior = before.document;
    if (prior && (next.installationId !== prior.installationId || historyError(prior, next))) return false;
    const oldPending = prior ? prior.pending : [];
    const finishing = action.type === 'FINISH';
    if (next.pending.length !== oldPending.length + (finishing ? 1 : 0)
      || oldPending.some((record, index) => !equal(record, next.pending[index]))) return false;
    const counter = prior ? prior.counter : 0;
    if (next.counter !== counter + (action.type === 'CONFIRM_START' ? 1 : 0)) return false;
    if (action.type === 'NEW_SESSION' || action.type === 'CANCEL_PREPARATION') {
      return next.state === 'IDLE' && next.preparation === null && next.active === null;
    }
    if (action.type === 'SELECT_BOOK' || action.type === 'SELECT_ACTION') {
      return next.state === 'PREPARING' && next.active === null && next.preparation
        && equal(next.preparation.bookSnapshot, preview.bookSnapshot)
        && equal(next.preparation.firstActionSnapshot, action.type === 'SELECT_BOOK' ? null : preview.firstActionSnapshot);
    }
    if (action.type === 'CONFIRM_START') {
      return next.state === 'FOCUS' && next.preparation === null && next.active
        && next.active.id === next.installationId + ':' + next.counter && next.active.ordinal === next.counter
        && equal(next.active.bookSnapshot, preview.bookSnapshot) && equal(next.active.firstActionSnapshot, preview.firstActionSnapshot)
        && next.active.intervals.length === 1 && next.active.intervals[0].kind === 'FOCUS';
    }
    if (finishing) {
      const saved = next.pending[next.pending.length - 1]; const active = prior && prior.active;
      return next.state === 'FINISHED_PENDING_SYNC' && next.active === null
        && immutableSession(active, saved) && saved.endPage === action.endPage && saved.finishedAt !== null
        && saved.intervals.length === active.intervals.length
        && active.intervals.slice(0, -1).every((interval, index) => equal(interval, saved.intervals[index]))
        && equal(saved.intervals[saved.intervals.length - 1].end, saved.finishedAt);
    }
    if (action.type === 'BEGIN_BREAK' || action.type === 'RESUME') {
      const active = prior && prior.active; const nextActive = next.active;
      if (!immutableSession(active, nextActive) || nextActive.intervals.length !== active.intervals.length + 1) return false;
      const last = nextActive.intervals[nextActive.intervals.length - 1];
      return next.state === (action.type === 'BEGIN_BREAK' ? 'BREAK' : 'FOCUS')
        && last.kind === next.state && last.plannedMinutes === (action.type === 'BEGIN_BREAK' ? action.minutes : null)
        && active.intervals.slice(0, -1).every((interval, index) => equal(interval, nextActive.intervals[index]));
    }
    return false;
  }
  async function runCommands(actions, startSnapshot, preview, successfulView) {
    if (!interact() || !writeAllowed(startSnapshot)) return getState();
    pending = true; ui.operation = actions[actions.length - 1].type === 'FINISH' ? 'finish'
      : actions[actions.length - 1].type === 'CONFIRM_START' ? 'start' : actions[actions.length - 1].type.toLowerCase();
    ui.errorCode = null; ui.notice = ''; const token = epoch;
    let before = copy(startSnapshot); publish();
    try {
      for (let index = 0; index < actions.length; index++) {
        if (!live(token)) break;
        const current = owner.snapshot();
        if (!writeAllowed(current) || !sameCheckpoint(before, current)) {
          if (live(token)) { accept(current, false); ui.errorCode = 'UI_STATE_CHANGED'; ui.notice = '状态已变化，请核对后再次明确确认。'; }
          break;
        }
        const result = await owner.dispatch(actions[index]);
        const actual = owner.snapshot();
        // Compare the receipt to the owner as well as the expected command.
        // A resolved Promise alone is never proof of a confirmed write.
        if (!sameReceipt(result, actual)) { uncertainty(); if (live(token)) accept(actual, false); break; }
        if (!verifyCommand(actions[index], before, result, preview)) {
          const unchangedFailure = sameCheckpoint(before, result) && (result.errorCode || ['BLOCKED', 'UNCERTAIN', 'CLOSED'].indexOf(result.status) >= 0);
          if (!unchangedFailure) uncertainty();
          else { ui.errorCode = result.errorCode || 'UI_SAVE_FAILED'; ui.notice = result.recoveryHint || '本次操作未确认保存，请核对当前状态。'; }
          if (live(token)) accept(result, false); break;
        }
        before = copy(result);
        if (!live(token)) break;
        accept(result, false);
        if (index === actions.length - 1) {
          ui.view = successfulView; returnViews.length = 0; ui.returnView = null;
          if (successfulView === 'READING') { ui.bookId = null; ui.actionId = null; }
        }
      }
    } catch (_) { uncertainty(); }
    finally {
      if (visible && !disposed) {
        if (rereadAfterOperation) { rereadAfterOperation = false; ui.operation = 'read'; await readOwner(epoch, true); }
      }
      pending = false; ui.operation = null; if (visible && !disposed) publish();
    }
    return getState();
  }
  function chooseBook(bookId) {
    if (!interact() || !baseReady() || !catalog.some(book => book.id === bookId)) return getState();
    ui.bookId = bookId; ui.actionId = null; ui.errorCode = null; ui.notice = ''; return resetReady();
  }
  function chooseAction(actionId) {
    if (!interact() || !baseReady()) return getState();
    const preview = resolveReadyPreview(ownerSnapshot, ui, catalog);
    const book = preview && catalog.find(entry => entry.id === preview.bookId);
    if (!book || !book.firstActions.some(action => action.id === actionId)) return getState();
    ui.actionId = actionId; ui.errorCode = null; ui.notice = ''; return resetReady();
  }
  function confirmStart(visiblePreview) {
    if (!interact() || ui.view !== 'READY') return Promise.resolve(getState());
    const current = refreshSnapshot();
    const state = current.document ? current.document.state : 'EMPTY';
    if (state === 'FOCUS' || state === 'BREAK') { ui.view = businessView(current); publish(); return Promise.resolve(getState()); }
    const preview = resolveReadyPreview(current, ui, catalog);
    const captured = copy(visiblePreview);
    if (!preview || !captured || !equal(captured, preview)) {
      ui.errorCode = 'UI_PREVIEW_CHANGED'; ui.notice = '显示内容已变化，请核对当前第一步后再确认。'; publish(); return Promise.resolve(getState());
    }
    const actions = [];
    if (state === 'FINISHED_PENDING_SYNC') actions.push({ type: 'NEW_SESSION' });
    const preparation = current.document && current.document.preparation;
    const sameBook = state === 'PREPARING' && equal(preparation.bookSnapshot, captured.bookSnapshot);
    if (state === 'PREPARING' && !sameBook) actions.push({ type: 'CANCEL_PREPARATION' });
    if (!sameBook) actions.push({ type: 'SELECT_BOOK', bookId: captured.bookId });
    if (!sameBook || !equal(preparation.firstActionSnapshot, captured.firstActionSnapshot)) actions.push({ type: 'SELECT_ACTION', firstActionId: captured.actionId });
    actions.push({ type: 'CONFIRM_START', confirmed: true });
    return runCommands(actions, current, captured, 'READING');
  }
  function openBreakPicker() {
    refreshSnapshot(); if (ui.view !== 'READING' || !ownerSnapshot.document || ownerSnapshot.document.state !== 'FOCUS') return getState();
    return navigate('BREAK_PICKER');
  }
  function beginBreak(minutes) {
    if (!interact() || ui.view !== 'BREAK_PICKER' || (minutes !== 5 && minutes !== 10)) return Promise.resolve(getState());
    const snapshot = refreshSnapshot(); if (!snapshot.document || snapshot.document.state !== 'FOCUS') return Promise.resolve(getState());
    return runCommands([{ type: 'BEGIN_BREAK', minutes }], snapshot, null, 'RESTING');
  }
  function resume() {
    if (!interact() || ui.view !== 'RESTING') return Promise.resolve(getState());
    const snapshot = refreshSnapshot(); if (!snapshot.document || snapshot.document.state !== 'BREAK') return Promise.resolve(getState());
    return runCommands([{ type: 'RESUME' }], snapshot, null, 'READING');
  }
  function openFinishReview() {
    if (!interact() || ['READING', 'RESTING'].indexOf(ui.view) < 0) return getState();
    const snapshot = refreshSnapshot(); if (!snapshot.document || !snapshot.document.active) return getState();
    finishSessionId = snapshot.document.active.id; ui.pageDigits = ''; ui.pageError = ''; return navigate('FINISH_REVIEW');
  }
  function openPageEditor() { return ui.view === 'FINISH_REVIEW' ? navigate('PAGE_EDITOR') : getState(); }
  function validDigits(digits) { return typeof digits === 'string' && (digits === '' || (/^[0-9]{1,6}$/.test(digits) && Number(digits) >= 1)); }
  function setPageDigits(digits) {
    if (!interact() || ui.view !== 'PAGE_EDITOR') return getState();
    ui.pageDigits = typeof digits === 'string' ? digits : '';
    ui.pageError = validDigits(digits) ? '' : '请填写1至999999的整数页码，或留空。'; publish(); return getState();
  }
  function finish(endPage) {
    if (!interact() || ['FINISH_REVIEW', 'PAGE_EDITOR'].indexOf(ui.view) < 0) return Promise.resolve(getState());
    if (endPage === undefined) {
      if (!validDigits(ui.pageDigits) || ui.pageError) { ui.pageError = '请填写1至999999的整数页码，或留空。'; publish(); return Promise.resolve(getState()); }
      endPage = ui.pageDigits === '' ? null : Number(ui.pageDigits);
    }
    if (endPage === '') endPage = null;
    if (endPage !== null && !(typeof endPage === 'number' && isFinite(endPage) && Math.floor(endPage) === endPage && endPage >= 1 && endPage <= 999999)) {
      ui.pageError = '请填写1至999999的整数页码，或留空。'; publish(); return Promise.resolve(getState());
    }
    const snapshot = refreshSnapshot();
    if (!snapshot.document || !snapshot.document.active || snapshot.document.active.id !== finishSessionId
      || ['FOCUS', 'BREAK'].indexOf(snapshot.document.state) < 0) {
      ui.errorCode = 'UI_STATE_CHANGED'; ui.notice = '当前学习已变化，请核对后重新进入结束确认。'; publish(); return Promise.resolve(getState());
    }
    return runCommands([{ type: 'FINISH', endPage }], snapshot, null, 'SAVED');
  }
  function done() {
    if (!interact() || ['SAVED', 'READY'].indexOf(ui.view) < 0) return getState();
    ui.pageDigits = ''; ui.pageError = ''; finishSessionId = null; ui.bookId = null; ui.actionId = null; return resetReady();
  }
  function exit() {
    if (!visible || disposed || ui.exitRequested) return getState();
    if (typeof options.requestExit !== 'function') { ui.notice = '退出接口不可用，请返回表盘；学习记录不会自动结束。'; publish(); return getState(); }
    ui.exitRequested = true;
    try { options.requestExit(); hide(); }
    catch (_) { ui.exitRequested = false; ui.notice = '退出结果未确认，当前学习与记录保留。'; publish(); }
    return getState();
  }
  function back() {
    if (!visible || disposed) return getState();
    if (pending) return exit();
    if (returnViews.length) {
      if (ui.view === 'PAGE_EDITOR') { ui.pageDigits = ''; ui.pageError = ''; }
      if (ui.view === 'FINISH_REVIEW') { ui.pageDigits = ''; ui.pageError = ''; finishSessionId = null; }
      ui.view = returnViews.pop(); ui.returnView = returnViews.length ? returnViews[returnViews.length - 1] : null; publish(); return getState();
    }
    return exit();
  }
  async function reload() {
    if (!visible || disposed || pending || ownerSnapshot.busy) return getState();
    pending = true; ui.operation = 'read'; publish(); const token = epoch;
    try { await readOwner(token, false); }
    finally {
      if (rereadAfterOperation && visible && !disposed) { rereadAfterOperation = false; await readOwner(epoch, true); }
      pending = false; ui.operation = null; if (visible && !disposed) publish();
    }
    return getState();
  }
  function dispose() { hide(); disposed = true; listeners.length = 0; }
  return { getState, subscribe, show, hide, back, chooseBook, chooseAction, confirmStart,
    openBookPicker: () => baseReady() ? navigate('BOOK_PICKER') : getState(),
    openActionPicker: () => baseReady() ? navigate('ACTION_PICKER') : getState(),
    openBreakPicker, beginBreak, resume, openFinishReview, openPageEditor, setPageDigits,
    finish, done, openDetails: () => navigate('DETAILS'), acknowledgeRecovery, reload, exit, dispose };
}
module.exports = { createLocalUiFlow };

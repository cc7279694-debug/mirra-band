const { createJournal } = require('./local-journal');
const { createDocument, transition, summarize, historyError } = require('./local-session');
const { encodeRecord, byteLength, MAX_BYTES } = require('./local-codec');

function errorCode(error) {
  let descriptor;
  try { descriptor = error && Object.getOwnPropertyDescriptor(error, 'code'); } catch (_) { descriptor = null; }
  const value = descriptor && descriptor.value;
  return typeof value === 'string' && /^[A-Z0-9_]{1,48}$/.test(value) ? value : 'OPERATION_FAILED';
}
function copy(value) { return value === null ? null : JSON.parse(JSON.stringify(value)); }
// One application-owned writer. Pages only subscribe and never own a journal.
function createLocalOwner(options) {
  options = options || {};
  if (typeof options.backendFactory !== 'function' || typeof options.clock !== 'function'
    || typeof options.installationIdFactory !== 'function') throw new Error('OWNER_OPTIONS');
  const storageQualified = options.storageQualified === true;
  let backend = null; let journal = null; let document = null; let sequence = 0;
  let status = 'UNOPENED'; let busy = false; let closed = false; let uncertain = false; let generation = 0;
  let lastError = null;
  const listeners = [];

  function observation() {
    try { return options.clock(); }
    catch (_) { return { wallMs: null, ownerId: 'unavailable-clock', monotonicMs: null, monotonicVerified: false }; }
  }
  function summary() {
    const empty = { observedFocusMs: 0, observedBreakMs: 0, breakRemainingMs: null, trustedFocusMs: null,
      timeUncertain: true, reasons: ['NO_LOCAL_SESSION'], timeConfidence: 'UNVERIFIED' };
    if (!document) return empty;
    try { return summarize(document, observation()); }
    catch (_) { return Object.assign({}, empty, { observedFocusMs: null, observedBreakMs: null, trustedFocusMs: 0, reasons: ['CLOCK_SOURCE_INVALID'] }); }
  }
  function snapshot() {
    const projected = summary();
    const actualStatus = closed ? 'CLOSED' : uncertain ? 'UNCERTAIN' : status;
    const recoveryHint = uncertain ? '原生存取结果未知。退出整个实验应用再打开，保留原记录，禁止继续写入。'
      : actualStatus === 'BLOCKED' ? '操作未确认。请重新读取恢复；不要卸载、清数据或覆盖最后有效记录。'
      : !storageQualified ? '等待选定存储后端的损坏恢复、覆盖升级和重启保留证据，暂不启用持久独立学习。'
      : actualStatus === 'RECOVERED' ? '检测到损坏，读取了上一有效快照。请核对恢复状态，损坏槽中的新边界无法证明。'
      : ['CAPACITY_REQUIRED', 'CAPACITY', 'PENDING_CAPACITY', 'INTERVAL_CAPACITY', 'COUNTER_CAPACITY', 'SIZE'].indexOf(lastError) >= 0
        ? '空间预算不足。未同步记录保留，未执行本次写入。' : '';
    return { document: copy(document), status: actualStatus, busy,
      canWrite: storageQualified && !closed && !uncertain && !busy && ['EMPTY', 'READY', 'RECOVERED'].indexOf(status) >= 0,
      storageQualified, errorCode: lastError, recoveryHint, summary: copy(projected),
      timeHint: projected.timeUncertain ? '时间不确定；原始时间边界保留，不生成已验证时长。' : '按已记录的时间边界计算；休息不计入学习。',
      pendingCount: document ? document.pending.length : 0, sequence };
  }
  function publish() { listeners.slice().forEach(listener => { try { listener(snapshot()); } catch (_) { /* View failure never changes a verified save. */ } }); }
  function blocked(code) { lastError = code; return snapshot(); }
  function ensureJournal() {
    if (journal) return;
    backend = options.backendFactory(); journal = createJournal({ backend });
  }
  function apply(result) {
    if (result.status === 'ready' || result.status === 'recovered' || result.status === 'empty') {
      // A live owner remembers what it already acknowledged. A missing or older
      // native snapshot cannot erase that knowledge or allocate a new identity.
      let conflict = null;
      if (document && sequence > 0) {
        if (result.status === 'empty') conflict = 'STORAGE_DISAPPEARED';
        else if (result.sequence < sequence) conflict = 'SNAPSHOT_ROLLBACK';
        else if (result.sequence === sequence && JSON.stringify(result.document) !== JSON.stringify(document)) conflict = 'SNAPSHOT_CONFLICT';
        else conflict = historyError(document, result.document);
      }
      if (conflict) { status = 'BLOCKED'; lastError = conflict; return; }
      document = result.document; sequence = result.sequence; status = result.status.toUpperCase(); lastError = null;
    } else {
      uncertain = result.status === 'uncertain' || Boolean(backend && typeof backend.describe === 'function' && backend.describe().uncertain);
      status = uncertain ? 'UNCERTAIN' : 'BLOCKED'; lastError = result.errorCode || result.code || 'RECOVERY_REQUIRED';
    }
  }
  async function operation(task) {
    if (closed) return blocked('CLOSED');
    if (uncertain) return blocked('UNCERTAIN');
    if (busy) return blocked('BUSY');
    busy = true; const owner = generation; publish();
    try { ensureJournal(); await task(); }
    catch (error) {
      if (!closed && owner === generation) lastError = errorCode(error);
    } finally {
      if (!closed && owner === generation) { busy = false; publish(); }
    }
    return snapshot();
  }
  async function open() { return operation(async () => { const result = await journal.recover(); if (!closed) apply(result); }); }
  async function dispatch(action) {
    if (closed) return blocked('CLOSED');
    if (uncertain) return blocked('UNCERTAIN');
    if (busy) return blocked('BUSY');
    if (!storageQualified) return blocked('STORAGE_EVIDENCE_REQUIRED');
    if (['EMPTY', 'READY', 'RECOVERED'].indexOf(status) < 0) return blocked(status === 'UNOPENED' ? 'NOT_OPEN' : 'RECOVERY_REQUIRED');
    return operation(async () => {
      const base = document || createDocument(options.installationIdFactory());
      const next = transition(base, action, observation());
      // Reserve finishing metadata before accepting any active-state growth.
      const raw = encodeRecord(sequence + 1, next);
      if (byteLength(raw) > (action && action.type === 'FINISH' ? MAX_BYTES : MAX_BYTES - 1024)) {
        lastError = 'CAPACITY_REQUIRED'; return;
      }
      const result = await journal.save(next, { expectedSequence: sequence });
      if (!closed) apply(result);
    });
  }
  function close() {
    if (closed) return;
    closed = true; generation++; busy = false;
    if (journal) journal.close(); else if (backend && typeof backend.close === 'function') backend.close();
    publish(); listeners.length = 0;
  }
  function subscribe(listener) {
    if (typeof listener !== 'function') throw new Error('LISTENER');
    if (closed) { try { listener(snapshot()); } catch (_) { /* No live owner remains. */ } return () => {}; }
    listeners.push(listener); try { listener(snapshot()); } catch (_) { /* Page remains replaceable. */ }
    let removed = false;
    return () => { if (removed) return; removed = true; const index = listeners.indexOf(listener); if (index >= 0) listeners.splice(index, 1); };
  }
  return { open, dispatch, snapshot, subscribe, close };
}
module.exports = { createLocalOwner };

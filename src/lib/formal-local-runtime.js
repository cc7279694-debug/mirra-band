const { createLocalOwner } = require('./local-owner');
const { createCatalogOwner } = require('./catalog-owner');
const { createProbeBackend } = require('../platform/probe-storage');
const { createRecordArchive } = require('./record-archive');
const { createRecordDigest } = require('../platform/record-digest');

// The formal package has its own two namespaces. Neither experimental URI is
// supplied here; another application's private files are never migration input.
function createFormalLocalRuntime(options) {
  options = options || {};
  if (typeof options.loadModule !== 'function') throw new Error('FORMAL_RUNTIME_OPTIONS');
  const ownerId = 'formal-process-' + Math.random().toString(36).slice(2, 14);
  let retired = false; let owner = null; let identity = 0;
  const digest = createRecordDigest(options.loadModule);
  const archive = createRecordArchive({ backend: createProbeBackend({ kind: 'file', namespace: 'local-record-archive-live', loadModule: options.loadModule }),
    hash: raw => digest.sha256(raw) });
  const catalogOwner = createCatalogOwner({ backendFactory: () => createProbeBackend({
    kind: 'file', namespace: 'catalog-live', loadModule: options.loadModule
  }) });
  function getBooks() {
    if (retired) return [];
    const saved = catalogOwner.snapshot();
    if (!saved.catalog || !saved.canonical || !saved.revision) return [];
    const local = owner ? owner.snapshot() : null;
    const pending = local && local.document ? local.document.pending.concat(local.retainedRecords || []) : [];
    return saved.catalog.books.slice().sort((a, b) => Number(b.isMainline) - Number(a.isMainline)).map(book => {
      let pendingPage = null;
      pending.forEach(record => {
        if (record.bookSnapshot.id === book.id && Number.isSafeInteger(record.endPage) && record.endPage >= 1
          && record.endPage >= book.currentPage && (book.totalPages === null || record.endPage <= book.totalPages)) {
          pendingPage = pendingPage === null ? record.endPage : Math.max(pendingPage, record.endPage);
        }
      });
      const startPage = pendingPage === null ? Math.max(1, book.currentPage) : pendingPage;
      const firstActions = [];
      if (book.firstAction !== null) firstActions.push({ id: 'phone-default', text: book.firstAction });
      firstActions.push({ id: 'preset-read', text: '翻到第' + startPage + '页，读这一页的第一段。' },
        { id: 'preset-open', text: '打开这本书，找到准备阅读的一页。' });
      return { id: book.id, title: book.title, startPage, currentPage: book.currentPage, totalPages: book.totalPages,
        pendingPage, isMainline: book.isMainline, firstActions };
    });
  }
  function guard(action) {
    if (retired) return 'CLOSED';
    if (typeof options.getMode === 'function' && options.getMode() !== 'LOCAL') return 'LOCAL_MODE_REQUIRED';
    if (!action || ['START_CONFIRMED', 'CONFIRM_START'].indexOf(action.type) < 0) return null;
    const phone = typeof options.phoneSnapshot === 'function' ? options.phoneSnapshot() : null;
    if (phone && phone.control && (phone.control.busy || phone.control.resultCode === 'RESULT_UNKNOWN')) return 'PHONE_CONTROL_UNCONFIRMED';
    if (phone && ['fresh', 'updating'].indexOf(phone.freshness) >= 0 && phone.body
      && ['PREPARING', 'ACTIVE', 'SAVING'].indexOf(phone.body.phase) >= 0) return 'PHONE_SESSION_ACTIVE';
    return null;
  }
  owner = createLocalOwner({ storageQualified: true, sessionContext: { profile: 'formal' }, beforeDispatch: guard, recordArchive: archive,
    catalogProvider: getBooks, catalogRevisionProvider: () => catalogOwner.snapshot().revision,
    backendFactory: () => createProbeBackend({ kind: 'file', namespace: 'local-session-live', loadModule: options.loadModule }),
    clock: options.clock || (() => {
      let wallMs = null; try { const observed = Date.now(); if (Number.isSafeInteger(observed)) wallMs = observed; } catch (_) { /* Unknown clock stays unknown. */ }
      return { wallMs, ownerId, monotonicMs: null, monotonicVerified: false };
    }), installationIdFactory: options.installationIdFactory || (() => 'formal-install-' + Math.random().toString(36).slice(2, 18) + '-' + (++identity))
  });
  function getRecords() {
    if (retired) throw new Error('CLOSED');
    const local = owner.snapshot();
    if (local.busy) throw new Error('BUSY');
    if (['EMPTY', 'READY', 'RECOVERED'].indexOf(local.status) < 0) throw new Error('LOCAL_RECOVERY_REQUIRED');
    const records = archive.records();
    if (local.document) local.document.pending.forEach(session => {
      const existing = records.find(record => record.session.id === session.id);
      if (existing && JSON.stringify(existing.session) !== JSON.stringify(session)) throw new Error('RECORD_CONFLICT');
      if (!existing) records.push({ schemaVersion: 1, installationId: local.document.installationId, session });
    });
    return records;
  }
  function close() { if (retired) return; retired = true; owner.close(); catalogOwner.close(); archive.close(); }
  return { owner, catalogOwner, archive, digest, getRecords, getBooks, close };
}
module.exports = { createFormalLocalRuntime };

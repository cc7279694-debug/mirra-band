const protocol = require('./catalog-protocol');
const MARKER = 'MIRRA_BOOK_CATALOG_V1';
const MAX_RECORD_BYTES = 32768;
const MAX_SEQUENCE = 9007199254740991;
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function copy(value) { return value === null ? null : JSON.parse(JSON.stringify(value)); }
function exactFields(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== names.length || names.some(key => !Object.prototype.hasOwnProperty.call(value, key))) fail('UNKNOWN_FIELD');
}
function nativeCode(error) {
  let descriptor; try { descriptor = error && Object.getOwnPropertyDescriptor(error, 'code'); } catch (_) { descriptor = null; }
  const code = descriptor && descriptor.value;
  return typeof code === 'string' && /^[A-Z0-9_]{1,48}$/.test(code) ? code : 'IO_ERROR';
}
function frozenInput(value) {
  exactFields(value, ['revision', 'catalog', 'canonical']);
  const catalog = protocol.validateCatalog(value.catalog); const canonical = protocol.canonicalCatalog(catalog);
  if (value.canonical !== canonical || value.revision !== protocol.revisionFor(canonical)) fail('INVALID_CATALOG');
  return { revision: value.revision, catalog, canonical };
}
function encodeRecord(sequence, value) {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) fail('SEQUENCE');
  const input = frozenInput(value); const body = { schemaVersion: 1, marker: MARKER, sequence, revision: input.revision, catalog: input.catalog };
  body.checksum = protocol.checksum(JSON.stringify(body)); const raw = JSON.stringify(body);
  if (protocol.utf8Bytes(raw) > MAX_RECORD_BYTES) fail('CAPACITY'); return raw;
}
function decodeRecord(raw) {
  if (typeof raw !== 'string') return { status: 'unknown', code: 'BACKEND_VALUE' };
  try {
    if (protocol.utf8Bytes(raw) > MAX_RECORD_BYTES) return { status: 'unknown', code: 'RECORD_TOO_LARGE' };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { status: 'corrupt', code: 'JSON' };
    if (parsed.schemaVersion !== 1 || parsed.marker !== MARKER) return { status: 'unknown', code: 'UNKNOWN_SCHEMA' };
    try { exactFields(parsed, ['schemaVersion', 'marker', 'sequence', 'revision', 'catalog', 'checksum']); }
    catch (_) { return { status: 'unknown', code: 'UNKNOWN_FIELD' }; }
    const catalog = protocol.validateCatalog(parsed.catalog); const canonical = protocol.canonicalCatalog(catalog);
    const input = { revision: parsed.revision, catalog, canonical };
    if (encodeRecord(parsed.sequence, input) !== raw) return { status: 'corrupt', code: 'CHECKSUM_OR_CANONICAL' };
    return { status: 'valid', sequence: parsed.sequence, revision: input.revision, catalog, canonical, raw };
  } catch (_) { return { status: 'corrupt', code: 'INVALID_RECORD' }; }
}
function createCatalogOwner(options) {
  if (!options || typeof options.backendFactory !== 'function') fail('OWNER_OPTIONS');
  let backend = null; let status = 'unopened'; let catalog = null; let canonical = null; let revision = null;
  let sequence = 0; let slot = null; let errorCode = null; let busy = false; let uncertain = false; let closed = false; let generation = 0;
  const listeners = [];
  function snapshot() { return { status: closed ? 'closed' : uncertain ? 'uncertain' : status, revision, catalog: copy(catalog), canonical, sequence, slot, errorCode, busy }; }
  function publish() { listeners.slice().forEach(listener => { try { listener(snapshot()); } catch (_) { /* A view cannot change acknowledged catalog facts. */ } }); }
  function rejected(code, rejectedStatus) { return Object.assign(snapshot(), { status: rejectedStatus || 'blocked', errorCode: code }); }
  function block(code) { status = 'blocked'; errorCode = code; return snapshot(); }
  function latch(code) { uncertain = true; status = 'uncertain'; errorCode = code || 'UNCERTAIN'; return snapshot(); }
  function ensureBackend() {
    if (backend) return;
    const candidate = options.backendFactory();
    if (!candidate || typeof candidate.read !== 'function' || typeof candidate.write !== 'function') fail('BACKEND');
    backend = candidate;
  }
  function safety() {
    if (closed) return snapshot();
    if (uncertain) return snapshot();
    try { if (backend && typeof backend.describe === 'function' && backend.describe().uncertain) return latch('UNCERTAIN'); }
    catch (_) { return latch('RESULT_UNKNOWN'); }
    return null;
  }
  function ioFailure(phase, error) {
    if (closed) return snapshot();
    const code = nativeCode(error);
    if (['TIMEOUT', 'NATIVE_THROW', 'UNCERTAIN', 'RESULT_UNKNOWN', 'UNKNOWN_RESULT', 'NATIVE_RESULT_UNKNOWN'].indexOf(code) >= 0) return latch(code);
    return block(phase);
  }
  async function inspect() {
    const slots = [];
    for (let index = 0; index < 2; index++) {
      const stopped = safety(); if (stopped) return stopped;
      let raw; try { raw = await backend.read(index); } catch (error) { return ioFailure('READ_FAILED', error); }
      const late = safety(); if (late) return late;
      if (raw !== null && typeof raw !== 'string') return block('BACKEND_VALUE'); slots.push(raw);
    }
    let damaged = false; const valid = [];
    for (let index = 0; index < 2; index++) {
      if (slots[index] === null) continue;
      const decoded = decodeRecord(slots[index]);
      if (decoded.status === 'unknown') return block(decoded.code === 'RECORD_TOO_LARGE' ? decoded.code : 'UNKNOWN_RECORD');
      if (decoded.status !== 'valid') { damaged = true; continue; }
      valid.push(Object.assign({}, decoded, { slot: index }));
    }
    if (!valid.length) return damaged ? block('CORRUPT_SLOTS') : { status: 'empty', revision: null, catalog: null, canonical: null, sequence: 0, slot: null };
    if (valid.length === 2) {
      if (valid[0].sequence === valid[1].sequence && valid[0].raw !== valid[1].raw) return block('AMBIGUOUS_SEQUENCE');
      if (valid[0].revision === valid[1].revision && valid[0].canonical !== valid[1].canonical) return block('REVISION_CONFLICT');
    }
    const selected = valid.length === 2 && valid[1].sequence > valid[0].sequence ? valid[1] : valid[0];
    return { status: damaged ? 'recovered' : 'ready', revision: selected.revision, catalog: selected.catalog, canonical: selected.canonical, sequence: selected.sequence, slot: selected.slot };
  }
  function acknowledgedConflict(value) {
    if (!catalog || sequence === 0) return null;
    if (value.status === 'empty') return 'STORAGE_DISAPPEARED';
    if (value.sequence < sequence) return 'SNAPSHOT_ROLLBACK';
    if (value.sequence === sequence && (value.revision !== revision || value.canonical !== canonical)) return 'SNAPSHOT_CONFLICT';
    if (value.revision === revision && value.canonical !== canonical) return 'REVISION_CONFLICT';
    return null;
  }
  function acknowledge(value) {
    const conflict = acknowledgedConflict(value); if (conflict) return block(conflict);
    catalog = value.catalog; canonical = value.canonical; revision = value.revision; sequence = value.sequence; slot = value.slot;
    status = value.status; errorCode = null; return snapshot();
  }
  async function operation(task) {
    if (closed) return rejected('CLOSED', 'closed');
    if (uncertain) return rejected(errorCode || 'UNCERTAIN', 'uncertain');
    if (busy) return rejected('BUSY');
    busy = true; const captured = generation; publish();
    try { if (!closed && captured === generation) { ensureBackend(); await task(); } }
    catch (error) { if (!closed && captured === generation) ioFailure(nativeCode(error), error); }
    finally { if (!closed && captured === generation) { busy = false; publish(); } }
    return snapshot();
  }
  async function open() {
    return operation(async () => {
      const inspected = await inspect(); if (closed || uncertain) return;
      if (['empty', 'ready', 'recovered'].indexOf(inspected.status) >= 0) acknowledge(inspected);
    });
  }
  async function save(value) {
    if (closed) return rejected('CLOSED', 'closed');
    if (uncertain) return rejected(errorCode || 'UNCERTAIN', 'uncertain');
    if (busy) return rejected('BUSY');
    if (status === 'unopened') return rejected('NOT_OPEN');
    if (['empty', 'ready', 'recovered'].indexOf(status) < 0) return rejected('RECOVERY_REQUIRED');
    let candidate;
    try { candidate = frozenInput(value); } catch (error) { return block(nativeCode(error)); }
    return operation(async () => {
      const expectedSequence = sequence;
      const existing = await inspect(); if (closed || uncertain || ['empty', 'ready', 'recovered'].indexOf(existing.status) < 0) return;
      const conflict = acknowledgedConflict(existing); if (conflict) { block(conflict); return; }
      if (existing.sequence !== expectedSequence) { block('STATE_CHANGED'); return; }
      if (existing.revision === candidate.revision && existing.canonical !== candidate.canonical) { block('REVISION_CONFLICT'); return; }
      if (existing.revision === candidate.revision && existing.canonical === candidate.canonical) { acknowledge(existing); return; }
      if (existing.sequence >= MAX_SEQUENCE) { block('SEQUENCE_EXHAUSTED'); return; }
      let raw; try { raw = encodeRecord(existing.sequence + 1, candidate); } catch (error) { block(nativeCode(error)); return; }
      const target = existing.slot === 0 ? 1 : 0;
      try { await backend.write(target, raw); } catch (error) { ioFailure('WRITE_FAILED', error); return; }
      const stopped = safety(); if (stopped) return;
      let readback; try { readback = await backend.read(target); } catch (error) { ioFailure('READBACK_FAILED', error); return; }
      const late = safety(); if (late) return;
      if (readback !== raw) { block('READBACK_MISMATCH'); return; }
      const decoded = decodeRecord(readback); if (decoded.status !== 'valid') { block('READBACK_INVALID'); return; }
      acknowledge({ status: 'ready', revision: decoded.revision, catalog: decoded.catalog, canonical: decoded.canonical, sequence: decoded.sequence, slot: target });
    });
  }
  function subscribe(listener) {
    if (typeof listener !== 'function') fail('LISTENER');
    if (closed) { try { listener(snapshot()); } catch (_) { /* No live owner remains. */ } return () => {}; }
    listeners.push(listener); try { listener(snapshot()); } catch (_) { /* Subscription never owns catalog state. */ }
    let removed = false; return () => { if (removed) return; removed = true; const index = listeners.indexOf(listener); if (index >= 0) listeners.splice(index, 1); };
  }
  function close() {
    if (closed) return; closed = true; generation++; busy = false;
    if (backend && typeof backend.close === 'function') { try { backend.close(); } catch (_) { /* Retired owner cannot perform another write. */ } }
    publish(); listeners.length = 0;
  }
  return { open, save, snapshot, subscribe, close };
}
module.exports = { createCatalogOwner, encodeRecord, decodeRecord, MARKER, MAX_RECORD_BYTES, MAX_SEQUENCE };

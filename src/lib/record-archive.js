const domain = require('./local-session');
const codec = require('./local-codec');
const records = require('./record-model');
const historyGuard = require('./record-history-guard');
const MAX_BYTES = 65536;
const MAX_RECORDS = 64;
const MARKER = 'MIRRA_CONFIRMED_RECORDS_V1';
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function fields(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== names.length) fail('ARCHIVE_FIELD');
  names.forEach(name => { const descriptor = Object.getOwnPropertyDescriptor(value, name); if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail('ARCHIVE_FIELD'); });
}
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function safeCode(error) { const code = error && error.code; return typeof code === 'string' && /^[A-Z0-9_]{1,48}$/.test(code) ? code : 'ARCHIVE_IO_FAILED'; }
function createRecordArchive(options) {
  const backend = options && options.backend; const hash = options && options.hash;
  if (!backend || typeof backend.read !== 'function' || typeof backend.write !== 'function' || typeof hash !== 'function') fail('ARCHIVE_OPTIONS');
  let current = null; let known = null; let busy = false; let closed = false; let uncertain = false; let status = 'unopened'; let lastCode = null;
  function digest(raw) { const value = hash(raw); if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) fail('ARCHIVE_DIGEST'); return value; }
  function confirmed(value, receipt) {
    const canonical = records.canonicalRecord(value); const parsed = records.parseCanonical(canonical);
    fields(receipt, ['installationId', 'sessionId', 'digest', 'bytes', 'status']);
    if (receipt.installationId !== parsed.installationId || receipt.sessionId !== parsed.session.id
      || receipt.digest !== digest(canonical) || receipt.bytes !== codec.byteLength(canonical) || receipt.status !== 'PERSISTED') fail('ARCHIVE_ACK_MISMATCH');
    return { canonical, receipt: { installationId: receipt.installationId, sessionId: receipt.sessionId, digest: receipt.digest, bytes: receipt.bytes, status: 'PERSISTED' } };
  }
  function normalize(entries) {
    if (!Array.isArray(entries) || entries.length > MAX_RECORDS) fail('ARCHIVE_CAPACITY');
    const ids = []; let installationId = null;
    return entries.map(entry => {
      fields(entry, ['canonical', 'receipt']); const parsed = records.parseCanonical(entry.canonical); const normalized = confirmed(parsed, entry.receipt);
      if (normalized.canonical !== entry.canonical) fail('ARCHIVE_CANONICAL');
      if (installationId !== null && parsed.installationId !== installationId) fail('IDENTITY_CONFLICT'); installationId = parsed.installationId;
      if (ids.indexOf(parsed.session.id) >= 0) fail('ARCHIVE_DUPLICATE'); ids.push(parsed.session.id); return normalized;
    });
  }
  function encode(sequence, entries) {
    if (!Number.isSafeInteger(sequence) || sequence < 1) fail('ARCHIVE_SEQUENCE');
    const envelope = { schemaVersion: 1, marker: MARKER, sequence, entries: normalize(entries) };
    envelope.checksum = codec.checksum(JSON.stringify(envelope)); const raw = JSON.stringify(envelope);
    if (codec.byteLength(raw) > MAX_BYTES) fail('ARCHIVE_CAPACITY'); return raw;
  }
  function decode(raw) {
    try {
      if (typeof raw !== 'string' || codec.byteLength(raw) > MAX_BYTES) fail('ARCHIVE_SIZE');
      const envelope = JSON.parse(raw);
      if (!envelope || typeof envelope !== 'object' || envelope.schemaVersion !== 1 || envelope.marker !== MARKER) return { status: 'unknown', code: 'UNKNOWN_ARCHIVE' };
      const expected = ['schemaVersion', 'marker', 'sequence', 'entries', 'checksum'];
      if (Object.keys(envelope).length !== expected.length || Object.keys(envelope).some(key => expected.indexOf(key) < 0)) return { status: 'unknown', code: 'UNKNOWN_ARCHIVE_FIELD' };
      if (encode(envelope.sequence, envelope.entries) !== raw) fail('ARCHIVE_CHECKSUM');
      return { status: 'valid', sequence: envelope.sequence, entries: normalize(envelope.entries), raw };
    } catch (error) { return { status: 'corrupt', code: safeCode(error) }; }
  }
  function extension(before, after) {
    for (const old of before) {
      const retained = after.find(entry => entry.receipt.sessionId === old.receipt.sessionId);
      if (!retained) return 'ARCHIVE_HISTORY_DISAPPEARED';
      if (JSON.stringify(retained) !== JSON.stringify(old)) return 'ARCHIVE_HISTORY_CHANGED';
    }
    return null;
  }
  function stopped() {
    if (closed) return 'CLOSED';
    if (backend.describe && backend.describe().uncertain) uncertain = true;
    return uncertain ? 'UNCERTAIN' : null;
  }
  function blocked(code, error) {
    if (error && ['TIMEOUT', 'NATIVE_THROW', 'UNCERTAIN'].indexOf(safeCode(error)) >= 0) uncertain = true;
    status = uncertain ? 'uncertain' : 'blocked'; lastCode = code; return Object.assign(snapshot(), { code });
  }
  function snapshot() {
    const entries = current ? current.entries : [];
    const sealed = !!current && current.valid.length === 2 && current.valid.every(value => value.raw === current.raw);
    return { status: closed ? 'closed' : uncertain ? 'uncertain' : status, code: lastCode, sequence: current ? current.sequence : 0,
      sealed, count: entries.length, entries: copy(entries), maxRecords: MAX_RECORDS, maxBytes: MAX_BYTES };
  }
  async function inspect() {
    const valid = []; let damaged = false;
    for (let slot = 0; slot < 2; slot++) {
      const stop = stopped(); if (stop) return blocked(stop);
      let raw; try { raw = await backend.read(slot); } catch (error) { return blocked('ARCHIVE_READ_FAILED', error); }
      if (raw === null) continue;
      const parsed = decode(raw); if (parsed.status === 'unknown') return blocked(parsed.code);
      if (parsed.status !== 'valid') { damaged = true; continue; }
      valid.push(Object.assign({}, parsed, { slot }));
    }
    const stop = stopped(); if (stop) return blocked(stop);
    if (!valid.length) {
      if (damaged || known) return blocked(damaged ? 'CORRUPT_ARCHIVE_SLOTS' : 'ARCHIVE_DISAPPEARED');
      current = null; status = 'empty'; lastCode = null; return snapshot();
    }
    const latest = valid.reduce((best, value) => value.sequence > best.sequence ? value : best, valid[0]);
    if (valid.length === 2) {
      if (valid[0].sequence === valid[1].sequence && valid[0].raw !== valid[1].raw) return blocked('AMBIGUOUS_ARCHIVE_SEQUENCE');
      const older = valid[0].sequence < valid[1].sequence ? valid[0] : valid[1]; const conflict = extension(older.entries, latest.entries);
      if (conflict) return blocked(conflict);
    }
    if (known) {
      if (latest.sequence < known.sequence) return blocked('ARCHIVE_ROLLBACK');
      if (latest.sequence === known.sequence && latest.raw !== known.raw) return blocked('ARCHIVE_CONFLICT');
      const conflict = extension(known.entries, latest.entries); if (conflict) return blocked(conflict);
    }
    current = Object.assign({}, latest, { valid }); known = { sequence: latest.sequence, raw: latest.raw, entries: copy(latest.entries) };
    status = damaged ? 'recovered' : 'ready'; lastCode = null; return snapshot();
  }
  async function open() {
    const stop = stopped(); if (stop) return blocked(stop); if (busy) return Object.assign(snapshot(), { status: 'blocked', code: 'BUSY' });
    busy = true; try { return await inspect(); } finally { busy = false; }
  }
  async function saveConfirmed(value, receipt) {
    const stop = stopped(); if (stop) return blocked(stop); if (busy) return Object.assign(snapshot(), { status: 'blocked', code: 'BUSY' });
    let entry; try { entry = confirmed(value, receipt); } catch (error) { return Object.assign(snapshot(), { status: 'blocked', code: safeCode(error) }); }
    if (status === 'blocked' || status === 'unopened') return Object.assign(snapshot(), { status: 'blocked', code: 'ARCHIVE_RECOVERY_REQUIRED' });
    busy = true;
    try {
      const state = await inspect(); if (['ready', 'recovered', 'empty'].indexOf(state.status) < 0) return state;
      const existing = current && current.entries.find(saved => saved.receipt.sessionId === entry.receipt.sessionId);
      if (existing && JSON.stringify(existing) !== JSON.stringify(entry)) return Object.assign(snapshot(), { status: 'blocked', code: 'ARCHIVE_RECORD_CONFLICT' });
      if (current && current.entries.length && current.entries[0].receipt.installationId !== entry.receipt.installationId) return Object.assign(snapshot(), { status: 'blocked', code: 'IDENTITY_CONFLICT' });
      if (existing && state.sealed) return state;
      let raw; let entries = current ? current.entries.slice() : [];
      if (!existing) entries.push(entry);
      try { raw = encode(current ? existing ? current.sequence : current.sequence + 1 : 1, entries); }
      catch (error) { return Object.assign(snapshot(), { status: 'blocked', code: safeCode(error) }); }
      // Complete the other slot first, preserving the previously valid archive.
      const first = current && current.slot === 0 ? 1 : 0;
      for (const slot of [first, 1 - first]) {
        const stop = stopped(); if (stop) return blocked(stop);
        try { await backend.write(slot, raw); } catch (error) { return blocked('ARCHIVE_WRITE_FAILED', error); }
        if (stopped()) return blocked(stopped());
        let readback; try { readback = await backend.read(slot); } catch (error) { return blocked('ARCHIVE_READBACK_FAILED', error); }
        if (stopped()) return blocked(stopped());
        if (readback !== raw || decode(readback).status !== 'valid') return blocked('ARCHIVE_READBACK_MISMATCH');
      }
      return await inspect();
    } finally { busy = false; }
  }
  function archivedRecords() { return current ? current.entries.map(entry => records.parseCanonical(entry.canonical)) : []; }
  async function historyError(previous, next, proofOptions) {
    const baseline = domain.historyError(previous, next, { profile: 'formal' }); if (baseline !== 'PENDING_DISAPPEARED') return baseline;
    const stop = stopped(); if (stop || busy) return baseline;
    const missing = previous.pending.filter(old => !next.pending.some(value => value.id === old.id));
    busy = true;
    try {
      const state = await inspect(); if (['ready', 'recovered'].indexOf(state.status) < 0) return baseline;
      const retainedPrevious = copy(previous);
      for (const old of missing) {
        let canonical; try { canonical = records.canonicalRecord({ schemaVersion: 1, installationId: previous.installationId, session: old }); } catch (_) { return baseline; }
        const entry = current.entries.find(value => value.canonical === canonical);
        if (!entry || proofOptions && proofOptions.requireSealed && !current.valid.every(value => value.entries.some(saved => JSON.stringify(saved) === JSON.stringify(entry)))) return baseline;
        if (proofOptions && proofOptions.requireSealed && current.valid.length !== 2) return baseline;
        retainedPrevious.pending = retainedPrevious.pending.filter(value => value.id !== old.id);
      }
      if (retainedPrevious.state === 'FINISHED_PENDING_SYNC' && retainedPrevious.pending.length === 0) retainedPrevious.state = 'IDLE';
      return domain.historyError(retainedPrevious, next, { profile: 'formal' });
    } finally { busy = false; }
  }
  function close() { if (closed) return; closed = true; if (backend.close) backend.close(); }
  const api = Object.freeze({ open, snapshot, saveConfirmed, records: archivedRecords, historyError, close });
  historyGuard.registerRecordArchive(api, historyError); return api;
}
module.exports = { MAX_BYTES, MAX_RECORDS, MARKER, createRecordArchive };

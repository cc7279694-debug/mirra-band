const { encodeRecord, decodeRecord, MAX_SEQUENCE } = require('./local-codec');
const { historyError } = require('./local-session');
function errorCode(error) {
  let descriptor;
  try { descriptor = error && Object.getOwnPropertyDescriptor(error, 'code'); } catch (_) { descriptor = null; }
  const value = descriptor && descriptor.value;
  return typeof value === 'string' && /^[A-Z0-9_]{1,48}$/.test(value) ? value : 'IO_ERROR';
}
function blank(status, code, error) {
  const result = { status, sequence: 0, document: null, slot: null };
  if (code) result.code = code;
  if (error) result.errorCode = error;
  return result;
}
// A canonical record is acknowledged only after exact readback. Neither slot is deleted.
function createJournal(options) {
  const backend = options && options.backend;
  if (!backend || typeof backend.read !== 'function' || typeof backend.write !== 'function') throw new Error('BACKEND');
  let busy = false; let recoveryRequired = false; let uncertain = false; let closed = false;
  function safety() {
    if (closed) return blank('blocked', 'CLOSED');
    if (typeof backend.describe === 'function' && backend.describe().uncertain) uncertain = true;
    return uncertain ? blank('uncertain', 'UNCERTAIN') : null;
  }
  function ioFailure(code, error) {
    const nativeCode = errorCode(error);
    if (nativeCode === 'TIMEOUT' || nativeCode === 'NATIVE_THROW' || nativeCode === 'UNCERTAIN') uncertain = true;
    recoveryRequired = true;
    const stopped = safety();
    return stopped || blank('blocked', code, nativeCode);
  }
  async function inspect() {
    const slots = [];
    for (let slot = 0; slot < 2; slot++) {
      const stopped = safety(); if (stopped) return stopped;
      try { slots.push(await backend.read(slot)); } catch (error) { return ioFailure('READ_FAILED', error); }
    }
    const stopped = safety(); if (stopped) return stopped;
    if (slots.some(raw => raw !== null && typeof raw !== 'string')) return blank('blocked', 'BACKEND_VALUE');
    const valid = []; let damaged = false;
    for (let slot = 0; slot < 2; slot++) {
      if (slots[slot] === null) continue;
      let record;
      try { record = decodeRecord(slots[slot]); } catch (_) { return blank('blocked', 'CODEC_ERROR'); }
      if (record.status === 'unknown') return blank('blocked', 'UNKNOWN_RECORD', record.code);
      if (record.status !== 'valid') { damaged = true; continue; }
      valid.push({ slot, raw: slots[slot], record });
    }
    if (!valid.length) return damaged ? blank('blocked', 'CORRUPT_SLOTS') : blank('empty');
    if (valid.length === 2 && valid[0].record.sequence === valid[1].record.sequence && valid[0].raw !== valid[1].raw) return blank('blocked', 'AMBIGUOUS_SEQUENCE');
    if (valid.length === 2 && valid[0].record.sequence !== valid[1].record.sequence) {
      const older = valid[0].record.sequence < valid[1].record.sequence ? valid[0] : valid[1];
      const newer = older === valid[0] ? valid[1] : valid[0];
      const conflict = historyError(older.record.document, newer.record.document);
      if (conflict) return blank('blocked', conflict);
    }
    const chosen = valid.length === 2 && valid[1].record.sequence > valid[0].record.sequence ? valid[1] : valid[0];
    return { status: damaged ? 'recovered' : 'ready', sequence: chosen.record.sequence, document: chosen.record.document, slot: chosen.slot };
  }
  async function recover() {
    const stopped = safety(); if (stopped) return stopped;
    if (busy) return blank('blocked', 'BUSY');
    busy = true;
    try { const result = await inspect(); recoveryRequired = result.status === 'blocked'; return result; }
    finally { busy = false; }
  }
  async function save(document, saveOptions) {
    const stopped = safety(); if (stopped) return stopped;
    if (busy) return blank('blocked', 'BUSY');
    if (recoveryRequired) return blank('blocked', 'RECOVERY_REQUIRED');
    const expected = saveOptions && saveOptions.expectedSequence;
    if (expected !== undefined && (!Number.isSafeInteger(expected) || expected < 0)) return blank('blocked', 'INVALID_EXPECTED_SEQUENCE');
    let canonical;
    try {
      canonical = decodeRecord(encodeRecord(1, document));
      if (canonical.status !== 'valid') return blank('blocked', 'INVALID_DOCUMENT');
    } catch (error) { return blank('blocked', errorCode(error)); }
    busy = true;
    try {
      const existing = await inspect();
      if (existing.status === 'blocked' || existing.status === 'uncertain') { recoveryRequired = true; return existing; }
      if (existing.sequence >= MAX_SEQUENCE) { recoveryRequired = true; return blank('blocked', 'SEQUENCE_EXHAUSTED'); }
      if (expected !== undefined && expected !== existing.sequence) { recoveryRequired = true; return blank('blocked', 'STATE_CHANGED'); }
      if (existing.document) {
        const conflict = historyError(existing.document, canonical.document);
        if (conflict) { recoveryRequired = true; return blank('blocked', conflict); }
      }
      let raw;
      try { raw = encodeRecord(existing.sequence + 1, canonical.document); } catch (error) { return blank('blocked', errorCode(error)); }
      const slot = existing.slot === 0 ? 1 : 0;
      try { await backend.write(slot, raw); } catch (error) { return ioFailure('WRITE_FAILED', error); }
      let stopped = safety(); if (stopped) return stopped;
      let readback;
      try { readback = await backend.read(slot); } catch (error) { return ioFailure('READBACK_FAILED', error); }
      stopped = safety(); if (stopped) return stopped;
      if (readback !== raw) { recoveryRequired = true; return blank('blocked', 'READBACK_MISMATCH'); }
      let record;
      try { record = decodeRecord(readback); } catch (_) { record = { status: 'corrupt' }; }
      if (record.status !== 'valid') { recoveryRequired = true; return blank('blocked', 'READBACK_INVALID'); }
      return { status: 'ready', sequence: record.sequence, document: record.document, slot };
    } finally { busy = false; }
  }
  function close() {
    if (closed) return;
    closed = true;
    if (typeof backend.close === 'function') backend.close();
  }
  return { recover, save, close };
}
module.exports = { createJournal };

const MAX_SEQUENCE = 9007199254740991;
const MAX_BYTES = 8192;
const MARKER = 'MIRRA_05A_TEST';

function reject(code) { throw new Error(code); }
function positiveInteger(value) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value > 0 && value <= MAX_SEQUENCE;
}
function fields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject('FIELD');
  const actual = Object.keys(value);
  if (actual.length !== allowed.length || allowed.some(key => !Object.prototype.hasOwnProperty.call(value, key)) || actual.some(key => allowed.indexOf(key) < 0)) reject('FIELD');
}
function textInfo(value) {
  if (typeof value !== 'string') reject('TEXT');
  let points = 0; let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    let code = value.charCodeAt(index); points++;
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(++index);
      if (!(low >= 0xdc00 && low <= 0xdfff)) reject('UNICODE');
      bytes += 4;
    } else if (code >= 0xdc00 && code <= 0xdfff) reject('UNICODE');
    else bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
  }
  return { points, bytes };
}
function payloadCopy(payload) {
  fields(payload, ['label', 'createdAtUnixMs', 'records']);
  if (textInfo(payload.label).points > 48) reject('TEXT');
  if (!positiveInteger(payload.createdAtUnixMs)) reject('TIME');
  if (!Array.isArray(payload.records) || payload.records.length > 32) reject('RECORDS');
  for (let index = 0; index < payload.records.length; index++) {
    if (!Object.prototype.hasOwnProperty.call(payload.records, index)) reject('RECORDS');
  }
  const ids = [];
  const records = payload.records.map(record => {
    fields(record, ['id', 'text']);
    if (typeof record.id !== 'string' || !/^[\x21-\x7e]{1,32}$/.test(record.id)) reject('ID');
    if (ids.indexOf(record.id) >= 0) reject('DUPLICATE_ID');
    ids.push(record.id);
    if (textInfo(record.text).points > 128) reject('TEXT');
    return { id: record.id, text: record.text };
  });
  return { label: payload.label, createdAtUnixMs: payload.createdAtUnixMs, records };
}
// CRC32 is only an accidental-corruption check, never authentication.
function checksum(text) {
  let crc = 0xffffffff;
  function byte(value) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  for (let index = 0; index < text.length; index++) {
    let code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) code = 0x10000 + ((code - 0xd800) << 10) + (text.charCodeAt(++index) - 0xdc00);
    if (code < 0x80) byte(code);
    else if (code < 0x800) { byte(0xc0 | (code >> 6)); byte(0x80 | (code & 0x3f)); }
    else if (code < 0x10000) { byte(0xe0 | (code >> 12)); byte(0x80 | ((code >> 6) & 0x3f)); byte(0x80 | (code & 0x3f)); }
    else { byte(0xf0 | (code >> 18)); byte(0x80 | ((code >> 12) & 0x3f)); byte(0x80 | ((code >> 6) & 0x3f)); byte(0x80 | (code & 0x3f)); }
  }
  return ('00000000' + ((crc ^ 0xffffffff) >>> 0).toString(16)).slice(-8);
}
function envelope(sequence, payload) {
  if (!positiveInteger(sequence)) reject('SEQUENCE');
  return { schemaVersion: 1, marker: MARKER, sequence, payload: payloadCopy(payload) };
}
function encodeRecord(sequence, payload) {
  const record = envelope(sequence, payload);
  record.checksum = checksum(JSON.stringify(record));
  const raw = JSON.stringify(record);
  if (textInfo(raw).bytes > MAX_BYTES) reject('SIZE');
  return raw;
}
function decodeRecord(raw) {
  if (typeof raw !== 'string') reject('BACKEND_VALUE');
  if (textInfo(raw).bytes > MAX_BYTES) reject('SIZE');
  let parsed;
  try { parsed = JSON.parse(raw); } catch (error) { reject('JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) reject('JSON');
  if (parsed.schemaVersion !== 1) reject('SCHEMA');
  if (parsed.marker !== MARKER) reject('MARKER');
  fields(parsed, ['schemaVersion', 'marker', 'sequence', 'payload', 'checksum']);
  const record = envelope(parsed.sequence, parsed.payload);
  if (typeof parsed.checksum !== 'string' || !/^[0-9a-f]{8}$/.test(parsed.checksum) || parsed.checksum !== checksum(JSON.stringify(record))) reject('CHECKSUM');
  record.checksum = parsed.checksum;
  // Reject duplicate JSON keys and alternative encodings after validating facts.
  if (raw !== JSON.stringify(record)) reject('CANONICAL');
  return { sequence: record.sequence, payload: record.payload };
}
function blank(status, reason) {
  const result = { status, sequence: 0, payload: null, slot: null };
  if (reason) result.reason = reason;
  return result;
}
function createJournal(options) {
  const backend = options && options.backend;
  if (!backend || typeof backend.read !== 'function' || typeof backend.write !== 'function') reject('BACKEND');
  let busy = false; let recoveryRequired = false;
  async function inspect() {
    const slots = [];
    try { slots.push(await backend.read(0)); slots.push(await backend.read(1)); }
    catch (error) { return blank('blocked', 'READ_FAILED'); }
    if (slots.some(raw => raw !== null && typeof raw !== 'string')) return blank('blocked', 'BACKEND_VALUE');
    const valid = []; let corrupt = false;
    for (let slot = 0; slot < 2; slot++) {
      if (slots[slot] === null) continue;
      try { valid.push({ slot, raw: slots[slot], record: decodeRecord(slots[slot]) }); }
      catch (error) {
        if (error.message === 'SCHEMA' || error.message === 'MARKER' || error.message === 'FIELD') return blank('blocked', 'UNKNOWN_RECORD');
        corrupt = true;
      }
    }
    if (valid.length === 0) return corrupt ? blank('blocked', 'CORRUPT_SLOTS') : blank('empty');
    if (valid.length === 2 && valid[0].record.sequence === valid[1].record.sequence && valid[0].raw !== valid[1].raw) return blank('blocked', 'AMBIGUOUS_SEQUENCE');
    const chosen = valid.length === 2 && valid[1].record.sequence > valid[0].record.sequence ? valid[1] : valid[0];
    const result = { status: corrupt ? 'recovered' : 'ready', sequence: chosen.record.sequence, payload: chosen.record.payload, slot: chosen.slot };
    if (corrupt) result.reason = 'CORRUPT_SLOT';
    return result;
  }
  async function recover() {
    if (busy) return blank('blocked', 'BUSY');
    busy = true;
    try {
      const result = await inspect();
      recoveryRequired = result.status === 'blocked';
      return result;
    } finally { busy = false; }
  }
  async function save(payload) {
    if (busy) return blank('blocked', 'BUSY');
    if (recoveryRequired) return blank('blocked', 'RECOVERY_REQUIRED');
    let copy;
    try { copy = payloadCopy(payload); }
    catch (error) { return blank('blocked', error.message); }
    busy = true;
    try {
      const existing = await inspect();
      if (existing.status === 'blocked') { recoveryRequired = true; return existing; }
      if (existing.sequence === MAX_SEQUENCE) { recoveryRequired = true; return blank('blocked', 'SEQUENCE_EXHAUSTED'); }
      const sequence = existing.sequence + 1;
      let raw;
      try { raw = encodeRecord(sequence, copy); }
      catch (error) { return blank('blocked', error.message); }
      const slot = existing.slot === 0 ? 1 : 0;
      try { await backend.write(slot, raw); }
      catch (error) { recoveryRequired = true; return blank('blocked', 'WRITE_FAILED'); }
      let readback;
      try { readback = await backend.read(slot); }
      catch (error) { recoveryRequired = true; return blank('blocked', 'READBACK_FAILED'); }
      if (readback !== raw) { recoveryRequired = true; return blank('blocked', 'READBACK_MISMATCH'); }
      let record;
      try { record = decodeRecord(readback); }
      catch (error) { recoveryRequired = true; return blank('blocked', 'READBACK_INVALID'); }
      return { status: 'ready', sequence: record.sequence, payload: record.payload, slot };
    } finally { busy = false; }
  }
  return { recover, save };
}
module.exports = { encodeRecord, decodeRecord, createJournal };

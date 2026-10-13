const domain = require('./local-session');
const MAX_BYTES = 8192;
const MAX_SEQUENCE = 9007199254740991;
const MARKER = 'MIRRA_05B_ISOLATED';
const FORMAL_MARKER = 'MIRRA_LOCAL_SESSION_V1';
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function byteLength(text) { return domain.textInfo(text).bytes; }
// CRC32 detects accidental corruption, not malicious modifications.
function checksum(text) {
  let crc = 0xffffffff;
  function byte(value) { crc ^= value; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
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
function encodeRecord(sequence, doc, context) {
  if (!Number.isSafeInteger(sequence) || sequence < 1) fail('SEQUENCE');
  const record = { schemaVersion: 1, marker: context && context.profile === 'formal' ? FORMAL_MARKER : MARKER, sequence, document: domain.validateDocument(doc, context) };
  record.checksum = checksum(JSON.stringify(record)); const raw = JSON.stringify(record);
  if (byteLength(raw) > MAX_BYTES) fail('CAPACITY'); return raw;
}
function decodeRecord(raw, context) {
  let record;
  try {
    if (typeof raw !== 'string' || byteLength(raw) > MAX_BYTES) fail('SIZE');
    record = JSON.parse(raw); if (!record || typeof record !== 'object' || Array.isArray(record)) fail('JSON');
    if (record.schemaVersion !== 1 || record.marker !== (context && context.profile === 'formal' ? FORMAL_MARKER : MARKER)) return { status: 'unknown', code: 'UNKNOWN_SCHEMA' };
    const names = ['schemaVersion', 'marker', 'sequence', 'document', 'checksum'];
    if (Object.keys(record).length !== names.length || Object.keys(record).some(key => names.indexOf(key) < 0)) return { status: 'unknown', code: 'UNKNOWN_FIELD' };
    const canonical = encodeRecord(record.sequence, record.document, context);
    if (canonical !== raw) fail('CHECKSUM_OR_CANONICAL');
    return { status: 'valid', sequence: record.sequence, document: domain.validateDocument(record.document, context) };
  } catch (error) { return { status: error.code === 'UNKNOWN_SCHEMA' || error.code === 'UNKNOWN_FIELD' ? 'unknown' : 'corrupt', code: error.code || 'JSON' }; }
}
module.exports = { MAX_BYTES, MAX_SEQUENCE, MARKER, FORMAL_MARKER, byteLength, utf8Bytes: byteLength, checksum, encodeRecord, decodeRecord };

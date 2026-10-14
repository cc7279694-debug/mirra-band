const wire = require('./companion-protocol');
const { checksum } = require('./record-checksum');
const VERSION = 4, MAX_RECORD_BYTES = 8192, MAX_PART_BYTES = 1024, MAX_PARTS = 8, DEADLINE_MS = 30000;
const TYPES = ['LOCAL_RECORD_OFFER', 'LOCAL_RECORD_NEED', 'LOCAL_RECORD_PART', 'LOCAL_RECORD_COMMIT', 'LOCAL_RECORD_ACK', 'LOCAL_RECORD_ERROR'];
const ERROR_CODES = ['DISABLED', 'BUSY', 'INVALID_RECORD', 'CONFLICT', 'TIMEOUT', 'DB_FAILED', 'RESULT_UNKNOWN', 'RECORD_TOO_LARGE', 'SOURCE_UNAVAILABLE', 'PERSIST_FAILED'];
const COMMON = ['protocolVersion', 'type', 'clientInstanceId', 'requestId', 'streamId', 'sourceInstallationId', 'localSessionId', 'recordDigest', 'totalBytes'];
function fail(code) { throw new Error(code); }
function fields(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== names.length
    || names.some(key => !Object.prototype.hasOwnProperty.call(value, key))) fail('RECORD_FIELD');
}
function identity(installationId, sessionId) {
  if (typeof installationId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(installationId)
    || typeof sessionId !== 'string' || sessionId.indexOf(installationId + ':') !== 0) fail('RECORD_ID');
  const suffix = sessionId.slice(installationId.length + 1);
  if (!/^[1-9][0-9]{0,15}$/.test(suffix) || !wire.integer(Number(suffix)) || Number(suffix) < 1 || String(Number(suffix)) !== suffix) fail('RECORD_ID');
}
function validateMessage(message) {
  if (!message || message.protocolVersion !== VERSION || TYPES.indexOf(message.type) < 0) fail('RECORD_VERSION');
  const extra = { LOCAL_RECORD_OFFER: ['schemaVersion', 'partCount'], LOCAL_RECORD_NEED: ['code'],
    LOCAL_RECORD_PART: ['index', 'data', 'checksum'], LOCAL_RECORD_COMMIT: [], LOCAL_RECORD_ACK: ['code'], LOCAL_RECORD_ERROR: ['code'] }[message.type];
  fields(message, COMMON.concat(extra));
  ['clientInstanceId', 'requestId', 'streamId'].forEach(key => {
    if (typeof message[key] !== 'string' || !/^[A-Za-z0-9._:-]{1,80}$/.test(message[key])) fail('RECORD_CONTEXT');
  });
  identity(message.sourceInstallationId, message.localSessionId);
  if (typeof message.recordDigest !== 'string' || !/^[0-9a-f]{64}$/.test(message.recordDigest)) fail('RECORD_DIGEST');
  if (!wire.integer(message.totalBytes) || message.totalBytes < 1 || message.totalBytes > MAX_RECORD_BYTES) fail('RECORD_SIZE');
  if (message.type === 'LOCAL_RECORD_OFFER') {
    if (message.schemaVersion !== 1 || !wire.integer(message.partCount) || message.partCount < Math.ceil(message.totalBytes / MAX_PART_BYTES)
      || message.partCount > MAX_PARTS || message.partCount > message.totalBytes) fail('RECORD_MANIFEST');
  } else if (message.type === 'LOCAL_RECORD_PART') {
    if (!wire.integer(message.index) || message.index >= MAX_PARTS || typeof message.data !== 'string' || !message.data.length
      || wire.utf8Bytes(message.data) > MAX_PART_BYTES || typeof message.checksum !== 'string' || !/^[0-9a-f]{8}$/.test(message.checksum)
      || checksum(message.data) !== message.checksum) fail('RECORD_PART');
  } else if (message.type === 'LOCAL_RECORD_NEED') {
    if (message.code !== 'NEED') fail('RECORD_RESULT');
  } else if (message.type === 'LOCAL_RECORD_ACK') {
    if (['IMPORTED', 'ALREADY_IMPORTED'].indexOf(message.code) < 0) fail('RECORD_RESULT');
  } else if (message.type === 'LOCAL_RECORD_ERROR' && ERROR_CODES.indexOf(message.code) < 0) fail('RECORD_ERROR');
  return message;
}
function encodeMessage(message) { validateMessage(message); return wire.encodeMessage(message); }
function decodeMessage(raw, expected) { return validateMessage(wire.decodeMessage(raw, expected)); }
module.exports = { VERSION, MAX_RECORD_BYTES, MAX_PART_BYTES, MAX_PARTS, DEADLINE_MS, TYPES, ERROR_CODES, COMMON, identity, validateMessage, encodeMessage, decodeMessage };

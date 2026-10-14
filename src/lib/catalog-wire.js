const CATALOG_VERSION = 3;
const MAX_CATALOG_BYTES = 16384;
const MAX_BOOKS = 12;
const MAX_PARTS = 32;
const MAX_PART_BYTES = 1024;
const TRANSFER_TIMEOUT_MS = 30000;
const TYPES = ['GET_CATALOG', 'CATALOG_MANIFEST', 'CATALOG_PART', 'CATALOG_ACK', 'CATALOG_ERROR'];
const ERROR_CODES = ['CATALOG_DISABLED', 'CATALOG_TOO_LARGE', 'SOURCE_UNAVAILABLE', 'SOURCE_BUSY', 'INVALID_CATALOG', 'TIMEOUT', 'CONFLICT', 'PERSIST_FAILED', 'RESULT_UNKNOWN'];
const COMMON = ['protocolVersion', 'type', 'clientInstanceId', 'requestId', 'streamId'];
function fail(code) { throw new Error(code); }
function fields(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== names.length || names.some(key => !Object.prototype.hasOwnProperty.call(value, key))) fail('CATALOG_FIELD');
}
function boundedInteger(value, minimum, maximum) { return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value <= 9007199254740991 && value >= minimum && value <= maximum; }
function hash(value) { if (typeof value !== 'string' || !/^[0-9a-f]{8}$/.test(value)) fail('CATALOG_CHECKSUM'); }
function identifier(value, book) { if (typeof value !== 'string' || !(book ? /^[A-Za-z0-9_-]{1,48}$/ : /^[A-Za-z0-9._:-]{1,80}$/).test(value)) fail('CATALOG_ID'); }
function revision(value) {
  if (typeof value !== 'string') fail('CATALOG_REVISION');
  const match = /^catalog-([0-9a-f]{8})-([1-9][0-9]{0,4})$/.exec(value);
  if (!match || !boundedInteger(Number(match[2]), 1, MAX_CATALOG_BYTES)) fail('CATALOG_REVISION');
  return { checksum: match[1], bytes: Number(match[2]) };
}
function validateMessage(message, primitives) {
  const utf8Bytes = primitives.utf8Bytes;
  if (!message || message.protocolVersion !== CATALOG_VERSION && message.protocolVersion !== 4 || TYPES.indexOf(message.type) < 0) fail('CATALOG_VERSION');
  const extra = {
    GET_CATALOG: ['knownRevision'], CATALOG_MANIFEST: ['revision', 'schemaVersion', 'totalBytes', 'partCount', 'bookCount', 'checksum'],
    CATALOG_PART: ['revision', 'index', 'data', 'checksum'], CATALOG_ACK: ['revision', 'code'], CATALOG_ERROR: ['code']
  }[message.type];
  fields(message, COMMON.concat(extra)); ['clientInstanceId', 'requestId', 'streamId'].forEach(key => identifier(message[key], false));
  if (message.type === 'GET_CATALOG') { if (message.knownRevision !== null) revision(message.knownRevision); }
  else if (message.type === 'CATALOG_ERROR') { if (ERROR_CODES.indexOf(message.code) < 0) fail('CATALOG_ERROR'); }
  else {
    const parsed = revision(message.revision);
    if (message.type === 'CATALOG_ACK') { if (message.code !== 'PERSISTED') fail('CATALOG_ACK'); }
    else {
      hash(message.checksum);
      if (message.type === 'CATALOG_MANIFEST') {
        if (message.schemaVersion !== 1 || !boundedInteger(message.totalBytes, 1, MAX_CATALOG_BYTES) || !boundedInteger(message.partCount, 1, MAX_PARTS)
          || !boundedInteger(message.bookCount, 0, MAX_BOOKS) || message.partCount < Math.ceil(message.totalBytes / MAX_PART_BYTES)
          || message.partCount > message.totalBytes || parsed.bytes !== message.totalBytes || parsed.checksum !== message.checksum) fail('CATALOG_MANIFEST');
      } else if (!boundedInteger(message.index, 0, MAX_PARTS - 1) || typeof message.data !== 'string' || !message.data.length || utf8Bytes(message.data) > MAX_PART_BYTES) fail('CATALOG_PART');
    }
  }
  return message;
}
module.exports = { CATALOG_VERSION, MAX_CATALOG_BYTES, MAX_BOOKS, MAX_PARTS, MAX_PART_BYTES, TRANSFER_TIMEOUT_MS, TYPES, ERROR_CODES, fields, boundedInteger, identifier, revision, fail, validateMessage };

const wire = require('./companion-protocol');
const { checksum } = require('./record-checksum');
const model = require('./record-model');
const envelope = require('./record-envelope');
const { VERSION, MAX_RECORD_BYTES, MAX_PART_BYTES, MAX_PARTS, DEADLINE_MS, TYPES, ERROR_CODES, COMMON, identity, validateMessage, encodeMessage, decodeMessage } = envelope;
function fail(code) { throw new Error(code); }
function buildTransfer(context, raw, digest) {
  if (!context || context.protocolVersion !== VERSION) fail('RECORD_CONTEXT');
  const record = model.parseCanonical(raw), common = { protocolVersion: VERSION, clientInstanceId: context.clientInstanceId,
    requestId: context.requestId, streamId: context.streamId, sourceInstallationId: record.installationId,
    localSessionId: record.session.id, recordDigest: digest, totalBytes: wire.utf8Bytes(raw) };
  const chunks = []; let chunk = '', bytes = 0;
  for (let offset = 0; offset < raw.length;) {
    const high = raw.charCodeAt(offset), width = high >= 0xd800 && high <= 0xdbff ? 2 : 1;
    const point = raw.slice(offset, offset + width), count = wire.utf8Bytes(point);
    if (bytes + count > MAX_PART_BYTES) { chunks.push(chunk); chunk = ''; bytes = 0; }
    chunk += point; bytes += count; offset += width;
  }
  if (chunk) chunks.push(chunk); if (chunks.length > MAX_PARTS) fail('RECORD_TOO_LARGE');
  const offer = Object.assign({}, common, { type: 'LOCAL_RECORD_OFFER', schemaVersion: 1, partCount: chunks.length });
  const parts = chunks.map((data, index) => Object.assign({}, common, { type: 'LOCAL_RECORD_PART', index, data, checksum: checksum(data) }));
  const commit = Object.assign({}, common, { type: 'LOCAL_RECORD_COMMIT' });
  [offer].concat(parts, [commit]).forEach(encodeMessage);
  return { canonical: raw, record, digest, offer, parts, commit };
}
module.exports = { VERSION, MAX_RECORD_BYTES, MAX_PART_BYTES, MAX_PARTS, DEADLINE_MS, TYPES, ERROR_CODES, COMMON,
  identity, validateMessage, encodeMessage, decodeMessage, buildTransfer };

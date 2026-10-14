const domain = require('./local-session');
const wire = require('./companion-protocol');
const MAX_RECORD_BYTES = 8192;
function fail(code) { throw new Error(code); }
function validateRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 3
    || ['schemaVersion', 'installationId', 'session'].some(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value');
    }) || value.schemaVersion !== 1) fail('INVALID_RECORD');
  const session = value.session;
  const document = domain.validateDocument({ schemaVersion: 1, installationId: value.installationId,
    counter: session && session.ordinal, state: 'FINISHED_PENDING_SYNC', preparation: null, active: null,
    pending: [session] }, { profile: 'formal' });
  return { schemaVersion: 1, installationId: document.installationId, session: document.pending[0] };
}
function canonicalRecord(value) {
  const raw = JSON.stringify(validateRecord(value));
  if (wire.utf8Bytes(raw) > MAX_RECORD_BYTES) fail('RECORD_TOO_LARGE');
  return raw;
}
function parseCanonical(raw) {
  if (typeof raw !== 'string' || !raw.length || wire.utf8Bytes(raw) > MAX_RECORD_BYTES) fail('RECORD_TOO_LARGE');
  wire.checkJsonKeys(raw, 6);
  const value = validateRecord(JSON.parse(raw));
  if (canonicalRecord(value) !== raw) fail('RECORD_NONCANONICAL');
  return value;
}
module.exports = { MAX_RECORD_BYTES, validateRecord, canonicalRecord, parseCanonical };

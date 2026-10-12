const test = require('node:test');
const assert = require('node:assert/strict');
const { crc32 } = require('node:zlib');
const domain = require('../src/lib/local-session');
const codec = require('../src/lib/local-codec');
test('local envelope is canonical, distinct from probe and has independent CRC32 oracle', () => {
  const raw = codec.encodeRecord(1, domain.createDocument('a')); const record = JSON.parse(raw);
  assert.equal(record.marker, 'MIRRA_05B_ISOLATED'); assert.equal(record.schemaVersion, 1);
  const checksum = record.checksum; delete record.checksum;
  assert.equal(checksum, crc32(Buffer.from(JSON.stringify(record), 'utf8')).toString(16).padStart(8, '0'));
  const decoded = codec.decodeRecord(raw); assert.equal(decoded.status, 'valid'); assert.equal(decoded.sequence, 1);
  assert.deepEqual(decoded.document, domain.createDocument('a'));
});
test('future schema, namespace or document fields are unknown and cannot be rolled over', () => {
  const base = JSON.parse(codec.encodeRecord(1, domain.createDocument('a')));
  for (const mutate of [r => r.schemaVersion++, r => r.marker = 'MIRRA_05A_TEST', r => r.document.extra = 1]) {
    const altered = JSON.parse(JSON.stringify(base)); mutate(altered); assert.equal(codec.decodeRecord(JSON.stringify(altered)).status, 'unknown');
  }
});
test('truncation, checksum mutation, noncanonical JSON and malformed Unicode are rejected', () => {
  const raw = codec.encodeRecord(1, domain.createDocument('a'));
  for (const bad of [raw.slice(0, -4), raw.replace('IDLE', 'FOCUS'), ' ' + raw, '\ud800']) assert.notEqual(codec.decodeRecord(bad).status, 'valid');
  assert.equal(codec.decodeRecord(JSON.stringify(JSON.parse(raw), null, 2)).status, 'corrupt');
});
test('sequence exhaustion and byte budget are enforced before any IO', () => {
  for (const n of [0, -1, 1.5, 9007199254740992]) assert.throws(() => codec.encodeRecord(n, domain.createDocument('a')));
  assert.equal(codec.decodeRecord('x'.repeat(8193)).status, 'corrupt');
  const doc = domain.createDocument('a'); doc.installationId = 'x'.repeat(100); assert.throws(() => codec.encodeRecord(1, doc));
});
test('Chinese and astral Unicode checksums match an independent UTF8 oracle', () => {
  let doc = domain.createDocument('unicode');
  const observation = { wallMs: 1, ownerId: 'a', monotonicMs: null, monotonicVerified: false };
  doc = domain.transition(doc, { type: 'SELECT_BOOK', bookId: domain.TEST_BOOKS[1].id }, observation);
  doc = domain.transition(doc, { type: 'SELECT_ACTION', firstActionId: domain.TEST_BOOKS[1].firstActions[0].id }, observation);
  doc.preparation.firstActionSnapshot.text += '📖';
  const raw = codec.encodeRecord(1, doc); const record = JSON.parse(raw); const actual = record.checksum; delete record.checksum;
  assert.equal(actual, crc32(Buffer.from(JSON.stringify(record), 'utf8')).toString(16).padStart(8, '0'));
  assert.equal(codec.byteLength(raw), Buffer.byteLength(raw, 'utf8')); assert.equal(codec.decodeRecord(raw).status, 'valid');
});
test('a structurally valid long interval ledger cannot exceed the serialized slot budget', () => {
  const time = n => ({ wallMs: n, ownerId: 'a'.repeat(64), monotonicMs: null, monotonicVerified: false });
  let doc = domain.createDocument('budget');
  doc = domain.transition(doc, { type: 'SELECT_BOOK', bookId: domain.TEST_BOOKS[1].id }, time(1));
  doc = domain.transition(doc, { type: 'SELECT_ACTION', firstActionId: domain.TEST_BOOKS[1].firstActions[0].id }, time(2));
  doc = domain.transition(doc, { type: 'CONFIRM_START', confirmed: true }, time(3));
  for (let n = 1; n < 32; n++) doc = domain.transition(doc, doc.state === 'FOCUS' ? { type: 'BEGIN_BREAK', minutes: 5 } : { type: 'RESUME' }, time(3 + n));
  assert.equal(domain.validateDocument(doc).active.intervals.length, 32);
  assert.throws(() => codec.encodeRecord(1, doc), error => error.code === 'CAPACITY');
  assert.equal(doc.active.id, 'budget:1'); assert.equal(doc.pending.length, 0);
});

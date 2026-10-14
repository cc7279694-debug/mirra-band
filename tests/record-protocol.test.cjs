const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const companion = require('../src/lib/companion-protocol');
const hash = raw => crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
const context = { protocolVersion: 4, clientInstanceId: 'record-client', requestId: 'record-request', streamId: 'record-stream' };
function record() {
  const start = { wallMs: 1000, ownerId: 'owner-a', monotonicMs: null, monotonicVerified: false };
  const end = { wallMs: 61000, ownerId: 'owner-a', monotonicMs: null, monotonicVerified: false };
  return { schemaVersion: 1, installationId: 'install-a', session: { id: 'install-a:1', ordinal: 1,
    bookSnapshot: { id: 'book-a', title: '中文与📖', startPage: 12 },
    firstActionSnapshot: { id: 'preset-read', text: '翻到第12页，读第一段。' },
    confirmedAt: start, startAt: start, intervals: [{ kind: 'FOCUS', start, end, plannedMinutes: null }], finishedAt: end, endPage: null } };
}

test('v4 negotiates record capability and exact consent boolean without changing older handshakes', () => {
  const hello = { protocolVersion: 4, type: 'HELLO', clientInstanceId: context.clientInstanceId,
    requestId: context.requestId, capabilities: ['READ_ONLY_SNAPSHOT', 'SESSION_CONTROL', 'BOOK_CATALOG', 'LOCAL_RECORD_SYNC'] };
  assert.doesNotThrow(() => companion.encodeMessage(hello));
  assert.doesNotThrow(() => companion.encodeMessage({ ...hello, type: 'HELLO_ACK', streamId: context.streamId, recordSyncEnabled: false }));
  assert.throws(() => companion.encodeMessage({ ...hello, type: 'HELLO_ACK', streamId: context.streamId }));
  assert.throws(() => companion.encodeMessage({ ...hello, type: 'HELLO_ACK', streamId: context.streamId, recordSyncEnabled: 'true' }));
  assert.throws(() => companion.encodeMessage({ ...hello, protocolVersion: 3 }));
});

test('record canonical preserves original complete session facts and rejects every open or changed boundary', () => {
  const model = require('../src/lib/record-model'); const value = record(); const raw = model.canonicalRecord(value);
  assert.deepEqual(model.parseCanonical(raw), value);
  for (const mutate of [v => v.session.finishedAt = null, v => v.session.intervals[0].end = null,
    v => v.session.id = 'install-b:1', v => v.session.ordinal = 0, v => v.session.endPage = 0,
    v => v.session.startAt.wallMs = 2, v => v.session.bookSnapshot.extra = 1,
    v => v.session.intervals[0].kind = 'DEEP_FOCUS', v => v.session.firstActionSnapshot.text = '\ud800']) {
    const next = JSON.parse(raw); mutate(next); assert.throws(() => model.canonicalRecord(next));
  }
  for (const invalid of [raw + ' ', raw.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
    raw.replace('"schemaVersion":1', '"schemaVersion":1,"\\u005f_proto__":1'), raw.replace('"wallMs":1000', '"wallMs":1e3'), ' '.repeat(8193)]) {
    assert.throws(() => model.parseCanonical(invalid));
  }
});

test('record frames retain all identity bytes, bounded UTF8 chunks, CRC and exact SHA without wall-clock trust', () => {
  const model = require('../src/lib/record-model'), wire = require('../src/lib/record-wire');
  const value = record(); value.installationId = 'i'.repeat(64); value.session.ordinal = 9007199254740991;
  value.session.id = value.installationId + ':' + value.session.ordinal; value.session.bookSnapshot.title = '📖'.repeat(120);
  value.session.firstActionSnapshot.text = '读'.repeat(160);
  const raw = model.canonicalRecord(value), transfer = wire.buildTransfer(context, raw, hash(raw));
  assert.equal(transfer.offer.localSessionId.length, 81); assert.equal(transfer.parts.map(p => p.data).join(''), raw);
  assert.ok(transfer.parts.length <= 8); assert.equal(transfer.offer.totalBytes, Buffer.byteLength(raw));
  for (const frame of [transfer.offer, ...transfer.parts, transfer.commit]) {
    const encoded = wire.encodeMessage(frame); assert.ok(Buffer.byteLength(encoded) <= 4096);
    assert.deepEqual(wire.decodeMessage(encoded, context), frame);
  }
  for (const frame of transfer.parts) { assert.ok(Buffer.byteLength(frame.data) <= 1024); assert.match(frame.checksum, /^[0-9a-f]{8}$/); }
  const ack = { ...transfer.commit, type: 'LOCAL_RECORD_ACK', code: 'IMPORTED' }; delete ack.schemaVersion;
  assert.doesNotThrow(() => wire.encodeMessage(ack));
  for (const changed of [{ localSessionId: 'i:1' }, { recordDigest: 'A'.repeat(64) }, { totalBytes: 8193 }, { code: 'APPLIED' }, { extra: 1 }])
    assert.throws(() => wire.encodeMessage({ ...ack, ...changed }));
  assert.throws(() => wire.decodeMessage(wire.encodeMessage(ack), { requestId: 'old-request' }));
  assert.throws(() => wire.buildTransfer({ ...context, protocolVersion: 3 }, raw, hash(raw)), /RECORD_CONTEXT/);
});

test('saved-size model covers 32 closed intervals and preserves fractional monotonic facts exactly', () => {
  const model = require('../src/lib/record-model'), wire = require('../src/lib/record-wire');
  const value = record(); const observation = n => ({ wallMs: n * 1000, ownerId: 'owner-a',
    monotonicMs: n === 0 ? 0.0000010000000000000002 : n * 1000, monotonicVerified: true });
  value.session.confirmedAt = observation(0); value.session.startAt = observation(0);
  value.session.intervals = Array.from({ length: 32 }, (_, n) => ({ kind: n % 2 ? 'BREAK' : 'FOCUS',
    start: observation(n), end: observation(n + 1), plannedMinutes: n % 2 ? 5 : null }));
  value.session.finishedAt = observation(32);
  const raw = model.canonicalRecord(value); assert.ok(raw.includes('0.0000010000000000000002'));
  assert.deepEqual(model.parseCanonical(raw), value);
  const transfer = wire.buildTransfer(context, raw, hash(raw)); assert.equal(transfer.parts.map(p => p.data).join(''), raw);
  assert.ok(transfer.parts.length <= 8);
});

test('new wire refuses duplicate escaped keys dangerous keys malformed unicode altered part CRC and unsupported NEED', () => {
  const model = require('../src/lib/record-model'), wire = require('../src/lib/record-wire');
  const raw = model.canonicalRecord(record()), transfer = wire.buildTransfer(context, raw, hash(raw));
  const encoded = wire.encodeMessage(transfer.offer);
  for (const invalid of [encoded.replace('"totalBytes":772', '"totalBytes":772,"\\u0074otalBytes":772'),
    encoded.replace('"schemaVersion":1', '"schemaVersion":1,"prototype":1'), ' '.repeat(4097)]) assert.throws(() => wire.decodeMessage(invalid));
  assert.throws(() => wire.encodeMessage({ ...transfer.parts[0], checksum: '0'.repeat(8) }));
  assert.throws(() => wire.encodeMessage({ ...transfer.parts[0], data: '\ud800' }));
  assert.throws(() => wire.encodeMessage({ ...transfer.commit, type: 'LOCAL_RECORD_NEED', code: 'PERSISTED_ALREADY' }));
});

test('native SHA adapter verifies independent ASCII and multilingual vectors and fails closed', () => {
  const native = require('../src/platform/record-digest');
  let calls = 0; const digest = native.createRecordDigest(() => ({ hashDigest({ data, algo }) { calls++; assert.equal(algo, 'SHA256'); return hash(data); } }));
  assert.equal(digest.sha256('中文📖'), hash('中文📖')); assert.ok(calls >= 4);
  assert.throws(() => native.createRecordDigest(() => ({ hashDigest: () => '0'.repeat(64) })).sha256('record'));
  assert.throws(() => native.createRecordDigest(() => { throw Error('unsupported'); }).sha256('record'));
  assert.throws(() => digest.sha256('\ud800'));
});

test('v4 carries the existing exact catalog on its negotiated stream without changing v3', async () => {
  const catalog = require('../src/lib/catalog-protocol');
  const request = { ...context, type: 'GET_CATALOG', knownRevision: null };
  const value = { schemaVersion: 1, books: [] }, transfer = catalog.buildTransfer(request, value);
  const receiver = catalog.createCatalogReceiver({ now: () => 1000, persist: async saved => ({ status: 'ready', ...saved }) });
  receiver.begin(context);
  for (const frame of transfer.frames) { assert.equal(frame.protocolVersion, 4); companion.decodeMessage(companion.encodeMessage(frame)); }
  await receiver.receive(transfer.frames[0]); assert.equal((await receiver.receive(transfer.frames[1])).protocolVersion, 4);
});

test('shared record v4 fixture messages and raw canonical have independent SHA equality', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../protocol/v4/fixtures/record-v4.json'), 'utf8'));
  const wire = require('../src/lib/record-wire'), model = require('../src/lib/record-model');
  assert.equal(hash(fixture.canonical), fixture.digest); assert.deepEqual(model.parseCanonical(fixture.canonical), fixture.record);
  for (const value of fixture.cases) {
    assert.equal(hash(value.canonical), value.digest); assert.equal(Buffer.byteLength(value.canonical), value.bytes);
    assert.deepEqual(model.parseCanonical(value.canonical), value.record);
    const transfer = wire.buildTransfer(context, value.canonical, value.digest);
    assert.ok(transfer.parts.length <= 8); assert.equal(transfer.parts.map(p => p.data).join(''), value.canonical);
  }
  for (const frame of fixture.messages) assert.deepEqual(companion.decodeMessage(companion.encodeMessage(frame)), frame);
  for (const name of ['app/src/test/resources/wearable/protocol-v4', 'app/src/androidTest/assets/wearable/protocol-v4'])
    assert.deepEqual(fs.readFileSync(path.join(__dirname, '../.local/android-worktree', name, 'record-v4.json')),
      fs.readFileSync(path.join(__dirname, '../protocol/v4/fixtures/record-v4.json')));
});

module.exports = { record, hash, context };

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = () => require('../src/lib/catalog-protocol');
const context = { protocolVersion: 3, clientInstanceId: 'catalog-client', requestId: 'catalog-request', streamId: 'catalog-stream' };
const request = { ...context, type: 'GET_CATALOG', knownRevision: null };
const catalog = () => ({ schemaVersion: 1, books: [
  { id: 'book_main', title: '真正的中文书籍 📖', totalPages: 300, currentPage: 12, firstAction: '翻到第12页，读第一段。', isMainline: true },
  { id: 'book_extra', title: '另一本书', totalPages: null, currentPage: 0, firstAction: null, isMainline: false }
] });
const receipt = value => ({ status: 'ready', ...value });
function receiver(persist) { let time = 1000; const value = load().createCatalogReceiver({ now: () => time, persist: persist || (async value => receipt(value)) }); value.begin(context); return { value, setTime: next => { time = next; } }; }

test('catalog uses reviewed UTF8 CRC32, canonical exact book fields, and full text without truncation', () => {
  const p = load(); assert.equal(p.checksum('123456789'), 'cbf43926');
  const value = catalog(); value.books[0].title = '中'.repeat(120); value.books[0].firstAction = '读'.repeat(160);
  const raw = p.canonicalCatalog(value); assert.equal(JSON.parse(raw).books[0].firstAction, value.books[0].firstAction);
  assert.equal(p.utf8Bytes('中文📖'), Buffer.byteLength('中文📖'));
  assert.deepEqual(p.validateCatalog(JSON.parse(raw)), value);
});
test('catalog rejects unknown fields, invalid IDs/pages/text, duplicate books and multiple mainlines', () => {
  const p = load();
  for (const change of [{ id: 'id.with.dot' }, { title: '' }, { title: '中'.repeat(121) }, { title: '\ud800' }, { title: 'x\u0000' }, { firstAction: '读'.repeat(161) }, { firstAction: '\u200b' }, { firstAction: '\u0600' }, { firstAction: '\udb40\udc20' }, { firstAction: '  ' }, { totalPages: 0 }, { currentPage: -1 }, { currentPage: 301 }, { extra: true }, { isMainline: 'true' }]) {
    const value = catalog(); Object.assign(value.books[0], change); assert.throws(() => p.validateCatalog(value), JSON.stringify(change));
  }
  const duplicate = catalog(); duplicate.books[1].id = duplicate.books[0].id; assert.throws(() => p.validateCatalog(duplicate));
  const main = catalog(); main.books[1].isMainline = true; assert.throws(() => p.validateCatalog(main));
  assert.throws(() => p.validateCatalog({ ...catalog(), extra: 1 }));
  assert.throws(() => p.validateCatalog({ schemaVersion: 2, books: [] }));
  const tooMany = { schemaVersion: 1, books: Array.from({ length: 13 }, (_, n) => ({ ...catalog().books[1], id: 'b_' + n })) }; assert.throws(() => p.validateCatalog(tooMany));
});
test('semantically identical manifest key order cannot break idempotence', async () => {
  const p = load(); const frames = p.buildTransfer(request, catalog()).frames; const r = receiver().value;
  await r.receive(frames[0]);
  const reordered = Object.fromEntries(Object.entries(frames[0]).reverse());
  assert.equal(await r.receive(reordered), null); assert.equal(r.snapshot().status, 'receiving');
  assert.equal((await r.receive(frames[1])).code, 'PERSISTED');
});
test('frame generation uses exact 4096byte wire budget and codepoint-safe 1024byte parts', () => {
  const p = load(); const value = catalog(); value.books = Array.from({ length: 12 }, (_, n) => ({ ...value.books[0], id: 'b_' + n, title: '📖'.repeat(120), firstAction: '读'.repeat(160), isMainline: n === 0 }));
  const transfer = p.buildTransfer(request, value);
  assert.ok(transfer.frames.length > 2); assert.ok(transfer.frames.length <= 33);
  assert.equal(transfer.frames[0].totalBytes, Buffer.byteLength(transfer.canonical));
  assert.equal(transfer.frames[0].bookCount, 12);
  const parts = transfer.frames.slice(1); assert.equal(parts.map(frame => frame.data).join(''), transfer.canonical);
  for (const frame of transfer.frames) { assert.ok(Buffer.byteLength(p.encodeMessage(frame)) <= 4096); assert.deepEqual(p.decodeMessage(p.encodeMessage(frame)), frame); }
  for (const frame of parts) { assert.ok(Buffer.byteLength(frame.data) <= 1024); assert.equal(p.checksum(frame.data), frame.checksum); }
  const repeat = p.buildTransfer({ ...request, knownRevision: transfer.revision }, value); assert.equal(repeat.frames.length, transfer.frames.length); assert.equal(repeat.canonical, transfer.canonical);
});
test('catalog wire parser retains duplicate-key, Unicode, type and context rejection', () => {
  const p = load(); const raw = p.encodeMessage(request);
  assert.throws(() => p.decodeMessage(raw.replace('"knownRevision":null', '"knownRevision":null,"knownRevision":null')));
  assert.throws(() => p.decodeMessage(raw.replace('"protocolVersion":3', '"protocolVersion":"3"')));
  assert.throws(() => p.decodeMessage(raw.replace('"protocolVersion":3', '"protocolVersion":2')));
  assert.throws(() => p.decodeMessage(raw, { requestId: 'other' }));
  assert.throws(() => p.encodeMessage({ ...request, arbitrary: true }));
  assert.throws(() => p.decodeMessage(' '.repeat(4097)));
  assert.throws(() => p.encodeMessage({ ...context, type: 'CATALOG_PART', revision: 'catalog-cbf43926-9', index: 0, data: '\ud800', checksum: '00000000' }));
});
test('complete out of order parts persist once, exact duplicates are idempotent, ACK waits readback', async () => {
  const p = load(); const data = catalog(); data.books[0].title = '中'.repeat(120); data.books[0].firstAction = '读'.repeat(160);
  const frames = p.buildTransfer(request, data).frames; let calls = 0; let finish; const waiting = new Promise(resolve => { finish = resolve; });
  const r = receiver(async value => { calls++; await waiting; return receipt(value); }).value;
  assert.equal(await r.receive(frames[0]), null);
  const parts = frames.slice(1).reverse();
  assert.equal(await r.receive(parts[0]), null); assert.equal(await r.receive(parts[0]), null);
  let pending; for (const frame of parts.slice(1)) pending = r.receive(frame);
  await Promise.resolve(); assert.equal(calls, 1); assert.equal(r.snapshot().status, 'persisting');
  finish(); const ack = await pending; assert.equal(ack.type, 'CATALOG_ACK'); assert.equal(ack.code, 'PERSISTED');
  assert.equal(r.snapshot().status, 'persisted'); assert.deepEqual(await r.receive(parts[0]), ack); assert.equal(calls, 1);
});
test('missing parts, late request/stream, cancellation and fixed deadline never acknowledge partial data', async () => {
  const p = load(); const frames = p.buildTransfer(request, catalog()).frames; let writes = 0;
  const r = receiver(async value => { writes++; return receipt(value); });
  assert.equal(await r.value.receive({ ...frames[0], requestId: 'old' }), null);
  assert.equal(await r.value.receive(frames[0]), null); r.setTime(31000);
  assert.equal(r.value.expire().code, 'TIMEOUT'); assert.equal(await r.value.receive(frames[1]), null); assert.equal(writes, 0);
  r.value.begin(context); r.value.cancel(); assert.equal(await r.value.receive(frames[0]), null); assert.equal(writes, 0);
});
test('conflicting duplicate, altered checksum, malformed complete and size/count mismatch fail safely', async () => {
  const p = load(); const value = catalog(); value.books[0].title = '中'.repeat(120); value.books[0].firstAction = '读'.repeat(160);
  const frames = p.buildTransfer(request, value).frames;
  const r = receiver().value; await r.receive(frames[0]); await r.receive(frames[1]);
  const changed = { ...frames[1], data: frames[1].data.replace('schemaVersion', 'schemaVersioX') }; changed.checksum = p.checksum(changed.data);
  assert.equal((await r.receive(changed)).code, 'CONFLICT'); assert.equal(r.snapshot().status, 'failed');
  const corrupt = receiver().value; await corrupt.receive(frames[0]); assert.equal((await corrupt.receive({ ...frames[1], checksum: '00000000' })).code, 'INVALID_CATALOG');
  const mismatch = receiver().value; await mismatch.receive({ ...frames[0], bookCount: 1 }); let failure;
  for (const frame of frames.slice(1)) failure = await mismatch.receive(frame);
  assert.equal(failure.code, 'INVALID_CATALOG');
});
test('failed, uncertain, or mismatched persistence receipts do not emit business-success ACK', async () => {
  const p = load(); const frames = p.buildTransfer(request, catalog()).frames;
  for (const persist of [async () => ({ status: 'blocked' }), async () => ({ status: 'uncertain' }), async value => ({ ...receipt(value), canonical: value.canonical + ' ' }), async value => ({ ...receipt(value), catalog: { schemaVersion: 1, books: [] } }), async () => { throw new Error('IO'); }]) {
    const r = receiver(persist).value; let result; for (const frame of frames) result = await r.receive(frame);
    assert.equal(result.type, 'CATALOG_ERROR'); assert.notEqual(result.code, 'PERSISTED'); assert.equal(r.snapshot().status, 'failed');
  }
});
test('cancel or timeout during persistence suppresses a late successful callback', async () => {
  const p = load(); const frames = p.buildTransfer(request, catalog()).frames;
  for (const cancel of [true, false]) {
    let finish; const wait = new Promise(resolve => { finish = resolve; });
    const r = receiver(async value => { await wait; return receipt(value); }); await r.value.receive(frames[0]);
    const pending = r.value.receive(frames[1]); await Promise.resolve();
    if (cancel) r.value.cancel(); else { r.setTime(31001); assert.equal(r.value.expire().code, 'TIMEOUT'); }
    finish(); assert.equal(await pending, null);
  }
});
test('clock rollback terminates bounded transfer and empty directory is a complete explicit replacement', async () => {
  const p = load(); const r = receiver(); r.setTime(999); assert.equal(r.value.expire().code, 'TIMEOUT');
  const empty = receiver().value; const transfer = p.buildTransfer(request, { schemaVersion: 1, books: [] }); let ack;
  for (const frame of transfer.frames) ack = await empty.receive(frame); assert.equal(ack.code, 'PERSISTED');
});
test('shared v3 literal golden fixture frames retain byte-exact canonical checksums', () => {
  const p = load(); const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../protocol/v3/fixtures/catalog-v3.json'), 'utf8'));
  assert.equal(p.canonicalCatalog(fixture.catalog), fixture.canonical);
  assert.deepEqual(p.buildTransfer(fixture.request, fixture.catalog).frames, fixture.frames);
  for (const frame of fixture.frames) assert.deepEqual(p.decodeMessage(p.encodeMessage(frame)), frame);
});
test('adversarial chunks cannot exploit a valid total checksum with duplicate JSON keys or noncanonical bytes', async () => {
  const p = load(); const base = p.buildTransfer(request, { schemaVersion: 1, books: [] });
  for (const raw of ['{"schemaVersion":1,"schemaVersion":1,"books":[]}', ' {"schemaVersion":1,"books":[]}']) {
    const revision = p.revisionFor(raw); let writes = 0;
    const r = receiver(async value => { writes++; return receipt(value); }).value;
    const manifest = { ...base.frames[0], revision, totalBytes: Buffer.byteLength(raw), checksum: p.checksum(raw) };
    const part = { ...base.frames[1], revision, data: raw, checksum: p.checksum(raw) };
    assert.equal(await r.receive(manifest), null); assert.equal((await r.receive(part)).code, 'INVALID_CATALOG'); assert.equal(writes, 0);
  }
});
test('foreign and premanifest parts never allocate or commit, invalid frame bounds cannot grow buffers', async () => {
  const p = load(); const frames = p.buildTransfer(request, catalog()).frames; let writes = 0;
  const r = receiver(async value => { writes++; return receipt(value); }).value;
  assert.equal(await r.receive(frames[1]), null); assert.equal(r.snapshot().receivedParts, 0);
  assert.equal(await r.receive({ ...frames[0], streamId: 'old-stream' }), null); assert.equal(r.snapshot().partCount, 0);
  await r.receive(frames[0]); assert.equal(await r.receive({ ...frames[1], revision: 'catalog-cbf43926-9' }), null);
  assert.equal((await r.receive({ ...frames[1], index: 32 })).code, 'INVALID_CATALOG'); assert.equal(writes, 0);
});
test('duplicates do not extend the fixed deadline and failed transfer can restart with a new context', async () => {
  const p = load(); const frames = p.buildTransfer(request, catalog()).frames; const r = receiver();
  await r.value.receive(frames[0]); r.setTime(30999); await r.value.receive(frames[0]); r.setTime(31000);
  assert.equal(r.value.expire().code, 'TIMEOUT'); assert.equal(r.value.expire(), null);
  r.value.begin({ ...context, requestId: 'next-request' }); let ack;
  for (const frame of frames) ack = await r.value.receive({ ...frame, requestId: 'next-request' }); assert.equal(ack.code, 'PERSISTED');
});

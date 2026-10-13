const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const protocol = require('../src/lib/catalog-protocol');
const load = () => require('../src/lib/catalog-owner');
function payload(title = '书籍一', books = null) {
  const catalog = { schemaVersion: 1, books: books || [{ id: 'book_1', title, totalPages: 100, currentPage: 1, firstAction: '打开这一页，读第一段。', isMainline: true }] };
  const canonical = protocol.canonicalCatalog(catalog); return { revision: protocol.revisionFor(canonical), catalog, canonical };
}
function record(sequence, value) { const body = { schemaVersion: 1, marker: 'MIRRA_BOOK_CATALOG_V1', sequence, revision: value.revision, catalog: value.catalog }; return JSON.stringify({ ...body, checksum: protocol.checksum(JSON.stringify(body)) }); }
function backend(initial = [null, null]) {
  const slots = initial.slice(); const calls = []; let uncertain = false; let closed = false;
  return { slots, calls, describe: () => ({ uncertain }), setUncertain: value => { uncertain = value; },
    read: async index => { calls.push(['read', index]); return slots[index]; },
    write: async (index, raw) => { calls.push(['write', index]); slots[index] = raw; },
    close: () => { closed = true; calls.push(['close']); }, closed: () => closed };
}
const owner = native => load().createCatalogOwner({ backendFactory: () => native });
const ioError = code => Object.assign(new Error('fixture failure'), { code });

test('catalog owner has independent strict envelope and saves only after dual read/write/exact readback', async () => {
  const native = backend(); const value = owner(native); assert.equal(value.snapshot().status, 'unopened');
  assert.equal((await value.save(payload())).errorCode, 'NOT_OPEN'); assert.equal((await value.open()).status, 'empty');
  native.calls.length = 0; const saved = await value.save(payload());
  assert.equal(saved.status, 'ready'); assert.equal(saved.sequence, 1); assert.equal(saved.slot, 0); assert.equal(saved.canonical, payload().canonical);
  assert.deepEqual(native.calls.map(call => call.slice(0, 2)), [['read', 0], ['read', 1], ['write', 0], ['read', 0]]);
  assert.equal(native.slots[0], record(1, payload())); assert.equal(native.slots[1], null);
  const reopened = owner(native); const read = await reopened.open(); assert.equal(read.revision, saved.revision); assert.deepEqual(read.catalog, saved.catalog);
});
test('same canonical catalog is idempotent only after both slots and CAS, without a new write', async () => {
  const native = backend([record(1, payload()), null]); const value = owner(native); await value.open(); native.calls.length = 0;
  const saved = await value.save(payload()); assert.equal(saved.sequence, 1); assert.equal(saved.status, 'ready');
  assert.deepEqual(native.calls, [['read', 0], ['read', 1]]);
});
test('replacing directory may remove books, alternates slots, and preserves exact previous bytes', async () => {
  const old = payload(); const original = record(1, old); const native = backend([original, null]); const value = owner(native); await value.open();
  const hash = crypto.createHash('sha256').update(original).digest('hex');
  const empty = payload('', []); const changed = await value.save(empty); assert.equal(changed.sequence, 2); assert.equal(changed.slot, 1); assert.equal(changed.catalog.books.length, 0);
  assert.equal(crypto.createHash('sha256').update(native.slots[0]).digest('hex'), hash); assert.equal(native.slots[1], record(2, empty));
});
test('one damaged slot recovers existing complete catalog, but two damaged slots stop writes', async () => {
  const native = backend([record(3, payload()), 'broken']); const value = owner(native); assert.equal((await value.open()).status, 'recovered');
  const saved = await value.save(payload('书籍二')); assert.equal(saved.sequence, 4); assert.equal(saved.status, 'ready'); assert.equal(native.slots[0], record(3, payload()));
  const bad = owner(backend(['broken', 'also broken'])); assert.equal((await bad.open()).errorCode, 'CORRUPT_SLOTS'); assert.equal((await bad.save(payload())).errorCode, 'RECOVERY_REQUIRED');
});
test('unknown schema or marker beside valid data blocks, with neither slot overwritten', async () => {
  for (const change of [{ schemaVersion: 2 }, { marker: 'OTHER_APP' }, { future: true }]) {
    const unknown = { ...JSON.parse(record(2, payload('书籍二'))), ...change }; const native = backend([record(1, payload()), JSON.stringify(unknown)]); const before = native.slots.slice();
    const value = owner(native); assert.equal((await value.open()).status, 'blocked'); assert.equal((await value.save(payload())).status, 'blocked'); assert.deepEqual(native.slots, before);
  }
});
test('equally sequenced different records and same revision different content are unsafe even with valid CRCs', async () => {
  const a = payload('plumless'); const b = payload('buckeroo'); assert.equal(a.revision, b.revision); assert.notEqual(a.canonical, b.canonical);
  for (const [left, right, code] of [[record(1, payload()), record(1, payload('other')), 'AMBIGUOUS_SEQUENCE'], [record(1, a), record(2, b), 'REVISION_CONFLICT']]) {
    const native = backend([left, right]); const before = native.slots.slice(); const value = owner(native); assert.equal((await value.open()).errorCode, code); assert.deepEqual(native.slots, before);
  }
  const native = backend([record(1, a), null]); const value = owner(native); await value.open(); assert.equal((await value.save(b)).errorCode, 'REVISION_CONFLICT'); assert.equal(native.slots[1], null);
});
test('an acknowledged live owner rejects storage disappearance, rollback or same-sequence mutation', async () => {
  for (const scenario of ['empty', 'older', 'changed']) {
    const native = backend([record(1, payload()), record(2, payload('newer'))]); const value = owner(native); const saved = await value.open();
    if (scenario === 'empty') native.slots.splice(0, 2, null, null);
    else if (scenario === 'older') native.slots[1] = null;
    else native.slots[1] = record(2, payload('mutated'));
    const result = await value.open(); assert.equal(result.status, 'blocked'); assert.equal(result.sequence, saved.sequence); assert.equal(result.canonical, saved.canonical);
    assert.equal(result.errorCode, { empty: 'STORAGE_DISAPPEARED', older: 'SNAPSHOT_ROLLBACK', changed: 'SNAPSHOT_CONFLICT' }[scenario]);
  }
});
test('external sequence changes violate save CAS; explicit re-open can acknowledge a legitimate newer catalog', async () => {
  const native = backend([record(1, payload()), null]); const value = owner(native); await value.open(); native.slots[1] = record(2, payload('other process'));
  assert.equal((await value.save(payload('next'))).errorCode, 'STATE_CHANGED'); assert.equal(native.slots[0], record(1, payload()));
  const opened = await value.open(); assert.equal(opened.status, 'ready'); assert.equal(opened.sequence, 2); assert.equal(opened.catalog.books[0].title, 'other process');
});
test('known IO/readback failures block until explicit recovery without fabricating an empty catalog', async () => {
  for (const phase of ['read', 'write', 'readback']) {
    const native = backend([record(1, payload()), null]); const value = owner(native); await value.open(); const read = native.read; const write = native.write;
    if (phase === 'read') native.read = async () => { throw ioError('READ_DENIED'); };
    if (phase === 'write') native.write = async () => { throw ioError('WRITE_DENIED'); };
    if (phase === 'readback') { let wrote = false; native.write = async (...args) => { await write(...args); wrote = true; }; native.read = async index => { if (wrote) throw ioError('READ_DENIED'); return read(index); }; }
    const failed = await value.save(payload('next')); assert.equal(failed.status, 'blocked'); assert.equal(failed.canonical, payload().canonical); assert.equal(failed.sequence, 1);
    assert.equal((await value.save(payload('next'))).errorCode, 'RECOVERY_REQUIRED'); native.read = read; native.write = write;
    const opened = await value.open(); assert.ok(['ready', 'recovered'].includes(opened.status));
  }
});
test('timeout, native throw, backend uncertainty and unknown result remain latched through open', async () => {
  for (const code of ['TIMEOUT', 'NATIVE_THROW', 'UNCERTAIN', 'RESULT_UNKNOWN']) {
    const native = backend([record(1, payload()), null]); const value = owner(native); await value.open(); const read = native.read; native.read = async () => { throw ioError(code); };
    assert.equal((await value.save(payload('next'))).status, 'uncertain'); native.read = read; assert.equal((await value.open()).status, 'uncertain'); assert.equal((await value.save(payload())).status, 'uncertain');
  }
  const native = backend([record(1, payload()), null]); const value = owner(native); await value.open(); native.setUncertain(true);
  assert.equal((await value.save(payload())).status, 'uncertain'); native.setUncertain(false); assert.equal((await value.open()).status, 'uncertain');
});
test('readback mismatch keeps the last acknowledged catalog and requires explicit recovery', async () => {
  const native = backend([record(1, payload()), null]); const value = owner(native); await value.open(); const read = native.read; let wrote = false;
  native.write = async (index, raw) => { native.slots[index] = raw; wrote = true; }; native.read = async index => wrote ? native.slots[index] + ' ' : read(index);
  const result = await value.save(payload('new')); assert.equal(result.status, 'blocked'); assert.equal(result.errorCode, 'READBACK_MISMATCH'); assert.equal(result.canonical, payload().canonical);
});
test('invalid input, byte budgets and sequence exhaustion never issue a write', async () => {
  const native = backend(); const value = owner(native); await value.open();
  for (const input of [{ ...payload(), canonical: payload().canonical + ' ' }, { ...payload(), revision: 'catalog-00000000-1' }, { ...payload(), catalog: { schemaVersion: 2, books: [] } }]) {
    const result = await value.save(input); assert.equal(result.status, 'blocked'); assert.equal(native.calls.filter(call => call[0] === 'write').length, 0); await value.open();
  }
  const exhaustedNative = backend([record(Number.MAX_SAFE_INTEGER, payload()), null]); const exhausted = owner(exhaustedNative); await exhausted.open();
  assert.equal((await exhausted.save(payload('new'))).errorCode, 'SEQUENCE_EXHAUSTED'); assert.equal(exhaustedNative.calls.filter(call => call[0] === 'write').length, 0);
  const oversize = owner(backend([record(1, payload()), 'x'.repeat(32769)])); assert.equal((await oversize.open()).status, 'blocked');
});
test('busy saves cannot return a successful receipt and cannot race or generate duplicate commits', async () => {
  const native = backend(); const value = owner(native); await value.open(); let release; const hold = new Promise(resolve => { release = resolve; }); const write = native.write;
  native.write = async (...args) => { await hold; return write(...args); };
  const first = value.save(payload()); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  const second = await value.save(payload()); assert.equal(second.status, 'blocked'); assert.equal(second.errorCode, 'BUSY'); assert.equal(value.snapshot().busy, true);
  release(); const result = await first; assert.equal(result.sequence, 1); assert.equal(native.calls.filter(call => call[0] === 'write').length, 1);
});
test('snapshot and subscriber values are detached, and subscriber failure cannot alter confirmed save', async () => {
  const native = backend(); const value = owner(native); value.subscribe(snapshot => { if (snapshot.catalog) snapshot.catalog.books[0].title = 'malicious view'; throw new Error('view'); });
  const seen = []; value.subscribe(snapshot => { if (snapshot.catalog) seen.push(snapshot.catalog.books[0].title); }); await value.open(); const result = await value.save(payload());
  assert.equal(result.catalog.books[0].title, '书籍一'); assert.ok(seen.every(title => title === '书籍一'));
  const snapshot = value.snapshot(); snapshot.catalog.books.length = 0; assert.equal(value.snapshot().catalog.books.length, 1);
});
test('caller mutation during IO cannot alter the frozen catalog transaction', async () => {
  const native = backend(); const value = owner(native); await value.open(); const input = payload(); let release; const hold = new Promise(resolve => { release = resolve; }); const read = native.read;
  native.read = async index => { await hold; return read(index); }; const saving = value.save(input); input.catalog.books[0].title = 'changed during save'; release();
  const result = await saving; assert.equal(result.catalog.books[0].title, '书籍一'); assert.equal(native.slots[0], record(1, payload()));
});
test('close retires the backend and suppresses publication or acknowledgement from late IO', async () => {
  const native = backend(); const value = owner(native); await value.open(); let release; const hold = new Promise(resolve => { release = resolve; }); const read = native.read;
  native.read = async index => { await hold; return read(index); }; let notices = 0; value.subscribe(() => { notices++; }); const pending = value.save(payload());
  value.close(); const afterClose = notices; release(); const result = await pending; assert.equal(result.status, 'closed'); assert.equal(notices, afterClose); assert.equal(native.closed(), true);
  assert.equal(native.calls.filter(call => call[0] === 'write').length, 0); assert.equal((await value.open()).status, 'closed');
});
test('a subscriber that retires the owner during its busy notification cannot create a late backend', async () => {
  let factories = 0; const native = backend(); const value = load().createCatalogOwner({ backendFactory: () => { factories++; return native; } });
  value.subscribe(snapshot => { if (snapshot.busy) value.close(); });
  assert.equal((await value.open()).status, 'closed'); assert.equal(factories, 0); assert.equal(native.calls.length, 0);
});
test('retired owner snapshot remains stable when a late native read rejects', async () => {
  const native = backend(); let reject; native.read = () => new Promise((resolve, fail) => { reject = fail; });
  const value = owner(native); const pending = value.open(); await Promise.resolve(); value.close(); const closed = value.snapshot();
  reject(ioError('TIMEOUT')); await pending; assert.deepEqual(value.snapshot(), closed);
});
test('real receiver ACK follows catalog owner durability and repeat complete transfer performs no write', async () => {
  const native = backend([record(1, payload()), null]); const value = owner(native); await value.open();
  const request = { protocolVersion: 3, type: 'GET_CATALOG', clientInstanceId: 'client', requestId: 'request', streamId: 'stream', knownRevision: null };
  const incoming = payload('来自手机的新书'); const frames = protocol.buildTransfer(request, incoming.catalog).frames;
  const receiver = protocol.createCatalogReceiver({ now: () => 1000, persist: data => value.save(data) }); receiver.begin(request);
  let ack; for (const frame of frames) ack = await receiver.receive(frame);
  assert.equal(ack.code, 'PERSISTED'); assert.equal(value.snapshot().sequence, 2); assert.equal(native.slots[0], record(1, payload()));
  const writes = native.calls.filter(call => call[0] === 'write').length; receiver.begin({ ...request, requestId: 'again' });
  for (const frame of frames) ack = await receiver.receive({ ...frame, requestId: 'again' });
  assert.equal(ack.code, 'PERSISTED'); assert.equal(value.snapshot().sequence, 2); assert.equal(native.calls.filter(call => call[0] === 'write').length, writes);
});
test('incomplete or failed received replacement keeps last complete directory and bytes for offline recovery', async () => {
  const previous = record(1, payload()); const native = backend([previous, null]); const value = owner(native); await value.open();
  const request = { protocolVersion: 3, type: 'GET_CATALOG', clientInstanceId: 'client', requestId: 'request', streamId: 'stream', knownRevision: null };
  const frames = protocol.buildTransfer(request, payload('新目录').catalog).frames;
  const receiver = protocol.createCatalogReceiver({ now: () => 1000, persist: data => value.save(data) }); receiver.begin(request);
  assert.equal(await receiver.receive(frames[0]), null); receiver.cancel(); assert.equal(native.slots[0], previous); assert.equal(native.slots[1], null);
  native.write = async (slot, raw) => { native.slots[slot] = raw.slice(0, 40); throw ioError('WRITE_DENIED'); };
  receiver.begin(request); let result; for (const frame of frames) result = await receiver.receive(frame);
  assert.equal(result.code, 'PERSIST_FAILED'); assert.equal(value.snapshot().canonical, payload().canonical); assert.equal(native.slots[0], previous);
  const reopened = owner(native); const recovered = await reopened.open(); assert.equal(recovered.status, 'recovered'); assert.equal(recovered.canonical, payload().canonical);
});

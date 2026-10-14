const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createFormalLocalRuntime } = require('../src/lib/formal-local-runtime');
const { createRecordSync } = require('../src/lib/record-sync');
const model = require('../src/lib/record-model'), catalog = require('../src/lib/catalog-protocol');
const hash = raw => crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
test('actual formal file owner, bounded sender and strict synthetic phone commit replay eight then recover ninth and backup rollback', async () => {
  const files = new Map(), db = new Map(), timers = new Map(); let wall = 1000, id = 0, sync, incoming, drop = true, commits = 0;
  const loadModule = name => name === '@system.crypto' ? { hashDigest: q => hash(q.data) } : {
    readText(q) { files.has(q.uri) ? q.success({ text: files.get(q.uri) }) : q.fail(null, 301); },
    writeText(q) { files.set(q.uri, q.text); q.success(); }
  };
  const options = { loadModule, clock: () => ({ wallMs: wall, ownerId: 'o', monotonicMs: null, monotonicVerified: false }), installationIdFactory: () => 'e2e-install' };
  const runtime = createFormalLocalRuntime(options); await runtime.owner.open(); await runtime.catalogOwner.open();
  const books = { schemaVersion: 1, books: [{ id: 'real-book', title: '真实目录样本📖', totalPages: 100, currentPage: 1, firstAction: null, isMainline: true }] };
  const canonical = catalog.canonicalCatalog(books); await runtime.catalogOwner.save({ catalog: books, canonical, revision: catalog.revisionFor(canonical) });
  for (let n = 0; n < 8; n++) {
    const start = await runtime.owner.dispatch({ type: 'START_CONFIRMED', bookId: 'real-book', firstActionId: 'preset-read', confirmed: true, catalogRevision: catalog.revisionFor(canonical) });
    assert.equal(start.document.active.ordinal, n + 1); wall += 1000; await runtime.owner.dispatch({ type: 'FINISH', endPage: n === 7 ? 20 : null });
  }
  assert.equal(runtime.owner.snapshot().pendingCount, 8);
  const reply = (type, code) => { const m = { ...incoming.offer, type, code }; delete m.schemaVersion; delete m.partCount; sync.handle(m); };
  sync = createRecordSync({ listRecords: runtime.getRecords, hash: raw => runtime.digest.sha256(raw), acknowledge: runtime.owner.acknowledgeCompleted,
    now: () => wall, randomId: () => 'r-' + (++id), setTimeout: fn => { const key = ++id; timers.set(key, () => { timers.delete(key); fn(); }); return key; }, clearTimeout: key => timers.delete(key),
    send(raw) { const m = JSON.parse(raw);
      if (m.type === 'LOCAL_RECORD_OFFER') { incoming = { offer: m, parts: [] }; reply('LOCAL_RECORD_NEED', 'NEED'); }
      else if (m.type === 'LOCAL_RECORD_PART') incoming.parts[m.index] = m.data;
      else if (m.type === 'LOCAL_RECORD_COMMIT') {
        const raw = incoming.parts.join(''), value = model.parseCanonical(raw); assert.equal(hash(raw), m.recordDigest);
        assert.equal(Buffer.byteLength(raw), m.totalBytes); const key = value.session.id, old = db.get(key);
        if (old) assert.equal(old, raw); else { db.set(key, raw); commits++; }
        if (drop) drop = false; else reply('LOCAL_RECORD_ACK', old ? 'ALREADY_IMPORTED' : 'IMPORTED');
      }
      return true;
    } });
  const flush = async () => { for (let n = 0; n < 24; n++) await new Promise(resolve => setImmediate(resolve)); };
  const ctx = { protocolVersion: 4, clientInstanceId: 'c', streamId: 's' };
  sync.connected(ctx, true); await flush(); assert.equal(db.size, 1); assert.equal(runtime.owner.snapshot().pendingCount, 8);
  wall += 30001; for (const fn of [...timers.values()]) fn(); await flush(); wall += 2000; for (const fn of [...timers.values()]) fn(); await flush();
  assert.equal(db.size, 8); assert.equal(commits, 8); assert.equal(runtime.owner.snapshot().pendingCount, 0);
  assert.equal(runtime.archive.snapshot().sealed, true); assert.equal(runtime.archive.records().length, 8);
  assert.equal(runtime.getBooks()[0].pendingPage, 20); assert.equal(runtime.getBooks()[0].currentPage, 1);
  db.clear(); sync.connected({ ...ctx, streamId: 'after-phone-backup' }, true); await flush();
  assert.equal(db.size, 8); assert.equal(commits, 16); assert.equal(runtime.archive.records().length, 8);
  sync.disconnected(); runtime.close();
  const restored = createFormalLocalRuntime(options); await restored.owner.open(); await restored.catalogOwner.open();
  assert.equal(restored.owner.snapshot().retainedRecords.length, 8);
  const ninth = await restored.owner.dispatch({ type: 'START_CONFIRMED', bookId: 'real-book', firstActionId: 'preset-read', confirmed: true, catalogRevision: catalog.revisionFor(canonical) });
  assert.equal(ninth.document.active.id, 'e2e-install:9'); assert.equal(ninth.document.active.bookSnapshot.startPage, 20); restored.close();
});

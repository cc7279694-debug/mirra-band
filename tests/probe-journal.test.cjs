const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { encodeRecord, decodeRecord, createJournal } = require('../src/lib/probe-journal');

const first = () => ({ label: '持久化实验 📖', createdAtUnixMs: 1000, records: [{ id: 'sample-1', text: '实验数据，不是学习记录。' }] });
const second = () => ({ label: '更新', createdAtUnixMs: 2000, records: [{ id: 'sample-2', text: '第二次保存' }] });
function memory(initial = [null, null], hooks = {}) {
  const slots = initial.slice(); const writes = [];
  return {
    slots, writes,
    async read(slot) { return hooks.read ? hooks.read(slot, slots) : slots[slot]; },
    async write(slot, raw) {
      writes.push(slot);
      if (hooks.write) await hooks.write(slot, raw, slots);
      else slots[slot] = raw;
    }
  };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const empty = { status: 'empty', sequence: 0, payload: null, slot: null };

// These cases catch missing data validation, corruption admission and unsafe writes.
test('canonical envelope round trips exact Chinese and emoji without trimming', () => {
  const raw = encodeRecord(1, first());
  assert.match(raw, /^\{"schemaVersion":1,"marker":"MIRRA_05A_TEST","sequence":1,"payload":/);
  assert.match(raw, /,"checksum":"[0-9a-f]{8}"\}$/);
  assert.deepEqual(decodeRecord(raw), { sequence: 1, payload: first() });
});
test('CRC rejects a changed payload without changing the checksum', () => {
  const raw = encodeRecord(1, first()).replace('实验数据', '真实数据');
  assert.throws(() => decodeRecord(raw), /CHECKSUM/);
});
test('CRC32 matches the independent zlib UTF8 fixture for Chinese and emoji', () => {
  // Digest established independently with node:zlib.crc32 over UTF8 bytes.
  const payload = { label: 'CRC 📖', createdAtUnixMs: 1, records: [{ id: '1', text: '中文' }] };
  const raw = '{"schemaVersion":1,"marker":"MIRRA_05A_TEST","sequence":1,"payload":{"label":"CRC 📖","createdAtUnixMs":1,"records":[{"id":"1","text":"中文"}]},"checksum":"8ff022b2"}';
  assert.equal(encodeRecord(1, payload), raw);
  assert.deepEqual(decodeRecord(raw), { sequence: 1, payload });
});
test('payload key order canonicalizes while text and array order remain exact', () => {
  const input = { records: [{ text: '  原文\n📚 ', id: 'ASCII~!' }], createdAtUnixMs: 123, label: ' ' };
  const raw = encodeRecord(3, input);
  assert.deepEqual(decodeRecord(raw), { sequence: 3, payload: { label: ' ', createdAtUnixMs: 123, records: [{ id: 'ASCII~!', text: '  原文\n📚 ' }] } });
  assert.equal(raw, encodeRecord(3, { label: ' ', createdAtUnixMs: 123, records: [{ id: 'ASCII~!', text: '  原文\n📚 ' }] }));
});
test('only exact allowed payload and record fields are accepted', () => {
  assert.throws(() => encodeRecord(1, { ...first(), sessionId: 'foreign' }), /FIELD/);
  assert.throws(() => encodeRecord(1, { ...first(), records: [{ id: 'x', text: 'x', unknown: true }] }), /FIELD/);
  const p = first(); delete p.label; assert.throws(() => encodeRecord(1, p), /FIELD/);
});
test('sequence and created time cannot admit zero fractional unsafe or coerced numbers', () => {
  for (const value of [0, -1, 1.1, NaN, Infinity, 9007199254740992, '1', null]) {
    assert.throws(() => encodeRecord(value, first()), /SEQUENCE/);
    assert.throws(() => encodeRecord(1, { ...first(), createdAtUnixMs: value }), /TIME/);
  }
  assert.equal(decodeRecord(encodeRecord(9007199254740991, first())).sequence, 9007199254740991);
});
test('code point limits preserve complete surrogate pairs at the boundary', () => {
  const valid = { label: '📖'.repeat(48), createdAtUnixMs: 1, records: [{ id: 'a', text: '📚'.repeat(128) }] };
  assert.deepEqual(decodeRecord(encodeRecord(1, valid)).payload, valid);
  assert.throws(() => encodeRecord(1, { ...valid, label: '📖'.repeat(49) }), /TEXT/);
  assert.throws(() => encodeRecord(1, { ...valid, records: [{ id: 'a', text: '📚'.repeat(129) }] }), /TEXT/);
  for (const malformed of ['\ud800', '\udc00', '\ud800a']) {
    assert.throws(() => encodeRecord(1, { ...valid, label: malformed }), /UNICODE/);
    assert.throws(() => encodeRecord(1, { ...valid, records: [{ id: 'a', text: malformed }] }), /UNICODE/);
  }
});
test('record identifiers must be unique printable ASCII within 32 characters', () => {
  for (const id of ['', 'x'.repeat(33), '中文', 'a b', 'a\n', '\u007f']) {
    assert.throws(() => encodeRecord(1, { ...first(), records: [{ id, text: 'x' }] }), /ID/);
  }
  assert.throws(() => encodeRecord(1, { ...first(), records: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }] }), /DUPLICATE_ID/);
});
test('record limit and UTF8 envelope budget reject oversized writes', () => {
  assert.throws(() => encodeRecord(1, { ...first(), records: Array.from({ length: 33 }, (_, i) => ({ id: String(i), text: '' })) }), /RECORDS/);
  assert.throws(() => encodeRecord(1, { ...first(), records: Array.from({ length: 32 }, (_, i) => ({ id: String(i), text: '📚'.repeat(128) })) }), /SIZE/);
  assert.throws(() => decodeRecord(' '.repeat(8193)), /SIZE/);
});
test('sparse arrays cannot encode null records that fail only after persistence', async () => {
  const sparse = new Array(1);
  assert.throws(() => encodeRecord(1, { ...first(), records: sparse }), /RECORDS/);
  const backend = memory();
  assert.equal((await createJournal({ backend }).save({ ...first(), records: sparse })).reason, 'RECORDS');
  assert.deepEqual(backend.writes, []);
});
test('raw parsing rejects invalid JSON duplicates prototype keys and noncanonical data', () => {
  assert.throws(() => decodeRecord(''), /JSON/);
  assert.throws(() => decodeRecord('{'), /JSON/);
  const raw = encodeRecord(1, first());
  assert.throws(() => decodeRecord(raw.replace('"sequence":1', '"sequence":2,"sequence":1')), /CANONICAL/);
  assert.throws(() => decodeRecord(raw.replace('"payload":', '"__proto__":{},"payload":')), /FIELD/);
  assert.throws(() => decodeRecord(' ' + raw), /CANONICAL/);
});
test('future schema and foreign marker do not decode as current experiment records', () => {
  const raw = encodeRecord(1, first());
  assert.throws(() => decodeRecord(raw.replace('"schemaVersion":1', '"schemaVersion":2')), /SCHEMA/);
  assert.throws(() => decodeRecord(raw.replace('MIRRA_05A_TEST', 'FOREIGN_DATA')), /MARKER/);
});
test('only two null slots recover as empty and save establishes sequence one', async () => {
  const backend = memory(); const journal = createJournal({ backend });
  assert.deepEqual(await journal.recover(), empty);
  assert.deepEqual(await journal.save(first()), { status: 'ready', sequence: 1, payload: first(), slot: 0 });
  assert.equal(decodeRecord(backend.slots[0]).sequence, 1);
  assert.equal(backend.slots[1], null);
});
test('saving alternates slots without changing the last valid slot', async () => {
  const backend = memory(); const journal = createJournal({ backend });
  await journal.save(first()); const old = backend.slots[0];
  assert.deepEqual(await journal.save(second()), { status: 'ready', sequence: 2, payload: second(), slot: 1 });
  assert.equal(backend.slots[0], old);
  await journal.save(first());
  assert.equal(decodeRecord(backend.slots[0]).sequence, 3);
  assert.equal(decodeRecord(backend.slots[1]).sequence, 2);
});
test('recreated journal chooses highest sequence independently of wall clock rollback', async () => {
  const backend = memory([encodeRecord(9, first()), encodeRecord(10, second())]);
  assert.deepEqual(await createJournal({ backend, now: () => 1 }).recover(), { status: 'ready', sequence: 10, payload: second(), slot: 1 });
});
test('one valid slot recovers beside a truncated write without losing the old payload', async () => {
  const backend = memory([encodeRecord(4, first()), '{"schemaVersion":1']);
  const result = await createJournal({ backend }).recover();
  assert.equal(result.status, 'recovered'); assert.equal(result.reason, 'CORRUPT_SLOT');
  assert.equal(result.sequence, 4); assert.equal(result.slot, 0); assert.deepEqual(result.payload, first());
});
test('a checksum damaged newest slot falls back to a valid older slot', async () => {
  const bad = encodeRecord(5, second()).replace('第二次保存', '损坏');
  const result = await createJournal({ backend: memory([encodeRecord(4, first()), bad]) }).recover();
  assert.equal(result.status, 'recovered'); assert.equal(result.sequence, 4); assert.deepEqual(result.payload, first());
});
test('two corrupt slots are blocked rather than silently returning empty', async () => {
  const backend = memory(['bad', '{']); const journal = createJournal({ backend });
  const result = await journal.recover();
  assert.equal(result.status, 'blocked'); assert.equal(result.reason, 'CORRUPT_SLOTS');
  assert.equal((await journal.save(first())).status, 'blocked'); assert.deepEqual(backend.writes, []);
});
test('one missing and one corrupt slot is blocked rather than silently returning empty', async () => {
  const result = await createJournal({ backend: memory([null, '']) }).recover();
  assert.equal(result.status, 'blocked'); assert.equal(result.reason, 'CORRUPT_SLOTS');
});
test('read failure never permits a write even when the other slot is valid', async () => {
  const backend = memory([encodeRecord(1, first()), null], { read: async (slot, slots) => { if (slot === 1) throw new Error('IO'); return slots[slot]; } });
  const journal = createJournal({ backend });
  assert.equal((await journal.recover()).reason, 'READ_FAILED');
  assert.equal((await journal.save(second())).status, 'blocked'); assert.deepEqual(backend.writes, []);
});
test('unknown schema or fields alongside an older valid slot block all writes', async () => {
  const raw = encodeRecord(2, second());
  for (const unknown of [raw.replace('"schemaVersion":1', '"schemaVersion":2'), raw.replace('"marker":"MIRRA_05A_TEST"', '"marker":"OTHER"'), raw.replace('"sequence":2', '"foreign":1,"sequence":2')]) {
    const backend = memory([encodeRecord(1, first()), unknown]); const journal = createJournal({ backend });
    assert.equal((await journal.recover()).status, 'blocked');
    assert.equal((await journal.save(first())).status, 'blocked'); assert.deepEqual(backend.writes, []);
  }
});
test('nonstring backend data is blocked rather than treated as a missing slot', async () => {
  const result = await createJournal({ backend: memory([null, false]) }).recover();
  assert.equal(result.status, 'blocked'); assert.equal(result.reason, 'BACKEND_VALUE');
});
test('equal sequence with different valid payloads is ambiguous and cannot be overwritten', async () => {
  const backend = memory([encodeRecord(2, first()), encodeRecord(2, second())]); const journal = createJournal({ backend });
  assert.equal((await journal.recover()).reason, 'AMBIGUOUS_SEQUENCE');
  assert.equal((await journal.save(first())).status, 'blocked'); assert.deepEqual(backend.writes, []);
});
test('duplicate identical valid slots recover deterministically without ambiguity', async () => {
  const raw = encodeRecord(2, first());
  assert.deepEqual(await createJournal({ backend: memory([raw, raw]) }).recover(), { status: 'ready', sequence: 2, payload: first(), slot: 0 });
});
test('partial write failure preserves the valid slot and requires explicit recovery', async () => {
  const backend = memory([encodeRecord(1, first()), null], { write: async (slot, raw, slots) => { slots[slot] = raw.slice(0, 30); throw new Error('IO'); } });
  const journal = createJournal({ backend }); const old = backend.slots[0];
  assert.equal((await journal.save(second())).reason, 'WRITE_FAILED'); assert.equal(backend.slots[0], old);
  assert.equal((await journal.save(second())).reason, 'RECOVERY_REQUIRED'); assert.deepEqual(backend.writes, [1]);
  const recovered = await journal.recover(); assert.equal(recovered.status, 'recovered'); assert.equal(recovered.sequence, 1);
});
test('failure after a complete write reports unknown persistence until recovered', async () => {
  const backend = memory([encodeRecord(1, first()), null], { write: async (slot, raw, slots) => { slots[slot] = raw; throw new Error('after'); } });
  const journal = createJournal({ backend });
  assert.equal((await journal.save(second())).status, 'blocked');
  assert.equal((await journal.save(first())).reason, 'RECOVERY_REQUIRED');
  assert.deepEqual(await journal.recover(), { status: 'ready', sequence: 2, payload: second(), slot: 1 });
});
test('write readback must equal the exact attempted record before save reports ready', async () => {
  const backend = memory([encodeRecord(1, first()), null], { write: async (slot, raw, slots) => { slots[slot] = encodeRecord(2, first()); } });
  const result = await createJournal({ backend }).save(second());
  assert.equal(result.status, 'blocked'); assert.equal(result.reason, 'READBACK_MISMATCH');
  assert.deepEqual(decodeRecord(backend.slots[0]).payload, first());
});
test('readback failure is blocked and does not treat write acknowledgement as durability', async () => {
  let written = false;
  const backend = memory([encodeRecord(1, first()), null], {
    write: async (slot, raw, slots) => { slots[slot] = raw; written = true; },
    read: async (slot, slots) => { if (written && slot === 1) throw new Error('IO'); return slots[slot]; }
  });
  const result = await createJournal({ backend }).save(second());
  assert.equal(result.status, 'blocked'); assert.equal(result.reason, 'READBACK_FAILED');
});
test('sequence exhaustion is blocked with no wraparound or write', async () => {
  const backend = memory([encodeRecord(9007199254740991, first()), null]);
  assert.equal((await createJournal({ backend }).save(second())).reason, 'SEQUENCE_EXHAUSTED');
  assert.deepEqual(backend.writes, []);
});
test('save re-reads the backend and rejects corruption introduced after prior recovery', async () => {
  const backend = memory([encodeRecord(1, first()), null]); const journal = createJournal({ backend });
  await journal.recover(); backend.slots[0] = 'corrupt';
  assert.equal((await journal.save(second())).status, 'blocked'); assert.deepEqual(backend.writes, []);
});
test('concurrent save cannot write a second slot or invalidate the in-flight save', async () => {
  const gate = deferred(); const entered = deferred();
  const backend = memory([encodeRecord(1, first()), null], { write: async (slot, raw, slots) => { entered.resolve(); await gate.promise; slots[slot] = raw; } });
  const journal = createJournal({ backend }); const pending = journal.save(second()); await entered.promise;
  assert.equal((await journal.save(first())).reason, 'BUSY');
  assert.equal((await journal.recover()).reason, 'BUSY');
  gate.resolve(); assert.equal((await pending).status, 'ready'); assert.deepEqual(backend.writes, [1]);
});
test('save captures an independent validated payload before an asynchronous write', async () => {
  const gate = deferred(); const entered = deferred(); const p = second();
  const backend = memory([encodeRecord(1, first()), null], { write: async (slot, raw, slots) => { entered.resolve(); await gate.promise; slots[slot] = raw; } });
  const journal = createJournal({ backend }); const pending = journal.save(p); await entered.promise;
  p.label = 'changed'; p.records[0].text = 'changed'; gate.resolve();
  const result = await pending; assert.deepEqual(result.payload, second());
  result.payload.records[0].text = 'outside mutation';
  assert.deepEqual(decodeRecord(backend.slots[1]).payload, second());
});
test('invalid save input never writes or blocks a later valid save', async () => {
  const backend = memory(); const journal = createJournal({ backend });
  assert.equal((await journal.save({ ...first(), unknown: true })).reason, 'FIELD');
  assert.deepEqual(backend.writes, []); assert.equal((await journal.save(first())).status, 'ready');
});
test('real isolated files survive recreation and interrupted next-slot write', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mirra-05a-journal-'));
  const safeRoot = path.resolve(root); const tempRoot = path.resolve(os.tmpdir());
  const location = slot => path.join(safeRoot, 'slot-' + slot + '.json');
  const backend = {
    async read(slot) { try { return await fs.readFile(location(slot), 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } },
    async write(slot, raw) { await fs.writeFile(location(slot), raw, 'utf8'); }
  };
  try {
    const saved = await createJournal({ backend }).save(first()); assert.equal(saved.status, 'ready');
    assert.deepEqual((await createJournal({ backend }).recover()).payload, first());
    await fs.writeFile(location(1), '{"interrupted":', 'utf8');
    const recovered = await createJournal({ backend }).recover(); assert.equal(recovered.status, 'recovered'); assert.deepEqual(recovered.payload, first());
  } finally {
    assert.ok(safeRoot.startsWith(tempRoot + path.sep));
    assert.ok(path.basename(safeRoot).startsWith('mirra-05a-journal-'));
    for (const slot of [0, 1]) {
      try { await fs.unlink(location(slot)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    // Nonrecursive removal fails safely if any unexpected file exists.
    await fs.rmdir(safeRoot);
  }
});

const test = require('node:test'); const assert = require('node:assert/strict');
const crypto = require('node:crypto'); const fixture = require('../protocol/v4/fixtures/record-v4.json');
const { canonicalRecord } = require('../src/lib/record-model');
function rig() {
  const { createRecordSync } = require('../src/lib/record-sync');
  let time = 1000, id = 0, records = [fixture.record], allow = true, blocked = false, readBusy = false, ackBusy = false, viewThrows = false;
  const timers = new Map(), sent = [], receipts = [], events = [];
  const sync = createRecordSync({ listRecords: async () => { if (readBusy) throw new Error('BUSY'); return records; }, hash: raw => crypto.createHash('sha256').update(raw).digest('hex'),
    acknowledge: async value => { if (blocked) throw new Error('LOCAL_FAILED'); if (ackBusy) return { confirmed: false, errorCode: 'BUSY' }; receipts.push(value); return { confirmed: true }; },
    send: raw => { sent.push(JSON.parse(raw)); return allow; }, now: () => time,
    randomId: () => 'req-' + (++id), setTimeout: fn => { const token = ++id; timers.set(token, () => { timers.delete(token); fn(); }); return token; }, clearTimeout: n => timers.delete(n),
    notify: view => { if (viewThrows) throw new Error('VIEW_SETTER_FAILED'); events.push(view); } });
  const flush = async () => { for (let n = 0; n < 8; n++) await new Promise(resolve => setImmediate(resolve)); };
  const reply = (type, code) => { const offer = sent.findLast(x => x.type === 'LOCAL_RECORD_OFFER');
    const value = { ...offer, type }; delete value.schemaVersion; delete value.partCount; if (code) value.code = code;
    sync.handle(value); return value; };
  return { sync, sent, timers, receipts, events, flush, reply,
    connect: () => sync.connected({ protocolVersion: 4, clientInstanceId: 'c', streamId: 's' }, true),
    records: value => records = value, blocked: value => blocked = value, allow: value => allow = value,
    readBusy: value => readBusy = value, ackBusy: value => ackBusy = value,
    viewThrows: value => viewThrows = value,
    advance: n => { time += n; for (const fn of [...timers.values()]) fn(); } };
}
test('offer requires NEED then complete bytes; only exact ACK and local durable receipt confirms', async () => {
  const r = rig(); r.connect(); await r.flush(); assert.equal(r.sent.length, 1);
  r.reply('LOCAL_RECORD_ACK', 'IMPORTED'); await r.flush(); assert.equal(r.receipts.length, 0);
  r.reply('LOCAL_RECORD_NEED', 'NEED'); await r.flush(); assert.equal(r.sent.at(-1).type, 'LOCAL_RECORD_COMMIT');
  assert.equal(r.sent.filter(x => x.type === 'LOCAL_RECORD_PART').map(x => x.data).join(''), canonicalRecord(fixture.record));
  const ack = r.reply('LOCAL_RECORD_ACK', 'IMPORTED'); await r.flush(); assert.equal(r.receipts.length, 1);
  assert.equal(r.sync.snapshot().confirmedCount, 1); r.sync.handle(ack); await r.flush(); assert.equal(r.receipts.length, 1);
});
test('throwing native view cannot abort transfer or turn a persisted confirmation into failure', async () => {
  const r = rig(); r.viewThrows(true); assert.doesNotThrow(() => r.connect()); await r.flush();
  assert.equal(r.sent.length, 1); r.reply('LOCAL_RECORD_NEED', 'NEED'); await r.flush();
  r.reply('LOCAL_RECORD_ACK', 'IMPORTED'); await r.flush(); assert.equal(r.receipts.length, 1);
  assert.equal(r.sync.snapshot().confirmedCount, 1); assert.equal(r.sync.snapshot().status, 'idle');
});
test('owner transient BUSY during HELLO or ACK recovers without false confirmation and never polls forever', async () => {
  const r = rig(); r.readBusy(true); r.connect(); await r.flush(); assert.equal(r.sync.snapshot().status, 'waiting');
  r.readBusy(false); r.advance(2000); await r.flush(); assert.equal(r.sent.length, 1);
  r.reply('LOCAL_RECORD_NEED', 'NEED'); await r.flush(); r.ackBusy(true); r.reply('LOCAL_RECORD_ACK', 'IMPORTED'); await r.flush();
  assert.equal(r.receipts.length, 0); assert.equal(r.sync.snapshot().confirmedCount, 0);
  r.ackBusy(false); r.advance(2000); await r.flush(); assert.equal(r.sent.filter(x => x.type === 'LOCAL_RECORD_OFFER').length, 2);
  r.reply('LOCAL_RECORD_NEED', 'NEED'); await r.flush(); r.reply('LOCAL_RECORD_ACK', 'ALREADY_IMPORTED'); await r.flush();
  assert.equal(r.receipts.length, 1);
  const stuck = rig(); stuck.readBusy(true); stuck.connect(); await stuck.flush();
  for (let n = 0; n < 4; n++) { stuck.advance(5000); await stuck.flush(); }
  assert.equal(stuck.timers.size, 0); assert.equal(stuck.sent.length, 0);
});
test('wrong digest, bytes, ID, request and stream never bind late ACK; stop cancels retry', async () => {
  const r = rig(); r.connect(); await r.flush(); r.reply('LOCAL_RECORD_NEED', 'NEED'); await r.flush();
  const offer = r.sent[0], ack = { ...offer, type: 'LOCAL_RECORD_ACK', code: 'IMPORTED' }; delete ack.schemaVersion; delete ack.partCount;
  for (const patch of [{ recordDigest: 'b'.repeat(64) }, { totalBytes: offer.totalBytes + 1 }, { localSessionId: 'install-a:2' }, { requestId: 'old' }, { streamId: 'old' }]) r.sync.handle({ ...ack, ...patch });
  await r.flush(); assert.equal(r.receipts.length, 0); r.sync.disconnected(); r.sync.handle(ack); await r.flush();
  assert.equal(r.receipts.length, 0); assert.equal(r.timers.size, 0);
});
test('lost ACK reuploads exact raw, bounded attempts then waits; new HELLO replays archives', async () => {
  const r = rig(); r.connect(); await r.flush();
  for (let n = 0; n < 3; n++) { r.reply('LOCAL_RECORD_NEED', 'NEED'); await r.flush(); r.advance(30001); await r.flush(); r.advance(10000); await r.flush(); }
  assert.equal(r.sent.filter(x => x.type === 'LOCAL_RECORD_OFFER').length, 3); assert.equal(r.timers.size, 0);
  r.sync.nudge(); await r.flush(); assert.equal(r.sync.snapshot().status, 'waiting'); assert.equal(r.sync.snapshot().errorCode, 'TIMEOUT');
  r.connect(); await r.flush(); assert.equal(r.sent.filter(x => x.type === 'LOCAL_RECORD_OFFER').length, 4);
});
test('local receipt failure and content conflict do not discard records or falsely report sync', async () => {
  for (const localFailure of [true, false]) {
    const r = rig(); r.blocked(localFailure); r.connect(); await r.flush(); r.reply('LOCAL_RECORD_NEED', 'NEED'); await r.flush();
    r.reply(localFailure ? 'LOCAL_RECORD_ACK' : 'LOCAL_RECORD_ERROR', localFailure ? 'IMPORTED' : 'CONFLICT'); await r.flush();
    assert.equal(r.sync.snapshot().confirmedCount, 0); assert.equal(r.timers.size, 0);
    assert.equal(r.sync.snapshot().status, 'blocked');
  }
});
test('new finish nudge drains once, capacity is bounded and unsupported digest never sends', async () => {
  const r = rig(); r.records([]); r.connect(); await r.flush(); assert.equal(r.sent.length, 0);
  r.records([fixture.record]); r.sync.nudge(); r.sync.nudge(); await r.flush(); assert.equal(r.sent.length, 1);
  r.reply('LOCAL_RECORD_NEED', 'NEED'); await r.flush(); r.reply('LOCAL_RECORD_ACK', 'ALREADY_IMPORTED'); await r.flush();
  r.sync.nudge(); await r.flush(); assert.equal(r.sent.filter(x => x.type === 'LOCAL_RECORD_OFFER').length, 1);
  const bad = rig(); bad.records(Array.from({ length: 73 }, () => fixture.record)); bad.connect(); await bad.flush();
  assert.equal(bad.sent.length, 0); assert.equal(bad.sync.snapshot().status, 'blocked');
});

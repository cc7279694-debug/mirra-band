const assert = require('node:assert/strict');
const { createLocalOwner } = require('../../src/lib/local-owner');
const { createDocument, TEST_BOOKS } = require('../../src/lib/local-session');
const { encodeRecord } = require('../../src/lib/local-codec');

function rig(options = {}) {
  const slots = options.slots || [null, null];
  const writes = []; const commands = [];
  let wallMs = 100000; let identities = 0; let closes = 0;
  let failureAt = null; let failureCode = null; let uncertain = false;
  let holdAt = null; let readbackSlot = null; let release = null;
  const backend = {
    async read(slot) {
      if (slot === readbackSlot) return new Promise(resolve => {
        release = () => { readbackSlot = null; release = null; resolve(slots[slot]); };
      });
      return slots[slot];
    },
    async write(slot, text) {
      writes.push({ slot, text });
      if (writes.length === failureAt) {
        if (failureCode === 'TIMEOUT') uncertain = true;
        throw Object.assign(new Error('private failure'), { code: failureCode });
      }
      slots[slot] = text;
      if (writes.length === holdAt) readbackSlot = slot;
    },
    describe: () => ({ uncertain, closed: false }),
    close() { closes++; }
  };
  const realOwner = createLocalOwner({ backendFactory: () => backend,
    storageQualified: options.storageQualified !== false,
    clock: () => ({ wallMs, ownerId: 'ui-owner', monotonicMs: null, monotonicVerified: false }),
    installationIdFactory: () => { identities++; return 'ui-installation'; } });
  const owner = {
    open: () => realOwner.open(), snapshot: () => realOwner.snapshot(),
    subscribe: listener => realOwner.subscribe(listener), close: () => realOwner.close(),
    async dispatch(action) { commands.push(JSON.parse(JSON.stringify(action))); return realOwner.dispatch(action); }
  };
  return { owner, realOwner, slots, writes, commands,
    next: (ms = 1000) => { wallMs += ms; }, identities: () => identities, closes: () => closes,
    failAt: (index, code = 'NATIVE_WRITE_FAILED') => { failureAt = index; failureCode = code; },
    holdAt: index => { holdAt = index; }, release: () => { assert.ok(release, 'expected held native readback'); release(); },
    async untilHeld() { for (let n = 0; n < 200 && !release; n++) await Promise.resolve(); assert.ok(release, 'native readback must be held'); }
  };
}
async function prepare(r, { bookId = TEST_BOOKS[0].id, actionId = 'read-first-paragraph', action = true } = {}) {
  await r.owner.open(); await r.owner.dispatch({ type: 'SELECT_BOOK', bookId });
  if (action) await r.owner.dispatch({ type: 'SELECT_ACTION', firstActionId: actionId });
}
async function start(r) { await prepare(r); await r.owner.dispatch({ type: 'CONFIRM_START', confirmed: true }); }
async function finished(r) { await start(r); r.next(); await r.owner.dispatch({ type: 'FINISH', endPage: null }); }
function idleRig(options = {}) { return rig(Object.assign({}, options, { slots: [encodeRecord(1, createDocument('ui-installation')), null] })); }

module.exports = { rig, idleRig, prepare, start, finished, TEST_BOOKS };

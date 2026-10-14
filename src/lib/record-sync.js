const wire = require('./record-wire');
const model = require('./record-model');

// Bounded sender composed into the existing transport owner. Nothing here owns
// an SDK listener, a database, or an independent local-session writer.
function createRecordSync(options) {
  const now = options.now || (() => Date.now());
  const schedule = options.setTimeout || setTimeout, cancel = options.clearTimeout || clearTimeout;
  let serial = 0, generation = 0, context = null, active = null, timer = null;
  let pumping = false, dirty = false, status = 'offline', errorCode = null, confirmedCount = 0, readAttempts = 0;
  let seen = Object.create(null), attempts = Object.create(null), lastClock = null;
  const unique = options.randomId || (() => 'record-' + Date.now().toString(36) + '-' + (++serial));
  function snapshot() { return { status, errorCode, confirmedCount, busy: !!active || pumping }; }
  function publish() { if (options.notify) { try { options.notify(snapshot()); } catch (_) { /* A view cannot alter durable facts or transport ownership. */ } } }
  function clearTimer() { if (timer !== null) cancel(timer); timer = null; }
  function current(token) { return context && generation === token; }
  function blocked(code) { clearTimer(); active = null; dirty = false; status = 'blocked'; errorCode = code; publish(); }
  function validClock() {
    const time = now();
    if (!Number.isSafeInteger(time) || lastClock !== null && time < lastClock) { blocked('CLOCK_DISCONTINUITY'); return false; }
    lastClock = time; return true;
  }
  function matches(message, transfer) {
    return wire.COMMON.filter(key => key !== 'type').every(key => message[key] === transfer.offer[key]);
  }
  function send(message) {
    try { return options.send(wire.encodeMessage(message)) !== false; } catch (_) { return false; }
  }
  function failAttempt(code) {
    if (!active) return;
    const key = active.key; clearTimer(); active = null; errorCode = code;
    if (attempts[key] >= 3) { status = 'waiting'; publish(); return; }
    status = 'retrying'; const token = generation;
    timer = schedule(() => { timer = null; if (current(token)) { dirty = true; pump(); } }, [2000, 5000][attempts[key] - 1]);
    publish();
  }
  async function pump() {
    if (!context || status === 'blocked' || active || pumping || timer !== null) return;
    const token = generation; pumping = true; dirty = false;
    try {
      const records = await options.listRecords();
      if (!current(token)) return;
      readAttempts = 0;
      if (!Array.isArray(records) || records.length > 72) throw new Error('RECORD_CAPACITY');
      let selected = null, exhausted = false;
      const identities = Object.create(null);
      for (let n = 0; n < records.length; n++) {
        const raw = model.canonicalRecord(records[n]);
        const key = records[n].session.id;
        if (identities[key] && identities[key] !== raw) throw new Error('RECORD_CONFLICT');
        identities[key] = raw;
        if (seen[key] !== raw && (attempts[key] || 0) >= 3) exhausted = true;
        if (!selected && seen[key] !== raw && (attempts[key] || 0) < 3) selected = { key, raw };
      }
      if (!selected) { status = exhausted ? 'waiting' : 'idle'; errorCode = exhausted ? errorCode || 'RESULT_UNKNOWN' : null; publish(); return; }
      if (!validClock()) return;
      const digest = await options.hash(selected.raw);
      if (!current(token) || status === 'blocked') return;
      const transfer = wire.buildTransfer(Object.assign({}, context, { requestId: unique() }), selected.raw, digest);
      active = { key: selected.key, transfer, deadline: now() + wire.DEADLINE_MS, stage: 'NEED', token };
      attempts[selected.key] = (attempts[selected.key] || 0) + 1;
      status = 'uploading'; errorCode = null;
      timer = schedule(() => { timer = null; if (current(token) && active && active.token === token) failAttempt('TIMEOUT'); }, wire.DEADLINE_MS);
      if (!send(transfer.offer) && active) failAttempt('SEND_FAILED');
      publish();
    } catch (error) {
      if (current(token)) {
        if (error && error.message === 'BUSY') {
          status = 'waiting'; errorCode = 'BUSY'; dirty = false;
          if (++readAttempts < 3) timer = schedule(() => { timer = null; if (current(token)) { dirty = true; pump(); } }, readAttempts === 1 ? 2000 : 5000);
          publish();
        } else blocked(error && /^[A-Z0-9_]{1,48}$/.test(error.message) ? error.message : 'RECORD_UNAVAILABLE');
      }
    } finally {
      if (current(token)) { pumping = false; if (dirty && !active && timer === null && status !== 'blocked') pump(); }
    }
  }
  async function confirm(request, message) {
    clearTimer(); request.stage = 'PERSIST'; status = 'confirming'; publish();
    try {
      const receipt = { installationId: message.sourceInstallationId, sessionId: message.localSessionId,
        digest: message.recordDigest, bytes: message.totalBytes, status: 'PERSISTED' };
      const result = await options.acknowledge({ recordId: message.localSessionId, receipt });
      if (!result || result.confirmed !== true) {
        if (result && result.errorCode === 'BUSY' && current(request.token) && active === request) { failAttempt('BUSY'); return; }
        throw new Error('LOCAL_PERSIST_FAILED');
      }
      if (!current(request.token) || active !== request) return;
      seen[request.key] = request.transfer.canonical; confirmedCount++; active = null;
      status = 'idle'; errorCode = null; dirty = true; publish(); pump();
    } catch (error) {
      if (current(request.token) && active === request) blocked('LOCAL_PERSIST_FAILED');
    }
  }
  function handle(message) {
    if (!context || !active || status === 'blocked' || !validClock()) return false;
    try { wire.validateMessage(message); } catch (_) { return false; }
    const request = active;
    if (!matches(message, request.transfer)) return false;
    if (request.stage === 'PERSIST') return false;
    if (now() >= request.deadline) { failAttempt('TIMEOUT'); return false; }
    if (message.type === 'LOCAL_RECORD_ERROR') {
      if (['BUSY', 'TIMEOUT', 'DB_FAILED', 'SOURCE_UNAVAILABLE', 'RESULT_UNKNOWN'].indexOf(message.code) >= 0) failAttempt(message.code);
      else blocked(message.code);
      return true;
    }
    if (message.type === 'LOCAL_RECORD_NEED' && request.stage === 'NEED') {
      request.stage = 'SENDING';
      for (let n = 0; n < request.transfer.parts.length; n++) {
        if (active !== request || !current(request.token)) return false;
        if (!send(request.transfer.parts[n])) { failAttempt('SEND_FAILED'); return false; }
      }
      if (active !== request || !current(request.token)) return false;
      request.stage = 'ACK';
      if (!send(request.transfer.commit)) failAttempt('SEND_FAILED');
      return true;
    }
    if (message.type === 'LOCAL_RECORD_ACK' && request.stage === 'ACK') { confirm(request, message); return true; }
    return false;
  }
  function disconnected() {
    generation++; context = null; active = null; clearTimer(); pumping = false; dirty = false;
    seen = Object.create(null); attempts = Object.create(null); readAttempts = 0; status = 'offline'; errorCode = null; lastClock = null; publish();
  }
  function connected(value, enabled) {
    disconnected();
    if (!enabled || !value || value.protocolVersion !== 4) { status = 'disabled'; publish(); return; }
    context = Object.assign({}, value); confirmedCount = 0; status = 'idle'; dirty = true; pump();
  }
  function nudge() { if (context && status !== 'blocked') { dirty = true; pump(); } }
  return { connected, disconnected, handle, nudge, snapshot };
}
module.exports = { createRecordSync };

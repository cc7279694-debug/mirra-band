const protocol = require('./companion-protocol');
const { displayTimer } = require('./companion-timer');
function createCompanionStore(options) {
  const transport = options.transport;
  const now = options.now || (() => Date.now());
  const schedule = options.setTimeout || setTimeout;
  const cancel = options.clearTimeout || clearTimeout;
  const repeat = options.setInterval || setInterval;
  const clearRepeat = options.clearInterval || clearInterval;
  let counter = 0;
  const unique = options.randomId || (() => 'w-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + (++counter));
  const listeners = [];
  const leases = [];
  const defaultLease = {};
  let active = false, disposed = false, channel = false, off = null, interval = null;
  let client = null, stream = null, sequence = 0, pending = null, body = null;
  let confirmedAt = null, lastClock = null, clockValid = true, nextPoll = Infinity, retryAt = Infinity, backoff = 0;
  let lastSeenSessionId = null, connection = 'connecting', freshness = 'unknown', errorCode = null, terminal = false;
  function limit() { return body && body.phase === 'IDLE' ? 30000 : 15000; }
  function snapshot() {
    const time = now();
    const age = confirmedAt === null || !clockValid ? null : Math.max(0, time - confirmedAt);
    const safeClock = continuous(time);
    const viewFreshness = body && (!safeClock || age !== null && age >= limit()) ? 'expired' : freshness;
    const recent = active && channel && clockValid && safeClock && body && age !== null && age < limit() && (viewFreshness === 'fresh' || viewFreshness === 'updating');
    return { mode: 'live', connection, freshness: viewFreshness, body: body ? Object.assign({}, body) : null,
      timer: displayTimer(body, age || 0, recent), lastSyncedAgeMs: age, errorCode };
  }
  function publish() { const view = snapshot(); listeners.slice().forEach(fn => fn(view)); }
  function subscribe(fn) { listeners.push(fn); return () => { const at = listeners.indexOf(fn); if (at >= 0) listeners.splice(at, 1); }; }
  function clearPending() { if (pending && pending.timeout !== null) cancel(pending.timeout); pending = null; }
  function planRetry() { retryAt = now() + [2000, 5000, 10000, 30000][Math.min(backoff++, 3)]; nextPoll = Infinity; }
  function expireRequest() {
    clearPending(); stream = null; errorCode = 'REQUEST_TIMEOUT';
    freshness = body ? 'expired' : 'unknown';
    planRetry(); publish();
  }
  function issue(type) {
    if (!active || !channel || pending || terminal) return;
    const time = now();
    const message = { protocolVersion: 1, type, clientInstanceId: client, requestId: unique() };
    if (type === 'HELLO') message.capabilities = ['READ_ONLY_SNAPSHOT'];
    else { message.streamId = stream; message.lastSeenSessionId = lastSeenSessionId; }
    const request = { id: message.requestId, type, deadline: time + 3000, timeout: null };
    pending = request;
    freshness = body ? (freshness !== 'expired' && clockValid && time - confirmedAt < limit() ? 'updating' : 'expired') : 'unknown';
    request.timeout = schedule(() => { if (active && pending === request) expireRequest(); }, 3000);
    if (!transport.send(protocol.encodeMessage(message)) && pending === request) expireRequest();
    publish();
  }
  function handshake() { stream = null; sequence = 0; issue('HELLO'); }
  function reattempt() {
    retryAt = Infinity;
    if (channel) handshake(); else { transport.stop(); transport.start(); }
  }
  function invalidateClock(time) {
    clockValid = false; lastClock = time; freshness = body ? 'expired' : 'unknown';
    clearPending(); stream = null; errorCode = 'CLOCK_DISCONTINUITY';
    if (channel) handshake(); else planRetry();
  }
  function continuous(time) { return protocol.integer(time) && (lastClock === null || (time >= lastClock && time - lastClock <= 7000)); }
  function tick() {
    if (!active) return;
    if (terminal) { publish(); return; }
    const time = now();
    if (!continuous(time)) { invalidateClock(time); publish(); return; }
    lastClock = time;
    if (body && confirmedAt !== null && (!clockValid || time - confirmedAt >= limit())) freshness = 'expired';
    if (!pending && time >= retryAt) reattempt();
    else if (!pending && stream && time >= nextPoll) { nextPoll = Infinity; issue('GET_SNAPSHOT'); }
    publish();
  }
  function handleMessage(payload) {
    if (!active || terminal) return;
    const time = now();
    if (!continuous(time)) { invalidateClock(time); publish(); return; }
    let message; try { message = protocol.decodeMessage(payload); } catch (error) { return; }
    if (message.clientInstanceId !== client) return;
    // DISABLED is a privacy invalidation, not evidence of freshness. Accept it
    // from the current stream even when no request is outstanding.
    if (message.type === 'STATUS_ERROR' && message.code === 'DISABLED' && stream && message.streamId === stream) {
      clearPending(); body = null; confirmedAt = null; lastSeenSessionId = null; stream = null;
      connection = 'disabled'; terminal = true; freshness = 'unknown'; errorCode = 'DISABLED'; retryAt = Infinity; nextPoll = Infinity; publish(); return;
    }
    if (!pending || message.requestId !== pending.id) return;
    if (time >= pending.deadline) { expireRequest(); return; }
    if (pending.type !== 'HELLO' && message.streamId !== stream) return;
    if (message.type === 'STATUS_ERROR') {
      clearPending(); body = null; confirmedAt = null; stream = null; lastSeenSessionId = null;
      connection = { SOURCE_BUSY: 'source_busy', SOURCE_UNAVAILABLE: 'source_unavailable', DISABLED: 'disabled', UNSUPPORTED_PROTOCOL: 'unsupported', UNAUTHORIZED: 'unauthorized', IDENTITY_ERROR: 'identity_error' }[message.code];
      freshness = 'unknown'; errorCode = message.code; nextPoll = Infinity;
      terminal = message.code !== 'SOURCE_BUSY' && message.code !== 'SOURCE_UNAVAILABLE';
      if (!terminal) planRetry(); else retryAt = Infinity;
      publish(); return;
    }
    if (pending.type === 'HELLO' && message.type === 'HELLO_ACK') {
      clearPending(); stream = message.streamId; sequence = 0; connection = 'connected';
      retryAt = Infinity; issue('GET_SNAPSHOT'); return;
    }
    if (pending.type !== 'GET_SNAPSHOT' || message.type !== 'SNAPSHOT' || message.sequence <= sequence) return;
    if (message.body.phase === 'ENDED' && message.body.sessionId !== lastSeenSessionId) return;
    clearPending(); body = Object.assign({}, message.body); sequence = message.sequence;
    if (body.phase === 'ACTIVE' || body.phase === 'SAVING') lastSeenSessionId = body.sessionId;
    confirmedAt = time; lastClock = time; clockValid = true; connection = 'connected'; freshness = 'fresh'; errorCode = null;
    backoff = 0; retryAt = Infinity; nextPoll = time + (body.phase === 'IDLE' ? 15000 : 5000); publish();
  }
  function handle(event) {
    if (!active) return;
    if (event.kind === 'message') { handleMessage(event.payload); return; }
    if (event.kind !== 'connection') return;
    // A known phone-side refusal survives incidental native close/open events.
    // Only an explicit user retry or a new visible cycle clears this decision.
    if (terminal) { channel = event.status === 'connected'; publish(); return; }
    errorCode = event.code || null;
    if (event.status === 'connected') {
      if (channel) return;
      channel = true; connection = 'connected'; clearPending(); handshake();
    } else {
      channel = false; clearPending(); stream = null; connection = event.status;
      freshness = body ? 'expired' : 'unknown'; nextPoll = Infinity;
      terminal = ['unsupported', 'unauthorized', 'identity_error', 'disabled'].indexOf(event.status) >= 0;
      if (event.status === 'disconnected') planRetry(); else retryAt = Infinity;
    }
    publish();
  }
  function start(lease) {
    if (disposed) return;
    const owner = lease === undefined ? defaultLease : lease;
    if (leases.indexOf(owner) >= 0) return;
    leases.push(owner);
    if (active) return;
    active = true; client = unique(); stream = null; sequence = 0; channel = false; terminal = false;
    lastClock = now(); clockValid = false; connection = 'connecting'; freshness = body ? 'expired' : 'unknown';
    off = transport.subscribe(handle); interval = repeat(tick, 1000); transport.start(); publish();
  }
  function stop(lease) {
    const owner = lease === undefined ? defaultLease : lease;
    const index = leases.indexOf(owner);
    if (index >= 0) leases.splice(index, 1);
    if (leases.length) return;
    if (!active) return;
    active = false; clearPending(); clearRepeat(interval); interval = null;
    if (off) off(); off = null; transport.stop(); channel = false; stream = null;
    retryAt = Infinity; nextPoll = Infinity; clockValid = false; connection = 'disconnected'; freshness = body ? 'expired' : 'unknown';
  }
  function requestRefresh() {
    if (!active || disposed) return;
    terminal = false; backoff = 0; clearPending(); retryAt = Infinity;
    if (channel) { if (stream) issue('GET_SNAPSHOT'); else handshake(); }
    else reattempt();
  }
  function destroy() { leases.length = 0; stop(); disposed = true; body = null; confirmedAt = null; lastSeenSessionId = null; listeners.length = 0; }
  return { start, stop, requestRefresh, snapshot, subscribe, destroy };
}
module.exports = { createCompanionStore };

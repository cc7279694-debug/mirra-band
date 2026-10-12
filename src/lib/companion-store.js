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
  let wireVersion = 2, v2Proven = false, controlCapability = false, grant = null, grantDeadline = 0;
  let command = null, settling = false, controlResult = null, monitorDegraded = false, resultContext = null;
  function limit() { return body && body.phase === 'IDLE' ? 30000 : 15000; }
  function subject() {
    return body ? { intentId: body.intentId, sessionId: body.sessionId, segmentId: grant ? grant.activeSegmentId : null,
      bookId: body.learningItemId, page: body.currentPage, firstAction: body.firstAction } : null;
  }
  function availableActions(recent, time) {
    if (!recent || wireVersion !== 2 || !controlCapability || !grant || !grant.controlGrant
      || time >= grantDeadline || command || settling || terminal || !body) return [];
    return grant.allowedActions.filter(action => {
      if (action === 'START_BREAK') return body.phase === 'ACTIVE' && !!body.sessionId && !!grant.activeSegmentId
        && ['FOCUS', 'DEEP_FOCUS', 'UNMONITORED'].indexOf(body.segmentType) >= 0;
      if (action === 'FINISH_BREAK') return body.phase === 'ACTIVE' && body.segmentType === 'BREAK'
        && !!body.sessionId && !!grant.activeSegmentId;
      return action === 'CONFIRM_PREPARATION_AND_START' && body.phase === 'PREPARING' && !!body.intentId
        && !!body.learningItemId && body.currentPage !== null && !body.firstActionTruncated
        && typeof body.firstAction === 'string' && !!body.firstAction.trim()
        && body.firstAction === grant.expectedFirstAction;
    });
  }
  function snapshot() {
    const time = now();
    const age = confirmedAt === null || !clockValid ? null : Math.max(0, time - confirmedAt);
    const safeClock = continuous(time);
    const viewFreshness = body && (!safeClock || age !== null && age >= limit()) ? 'expired' : freshness;
    const recent = active && channel && clockValid && safeClock && body && age !== null && age < limit() && (viewFreshness === 'fresh' || viewFreshness === 'updating');
    return { mode: 'live', connection, freshness: viewFreshness, body: body ? Object.assign({}, body) : null,
      timer: displayTimer(body, age || 0, recent), lastSyncedAgeMs: age, errorCode,
      control: { protocolVersion: wireVersion, negotiated: controlCapability,
        availableActions: availableActions(recent, time), busy: !!command || settling,
        resultCode: controlResult, monitorDegraded, subject: subject() } };
  }
  function publish() { const view = snapshot(); listeners.slice().forEach(fn => fn(view)); }
  function subscribe(fn) { listeners.push(fn); return () => { const at = listeners.indexOf(fn); if (at >= 0) listeners.splice(at, 1); }; }
  function clearPending() { if (pending && pending.timeout !== null) cancel(pending.timeout); pending = null; }
  function clearCommand() { if (command && command.timeout !== null) cancel(command.timeout); command = null; }
  function clearControlResult() { controlResult = null; monitorDegraded = false; resultContext = null; }
  function resultAppliesToCurrentBody() {
    if (!body || !resultContext) return false;
    const expected = resultContext.subject;
    const applied = controlResult === 'APPLIED' || controlResult === 'ALREADY_APPLIED';
    if (resultContext.action === 'CONFIRM_PREPARATION_AND_START') {
      if (applied) return body.phase === 'ACTIVE' && body.sessionId === resultContext.sessionId;
      return body.phase === 'PREPARING' && body.intentId === expected.intentId
        && body.learningItemId === expected.bookId && body.currentPage === expected.page
        && body.firstAction === expected.firstAction;
    }
    if (body.phase !== 'ACTIVE' || body.sessionId !== (applied ? resultContext.sessionId : expected.sessionId)) return false;
    if (applied) return body.segmentType === (resultContext.action === 'START_BREAK' ? 'BREAK' : 'RECOVERY');
    return grant && grant.activeSegmentId === expected.segmentId;
  }
  function uncertainCommand() {
    if (!command && !settling) return;
    clearCommand(); settling = false; controlResult = 'RESULT_UNKNOWN'; monitorDegraded = false; resultContext = null;
    grant = null; grantDeadline = 0;
  }
  function useReadOnlyProtocol() {
    clearPending(); wireVersion = 1; controlCapability = false; grant = null; grantDeadline = 0;
    stream = null; sequence = 0; issue('HELLO');
  }
  function planRetry() { retryAt = now() + [2000, 5000, 10000, 30000][Math.min(backoff++, 3)]; nextPoll = Infinity; }
  function expireRequest() {
    if (pending && pending.type === 'HELLO' && pending.version === 2 && !v2Proven) { useReadOnlyProtocol(); return; }
    clearPending(); stream = null; errorCode = 'REQUEST_TIMEOUT';
    grant = null; grantDeadline = 0;
    freshness = body ? 'expired' : 'unknown';
    planRetry(); publish();
  }
  function issue(type) {
    if (!active || !channel || pending || command || terminal) return;
    const time = now();
    const message = { protocolVersion: wireVersion, type, clientInstanceId: client, requestId: unique() };
    if (type === 'HELLO') message.capabilities = wireVersion === 2
      ? ['READ_ONLY_SNAPSHOT', 'SESSION_CONTROL'] : ['READ_ONLY_SNAPSHOT'];
    else { message.streamId = stream; message.lastSeenSessionId = lastSeenSessionId; }
    const request = { id: message.requestId, type, version: wireVersion, deadline: time + 3000, timeout: null };
    pending = request;
    freshness = body ? (freshness !== 'expired' && clockValid && time - confirmedAt < limit() ? 'updating' : 'expired') : 'unknown';
    request.timeout = schedule(() => { if (active && pending === request) expireRequest(); }, 3000);
    if (!transport.send(protocol.encodeMessage(message)) && pending === request) expireRequest();
    publish();
  }
  function handshake() { stream = null; sequence = 0; controlCapability = false; grant = null; grantDeadline = 0; issue('HELLO'); }
  function reattempt() {
    retryAt = Infinity;
    if (channel) handshake(); else { transport.stop(); transport.start(); }
  }
  function invalidateClock(time) {
    clockValid = false; lastClock = time; freshness = body ? 'expired' : 'unknown';
    uncertainCommand(); grant = null; grantDeadline = 0;
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
    if (pending && pending.type === 'HELLO' && pending.version === 2 && message.type === 'STATUS_ERROR'
      && message.code === 'UNSUPPORTED_PROTOCOL' && message.requestId === pending.id) {
      useReadOnlyProtocol(); return;
    }
    if (message.protocolVersion !== wireVersion) return;
    // DISABLED is a privacy invalidation, not evidence of freshness. Accept it
    // from the current stream even when no request is outstanding.
    if (message.type === 'STATUS_ERROR' && message.code === 'DISABLED' && stream && message.streamId === stream) {
      clearPending(); uncertainCommand(); grant = null; body = null; confirmedAt = null; lastSeenSessionId = null; stream = null;
      connection = 'disabled'; terminal = true; freshness = 'unknown'; errorCode = 'DISABLED'; retryAt = Infinity; nextPoll = Infinity; publish(); return;
    }
    if (message.type === 'COMMAND_RESULT') {
      if (!command || message.requestId !== command.id || message.streamId !== stream || message.action !== command.action) return;
      if (time >= command.deadline) { uncertainCommand(); clearPending(); issue('GET_SNAPSHOT'); publish(); return; }
      resultContext = { action: command.action, subject: command.subject, sessionId: message.sessionId };
      clearCommand(); controlResult = message.code; monitorDegraded = message.monitorDegraded === true;
      settling = true; grant = null; grantDeadline = 0;
      clearPending(); issue('GET_SNAPSHOT'); publish(); return;
    }
    if (!pending || message.requestId !== pending.id) return;
    if (time >= pending.deadline) { expireRequest(); return; }
    if (pending.type !== 'HELLO' && message.streamId !== stream) return;
    if (message.type === 'STATUS_ERROR') {
      clearPending(); uncertainCommand(); grant = null; body = null; confirmedAt = null; stream = null; lastSeenSessionId = null;
      connection = { SOURCE_BUSY: 'source_busy', SOURCE_UNAVAILABLE: 'source_unavailable', DISABLED: 'disabled', UNSUPPORTED_PROTOCOL: 'unsupported', UNAUTHORIZED: 'unauthorized', IDENTITY_ERROR: 'identity_error' }[message.code];
      freshness = 'unknown'; errorCode = message.code; nextPoll = Infinity;
      terminal = message.code !== 'SOURCE_BUSY' && message.code !== 'SOURCE_UNAVAILABLE';
      if (!terminal) planRetry(); else retryAt = Infinity;
      publish(); return;
    }
    if (pending.type === 'HELLO' && message.type === 'HELLO_ACK') {
      clearPending(); stream = message.streamId; sequence = 0; connection = 'connected';
      if (wireVersion === 2) v2Proven = true;
      controlCapability = wireVersion === 2 && message.capabilities.indexOf('SESSION_CONTROL') >= 0;
      retryAt = Infinity; issue('GET_SNAPSHOT'); return;
    }
    if (pending.type !== 'GET_SNAPSHOT' || message.type !== 'SNAPSHOT' || message.sequence <= sequence) return;
    if (message.body.phase === 'ENDED' && message.body.sessionId !== lastSeenSessionId) return;
    clearPending(); body = Object.assign({}, message.body); sequence = message.sequence;
    grant = wireVersion === 2 && controlCapability && message.control ? Object.assign({}, message.control) : null;
    grantDeadline = grant && grant.controlGrant
      ? time + Math.min(30000, Math.max(0, grant.grantExpiresAtUnixMs - message.sourceObservedAtUnixMs)) : 0;
    settling = false;
    if (controlResult === 'RESULT_UNKNOWN' || controlResult && !resultAppliesToCurrentBody()) clearControlResult();
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
      uncertainCommand(); grant = null; grantDeadline = 0;
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
    wireVersion = 2; v2Proven = false; controlCapability = false; grant = null; grantDeadline = 0;
    lastClock = now(); clockValid = false; connection = 'connecting'; freshness = body ? 'expired' : 'unknown';
    off = transport.subscribe(handle); interval = repeat(tick, 1000); transport.start(); publish();
  }
  function stop(lease) {
    const owner = lease === undefined ? defaultLease : lease;
    const index = leases.indexOf(owner);
    if (index >= 0) leases.splice(index, 1);
    if (command && command.owner === owner) {
      uncertainCommand(); clearPending();
      if (leases.length && stream && channel) issue('GET_SNAPSHOT');
    }
    if (leases.length) return;
    if (!active) return;
    active = false; uncertainCommand(); clearPending(); grant = null; grantDeadline = 0; clearRepeat(interval); interval = null;
    if (off) off(); off = null; transport.stop(); channel = false; stream = null;
    retryAt = Infinity; nextPoll = Infinity; clockValid = false; connection = 'disconnected'; freshness = body ? 'expired' : 'unknown';
  }
  function requestRefresh() {
    if (!active || disposed || command) return;
    terminal = false; backoff = 0; clearPending(); retryAt = Infinity;
    if (channel) { if (stream) issue('GET_SNAPSHOT'); else handshake(); }
    else reattempt();
  }
  function submitControl(action, values, owner) {
    values = values || {};
    if (!active || disposed || leases.indexOf(owner) < 0 || snapshot().control.availableActions.indexOf(action) < 0) return false;
    const expected = values.expected, current = subject();
    if (!expected || !current || ['intentId', 'sessionId', 'segmentId', 'bookId', 'page', 'firstAction']
      .some(key => expected[key] !== current[key])) return false;
    const prepare = action === 'CONFIRM_PREPARATION_AND_START';
    const message = { protocolVersion: 2, type: 'COMMAND', clientInstanceId: client,
      requestId: unique(), streamId: stream, controlGrant: grant.controlGrant, action,
      expectedIntentId: prepare ? body.intentId : null, expectedSessionId: prepare ? null : body.sessionId,
      expectedSegmentId: prepare ? null : grant.activeSegmentId, expectedBookId: prepare ? body.learningItemId : null,
      expectedPage: prepare ? body.currentPage : null, expectedFirstAction: prepare ? body.firstAction : null,
      breakMinutes: action === 'START_BREAK' ? values.breakMinutes : null };
    let payload; try { payload = protocol.encodeMessage(message); } catch (error) { return false; }
    clearPending();
    const request = { id: message.requestId, action, owner, subject: current, deadline: now() + 5000, timeout: null };
    command = request; clearControlResult(); settling = false;
    grant = null; grantDeadline = 0; nextPoll = Infinity;
    request.timeout = schedule(() => {
      if (active && command === request) {
        uncertainCommand(); if (stream && channel) issue('GET_SNAPSHOT'); else planRetry(); publish();
      }
    }, 5000);
    if (!transport.send(payload) && command === request) {
      uncertainCommand(); if (stream && channel) issue('GET_SNAPSHOT'); else planRetry();
    }
    publish(); return true;
  }
  function destroy() { leases.length = 0; stop(); disposed = true; body = null; confirmedAt = null; lastSeenSessionId = null; listeners.length = 0; }
  return { start, stop, requestRefresh, submitControl, snapshot, subscribe, destroy };
}
module.exports = { createCompanionStore };

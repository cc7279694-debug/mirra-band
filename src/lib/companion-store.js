const protocol = require('./companion-protocol');
const { displayTimer } = require('./companion-timer');
function createCompanionStore(options) {
  const transport = options.transport;
  const now = options.now || (() => Date.now());
  const schedule = options.setTimeout || setTimeout;
  const cancel = options.clearTimeout || clearTimeout;
  const repeat = options.setInterval || setInterval;
  const clearRepeat = options.clearInterval || clearInterval;
  const catalogReceiver = options.catalogReceiver || null;
  let counter = 0;
  const unique = options.randomId || (() => 'w-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + (++counter));
  const listeners = [];
  const leases = [];
  const defaultLease = {};
  let active = false, disposed = false, channel = false, off = null, interval = null;
  let client = null, stream = null, sequence = 0, pending = null, body = null;
  let confirmedAt = null, lastClock = null, clockValid = true, nextPoll = Infinity, retryAt = Infinity, backoff = 0;
  let lastSeenSessionId = null, connection = 'connecting', freshness = 'unknown', errorCode = null, terminal = false;
  let wireVersion = 2, v2Proven = false, v3Proven = false, controlCapability = false, grant = null, grantDeadline = 0;
  let command = null, settling = false, controlResult = null, monitorDegraded = false, resultContext = null;
  let catalogCapability = false, catalogRequest = null, catalogError = null;
  function controlsAllowed() {
    try { return typeof options.controlAllowed !== 'function' || options.controlAllowed() === true; }
    catch (_) { return false; }
  }
  function limit() { return body && body.phase === 'IDLE' ? 30000 : 15000; }
  function subject() {
    return body ? { intentId: body.intentId, sessionId: body.sessionId, segmentId: grant ? grant.activeSegmentId : null,
      bookId: body.learningItemId, page: body.currentPage, firstAction: body.firstAction } : null;
  }
  function availableActions(recent, time) {
    if (!recent || wireVersion < 2 || !controlsAllowed() || !controlCapability || !grant || !grant.controlGrant
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
    const catalogView = catalogReceiver ? catalogReceiver.snapshot() : null;
    return { mode: 'live', connection, freshness: viewFreshness, body: body ? Object.assign({}, body) : null,
      timer: displayTimer(body, age || 0, recent), lastSyncedAgeMs: age, errorCode,
      catalog: catalogView ? Object.assign({}, catalogView, { status: catalogError ? 'failed' : catalogView.status, negotiated: catalogCapability,
        busy: !!catalogRequest, errorCode: catalogError }) : null,
      control: { protocolVersion: wireVersion, negotiated: controlCapability,
        availableActions: availableActions(recent, time), busy: !!command || settling,
        resultCode: controlResult, monitorDegraded, subject: subject() } };
  }
  function publish() { const view = snapshot(); listeners.slice().forEach(fn => fn(view)); }
  function subscribe(fn) { listeners.push(fn); return () => { const at = listeners.indexOf(fn); if (at >= 0) listeners.splice(at, 1); }; }
  function clearPending() { if (pending && pending.timeout !== null) cancel(pending.timeout); pending = null; }
  function clearCommand() { if (command && command.timeout !== null) cancel(command.timeout); command = null; }
  function clearCatalog(retire) {
    if (catalogRequest && catalogRequest.timeout !== null) cancel(catalogRequest.timeout);
    catalogRequest = null;
    if (retire && catalogReceiver) catalogReceiver.cancel();
  }
  function catalogCurrent(request) {
    return active && !disposed && !terminal && channel && catalogRequest === request
      && wireVersion === 3 && request.client === client && request.stream === stream && now() < request.deadline;
  }
  function sendCatalogReply(request, message) {
    if (!message || !catalogCurrent(request)) return;
    let payload; try { payload = protocol.encodeMessage(message); } catch (_) { return; }
    if (message.type === 'CATALOG_ACK' || message.type === 'CATALOG_ERROR') clearCatalog(false);
    transport.send(payload);
  }
  function requestCatalog() {
    if (!catalogReceiver || !active || disposed || terminal || !channel || !stream || wireVersion !== 3
      || !catalogCapability || catalogRequest) return false;
    let revision = null;
    try { if (typeof options.catalogRevision === 'function') revision = options.catalogRevision(); }
    catch (_) { return false; }
    const message = { protocolVersion: 3, type: 'GET_CATALOG', clientInstanceId: client, requestId: unique(),
      streamId: stream, knownRevision: revision };
    let payload; try { payload = protocol.encodeMessage(message); } catch (_) { return false; }
    const request = { id: message.requestId, client, stream, deadline: now() + 30000, timeout: null };
    catalogRequest = request; catalogError = null;
    try {
      catalogReceiver.begin({ protocolVersion: 3, clientInstanceId: client, requestId: request.id, streamId: stream });
      request.timeout = schedule(() => {
        if (catalogRequest !== request) return;
        let response = null; try { response = catalogReceiver.expire(); } catch (_) { /* Fixed failure below owns retirement. */ }
        if (response && active && channel && !terminal && request.client === client && request.stream === stream) {
          try { transport.send(protocol.encodeMessage(response)); } catch (_) { /* Never acknowledge failed persistence. */ }
        }
        catalogError = 'TIMEOUT'; clearCatalog(true); publish();
      }, 30000);
      if (!transport.send(payload) && catalogRequest === request) { catalogError = 'SEND_FAILED'; clearCatalog(true); }
    } catch (_) { catalogError = 'CATALOG_HANDLER_FAILED'; clearCatalog(true); }
    publish(); return catalogRequest === request;
  }
  function receiveCatalog(message) {
    const request = catalogRequest;
    if (!request || !catalogCurrent(request) || message.requestId !== request.id || message.streamId !== request.stream) return;
    let received;
    try { received = catalogReceiver.receive(message); }
    catch (_) { catalogError = 'CATALOG_HANDLER_FAILED'; clearCatalog(true); publish(); return; }
    Promise.resolve(received).then(reply => {
      if (!catalogCurrent(request)) return;
      sendCatalogReply(request, reply);
      if (catalogRequest === request && catalogReceiver.snapshot().status === 'failed') {
        catalogError = catalogReceiver.snapshot().code || 'CATALOG_FAILED'; clearCatalog(false);
      }
      publish();
    }, () => {
      if (!catalogCurrent(request)) return;
      catalogError = 'CATALOG_HANDLER_FAILED'; clearCatalog(true); publish();
    });
    publish();
  }
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
  function useOlderProtocol() {
    clearPending(); clearCatalog(true); wireVersion = wireVersion === 3 ? 2 : 1;
    catalogCapability = false; controlCapability = false; grant = null; grantDeadline = 0;
    stream = null; sequence = 0; issue('HELLO');
  }
  function planRetry() { retryAt = now() + [2000, 5000, 10000, 30000][Math.min(backoff++, 3)]; nextPoll = Infinity; }
  function expireRequest() {
    if (pending && pending.type === 'HELLO' && (pending.version === 3 && !v3Proven || pending.version === 2 && !v2Proven)) { useOlderProtocol(); return; }
    clearPending(); clearCatalog(true); stream = null; errorCode = 'REQUEST_TIMEOUT';
    grant = null; grantDeadline = 0;
    freshness = body ? 'expired' : 'unknown';
    planRetry(); publish();
  }
  function issue(type) {
    if (!active || !channel || pending || command || terminal) return;
    const time = now();
    const message = { protocolVersion: wireVersion, type, clientInstanceId: client, requestId: unique() };
    if (type === 'HELLO') message.capabilities = wireVersion === 3
      ? ['READ_ONLY_SNAPSHOT', 'SESSION_CONTROL', 'BOOK_CATALOG'] : wireVersion === 2
        ? ['READ_ONLY_SNAPSHOT', 'SESSION_CONTROL'] : ['READ_ONLY_SNAPSHOT'];
    else { message.streamId = stream; message.lastSeenSessionId = lastSeenSessionId; }
    const request = { id: message.requestId, type, version: wireVersion, deadline: time + 3000, timeout: null };
    pending = request;
    freshness = body ? (freshness !== 'expired' && clockValid && time - confirmedAt < limit() ? 'updating' : 'expired') : 'unknown';
    request.timeout = schedule(() => { if (active && pending === request) expireRequest(); }, 3000);
    if (!transport.send(protocol.encodeMessage(message)) && pending === request) expireRequest();
    publish();
  }
  function handshake() { clearCatalog(true); catalogCapability = false; stream = null; sequence = 0; controlCapability = false; grant = null; grantDeadline = 0; issue('HELLO'); }
  function reattempt() {
    retryAt = Infinity;
    if (channel) handshake(); else { transport.stop(); transport.start(); }
  }
  function invalidateClock(time) {
    clockValid = false; lastClock = time; freshness = body ? 'expired' : 'unknown';
    uncertainCommand(); grant = null; grantDeadline = 0;
    clearPending(); clearCatalog(true); stream = null; errorCode = 'CLOCK_DISCONTINUITY';
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
    if (pending && pending.type === 'HELLO' && pending.version >= 2 && message.type === 'STATUS_ERROR'
      && message.code === 'UNSUPPORTED_PROTOCOL' && message.requestId === pending.id) {
      useOlderProtocol(); return;
    }
    if (message.protocolVersion !== wireVersion) return;
    if (wireVersion === 3 && ['CATALOG_MANIFEST', 'CATALOG_PART', 'CATALOG_ERROR'].indexOf(message.type) >= 0) {
      receiveCatalog(message); return;
    }
    // DISABLED is a privacy invalidation, not evidence of freshness. Accept it
    // from the current stream even when no request is outstanding.
    if (message.type === 'STATUS_ERROR' && message.code === 'DISABLED' && stream && message.streamId === stream) {
      clearPending(); clearCatalog(true); catalogCapability = false; uncertainCommand(); grant = null; body = null; confirmedAt = null; lastSeenSessionId = null; stream = null;
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
      clearPending(); clearCatalog(true); catalogCapability = false; uncertainCommand(); grant = null; body = null; confirmedAt = null; stream = null; lastSeenSessionId = null;
      connection = { SOURCE_BUSY: 'source_busy', SOURCE_UNAVAILABLE: 'source_unavailable', DISABLED: 'disabled', UNSUPPORTED_PROTOCOL: 'unsupported', UNAUTHORIZED: 'unauthorized', IDENTITY_ERROR: 'identity_error' }[message.code];
      freshness = 'unknown'; errorCode = message.code; nextPoll = Infinity;
      terminal = message.code !== 'SOURCE_BUSY' && message.code !== 'SOURCE_UNAVAILABLE';
      if (!terminal) planRetry(); else retryAt = Infinity;
      publish(); return;
    }
    if (pending.type === 'HELLO' && message.type === 'HELLO_ACK') {
      clearPending(); stream = message.streamId; sequence = 0; connection = 'connected';
      if (wireVersion === 2) v2Proven = true;
      if (wireVersion === 3) v3Proven = true;
      controlCapability = wireVersion >= 2 && message.capabilities.indexOf('SESSION_CONTROL') >= 0;
      catalogCapability = wireVersion === 3 && message.capabilities.indexOf('BOOK_CATALOG') >= 0;
      retryAt = Infinity; issue('GET_SNAPSHOT'); requestCatalog(); return;
    }
    if (pending.type !== 'GET_SNAPSHOT' || message.type !== 'SNAPSHOT' || message.sequence <= sequence) return;
    if (message.body.phase === 'ENDED' && message.body.sessionId !== lastSeenSessionId) return;
    clearPending(); body = Object.assign({}, message.body); sequence = message.sequence;
    grant = wireVersion >= 2 && controlCapability && message.control ? Object.assign({}, message.control) : null;
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
      uncertainCommand(); clearCatalog(true); catalogCapability = false; grant = null; grantDeadline = 0;
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
    wireVersion = catalogReceiver ? 3 : 2; v2Proven = false; v3Proven = false;
    catalogCapability = false; catalogError = null; controlCapability = false; grant = null; grantDeadline = 0;
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
    active = false; uncertainCommand(); clearPending(); clearCatalog(true); catalogCapability = false; grant = null; grantDeadline = 0; clearRepeat(interval); interval = null;
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
    const message = { protocolVersion: wireVersion, type: 'COMMAND', clientInstanceId: client,
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
  return { start, stop, requestRefresh, requestCatalog, submitControl, snapshot, subscribe, destroy };
}
module.exports = { createCompanionStore };

// This is the sole owner of the platform's singleton event slots. No business
// state or payload logging belongs at this boundary.
function createTransport(options) {
  const schedule = options.setTimeout || setTimeout;
  const cancel = options.clearTimeout || clearTimeout;
  const listeners = [];
  let owner = null;
  let status = 'disconnected';
  function publish(event) {
    if (event.status) status = event.status;
    listeners.slice().forEach(listener => listener(event));
  }
  function subscribe(listener) {
    listeners.push(listener);
    return () => { const index = listeners.indexOf(listener); if (index >= 0) listeners.splice(index, 1); };
  }
  function clearQuery(context) {
    context.pending = false;
    if (context.timer !== null) cancel(context.timer);
    context.timer = null;
  }
  function restoreHandlers(context) {
    context.handlers.forEach(entry => {
      try { if (context.native[entry.name] === entry.handler) context.native[entry.name] = entry.previous; }
      catch (error) { /* Retired callbacks remain inert even if native teardown fails. */ }
    });
  }
  function errorCategory(error) {
    // Never inspect native error text or arbitrary name/message getters.
    try {
      if (error instanceof TypeError) return 'TYPE_ERROR';
      if (error instanceof ReferenceError) return 'REFERENCE_ERROR';
      if (error instanceof RangeError) return 'RANGE_ERROR';
      if (error instanceof SyntaxError) return 'SYNTAX_ERROR';
      if (error instanceof Error) return 'ERROR';
    } catch (ignored) { /* Exotic native throws can also reject prototype inspection. */ }
    return 'UNKNOWN_THROW';
  }
  function queryFailure(prefix, code) {
    const known = [200, 201, 202, 203, 204, 205, 207, 300, 1000, 1001, 1006];
    return prefix + '_FAIL_' + (typeof code === 'number' && known.indexOf(code) >= 0 ? code : 'UNKNOWN');
  }
  function unknownStatus(prefix, value) {
    // typeof has a fixed language-defined set; never inspect or stringify value.
    return prefix + '_STATUS_UNKNOWN_' + (typeof value).toUpperCase();
  }
  function legacyDiagnostic(value) {
    // This reads only the synchronous platform state, never error/message bodies.
    // Expose a bounded ASCII state token, with case and wrapper preserved in the
    // category. Unknown tokens remain failures, including lowercase/quoted CONNECTED.
    if (typeof value === 'string' && value.length <= 64) {
      const token = /^[A-Za-z0-9_]{1,32}$/;
      if (token.test(value)) return 'APK_RAW_' + value;
      if (/^"[A-Za-z0-9_]{1,32}"$/.test(value)) return 'APK_QUOTED_' + value.slice(1, -1);
      const padded = value.replace(/^ +| +$/g, '');
      if (padded !== value && token.test(padded)) return 'APK_PADDED_' + padded;
    }
    return unknownStatus('APK', value);
  }
  function start() {
    if (owner) return;
    const context = { native: null, handlers: [], timer: null, pending: false, waitCode: null, sendGeneration: 0, failed: false };
    owner = context;
    const current = () => owner === context && !context.failed;
    function connection(next, code) {
      if (!current()) return;
      clearQuery(context);
      publish({ kind: 'connection', status: next, code: code || null });
    }
    function initializationFailed(code) {
      if (!current()) return;
      context.failed = true;
      clearQuery(context);
      restoreHandlers(context);
      publish({ kind: 'connection', status: 'unsupported', code });
    }
    let stage = 'MODULE_LOAD';
    try {
      if (typeof options.loadModule !== 'function') { initializationFailed('INIT_MODULE_LOAD_API_MISSING'); return; }
      const platform = options.loadModule();
      stage = 'INSTANCE';
      const instance = platform && platform.instance;
      if (typeof instance !== 'function') { initializationFailed('INIT_INSTANCE_API_MISSING'); return; }
      context.native = instance.call(platform);
      const native = context.native;
      if (!native || typeof native !== 'object' && typeof native !== 'function') {
        initializationFailed('INIT_INSTANCE_API_MISSING'); return;
      }
      const slots = ['onmessage', 'onopen', 'onclose', 'onerror'];
      stage = 'READ_CALLBACK';
      if (slots.some(name => native[name] !== undefined && native[name] !== null)) {
        connection('unavailable', 'CALLBACK_OWNED'); return;
      }
      const handlers = {
        onopen() { connection('connected'); },
        onclose() { connection('disconnected'); },
        onerror(event) { connection('disconnected', event && event.code === 1001 ? 'PHONE_APP_MISSING' : 'CHANNEL_ERROR'); },
        onmessage(event) {
          if (!current()) return;
          if (event && typeof event.data === 'string') publish({ kind: 'message', payload: event.data });
          else publish({ kind: 'error', code: 'INVALID_PAYLOAD' });
        },
      };
      context.pending = true;
      context.timer = schedule(() => {
        if (current() && context.pending) connection('disconnected', context.waitCode || 'CHANNEL_TIMEOUT');
      }, 3000);
      publish({ kind: 'connection', status: 'connecting', code: null });
      slots.forEach(name => {
        if (!current()) return;
        stage = 'READ_CALLBACK';
        context.handlers.push({ name, handler: handlers[name], previous: native[name] });
        stage = 'SET_CALLBACK';
        native[name] = handlers[name];
      });
      // A native setter can deliver a cached onopen immediately. Preserve it.
      if (!current() || !context.pending) return;
      stage = 'READY_CALL';
      const ready = native.getReadyState;
      if (typeof ready === 'function') {
        ready.call(native, {
          success(data) {
            if (!current() || !context.pending) return;
            const result = data && data.status;
            const code = result === 2 ? 'READY_STATUS_2' : unknownStatus('READY', result);
            connection(result === 1 ? 'connected' : 'disconnected', result === 1 ? null : code);
          },
          fail(data, code) { if (current() && context.pending) connection('disconnected', queryFailure('READY', code)); },
        });
      } else {
        stage = 'DIAGNOSIS_CALL';
        const diagnosis = native.diagnosis;
        if (typeof diagnosis === 'function') {
          diagnosis.call(native, {
            timeout: 3000,
            success(data) {
              if (!current() || !context.pending) return;
              const result = data && data.status;
              const code = result === 204 ? 'DIAG_STATUS_204' : result === 1001 ? 'DIAG_STATUS_1001'
                : result === 1000 ? 'DIAG_STATUS_1000' : unknownStatus('DIAG', result);
              connection(result === 0 ? 'connected' : 'disconnected', result === 0 ? null : code);
            },
            fail(data, code) { if (current() && context.pending) connection('disconnected', queryFailure('DIAG', code)); },
          });
        } else {
          stage = 'APK_STATUS_CALL';
          const apkStatus = native.getApkStatus;
          if (typeof apkStatus !== 'function') { initializationFailed('INIT_READY_CALL_API_MISSING'); return; }
          // Old official implementations also return CONNECTING for unresolved states.
          // Query once, then keep the existing deadline for real native events.
          const result = apkStatus.call(native);
          if (!current() || !context.pending) return;
          if (result === 'CONNECTING') {
            context.waitCode = 'APK_CONNECTING_TIMEOUT';
            publish({ kind: 'connection', status: 'connecting', code: 'APK_STATUS_CONNECTING' });
            return;
          }
          const code = result === 'UNINSTALLED' ? 'APK_STATUS_UNINSTALLED' : result === 'DISCONNECTED'
            ? 'APK_STATUS_DISCONNECTED' : legacyDiagnostic(result);
          connection(result === 'CONNECTED' ? 'connected' : 'disconnected', result === 'CONNECTED' ? null : code);
        }
      }
    } catch (error) { initializationFailed('INIT_' + stage + '_' + errorCategory(error)); }
  }
  function stop() {
    const context = owner; owner = null; status = 'disconnected';
    if (!context) return;
    clearQuery(context);
    restoreHandlers(context);
  }
  function send(payload) {
    const context = owner;
    if (!context || context.failed || status !== 'connected' || typeof payload !== 'string') return false;
    let data;
    try { data = JSON.parse(payload); }
    catch (error) { publish({ kind: 'error', code: 'INVALID_PAYLOAD' }); return false; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      publish({ kind: 'error', code: 'INVALID_PAYLOAD' }); return false;
    }
    const generation = ++context.sendGeneration;
    let settled = false;
    function settle() {
      if (owner !== context || context.failed || context.sendGeneration !== generation || settled) return false;
      settled = true;
      return true;
    }
    try {
      const nativeSend = context.native.send;
      if (typeof nativeSend !== 'function') {
        if (settle()) publish({ kind: 'connection', status: 'disconnected', code: 'SEND_API_MISSING' });
        return false;
      }
      nativeSend.call(context.native, { data,
        // Native success only settles delivery. A valid business reply owns freshness.
        success() { settle(); },
        fail() {
          if (!settle()) return;
          publish({ kind: 'connection', status: 'disconnected', code: 'SEND_FAILED' });
        },
      });
      return true;
    } catch (error) {
      if (settle()) publish({ kind: 'connection', status: 'disconnected', code: 'SEND_FAILED' });
      return false;
    }
  }
  return { start, stop, send, subscribe };
}
module.exports = { createTransport };

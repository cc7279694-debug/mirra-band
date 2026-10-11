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
  function start() {
    if (owner) return;
    const context = { native: null, handlers: [], timer: null, pending: false, sendGeneration: 0, failed: false };
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
      slots.forEach(name => {
        stage = 'READ_CALLBACK';
        context.handlers.push({ name, handler: handlers[name], previous: native[name] });
        stage = 'SET_CALLBACK';
        native[name] = handlers[name];
      });
      stage = 'READY_CALL';
      context.pending = true;
      publish({ kind: 'connection', status: 'connecting', code: null });
      context.timer = schedule(() => {
        if (current() && context.pending) connection('disconnected', 'CHANNEL_TIMEOUT');
      }, 3000);
      const ready = native.getReadyState;
      if (typeof ready !== 'function') { initializationFailed('INIT_READY_CALL_API_MISSING'); return; }
      ready.call(native, {
        success(data) {
          if (!current() || !context.pending) return;
          connection(data && data.status === 1 ? 'connected' : 'disconnected');
        },
        fail() { if (current() && context.pending) connection('disconnected', 'CHANNEL_UNAVAILABLE'); },
      });
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
    if (!context || status !== 'connected' || typeof payload !== 'string') return false;
    const generation = ++context.sendGeneration;
    let settled = false;
    function settle() {
      if (owner !== context || context.sendGeneration !== generation || settled) return false;
      settled = true;
      return true;
    }
    try {
      context.native.send({ data: payload,
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

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
  function start() {
    if (owner) return;
    const context = { native: null, handlers: [], timer: null, pending: false };
    owner = context;
    const current = () => owner === context;
    function connection(next, code) {
      if (!current()) return;
      clearQuery(context);
      publish({ kind: 'connection', status: next, code: code || null });
    }
    try {
      const platform = options.loadModule();
      context.native = platform.instance();
      const native = context.native;
      const slots = ['onmessage', 'onopen', 'onclose', 'onerror'];
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
        context.handlers.push({ name, handler: handlers[name], previous: native[name] });
        native[name] = handlers[name];
      });
      context.pending = true;
      publish({ kind: 'connection', status: 'connecting', code: null });
      context.timer = schedule(() => {
        if (current() && context.pending) connection('disconnected', 'CHANNEL_TIMEOUT');
      }, 3000);
      native.getReadyState({
        success(data) {
          if (!current() || !context.pending) return;
          connection(data && data.status === 1 ? 'connected' : 'disconnected');
        },
        fail() { if (current() && context.pending) connection('disconnected', 'CHANNEL_UNAVAILABLE'); },
      });
    } catch (error) { connection('unsupported', 'INTERCONNECT_UNAVAILABLE'); }
  }
  function stop() {
    const context = owner; owner = null; status = 'disconnected';
    if (!context) return;
    clearQuery(context);
    context.handlers.forEach(entry => {
      try { if (context.native[entry.name] === entry.handler) context.native[entry.name] = entry.previous; }
      catch (error) { /* Retired callbacks remain inert even if native teardown fails. */ }
    });
  }
  function send(payload) {
    const context = owner;
    if (!context || status !== 'connected' || typeof payload !== 'string') return false;
    try {
      context.native.send({ data: payload,
        fail() {
          if (owner !== context) return;
          publish({ kind: 'connection', status: 'disconnected', code: 'SEND_FAILED' });
        },
      });
      return true;
    } catch (error) {
      if (owner === context) publish({ kind: 'connection', status: 'disconnected', code: 'SEND_FAILED' });
      return false;
    }
  }
  return { start, stop, send, subscribe };
}
module.exports = { createTransport };

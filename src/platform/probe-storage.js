// This boundary owns only enumerated, mutually isolated file/key namespaces. Native IO cannot be cancelled:
// a timed-out or interrupted call therefore requires a new application process.
const MAX_BYTES = 8192;
function failure(code) { const error = new Error(code); error.code = code; return error; }
function validText(text, maximum) {
  if (typeof text !== 'string') throw failure('INVALID_TEXT');
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw failure('INVALID_UNICODE');
      bytes += 4;
    } else if (code >= 0xdc00 && code <= 0xdfff) throw failure('INVALID_UNICODE');
    else bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
    if (bytes > (maximum || MAX_BYTES)) throw failure('TEXT_TOO_LARGE');
  }
  return text;
}
function createProbeBackend(options) {
  options = options || {};
  const kind = options.kind;
  if (kind !== 'storage' && kind !== 'file') throw failure('INVALID_KIND');
  const namespace = options.namespace === undefined ? 'probe' : options.namespace;
  const names = { probe: ['mirra_05a_journal_a', 'mirra_05a_journal_b'],
    'local-session-test': ['mirra_05b_test_sessions_a', 'mirra_05b_test_sessions_b'],
    'local-session-live': ['mirra_local_sessions_live_a', 'mirra_local_sessions_live_b'],
    'catalog-live': ['mirra_catalog_live_a', 'mirra_catalog_live_b'] };
  if (!Object.prototype.hasOwnProperty.call(names, namespace)) throw failure('INVALID_NAMESPACE');
  if ((namespace === 'local-session-live' || namespace === 'catalog-live') && kind !== 'file') throw failure('INVALID_KIND');
  const maxBytes = namespace === 'catalog-live' ? 32768 : MAX_BYTES;
  const timeoutMs = options.timeoutMs === undefined ? 5000 : options.timeoutMs;
  if (typeof timeoutMs !== 'number' || !isFinite(timeoutMs) || Math.floor(timeoutMs) !== timeoutMs
    || timeoutMs < 1 || timeoutMs > 5000) throw failure('INVALID_TIMEOUT');
  const schedule = options.schedule || setTimeout;
  const cancelSchedule = options.cancelSchedule || clearTimeout;
  if (typeof schedule !== 'function' || typeof cancelSchedule !== 'function') throw failure('INVALID_TIMER');
  let native = null; let loaded = false; let uncertain = false; let closed = false;
  const pending = [];

  function retireAll(code) { pending.slice().forEach(operation => operation.settle(failure(code))); }
  function getNative() {
    if (loaded) return native;
    try {
      if (typeof options.loadModule !== 'function') throw failure('MODULE_LOAD_FAILED');
      native = options.loadModule(kind === 'storage' ? '@system.storage' : '@system.file');
      loaded = true;
      return native;
    } catch (error) { throw failure('MODULE_LOAD_FAILED'); }
  }
  function invoke(slot, text, writing) {
    if (slot !== 0 && slot !== 1) return Promise.reject(failure('INVALID_SLOT'));
    if (closed) return Promise.reject(failure('CLOSED'));
    if (uncertain) return Promise.reject(failure('UNCERTAIN'));
    if (writing) {
      // storage.set with an empty value deletes the key; the probe never deletes slots.
      if (text === '') return Promise.reject(failure('INVALID_TEXT'));
      try { validText(text, maxBytes); } catch (error) { return Promise.reject(error); }
    }
    let module; let method;
    try {
      module = getNative();
      method = module && module[kind === 'storage' ? writing ? 'set' : 'get' : writing ? 'writeText' : 'readText'];
    } catch (error) { return Promise.reject(failure(loaded ? 'API_MISSING' : 'MODULE_LOAD_FAILED')); }
    if (typeof method !== 'function') return Promise.reject(failure('API_MISSING'));

    return new Promise((resolve, reject) => {
      const operation = { timer: null, settled: false, settle };
      function settle(error, value) {
        if (operation.settled) return;
        operation.settled = true;
        const index = pending.indexOf(operation);
        if (index >= 0) pending.splice(index, 1);
        if (operation.timer !== null) {
          try { cancelSchedule(operation.timer); } catch (ignored) { /* Callback remains inert after retirement. */ }
        }
        operation.timer = null;
        if (error) reject(error); else resolve(value);
      }
      pending.push(operation);
      try {
        operation.timer = schedule(() => {
          if (operation.settled) return;
          uncertain = true;
          settle(failure('TIMEOUT'));
          retireAll('UNCERTAIN');
        }, timeoutMs);
      } catch (error) { settle(failure('SCHEDULE_FAILED')); return; }
      if (operation.settled) return;
      const argumentsObject = {
        success(data) {
          if (operation.settled) return;
          if (writing) { settle(data === undefined ? null : failure('CALLBACK_SHAPE')); return; }
          let value;
          try {
            if (kind === 'storage') {
              if (typeof data !== 'string') throw failure('CALLBACK_SHAPE');
              value = data;
            } else {
              if (!data || typeof data !== 'object' || Array.isArray(data)
                || Object.keys(data).length !== 1) throw failure('CALLBACK_SHAPE');
              const descriptor = Object.getOwnPropertyDescriptor(data, 'text');
              if (!descriptor || typeof descriptor.value !== 'string') throw failure('CALLBACK_SHAPE');
              value = descriptor.value;
            }
          } catch (ignored) { settle(failure('CALLBACK_SHAPE')); return; }
          // Validation receives a primitive string and can only throw our own codes.
          try { validText(value, maxBytes); } catch (error) { settle(error); return; }
          settle(null, kind === 'storage' && value === '' ? null : value);
        },
        fail(data, code) {
          if (operation.settled) return;
          if (!writing && kind === 'file' && code === 301) { settle(null, null); return; }
          const safe = typeof code === 'number' && isFinite(code) && Math.floor(code) === code
            && code >= 0 && code <= 9999 ? String(code) : 'UNKNOWN';
          settle(failure('NATIVE_FAIL_' + safe));
        },
      };
      const name = names[namespace][slot];
      if (kind === 'storage') {
        argumentsObject.key = name;
        if (writing) argumentsObject.value = text;
      } else {
        argumentsObject.uri = 'internal://files/' + name + '.json';
        if (writing) argumentsObject.text = text;
      }
      try { method.call(module, argumentsObject); }
      catch (error) {
        if (operation.settled) return;
        uncertain = true;
        settle(failure('NATIVE_THROW'));
        retireAll('UNCERTAIN');
      }
    });
  }
  return {
    read(slot) { return invoke(slot, null, false); },
    write(slot, text) { return invoke(slot, text, true); },
    describe() { return { kind, uncertain, closed, loaded, pendingCount: pending.length, timeoutMs, maxBytes }; },
    close() {
      if (closed) return;
      closed = true;
      if (pending.length) uncertain = true;
      retireAll('CLOSED');
    },
  };
}
module.exports = { createProbeBackend };

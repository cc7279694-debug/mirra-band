const { createJournal } = require('./probe-journal');

// This owner stores synthetic probe records only. It does not own learning time.
function createProbeController(options) {
  options = options || {};
  const now = options.now || Date.now;
  const backendFactory = options.backendFactory;
  if (typeof backendFactory !== 'function') throw new Error('BACKEND_FACTORY');
  // Ephemeral diagnostic marker, not a device identity or a clock/boot guarantee.
  const instanceTag = options.newInstanceId ? options.newInstanceId() : Math.random().toString(36).slice(2, 10) + '-' + Math.random().toString(36).slice(2, 10);
  if (typeof instanceTag !== 'string' || !/^[a-z0-9_-]{1,24}$/.test(instanceTag)) throw new Error('INSTANCE_MARKER');
  let backendKind = 'storage';
  let backend = null;
  let journal = null;
  let busy = false;
  let closed = false;
  let uncertain = false;
  let generation = 0;
  let injectFailure = false;
  let current = { status: 'UNOPENED', sequence: 0, payload: null, slot: null };
  let diagnostic = '仅隔离测试数据；尚未读取';
  let lastWriteMs = null;
  let lastReadMs = null;
  let lastIoCode = null;
  const history = [];
  const listeners = [];

  function code(error) {
    let descriptor;
    try { descriptor = error && Object.getOwnPropertyDescriptor(error, 'code'); } catch (_) { descriptor = null; }
    const value = descriptor && typeof descriptor.value === 'string' ? descriptor.value : 'IO_ERROR';
    return /^[A-Z0-9_]{1,48}$/.test(value) ? value : 'IO_ERROR';
  }
  function fail(value) { const error = new Error(value); error.code = value; return error; }
  function duration(start) { const end = now(); return Number.isSafeInteger(start) && Number.isSafeInteger(end) && end >= start && end - start <= 5000 ? end - start : null; }
  function remember(text) { history.push(text); while (history.length > 8) history.shift(); }
  function clockText() {
    if (!current.payload) return '仅观测墙钟；不计算可信学习时长';
    const value = now();
    const gap = value - current.payload.createdAtUnixMs;
    if (!Number.isSafeInteger(value) || value < 1 || gap < 0) return '时钟回退或异常 · 时间不确定';
    return '墙钟差 ' + Math.floor(gap / 1000) + ' 秒；不计算可信学习时长，重启可靠性待验证';
  }
  function snapshot() {
    return { backend: backendKind, status: closed ? 'CLOSED' : uncertain ? 'UNCERTAIN' : current.status,
      busy, instanceTag, canWrite: !closed && !uncertain && !busy && ['EMPTY', 'READY', 'RECOVERED'].indexOf(current.status) >= 0,
      sequence: current.sequence || 0, recordCount: current.payload ? current.payload.records.length : 0,
      sampleText: current.payload && current.payload.records.length ? current.payload.records[0].text : '',
      diagnostic, lastWriteMs, lastReadMs, clockText: clockText(), historyRows: history.slice(),
      versionName: options.versionName || 'unknown', versionCode: options.versionCode || 0 };
  }
  function publish() {
    listeners.slice().forEach(listener => {
      try { listener(snapshot()); } catch (_) { remember('页面更新失败；存储结果仍以读回为准'); }
    });
  }
  function ensureBackend() {
    if (backend) return;
    backend = backendFactory(backendKind);
    journal = createJournal({ backend: {
      read: async slot => {
        const start = now();
        try { const value = await backend.read(slot); lastIoCode = null; return value; }
        catch (error) { lastIoCode = code(error); throw error; }
        finally { lastReadMs = duration(start); }
      },
      write: async (slot, text) => {
        if (injectFailure) { injectFailure = false; lastIoCode = 'INJECTED_WRITE_FAILURE'; throw fail('INJECTED_WRITE_FAILURE'); }
        const start = now();
        try { await backend.write(slot, text); lastIoCode = null; }
        catch (error) { lastIoCode = code(error); throw error; }
        finally { lastWriteMs = duration(start); }
      }
    } });
  }
  function apply(result) {
    current = Object.assign({}, result, { status: result.status.toUpperCase() });
    if (current.status === 'BLOCKED') diagnostic = '存取被阻止：' + (result.reason || 'RECOVERY_REQUIRED') + (lastIoCode ? ' / ' + lastIoCode : '');
    else if (current.status === 'RECOVERED') diagnostic = '检测到损坏，已读回上一有效测试快照';
    else if (current.status === 'EMPTY') diagnostic = '两个实验槽均不存在，可以写入测试样本';
    else diagnostic = '精确读回与校验通过 · ' + current.payload.label;
  }
  async function operation(action) {
    if (closed) throw fail('CLOSED');
    if (uncertain) throw fail('UNCERTAIN');
    if (busy) throw fail('BUSY');
    busy = true;
    const owner = generation;
    publish();
    try {
      ensureBackend();
      await action();
    } catch (error) {
      if (closed || generation !== owner) return snapshot();
      uncertain = code(error) === 'UNCERTAIN' || code(error) === 'TIMEOUT' || Boolean(backend && backend.describe().uncertain);
      current = Object.assign({}, current, { status: uncertain ? 'UNCERTAIN' : 'BLOCKED' });
      diagnostic = uncertain ? '原生存取结果未知，请退出整个实验应用再打开；禁止再次写入' : '实验操作失败：' + code(error) + '；请重新读回';
      remember(diagnostic);
    } finally {
      if (!closed && owner === generation) { busy = false; publish(); }
    }
    return snapshot();
  }
  function sample(count) {
    const timestamp = now();
    if (!Number.isSafeInteger(timestamp) || timestamp < 1) throw fail('CLOCK_INVALID');
    const records = [];
    for (let index = 0; index < count; index++) records.push({ id: 'probe-' + (index + 1), text: '中文恢复样本📖' });
    return { label: '隔离存储实验', createdAtUnixMs: timestamp, records };
  }
  function requireWritable() {
    if (['EMPTY', 'READY', 'RECOVERED'].indexOf(current.status) < 0) throw fail('RECOVERY_REQUIRED');
  }
  async function save(count) {
    requireWritable();
    const result = await journal.save(sample(count));
    apply(result);
    if (result.status === 'blocked') {
      if (backend.describe().uncertain) { uncertain = true; diagnostic = '原生存取结果未知；请重开整个实验应用'; }
      return false;
    }
    remember('读回确认 #' + result.sequence + ' · ' + count + ' 条测试数据');
    return true;
  }
  async function recover() {
    const result = await journal.recover();
    apply(result);
    if (backend.describe().uncertain) { uncertain = true; diagnostic = '原生存取结果未知；请重开整个实验应用'; }
    remember('重新读取：' + current.status + ' / #' + current.sequence);
  }
  return {
    snapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') throw fail('LISTENER');
      if (closed) return () => {};
      listeners.push(listener);
      return () => { const index = listeners.indexOf(listener); if (index >= 0) listeners.splice(index, 1); };
    },
    open() { return operation(recover); },
    saveSample() { return operation(() => save(1)); },
    runCapacityProbe() { return operation(async () => {
      for (const count of [1, 4, 8, 16, 32]) { if (!await save(count)) break; }
      // Largest tested batch is a lower bound, never a claim about total free space.
      if (current.status === 'READY') diagnostic = '最大已读回批次：32 条；未测设备总容量上限';
    }); },
    runDamageRecovery() { return operation(async () => {
      // Create two verified slots before damaging the newest synthetic copy.
      if (!await save(1) || !await save(1)) return;
      const damagedSlot = current.slot;
      await backend.write(damagedSlot, '{"interrupted":');
      await recover();
    }); },
    runWriteFailure() { return operation(async () => {
      requireWritable(); injectFailure = true;
      try { await save(1); } finally { injectFailure = false; }
      if (current.status === 'BLOCKED') diagnostic = '模拟写入失败；未报告保存成功，请重新读回';
    }); },
    useBackend(kind) {
      if (kind !== 'storage' && kind !== 'file') return Promise.reject(fail('BACKEND_KIND'));
      return operation(async () => {
        if (backend) backend.close();
        backend = null; journal = null; backendKind = kind; injectFailure = false;
        current = { status: 'UNOPENED', sequence: 0, payload: null, slot: null };
        ensureBackend(); await recover();
      });
    },
    noteLifecycle(event) {
      if (closed || ['create', 'show', 'hide', 'destroy'].indexOf(event) < 0) return;
      remember('生命周期：' + event + '；不触发自动保存');
      publish();
    },
    close() {
      if (closed) return;
      closed = true; generation++; busy = false;
      if (backend) backend.close();
      listeners.length = 0;
    }
  };
}
module.exports = { createProbeController };

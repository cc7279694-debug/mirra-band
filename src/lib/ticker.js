function createTicker({
  refresh,
  setInterval: schedule = setInterval,
  clearInterval: cancel = clearInterval,
  intervalMs = 1000,
} = {}) {
  if (typeof refresh !== 'function' || typeof schedule !== 'function'
      || typeof cancel !== 'function') {
    throw new TypeError('Ticker callbacks must be functions');
  }
  if (typeof intervalMs !== 'number' || !isFinite(intervalMs)
      || intervalMs <= 0 || Math.floor(intervalMs) !== intervalMs) {
    throw new RangeError('intervalMs must be a positive integer');
  }

  let visible = false;
  let destroyed = false;
  let handle = null;
  let generation = 0;

  function hide() {
    visible = false;
    generation += 1;
    if (handle !== null) {
      cancel(handle);
      handle = null;
    }
  }

  function show() {
    if (destroyed || visible) return;
    visible = true;
    const activeGeneration = ++generation;
    try {
      refresh();
      // The immediate refresh may navigate away and hide or destroy this page.
      if (destroyed || !visible || activeGeneration !== generation) return;
      handle = schedule(() => {
        if (!destroyed && visible && activeGeneration === generation) refresh();
      }, intervalMs);
    } catch (error) {
      hide();
      throw error;
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    hide();
  }

  return { show, hide, destroy };
}

module.exports = { createTicker };

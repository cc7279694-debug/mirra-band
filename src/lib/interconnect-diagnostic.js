const DEMO_NOTICE = '只读探测；独立演示签名未接入正式 Mirra，不代表真实学习数据。';

// Only these codes are explicitly documented for the Interconnect boundary.
function safeCode(value) {
  return value === 1000 || value === 1001 || value === 1006 ? value : null;
}

function eventCode(data) {
  try {
    return data && typeof data === 'object' ? safeCode(data.code) : null;
  } catch (error) {
    return null;
  }
}

function createDiagnostic(options = {}) {
  const schedule = options.setTimeout || setTimeout;
  const cancel = options.clearTimeout || clearTimeout;
  const timeoutMs = typeof options.timeoutMs === 'number'
    && isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs : 3000;
  let current = null;
  let state = {
    moduleStatus: 'not-probed',
    connectionStatus: 'unknown',
    title: '尚未探测',
    detail: DEMO_NOTICE,
    code: null,
  };

  function snapshot() {
    return Object.assign({}, state);
  }

  function isCurrent(context) {
    return current === context && context.active;
  }

  function clearTimer(context) {
    if (context.timer !== null) {
      cancel(context.timer);
      context.timer = null;
    }
  }

  function dispose() {
    const context = current;
    current = null;
    if (!context) return;
    context.active = false;
    context.queryPending = false;
    clearTimer(context);
    context.handlers.forEach((entry) => {
      try {
        // A later consumer may have replaced our singleton callback.
        if (context.connect[entry.name] === entry.handler) {
          context.connect[entry.name] = entry.previous;
        }
      } catch (error) {
        // Native slots may be inaccessible during teardown; callbacks remain inert.
      }
    });
    context.handlers = [];
    context.onChange = null;
  }

  function publish(context, moduleStatus, connectionStatus, title, detail, code = null) {
    if (!isCurrent(context)) return;
    state = {
      moduleStatus,
      connectionStatus,
      title,
      detail: `${detail} ${DEMO_NOTICE}`,
      code,
    };
    if (typeof context.onChange === 'function') context.onChange(snapshot());
  }

  function settle(context, connectionStatus, title, detail, code = null) {
    if (!isCurrent(context) || !context.queryPending) return;
    context.queryPending = false;
    clearTimer(context);
    publish(context, 'available', connectionStatus, title, detail, code);
  }

  function connectionEvent(context, connectionStatus, title, detail, code = null) {
    if (!isCurrent(context)) return;
    context.queryPending = false;
    clearTimer(context);
    publish(context, 'available', connectionStatus, title, detail, code);
  }

  function attach(context, name, handler) {
    if (!isCurrent(context)) return;
    try {
      const previous = context.connect[name];
      // The platform exposes one callback slot per event. Do not steal an owner.
      if (previous !== null && previous !== undefined) return;
      context.handlers.push({ name, handler, previous });
      context.connect[name] = handler;
    } catch (error) {
      // getReadyState can still provide the bounded read-only result.
    }
  }

  function probe(onChange) {
    dispose();
    const context = {
      active: true,
      onChange,
      connect: null,
      handlers: [],
      timer: null,
      queryPending: false,
    };
    current = context;
    publish(context, 'loading', 'checking', '正在只读探测', '正在读取通信接口。');
    if (!isCurrent(context)) return snapshot();

    let getReadyState;
    try {
      const platform = options.loadModule();
      if (!platform || typeof platform.instance !== 'function') {
        throw new Error('Interconnect instance unavailable');
      }
      context.connect = platform.instance();
      getReadyState = context.connect && context.connect.getReadyState;
      if (typeof getReadyState !== 'function') {
        throw new Error('Interconnect query unavailable');
      }
    } catch (error) {
      publish(context, 'unavailable', 'unknown', '通信接口不可用', '未能读取平台接口，设备支持情况尚未验证。');
      return snapshot();
    }
    if (!isCurrent(context)) return snapshot();
    publish(context, 'available', 'checking', '正在查询通道', '接口已加载，等待平台连接状态。');
    if (!isCurrent(context)) return snapshot();

    context.queryPending = true;
    attach(context, 'onopen', () => {
      connectionEvent(context, 'connected', '通道已连接', '平台报告传输通道已打开；尚未验证 Mirra 双向通信。');
    });
    attach(context, 'onclose', (data) => {
      connectionEvent(context, 'disconnected', '通道未连接', '平台报告传输通道已关闭，原因未知。', eventCode(data));
    });
    attach(context, 'onerror', (data) => {
      const code = eventCode(data);
      if (code === 1006) {
        connectionEvent(context, 'disconnected', '通道未连接', '平台报告传输通道已断开，原因未知。', code);
      } else {
        const detail = code === 1001
          ? '平台报告对应手机应用未安装；尚未验证正式 Mirra 接入。'
          : '平台报告通信错误，连接状态与原因未知。';
        connectionEvent(context, 'unknown', '连接状态未知', detail, code);
      }
    });
    if (!isCurrent(context) || !context.queryPending) return snapshot();

    context.timer = schedule(() => {
      settle(context, 'unknown', '连接状态未知', '只读查询超时，不能据此判断配对或兼容情况。');
    }, timeoutMs);
    try {
      getReadyState.call(context.connect, {
        success(data) {
          let status;
          try {
            status = data && typeof data === 'object' ? data.status : undefined;
          } catch (error) {
            status = undefined;
          }
          if (status === 1) {
            settle(context, 'connected', '通道已连接', '平台报告传输通道已打开；尚未验证 Mirra 双向通信。');
          } else if (status === 2) {
            settle(context, 'disconnected', '通道未连接', '平台报告传输通道已断开，原因未知。');
          } else {
            settle(context, 'unknown', '连接状态未知', '平台未返回可识别的连接状态。');
          }
        },
        fail(data, rawCode) {
          const code = safeCode(rawCode);
          if (code === 1006) {
            settle(context, 'disconnected', '通道未连接', '平台报告传输通道已断开，原因未知。', code);
          } else {
            settle(context, 'unknown', '连接状态未知', '只读查询失败，连接状态与原因未知。', code);
          }
        },
      });
    } catch (error) {
      settle(context, 'unknown', '连接状态未知', '平台连接查询未完成，原因未知。');
    }
    return snapshot();
  }

  return { probe, snapshot, dispose };
}

module.exports = { createDiagnostic };

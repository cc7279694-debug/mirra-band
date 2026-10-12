const CONNECTION_COPY = {
  connecting: ['正在连接', '打开手机 Mirra，确认手环伴侣已启用'],
  disconnected: ['连接已中断', '靠近手机并检查蓝牙，然后重试'],
  unsupported: ['当前无法连接', '请在手机查看手环伴侣的兼容情况'],
  unauthorized: ['需要手机授权', '请在手机的手环伴侣页完成设备授权'],
  identity_error: ['应用身份不匹配', '请安装与手机 Mirra 配套的手环版本'],
  disabled: ['手环伴侣已关闭', '请在手机「我的 → 手环伴侣」启用'],
  source_busy: ['手机正在处理数据', '完成后重新连接获取最新状态'],
  source_unavailable: ['暂时无法获取状态', '请打开手机 Mirra 后重试'],
};
const CONTROL_COPY = {
  STALE_STATE: '手机状态已变化，请查看最新状态后再操作',
  REQUIRES_PHONE: '请打开手机 Mirra 完成操作，准备内容已保留',
  DISABLED: '请在手机手环伴侣页开启学习控制',
  UNAUTHORIZED: '请在手机确认手环授权后再操作',
  BUSY: '手机正在处理，请稍后查看最新状态',
  FAILED: '手机未能完成操作，请在手机查看',
  RESULT_UNKNOWN: '结果未确认，正在同步',
};

function truncate(value, limit) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  const characters = [];
  for (let index = 0; index < text.length; index += 1) {
    const first = text.charCodeAt(index);
    if (first >= 0xD800 && first <= 0xDBFF && index + 1 < text.length) {
      const second = text.charCodeAt(index + 1);
      if (second >= 0xDC00 && second <= 0xDFFF) {
        characters.push(text.slice(index, index + 2));
        index += 1;
        continue;
      }
    }
    if (first < 0xD800 || first > 0xDFFF) characters.push(text.charAt(index));
  }
  if (characters.length <= limit) return characters.join('');
  return characters.slice(0, limit - 1).join('') + '…';
}

function isDuration(value) {
  return typeof value === 'number' && isFinite(value) && value >= 0
    && Math.floor(value) === value && value <= 9007199254740991;
}

function textRows(value, limit) {
  const text = truncate(value, 200);
  const rows = [];
  text.split(/\r\n|\r|\n/).forEach(line => {
    let start = 0;
    let characters = 0;
    for (let index = 0; index < line.length; index += 1) {
      const code = line.charCodeAt(index);
      if (code >= 0xD800 && code <= 0xDBFF) index += 1;
      characters += 1;
      if (characters === limit) {
        rows.push(line.slice(start, index + 1));
        start = index + 1;
        characters = 0;
      }
    }
    if (start < line.length || line.length === 0 && text.length > 0) rows.push(line.slice(start));
  });
  return rows;
}

function formatDuration(value, remaining) {
  if (!isDuration(value)) return '';
  const seconds = remaining ? Math.ceil(value / 1000) : Math.floor(value / 1000);
  const hours = Math.floor(seconds / 3600);
  if (hours >= 100) return '99小时+';
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return hours + '小时' + minutes + '分';
  const pad = (number) => number < 10 ? '0' + number : String(number);
  return pad(minutes) + ':' + pad(seconds % 60);
}

function monitoringText(body) {
  if (!body) return '尚无手机监测信息';
  if (body.coverage === 'NONE' || body.segmentType === 'UNMONITORED') return '本次阅读未监测';
  if (body.coverage === 'PARTIAL' || body.monitorAvailability === 'UNAVAILABLE') return '本次监测已中断';
  if (body.monitorAvailability !== 'AVAILABLE' || body.coverage !== 'FULL') return '当前监测情况待确认';
  return '手机当前监测可用';
}

function present(input) {
  input = input || {};
  const body = input.body || null;
  const demo = input.mode === 'demo';
  const connected = input.connection === 'connected';
  const fresh = connected && (input.freshness === 'fresh' || input.freshness === 'updating');
  const age = isDuration(input.lastSyncedAgeMs) ? input.lastSyncedAgeMs : null;
  const ageText = age === null ? '' : age < 60000
    ? Math.floor(age / 1000) + ' 秒前' : Math.floor(age / 60000) + ' 分钟前';
  const view = {
    showDemo: demo, demoLabel: demo ? '演示数据' : '', title: '', titleClass: 'state',
    tone: fresh ? 'normal' : 'warning', syncText: '', hasTimer: false, timerText: '',
    timerLabel: '', timerClass: 'timer', heroText: '', hint: '', bookTitle: '',
    fullBookTitle: '', bookRows: [], bookNotice: '', pageText: '', firstAction: '',
    firstActionRows: [], actionNotice: '', hasFirstAction: false,
    monitorText: '', detailTimerText: '', detailTimerLabel: '', precisionText: '',
    canRetry: !fresh, helpText: '', connectionText: '', errorText: '',
    canStartBreak: false, canFinishBreak: false, canConfirmStart: false,
    hasControl: false, controlBusy: false, controlLabel: '', controlMessage: '',
  };
  view.syncText = fresh
    ? input.freshness === 'updating' ? '正在更新' : ageText ? '已同步 · ' + ageText : '刚刚同步'
    : ageText ? '上次同步 · ' + ageText : '尚未同步手机状态';
  view.connectionText = connected ? '手机通道已连通' : '手机通道尚未连通';
  view.errorText = typeof input.errorCode === 'string' ? truncate(input.errorCode, 45) : '';
  const control = input.control || {};
  view.controlBusy = !demo && control.busy === true;
  view.controlMessage = !demo ? control.busy ? control.resultCode ? CONTROL_COPY[control.resultCode] || '手机已回复，正在同步' : '正在请求手机确认'
    : control.monitorDegraded === true ? '已开始，但监测降级；请在手机查看'
    : CONTROL_COPY[control.resultCode] || '' : '';

  const unavailable = input.connection === 'source_busy' || input.connection === 'source_unavailable'
    || input.connection === 'disabled' || input.connection === 'unauthorized'
    || input.connection === 'identity_error' || input.connection === 'unsupported';
  if (!body || unavailable) {
    const copy = CONNECTION_COPY[input.connection] || ['等待手机状态', '请打开手机 Mirra 后重试'];
    view.title = copy[0];
    view.heroText = copy[1];
    view.helpText = copy[1];
    view.monitorText = '尚无手机监测信息';
    return view;
  }

  view.bookTitle = truncate(body.bookTitle, 24);
  view.fullBookTitle = truncate(body.bookTitle, 120);
  view.bookRows = textRows(view.fullBookTitle, 24);
  view.bookNotice = body.bookTitleTruncated || view.fullBookTitle !== (body.bookTitle || '').trim()
    ? '书名已截短，可在手机查看完整内容' : '';
  view.firstAction = truncate(body.firstAction, 200);
  view.firstActionRows = textRows(view.firstAction, 24);
  view.actionNotice = body.firstActionTruncated || view.firstAction !== (body.firstAction || '').trim()
    ? '动作已截短，可在手机查看完整内容' : '';
  view.hasFirstAction = !!view.firstAction;
  view.pageText = isDuration(body.currentPage)
    ? '第 ' + body.currentPage + ' 页' + (isDuration(body.totalPages) && body.totalPages > 0 ? ' / ' + body.totalPages + ' 页' : '') : '';
  view.monitorText = monitoringText(body);
  const timer = input.timer || {};
  const freeze = !fresh || body.phase === 'SAVING' || body.phase === 'ENDED';
  const countdown = body.timerKind === 'BREAK_REMAINING' || body.timerKind === 'ALLOWANCE_REMAINING';
  const elapsed = freeze ? body.elapsedMs : isDuration(timer.elapsedMs) ? timer.elapsedMs : body.elapsedMs;
  const remaining = freeze ? body.remainingMs : isDuration(timer.remainingMs) ? timer.remainingMs : body.remainingMs;
  const duration = countdown ? remaining : elapsed;
  view.detailTimerText = formatDuration(duration, countdown);
  view.detailTimerLabel = countdown ? '剩余时间' : body.phase === 'PREPARING' ? '准备已进行'
    : body.phase === 'SAVING' || body.phase === 'ENDED' ? '本次时长' : '本次已进行';
  view.timerText = view.detailTimerText;
  view.timerLabel = view.detailTimerLabel;
  view.hasTimer = !!view.timerText && body.timerKind !== 'NONE' && body.phase !== 'PREPARING' && body.phase !== 'IDLE';
  view.timerClass = view.timerText.indexOf('小时') >= 0 ? 'timer timer-long' : 'timer';
  view.precisionText = view.hasTimer && !freeze && timer.interpolated !== true ? '仅显示手机确认值' : '';

  if (!fresh) {
    view.title = input.connection === 'disconnected' ? '连接已中断' : '状态待更新';
    view.timerLabel = countdown ? '上次确认剩余' : '上次确认时长';
    view.heroText = view.hasTimer ? '' : '当前学习状态尚未确认';
    view.hint = '显示上次确认的信息';
    view.helpText = '重新连接后获取完整状态';
    return view;
  }

  const actions = !demo && !control.busy && Array.isArray(control.availableActions) ? control.availableActions : [];
  view.canStartBreak = body.phase === 'ACTIVE' && ['FOCUS', 'DEEP_FOCUS', 'UNMONITORED'].indexOf(body.segmentType) >= 0
    && actions.indexOf('START_BREAK') >= 0;
  view.canFinishBreak = body.phase === 'ACTIVE' && body.segmentType === 'BREAK' && actions.indexOf('FINISH_BREAK') >= 0;
  view.canConfirmStart = body.phase === 'PREPARING' && !view.actionNotice && !!view.firstAction
    && actions.indexOf('CONFIRM_PREPARATION_AND_START') >= 0;
  view.hasControl = view.canStartBreak || view.canFinishBreak || view.canConfirmStart || view.controlBusy;
  view.controlLabel = view.controlBusy ? '正在确认' : view.canStartBreak ? '休息'
    : view.canFinishBreak ? '结束休息' : view.canConfirmStart ? '确认第一步' : '';

  if (body.phase === 'IDLE') {
    view.title = '等待开始';
    view.heroText = '请在手机开始';
    view.hint = '手环会同步当前阅读';
  } else if (body.phase === 'PREPARING') {
    view.title = '先完成这一步';
    view.heroText = truncate(body.firstAction, 27) || '请在手机查看准备动作';
    view.hint = view.canConfirmStart ? '读完详情，再明确确认' : '完成后请在手机确认';
  } else if (body.phase === 'SAVING') {
    view.title = '正在保存本次阅读';
    view.hint = '请等待手机完成保存';
  } else if (body.phase === 'ENDED') {
    view.title = body.endType === 'NORMAL' ? '记录已保存' : '本次学习已中断';
    view.hint = '阅读已结束';
  } else if (body.phase === 'ACTIVE') {
    if (body.segmentType === 'BREAK') {
      view.title = '休息中';
      view.hint = remaining === 0 ? '休息时间已到' : '让目光歇一会儿';
    } else if (body.segmentType === 'TEMPORARY_ALLOWANCE') {
      view.title = '临时处理事情';
      view.hint = remaining === 0 ? '临时用途时间已到' : '处理好后回到书本';
    } else if (body.segmentType === 'DISTRACTION') {
      view.title = '暂时离开了学习';
      view.hint = '下一步，回到当前页';
    } else if (body.segmentType === 'RECOVERY') {
      view.title = '正在回到学习';
      view.hint = '从当前页接着读';
    } else if (body.coverage === 'NONE' || body.segmentType === 'UNMONITORED') {
      view.title = '阅读中 · 未监测';
    } else if (body.coverage === 'PARTIAL' || body.monitorAvailability === 'UNAVAILABLE') {
      view.title = '阅读中 · 监测已中断';
    } else if (body.monitorAvailability !== 'AVAILABLE' || body.coverage !== 'FULL') {
      view.title = '阅读中 · 监测待确认';
    } else if (body.segmentType === 'DEEP_FOCUS') {
      view.title = '深度专注';
    } else if (body.segmentType === 'FOCUS') {
      view.title = '专注中';
    } else {
      view.title = '阅读中';
    }
    if (!view.hasTimer) view.heroText = '时间暂不可用';
  } else {
    view.title = '状态待确认';
    view.hasTimer = false;
    view.timerText = '';
  }
  if (view.title.length > 9) view.titleClass = 'state state-small';
  view.helpText = demo ? '当前使用演示数据，不会控制手机学习'
    : control.negotiated ? '仅执行手机允许的操作。书籍、页码与结束阅读请在手机管理。'
    : '当前为只读同步。学习操作请在手机完成。';
  return view;
}

module.exports = { present, truncate, formatDuration, textRows };

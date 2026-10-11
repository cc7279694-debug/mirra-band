const STATES = [
  { id: 'idle', label: '未开始' },
  { id: 'preparing', label: '启动准备' },
  { id: 'focus', label: '专注' },
  { id: 'break', label: '休息' },
  { id: 'recovery', label: '恢复' },
  { id: 'unmonitored', label: '未监测' },
  { id: 'disconnected', label: '断连' },
];

const DETAILS = {
  idle: {
    timerLabel: '尚未开始学习',
    message: '选择测试状态，查看手环演示。',
  },
  preparing: {
    timerLabel: '示例第一步',
    message: '打开书本，读完当前页。仅模拟准备动作。',
  },
  focus: {
    timerLabel: '专注演示时长',
    message: '仅演示计时，不生成真实学习记录。',
  },
  break: {
    timerLabel: '休息演示剩余',
    message: '休息不计为有效专注。归零后保持休息。',
  },
  recovery: {
    timerLabel: '恢复演示时长',
    message: '回到书本，重新找到下一步。恢复不计为有效专注。',
  },
  unmonitored: {
    timerLabel: '会话演示时长',
    message: '当前未监测，尚未验证是否专注。',
  },
  disconnected: {
    timerLabel: '无实时数据',
    message: '模拟手机未连接，无实时手机数据。',
  },
};

const DEFAULT_BOOK = '怪诞行为学';
const DEFAULT_BREAK_MS = 300000;
const MAX_SAFE_INTEGER = 9007199254740991;

function normalizeBook(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title) return DEFAULT_BOOK;
  if (title.length <= 24) return title;
  let shortened = title.slice(0, 23);
  const lastCode = shortened.charCodeAt(shortened.length - 1);
  if (lastCode >= 0xD800 && lastCode <= 0xDBFF) {
    shortened = shortened.slice(0, -1);
  }
  return shortened + '…';
}

function formatTime(totalSeconds) {
  if (totalSeconds >= 360000) return '99小时+';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const twoDigits = (value) => value < 10 ? '0' + value : String(value);
  const minutesAndSeconds = twoDigits(minutes) + ':' + twoDigits(seconds);
  return hours > 0 ? twoDigits(hours) + ':' + minutesAndSeconds : minutesAndSeconds;
}

function createDemo({ now = Date.now } = {}) {
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  function readClock() {
    const value = now();
    if (typeof value !== 'number' || !isFinite(value)) {
      throw new TypeError('now must return a finite timestamp');
    }
    return value;
  }

  let stateId = 'idle';
  let anchor = readClock();
  let elapsedMs = 0;
  let breakDurationMs = DEFAULT_BREAK_MS;
  let bookTitle = DEFAULT_BOOK;

  function reset() {
    const nextAnchor = readClock();
    anchor = nextAnchor;
    elapsedMs = 0;
  }

  function select(id, options = {}) {
    if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(DETAILS, id)) {
      throw new RangeError('Unknown demonstration state');
    }
    const duration = options.breakDurationMs === undefined
      ? DEFAULT_BREAK_MS : options.breakDurationMs;
    if (typeof duration !== 'number' || !isFinite(duration)
        || duration <= 0 || Math.floor(duration) !== duration || duration > MAX_SAFE_INTEGER) {
      throw new RangeError('breakDurationMs must be a positive safe integer');
    }
    const nextBook = normalizeBook(options.bookTitle);
    const nextAnchor = readClock();
    stateId = id;
    bookTitle = nextBook;
    breakDurationMs = duration;
    anchor = nextAnchor;
    elapsedMs = 0;
  }

  function completePreparation() {
    if (stateId !== 'preparing') return false;
    const nextAnchor = readClock();
    stateId = 'focus';
    anchor = nextAnchor;
    elapsedMs = 0;
    return true;
  }

  function snapshot() {
    const details = DETAILS[stateId];
    const hasTimer = stateId === 'focus' || stateId === 'break'
      || stateId === 'recovery' || stateId === 'unmonitored';
    let timerText = '--:--';
    if (hasTimer) {
      // A rollback pauses the display until the clock catches up; refreshes never add time.
      elapsedMs = Math.max(elapsedMs, 0, readClock() - anchor);
      const seconds = stateId === 'break'
        ? Math.ceil(Math.max(0, breakDurationMs - elapsedMs) / 1000)
        : Math.floor(elapsedMs / 1000);
      timerText = formatTime(seconds);
    }
    const isPreparing = stateId === 'preparing';
    return {
      stateId,
      stateLabel: STATES.filter((state) => state.id === stateId)[0].label,
      timerText,
      timerLabel: details.timerLabel,
      bookTitle,
      message: details.message,
      actionLabel: isPreparing ? '模拟完成准备' : hasTimer ? '重置演示计时' : '',
      simulationLabel: '测试模式 / 模拟数据',
      canAct: isPreparing || hasTimer,
      hasTimer,
    };
  }

  return { select, reset, completePreparation, snapshot };
}

module.exports = { createDemo, STATES };

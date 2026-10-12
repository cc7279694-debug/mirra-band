const VERSION = 1;
const CONTROL_VERSION = 2;
const MAX_BYTES = 4096;
const ACTIONS = ['START_BREAK', 'FINISH_BREAK', 'CONFIRM_PREPARATION_AND_START'];
const RESULT_CODES = ['APPLIED', 'ALREADY_APPLIED', 'STALE_STATE', 'REQUIRES_PHONE', 'DISABLED', 'UNAUTHORIZED', 'BUSY', 'FAILED', 'RESULT_UNKNOWN'];
const BODY_KEYS = ['phase', 'intentId', 'sessionId', 'learningItemId', 'bookTitle', 'currentPage', 'totalPages', 'firstAction', 'bookTitleTruncated', 'firstActionTruncated', 'segmentType', 'coverage', 'monitorAvailability', 'elapsedMs', 'remainingMs', 'timerKind', 'endType'];
function reject(code) { throw new Error(code); }
function integer(value) { return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0 && value <= 9007199254740991; }
function textInfo(value) {
  let bytes = 0; let points = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i); points++;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) reject('UNICODE');
      bytes += 4;
    } else if (code >= 0xdc00 && code <= 0xdfff) reject('UNICODE');
    else bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
  }
  return { bytes, points };
}
function utf8Bytes(value) { if (typeof value !== 'string') reject('TEXT'); return textInfo(value).bytes; }
function nullableText(value, limit) { if (value !== null && (typeof value !== 'string' || textInfo(value).points > limit)) reject('TEXT'); }
function id(value, nullable) { if (nullable && value === null) return; if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,80}$/.test(value)) reject('ID'); }
function enumeration(value, values) { if (values.indexOf(value) < 0) reject('ENUM'); }
function keys(object, required, optional) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) reject('OBJECT');
  if (required.some(key => !Object.prototype.hasOwnProperty.call(object, key))) reject('MISSING');
  if (Object.keys(object).some(key => required.indexOf(key) < 0 && (optional || []).indexOf(key) < 0)) reject('FIELD');
}
function safeTree(value, depth) {
  if (depth > 4) reject('DEPTH');
  if (!value || typeof value !== 'object') return;
  Object.keys(value).forEach(key => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') reject('KEY');
    safeTree(value[key], depth + 1);
  });
}
// JSON.parse overwrites duplicate keys. A bounded structural pass rejects them
// before the standard parser performs full JSON syntax and value validation.
function checkJsonKeys(text) {
  let offset = 0;
  const whitespace = () => { while (offset < text.length && /[ \t\r\n]/.test(text.charAt(offset))) offset++; };
  function quoted() {
    if (text.charAt(offset) !== '"') reject('JSON');
    const start = offset++;
    while (offset < text.length) {
      const char = text.charAt(offset++);
      if (char === '\\') offset++;
      else if (char === '"') {
        try { return JSON.parse(text.slice(start, offset)); } catch (error) { reject('JSON'); }
      }
    }
    reject('JSON');
  }
  function value(depth) {
    if (depth > 4) reject('DEPTH');
    whitespace();
    const first = text.charAt(offset);
    if (first === '{') {
      offset++; whitespace(); const seen = [];
      if (text.charAt(offset) === '}') { offset++; return; }
      while (offset < text.length) {
        whitespace(); const key = quoted();
        if (seen.indexOf(key) >= 0) reject('DUPLICATE');
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') reject('KEY');
        seen.push(key); whitespace(); if (text.charAt(offset++) !== ':') reject('JSON');
        value(depth + 1); whitespace(); const separator = text.charAt(offset++);
        if (separator === '}') return; if (separator !== ',') reject('JSON');
      }
      reject('JSON');
    } else if (first === '[') {
      offset++; whitespace(); if (text.charAt(offset) === ']') { offset++; return; }
      while (offset < text.length) {
        value(depth + 1); whitespace(); const separator = text.charAt(offset++);
        if (separator === ']') return; if (separator !== ',') reject('JSON');
      }
      reject('JSON');
    } else if (first === '"') { const decoded = quoted(); textInfo(decoded); }
    else {
      const start = offset;
      while (offset < text.length && !/[,\]} \t\r\n]/.test(text.charAt(offset))) offset++;
      if (start === offset) reject('JSON');
    }
  }
  value(0); whitespace(); if (offset !== text.length) reject('JSON');
}
function validateBody(body) {
  keys(body, BODY_KEYS);
  enumeration(body.phase, ['IDLE', 'PREPARING', 'ACTIVE', 'SAVING', 'ENDED']);
  ['intentId', 'sessionId', 'learningItemId'].forEach(key => id(body[key], true));
  nullableText(body.bookTitle, 120); nullableText(body.firstAction, 180); nullableText(body.endType, 40);
  ['bookTitleTruncated', 'firstActionTruncated'].forEach(key => { if (typeof body[key] !== 'boolean') reject('BOOLEAN'); });
  ['currentPage', 'totalPages', 'elapsedMs', 'remainingMs'].forEach(key => { if (body[key] !== null && !integer(body[key])) reject('NUMBER'); });
  if (body.totalPages !== null && body.totalPages < 1) reject('PAGE');
  if (body.currentPage !== null && (body.currentPage < 1 || body.totalPages === null || body.currentPage > body.totalPages)) reject('PAGE');
  enumeration(body.segmentType, [null, 'FOCUS', 'DEEP_FOCUS', 'BREAK', 'TEMPORARY_ALLOWANCE', 'DISTRACTION', 'RECOVERY', 'UNMONITORED']);
  enumeration(body.coverage, [null, 'FULL', 'PARTIAL', 'NONE']);
  enumeration(body.monitorAvailability, ['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN']);
  enumeration(body.timerKind, ['NONE', 'PREPARATION_ELAPSED', 'SESSION_ELAPSED', 'BREAK_REMAINING', 'ALLOWANCE_REMAINING', 'FINAL_SESSION_DURATION']);
  if (['ACTIVE', 'SAVING', 'ENDED'].indexOf(body.phase) >= 0 && body.sessionId === null) reject('OWNERSHIP');
  if (body.phase === 'PREPARING' && (body.intentId === null || body.sessionId !== null)) reject('OWNERSHIP');
  if (body.phase === 'IDLE' && (body.sessionId !== null || body.intentId !== null || body.timerKind !== 'NONE')) reject('OWNERSHIP');
  if (body.phase === 'SAVING' && body.timerKind !== 'FINAL_SESSION_DURATION' && body.timerKind !== 'NONE') reject('TIMER');
  if (body.phase === 'ENDED' && body.timerKind !== 'FINAL_SESSION_DURATION' && body.timerKind !== 'NONE') reject('TIMER');
  return body;
}
function validateCapabilities(capabilities, version) {
  if (!Array.isArray(capabilities) || capabilities[0] !== 'READ_ONLY_SNAPSHOT' ||
      (capabilities.length !== 1 && !(version === CONTROL_VERSION && capabilities.length === 2 && capabilities[1] === 'SESSION_CONTROL'))) reject('CAPABILITY');
}
function validateControl(control, body, observedAt) {
  keys(control, ['activeSegmentId', 'allowedActions', 'controlGrant', 'grantExpiresAtUnixMs', 'expectedFirstAction']);
  id(control.activeSegmentId, true); id(control.controlGrant, true);
  nullableText(control.expectedFirstAction, 180);
  if (!Array.isArray(control.allowedActions) || control.allowedActions.length > ACTIONS.length) reject('ACTION');
  control.allowedActions.forEach((action, index) => {
    enumeration(action, ACTIONS);
    if (control.allowedActions.indexOf(action) !== index) reject('ACTION');
  });
  if (!control.allowedActions.length) {
    if (control.controlGrant !== null || control.grantExpiresAtUnixMs !== null || control.expectedFirstAction !== null) reject('GRANT');
  } else {
    if (control.controlGrant === null || !integer(control.grantExpiresAtUnixMs) || control.grantExpiresAtUnixMs <= observedAt || control.grantExpiresAtUnixMs - observedAt > 30000) reject('GRANT');
    control.allowedActions.forEach(action => {
      if (action === 'CONFIRM_PREPARATION_AND_START') {
        if (body.phase !== 'PREPARING' || body.firstActionTruncated || body.firstAction === null || !body.firstAction.trim() || control.expectedFirstAction !== body.firstAction || control.activeSegmentId !== null || body.currentPage === null) reject('CONTROL_STATE');
      } else {
        if (body.phase !== 'ACTIVE' || control.activeSegmentId === null || control.expectedFirstAction !== null) reject('CONTROL_STATE');
        if (action === 'START_BREAK' && ['FOCUS', 'DEEP_FOCUS', 'UNMONITORED'].indexOf(body.segmentType) < 0) reject('CONTROL_STATE');
        if (action === 'FINISH_BREAK' && body.segmentType !== 'BREAK') reject('CONTROL_STATE');
      }
    });
  }
  if (body.phase !== 'ACTIVE' && control.activeSegmentId !== null) reject('CONTROL_STATE');
}
function validateCommand(message) {
  id(message.controlGrant); enumeration(message.action, ACTIONS);
  ['expectedIntentId', 'expectedSessionId', 'expectedSegmentId', 'expectedBookId'].forEach(key => id(message[key], true));
  nullableText(message.expectedFirstAction, 180);
  if (message.action === 'CONFIRM_PREPARATION_AND_START') {
    if (message.expectedIntentId === null || message.expectedBookId === null || !integer(message.expectedPage) || message.expectedPage < 1 || message.expectedPage > 2147483647 ||
        message.expectedFirstAction === null || !message.expectedFirstAction.trim() || message.expectedSessionId !== null || message.expectedSegmentId !== null || message.breakMinutes !== null) reject('COMMAND_STATE');
  } else {
    if (message.expectedSessionId === null || message.expectedSegmentId === null || message.expectedBookId !== null || message.expectedPage !== null || message.expectedFirstAction !== null) reject('COMMAND_STATE');
    if (message.action === 'START_BREAK') enumeration(message.breakMinutes, [5, 10]);
    else if (message.breakMinutes !== null) reject('COMMAND_STATE');
  }
}
function decodeMessage(payload, expected) {
  if (typeof payload !== 'string') reject('TEXT');
  if (utf8Bytes(payload) > MAX_BYTES) reject('SIZE');
  checkJsonKeys(payload);
  let message; try { message = JSON.parse(payload); } catch (error) { reject('JSON'); }
  safeTree(message, 0);
  const common = ['protocolVersion', 'type', 'clientInstanceId', 'requestId'];
  if (!message || (message.protocolVersion !== VERSION && message.protocolVersion !== CONTROL_VERSION)) reject('VERSION');
  id(message.clientInstanceId); id(message.requestId);
  if (message.type === 'HELLO' || message.type === 'HELLO_ACK') {
    keys(message, common.concat(message.type === 'HELLO_ACK' ? ['streamId', 'capabilities'] : ['capabilities']));
    validateCapabilities(message.capabilities, message.protocolVersion);
  } else if (message.type === 'GET_SNAPSHOT') {
    keys(message, common.concat(['streamId', 'lastSeenSessionId'])); id(message.lastSeenSessionId, true);
  } else if (message.type === 'SNAPSHOT') {
    keys(message, common.concat(['streamId', 'sequence', 'sourceObservedAtUnixMs', 'body']).concat(message.protocolVersion === CONTROL_VERSION ? ['control'] : []));
    if (!integer(message.sequence) || message.sequence < 1 || !integer(message.sourceObservedAtUnixMs) || message.sourceObservedAtUnixMs < 1) reject('NUMBER');
    validateBody(message.body);
    if (message.protocolVersion === CONTROL_VERSION) {
      const body = message.body;
      if (['PREPARING', 'ACTIVE', 'SAVING', 'ENDED'].indexOf(body.phase) >= 0 && body.learningItemId === null) reject('OWNERSHIP');
      if (body.phase === 'ACTIVE' && (body.segmentType === null || body.coverage === null)) reject('OWNERSHIP');
      if (body.phase !== 'ACTIVE' && body.segmentType !== null) reject('OWNERSHIP');
      validateControl(message.control, body, message.sourceObservedAtUnixMs);
    }
  } else if (message.type === 'STATUS_ERROR') {
    keys(message, common.concat(['code']), ['streamId']);
    enumeration(message.code, ['SOURCE_BUSY', 'DISABLED', 'UNSUPPORTED_PROTOCOL', 'SOURCE_UNAVAILABLE', 'UNAUTHORIZED', 'IDENTITY_ERROR']);
  } else if (message.type === 'COMMAND' && message.protocolVersion === CONTROL_VERSION) {
    keys(message, common.concat(['streamId', 'controlGrant', 'action', 'expectedIntentId', 'expectedSessionId', 'expectedSegmentId', 'expectedBookId', 'expectedPage', 'expectedFirstAction', 'breakMinutes']));
    validateCommand(message);
  } else if (message.type === 'COMMAND_RESULT' && message.protocolVersion === CONTROL_VERSION) {
    keys(message, common.concat(['streamId', 'action', 'code', 'sessionId', 'monitorDegraded']));
    enumeration(message.action, ACTIONS); enumeration(message.code, RESULT_CODES); id(message.sessionId, true);
    if (typeof message.monitorDegraded !== 'boolean') reject('BOOLEAN');
    const committed = ['APPLIED', 'ALREADY_APPLIED'].indexOf(message.code) >= 0;
    if (committed && message.sessionId === null) reject('RESULT');
    if (message.monitorDegraded && (!committed || message.action !== 'CONFIRM_PREPARATION_AND_START' || message.sessionId === null)) reject('RESULT');
  } else reject('COMMAND');
  if (message.streamId !== undefined) id(message.streamId);
  if (expected) ['protocolVersion', 'clientInstanceId', 'requestId', 'streamId'].forEach(key => {
    if (expected[key] !== undefined && message[key] !== expected[key]) reject('CONTEXT');
  });
  return message;
}
function encodeMessage(message) {
  const payload = JSON.stringify(message);
  decodeMessage(payload);
  return payload;
}
module.exports = { VERSION, CONTROL_VERSION, ACTIONS, RESULT_CODES, MAX_BYTES, BODY_KEYS, integer, utf8Bytes, validateBody, decodeMessage, encodeMessage };

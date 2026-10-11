const VERSION = 1;
const MAX_BYTES = 4096;
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
function decodeMessage(payload, expected) {
  if (typeof payload !== 'string') reject('TEXT');
  if (utf8Bytes(payload) > MAX_BYTES) reject('SIZE');
  checkJsonKeys(payload);
  let message; try { message = JSON.parse(payload); } catch (error) { reject('JSON'); }
  safeTree(message, 0);
  const common = ['protocolVersion', 'type', 'clientInstanceId', 'requestId'];
  if (!message || message.protocolVersion !== VERSION) reject('VERSION');
  id(message.clientInstanceId); id(message.requestId);
  if (message.type === 'HELLO' || message.type === 'HELLO_ACK') {
    keys(message, common.concat(message.type === 'HELLO_ACK' ? ['streamId', 'capabilities'] : ['capabilities']));
    if (!Array.isArray(message.capabilities) || message.capabilities.length !== 1 || message.capabilities[0] !== 'READ_ONLY_SNAPSHOT') reject('CAPABILITY');
  } else if (message.type === 'GET_SNAPSHOT') {
    keys(message, common.concat(['streamId', 'lastSeenSessionId'])); id(message.lastSeenSessionId, true);
  } else if (message.type === 'SNAPSHOT') {
    keys(message, common.concat(['streamId', 'sequence', 'sourceObservedAtUnixMs', 'body']));
    if (!integer(message.sequence) || message.sequence < 1 || !integer(message.sourceObservedAtUnixMs) || message.sourceObservedAtUnixMs < 1) reject('NUMBER');
    validateBody(message.body);
  } else if (message.type === 'STATUS_ERROR') {
    keys(message, common.concat(['code']), ['streamId']);
    enumeration(message.code, ['SOURCE_BUSY', 'DISABLED', 'UNSUPPORTED_PROTOCOL', 'SOURCE_UNAVAILABLE', 'UNAUTHORIZED', 'IDENTITY_ERROR']);
  } else reject('COMMAND');
  if (message.streamId !== undefined) id(message.streamId);
  if (expected) ['clientInstanceId', 'requestId', 'streamId'].forEach(key => {
    if (expected[key] !== undefined && message[key] !== expected[key]) reject('CONTEXT');
  });
  return message;
}
function encodeMessage(message) {
  const payload = JSON.stringify(message);
  decodeMessage(payload);
  return payload;
}
module.exports = { VERSION, MAX_BYTES, BODY_KEYS, integer, utf8Bytes, validateBody, decodeMessage, encodeMessage };

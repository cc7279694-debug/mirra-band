const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { encodeMessage, decodeMessage, utf8Bytes } = require('../src/lib/companion-protocol');
const fixture = () => JSON.parse(fs.readFileSync('protocol/v1/fixtures/active.json', 'utf8'));
test('golden Chinese/emoji snapshot round trips and UTF8 budget measures bytes', () => {
  const m = fixture(); assert.deepEqual(decodeMessage(encodeMessage(m)), m);
  assert.equal(utf8Bytes('中文📖'), Buffer.byteLength('中文📖'));
  assert.throws(() => decodeMessage(' '.repeat(4097)), /SIZE/);
});
test('foreign requests/streams and unsafe integers cannot become current facts', () => {
  const m = fixture();
  assert.throws(() => decodeMessage(JSON.stringify(m), { requestId: 'other' }), /CONTEXT/);
  assert.throws(() => decodeMessage(JSON.stringify(m), { streamId: 'other' }), /CONTEXT/);
  for (const n of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    m.body.elapsedMs = n; assert.throws(() => encodeMessage(m));
  }
});
test('unknown commands/version/enums, prototype keys, nested content rejected', () => {
  const m = fixture(); m.type = 'FINISH'; assert.throws(() => encodeMessage(m));
  m.type = 'SNAPSHOT'; m.protocolVersion = 2; assert.throws(() => encodeMessage(m));
  m.protocolVersion = 1; m.body.segmentType = 'MAGIC'; assert.throws(() => encodeMessage(m));
  assert.throws(() => decodeMessage('{"__proto__":{"unsafe":true}}'));
  const valid = JSON.stringify(fixture());
  assert.throws(() => decodeMessage(valid.replace('"protocolVersion":1', '"protocolVersion":2,"protocolVersion":1')), /DUPLICATE/);
  assert.throws(() => decodeMessage(valid.replace('"protocolVersion":1', '"protocolVersion":"1"')), /VERSION/);
});
test('nullable data is explicit, page bounds and ownership remain coherent', () => {
  const m = fixture(); m.body.bookTitle = null; m.body.totalPages = null; m.body.currentPage = null;
  assert.equal(decodeMessage(encodeMessage(m)).body.bookTitle, null);
  m.body.totalPages = 2; m.body.currentPage = 42; assert.throws(() => encodeMessage(m));
  m.body.totalPages = 300; m.body.sessionId = null; assert.throws(() => encodeMessage(m));
});
test('invalid page zero or unknown book bound cannot be presented as a valid page', () => {
  const m = fixture(); m.body.currentPage = 0; assert.throws(() => encodeMessage(m), /PAGE/);
  m.body.currentPage = 42; m.body.totalPages = null; assert.throws(() => encodeMessage(m), /PAGE/);
});
test('wire code-point limits preserve pairs and unknown end type stays unknown', () => {
  const m = fixture(); m.body.bookTitle = '📖'.repeat(121); assert.throws(() => encodeMessage(m));
  m.body.bookTitle = '\uD800'; assert.throws(() => encodeMessage(m));
  m.body.bookTitle = '观已'; m.body.phase = 'ENDED'; m.body.endType = 'FUTURE_VALUE';
  m.body.timerKind = 'FINAL_SESSION_DURATION'; m.body.segmentType = null;
  assert.equal(decodeMessage(encodeMessage(m)).body.endType, 'FUTURE_VALUE');
});

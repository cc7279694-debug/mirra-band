const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const protocol = require('../src/lib/companion-protocol');
const hello = { protocolVersion: 2, type: 'HELLO', clientInstanceId: 'client-two', requestId: 'hello-two', capabilities: ['READ_ONLY_SNAPSHOT', 'SESSION_CONTROL'] };
const command = { protocolVersion: 2, type: 'COMMAND', clientInstanceId: 'client-two', requestId: 'command-one', streamId: 'stream-two', controlGrant: 'grant-one', action: 'START_BREAK', expectedIntentId: null, expectedSessionId: 'session-one', expectedSegmentId: 'segment-one', expectedBookId: null, expectedPage: null, expectedFirstAction: null, breakMinutes: 5 };
const v1 = name => JSON.parse(fs.readFileSync('protocol/v1/fixtures/' + name + '.json', 'utf8'));
test('v2 negotiates read-only and control while v1 retains its exact capability', () => {
  assert.deepEqual(protocol.decodeMessage(protocol.encodeMessage(hello)), hello);
  assert.deepEqual(protocol.decodeMessage(protocol.encodeMessage(v1('hello'))), v1('hello'));
  assert.throws(() => protocol.encodeMessage({ ...v1('hello'), capabilities: hello.capabilities }));
  assert.deepEqual(protocol.decodeMessage(protocol.encodeMessage({ ...hello, capabilities: ['READ_ONLY_SNAPSHOT'] })).capabilities, ['READ_ONLY_SNAPSHOT']);
});
test('only v2 authorized command shapes and business durations cross the codec', () => {
  assert.deepEqual(protocol.decodeMessage(protocol.encodeMessage(command)), command);
  for (const changed of [{ protocolVersion: 1 }, { action: 'END_SESSION' }, { breakMinutes: 0 }, { breakMinutes: 15 }, { expectedSegmentId: null }, { expectedFirstAction: 'injected action' }, { durationMillis: 300000 }]) {
    assert.throws(() => protocol.encodeMessage({ ...command, ...changed }));
  }
  const finish = { ...command, action: 'FINISH_BREAK', breakMinutes: null };
  assert.deepEqual(protocol.decodeMessage(protocol.encodeMessage(finish)), finish);
  const start = { ...command, action: 'CONFIRM_PREPARATION_AND_START', expectedIntentId: 'intent-one', expectedSessionId: null, expectedSegmentId: null, expectedBookId: 'book-one', expectedPage: 1, expectedFirstAction: '翻到第 1 页，读第一段。', breakMinutes: null };
  assert.deepEqual(protocol.decodeMessage(protocol.encodeMessage(start)), start);
  for (const changed of [{ expectedPage: 0 }, { expectedFirstAction: '' }, { expectedFirstAction: '\ud800' }, { expectedSessionId: 'already-active' }]) assert.throws(() => protocol.encodeMessage({ ...start, ...changed }));
});
test('v2 snapshot grant expires relative to source observation and has an exact whitelist', () => {
  const snapshot = { ...v1('active'), protocolVersion: 2, control: { activeSegmentId: 'segment-one', allowedActions: ['START_BREAK'], controlGrant: 'grant-one', grantExpiresAtUnixMs: v1('active').sourceObservedAtUnixMs + 30000, expectedFirstAction: null } };
  assert.deepEqual(protocol.decodeMessage(protocol.encodeMessage(snapshot)), snapshot);
  for (const changed of [{ grantExpiresAtUnixMs: snapshot.sourceObservedAtUnixMs }, { grantExpiresAtUnixMs: snapshot.sourceObservedAtUnixMs + 30001 }, { controlGrant: null }, { allowedActions: ['END_SESSION'] }, { arbitrarySQL: 'delete' }]) assert.throws(() => protocol.encodeMessage({ ...snapshot, control: { ...snapshot.control, ...changed } }));
  assert.throws(() => protocol.encodeMessage({ ...snapshot, protocolVersion: 1 }));
});
test('command results distinguish committed degraded starts and uncertain outcomes', () => {
  const result = { protocolVersion: 2, type: 'COMMAND_RESULT', clientInstanceId: 'client-two', requestId: 'command-one', streamId: 'stream-two', action: 'CONFIRM_PREPARATION_AND_START', code: 'APPLIED', sessionId: 'session-one', monitorDegraded: true };
  assert.deepEqual(protocol.decodeMessage(protocol.encodeMessage(result)), result);
  for (const code of ['APPLIED', 'ALREADY_APPLIED', 'STALE_STATE', 'REQUIRES_PHONE', 'DISABLED', 'UNAUTHORIZED', 'BUSY', 'FAILED', 'RESULT_UNKNOWN']) {
    const value = { ...result, code, monitorDegraded: false, sessionId: code === 'APPLIED' || code === 'ALREADY_APPLIED' ? 'session-one' : null };
    assert.equal(protocol.decodeMessage(protocol.encodeMessage(value)).code, code);
  }
  assert.throws(() => protocol.encodeMessage({ ...result, code: 'FAILED' }));
  assert.throws(() => protocol.decodeMessage(JSON.stringify(result), { requestId: 'other' }), /CONTEXT/);
});
test('all v2 literal golden fixtures round trip through the exact codec', () => {
  for (const filename of fs.readdirSync('protocol/v2/fixtures')) {
    const value = JSON.parse(fs.readFileSync('protocol/v2/fixtures/' + filename));
    assert.deepEqual(protocol.decodeMessage(protocol.encodeMessage(value)), value, filename);
  }
});
test('available phone source sets mirror every v2 literal fixture and schema byte for byte', { skip: !fs.existsSync('.local/android-worktree/app/src/test/resources/wearable/protocol-v2') }, () => {
  const schema = fs.readFileSync('protocol/v2/schema.json');
  for (const sourceSet of ['test/resources', 'androidTest/assets']) assert.deepEqual(fs.readFileSync('.local/android-worktree/app/src/' + sourceSet + '/wearable/protocol-v2/schema.json'), schema);
  for (const filename of fs.readdirSync('protocol/v2/fixtures')) {
    const bytes = fs.readFileSync('protocol/v2/fixtures/' + filename);
    for (const sourceSet of ['test/resources', 'androidTest/assets']) assert.deepEqual(fs.readFileSync('.local/android-worktree/app/src/' + sourceSet + '/wearable/protocol-v2/' + filename), bytes, sourceSet + '/' + filename);
  }
});
test('fresh grants never authorize a changed action or a non-actionable phase', () => {
  const source = JSON.parse(fs.readFileSync('protocol/v2/fixtures/preparing.json', 'utf8'));
  for (const changed of [{ expectedFirstAction: '看完另一段' }, { allowedActions: ['START_BREAK'] }, { activeSegmentId: 'old-segment' }]) assert.throws(() => protocol.encodeMessage({ ...source, control: { ...source.control, ...changed } }));
  assert.throws(() => protocol.encodeMessage({ ...source, body: { ...source.body, firstActionTruncated: true } }));
  for (const name of ['idle', 'saving', 'ended']) {
    const unavailable = JSON.parse(fs.readFileSync('protocol/v2/fixtures/' + name + '.json', 'utf8'));
    assert.throws(() => protocol.encodeMessage({ ...unavailable, control: source.control }));
  }
});
test('v2 retains byte depth duplicate field and UTF8 rejection at the command boundary', () => {
  const text = JSON.stringify(command);
  assert.throws(() => protocol.decodeMessage(text.replace('"action":"START_BREAK"', '"action":"START_BREAK","action":"FINISH_BREAK"')), /DUPLICATE/);
  assert.throws(() => protocol.encodeMessage({ ...command, controlGrant: 'grant\ud800' }));
  assert.throws(() => protocol.decodeMessage(' '.repeat(4097)), /SIZE/);
  assert.throws(() => protocol.decodeMessage(text.replace('"protocolVersion":2', '"protocolVersion":"2"')), /VERSION/);
  assert.throws(() => protocol.decodeMessage(text, { protocolVersion: 1 }), /CONTEXT/);
});

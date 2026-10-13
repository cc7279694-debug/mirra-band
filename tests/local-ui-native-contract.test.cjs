const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.resolve(__dirname, '../src/pages/LocalSession/index.ux'), 'utf8');
const template = page.match(/<template>([\s\S]*?)<\/template>/)[1];
function screen(name) {
  const marker = '<!-- VIEW: ' + name + ' -->';
  const start = template.indexOf(marker);
  assert.notEqual(start, -1, name + ' must have its own mutually exclusive native container');
  const end = template.indexOf('<!-- VIEW:', start + marker.length);
  return template.slice(start, end === -1 ? template.length : end);
}

test('one native route uses uppercase, mutually exclusive task views instead of a shared control list', () => {
  for (const view of ['READY', 'BOOK_PICKER', 'ACTION_PICKER', 'READING', 'BREAK_PICKER', 'RESTING', 'FINISH_REVIEW', 'PAGE_EDITOR', 'SAVED', 'DETAILS', 'STORAGE_NOTICE']) {
    assert.ok(screen(view).includes("if=\"{{view === '" + view + "'}}\""));
  }
  assert.doesNotMatch(template, /viewMode/);
});

test('ready includes the visible book, original first action and explicit confirmation in one view', () => {
  const ready = screen('READY');
  assert.match(ready, /previewBookTitle/);
  assert.match(ready, /先完成这一步/);
  assert.match(ready, /onclick="confirmStart"/);
  assert.match(ready, /if="\{\{!previewLongAction\}\}"/);
  assert.match(ready, /if="\{\{previewLongAction\}\}"/);
  assert.match(ready, /for="\{\{actionRows\}\}"/);
});

test('reading and resting keep timer qualifiers adjacent and both actions outside scroll content', () => {
  for (const view of ['READING', 'RESTING']) {
    const body = screen(view);
    assert.match(body, /timerText/);
    assert.match(body, /timerQualifier/);
    assert.match(body, /class="split-actions"/);
    assert.doesNotMatch(body, /<list\b/);
    assert.match(body, /onclick="showFinish"/);
  }
  assert.match(screen('READING'), /onclick="openBreakPicker"/);
  assert.doesNotMatch(screen('READING'), /onclick="resume"/);
  assert.match(screen('RESTING'), /onclick="resume"/);
});

test('finish review has one save confirmation, optional page editor and no keypad', () => {
  const body = screen('FINISH_REVIEW');
  assert.match(body, /onclick="finishSession"/);
  assert.match(body, /onclick="showPageEditor"/);
  assert.doesNotMatch(body, /appendDigit|digit-key|eraseDigit/);
  assert.match(body, /endPageText/);
});

test('busy rest submission keeps dimensions and shows pending feedback while secondary actions are dimmed', () => {
  assert.match(screen('BREAK_PICKER'), /busy \? '正在保存…'/);
  assert.match(screen('BREAK_PICKER'), /canWrite \? '#181A1D'/);
  for (const view of ['READING', 'RESTING']) assert.match(screen(view), /secondaryEnabled \? '#181A1D'/);
});

test('optional page editor alone owns the 3x4 keypad and toolbar save', () => {
  const body = screen('PAGE_EDITOR');
  assert.equal((body.match(/class="key-row"/g) || []).length, 4);
  assert.equal((body.match(/class="digit-key"/g) || []).length, 12);
  assert.match(body, /class="editor-toolbar"/);
  assert.match(body, /onclick="savePage"/);
  assert.match(body, /onclick="clearEndPage"/);
  assert.match(body, /onclick="eraseDigit"/);
  assert.match(body, /busy \? '保存中' : primaryLabel/);
});

test('saved has only one main Done action, explicit local origin and no synchronization control', () => {
  const body = screen('SAVED');
  assert.equal((body.match(/onclick="done"/g) || []).length, 1);
  assert.match(body, /sourceLabel/);
  assert.doesNotMatch(body, /newSession|立即同步|正在上传|已同步到手机/);
});

test('storage blocking and recovered snapshot acknowledgement occupy a visible dedicated task view', () => {
  const body = screen('STORAGE_NOTICE');
  assert.match(body, /noticeTitle/);
  assert.match(body, /for="\{\{noticeRows\}\}"/);
  assert.match(page, /noticeRows = this\.wrapText\(next\.notice\.text\)/);
  assert.match(body, /onclick="noticeAction"/);
  assert.match(body, /bookTitle/);
  assert.match(screen('DETAILS'), /detailTimeReason/);
});

function cssRules() {
  const css = fs.readFileSync(path.resolve(__dirname, '../src/common/local-theme.css'), 'utf8');
  const rules = {};
  for (const match of css.matchAll(/\.([\w-]+)\s*\{([^}]+)\}/g)) {
    rules[match[1]] = Object.fromEntries(match[2].split(';').filter(value => value.trim()).map(value => value.trim().split(/:\s*/)));
  }
  return rules;
}
function vertical(rules, classes) {
  return classes.reduce((sum, name) => sum + parseFloat(rules[name].height || (/submit$/.test(name) ? rules.button.height : 0)) + parseFloat(rules[name]['margin-top'] || 0), 0);
}
test('native CSS preserves first-screen finish and saved actions within 208 design units', () => {
  const rules = cssRules();
  const finish = ['toolbar', 'review-book', 'review-time', 'page-option', 'review-submit'];
  if (screen('FINISH_REVIEW').includes('class="confirmation-hint"')) finish.splice(-1, 0, 'confirmation-hint');
  assert.ok(vertical(rules, finish) <= 208, 'finish save is below the visible content budget');
  assert.ok(vertical(rules, ['toolbar', 'saved-book', 'saved-times', 'saved-page', 'saved-source', 'saved-notice', 'saved-submit']) <= 208, 'saved Done is below the visible content budget');
  assert.equal(parseFloat(rules['split-primary'].width) + 8 + parseFloat(rules['split-secondary'].width), 144);
  assert.equal(parseFloat(rules['digit-key'].width) * 3 + 6 * 2, 144);
  for (const name of ['toolbar', 'button', 'secondary', 'split-actions', 'editor-toolbar', 'digit-key']) assert.equal(rules[name]['flex-shrink'], '0');
});

test('expired break text uses a readable text size instead of the 40-unit timer size', () => {
  assert.match(screen('RESTING'), /timerText === '休息时间已到' \? 16/);
});

test('the page uses only local theme and no browser-only layout assumptions or second owner', () => {
  assert.match(page, /@import '\.\.\/\.\.\/common\/local-theme\.css'/);
  assert.doesNotMatch(page, /createLocalOwner|owner\.close\(|position:\s*(?:fixed|sticky)|display:\s*grid|backdrop-filter|var\(--|Date\.now/);
});

test('each native event is bound to a method in the real page script', () => {
  const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const event of template.matchAll(/onclick="([a-zA-Z]+)(?:\([^" ]*\))?"/g)) {
    assert.match(script, new RegExp('\\b' + event[1] + '\\([^)]*\\)\\s*\\{'), event[1] + ' must have an executable page binding');
  }
});

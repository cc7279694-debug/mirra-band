const test = require('node:test');
const assert = require('node:assert/strict');
const tokens = require('../src/ui/local-tokens');

function luminance(hex) {
  const channels = hex.replace('#', '').match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function contrast(a, b) { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + 0.05) / (values[1] + 0.05); }

test('normal text and CTA text remain readable on their assigned dark or blue surfaces', () => {
  for (const [foreground, background] of [
    ['textPrimary', 'background'], ['textSecondary', 'surface'], ['textTertiary', 'surface'],
    ['onAccent', 'accent'], ['onAccent', 'accentPressed'], ['warning', 'background'], ['danger', 'background']
  ]) assert.ok(contrast(tokens.colors[foreground], tokens.colors[background]) >= 4.5, foreground + ' on ' + background);
});

test('split reading actions and three-column keypad fit their content width without shrinking hit targets', () => {
  assert.equal(tokens.page.width - 2 * tokens.safe.horizontal, tokens.page.contentWidth);
  assert.equal(tokens.split.primaryWidth + tokens.split.gap + tokens.split.secondaryWidth, tokens.page.contentWidth);
  assert.equal(3 * tokens.digit.width + 2 * tokens.digit.gap, tokens.page.contentWidth);
  assert.ok(tokens.split.secondaryWidth >= tokens.hit.minimumWidth);
  for (const height of [tokens.hit.primaryHeight, tokens.hit.secondaryHeight, tokens.hit.inlineHeight, tokens.digit.height]) {
    assert.ok(height >= tokens.hit.minimumHeight);
  }
  assert.ok(tokens.hit.inlineWidth >= tokens.hit.minimumWidth);
});

test('reading actions and four-row editor leave bottom room inside the nominal 168 by 240 canvas', () => {
  const reading = tokens.layout.reading;
  assert.ok(reading.actionsY >= reading.statusY + reading.statusHeight);
  assert.ok(reading.actionsY + reading.actionsHeight <= tokens.page.nominalHeight - tokens.safe.bottom);
  const keyboardHeight = tokens.layout.pageEditor.toolbarHeight + tokens.layout.pageEditor.pageHeight
    + 4 * tokens.digit.height + 3 * tokens.digit.rowGap;
  assert.ok(keyboardHeight + tokens.safe.top + tokens.safe.bottom <= tokens.page.nominalHeight);
  assert.ok(tokens.typography.longTimer.size < tokens.typography.timer.size);
  assert.ok(tokens.typography.action.size >= 13);
});

test('local design values are immutable so temporary button states cannot alter another view', () => {
  assert.equal(Object.isFrozen(tokens), true);
  assert.equal(Object.isFrozen(tokens.colors), true);
  assert.equal(Object.isFrozen(tokens.layout.reading), true);
  assert.equal(Object.isFrozen(tokens.typography.timer), true);
});

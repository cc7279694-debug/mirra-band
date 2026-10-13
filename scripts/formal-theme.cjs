'use strict';

// Build-time, live-profile-only presentation adapter. It never runs on the
// wrist and never changes page scripts, owners, events, IO or storage formats.
const fs = require('node:fs');
const path = require('node:path');
const PAGES = ['Mode', 'Home', 'Detail', 'Control', 'Connection', 'LocalSession'];
const legacyColors = {
  '#0B0F14': '#FFFFFF', '#EEF3F8': '#181A1D', '#A6B2C3': '#626873',
  '#D7B77A': '#386FBE', '#6598E8': '#386FBE', '#151C25': '#F2F4F7', '#314763': '#F2F4F7',
};
function transformFormalPage(source, page, readCss = name =>
  fs.readFileSync(path.join(__dirname, '../src/common', name), 'utf8')) {
  if (!PAGES.includes(page)) throw new Error('Unknown formal page');
  const styles = source.match(/<style\b[^>]*>([\s\S]*?)<\/style>/);
  if (!styles) throw new Error('Missing formal page styles: ' + page);
  let css = styles[1].replace(/@import\s+['"]\.\.\/\.\.\/common\/(theme|local-theme)\.css['"]\s*;/g,
    (_, name) => readCss(name === 'theme' ? 'formal-theme.css' : 'local-theme.css'));
  if (/@import\b/.test(css)) throw new Error('Unresolved formal style import: ' + page);
  css = css.replace(/#[0-9a-f]{6}\b/gi, color => legacyColors[color.toUpperCase()] || color);
  if (page === 'Mode') {
    css = css.replace(/(\.mode-secondary-label\s*\{[^}]*\bcolor\s*:\s*)#386FBE/i, '$1#181A1D');
  }
  if (page === 'Home') {
    // Gray busy button must not retain the normal white-on-blue label.
    const before = '<text class="button-label">{{controlLabel}}</text>';
    const after = '<text class="{{controlBusy ? \'button-label control-disabled-label\' : \'button-label\'}}">{{controlLabel}}</text>';
    if (!source.includes(before)) throw new Error('Missing formal busy-label binding');
    source = source.replace(before, after);
    css += '\n.control-disabled-label { color: #626873; }\n';
  }
  return source.replace(/<style\b[^>]*>[\s\S]*?<\/style>/, '<style>\n' + css.trim() + '\n</style>');
}
module.exports = { PAGES, transformFormalPage };

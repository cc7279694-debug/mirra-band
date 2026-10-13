const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sourceFilter } = require('../scripts/source-profile.cjs');
const root = path.resolve(__dirname, '../src');
test('every staged profile preserves the static local module dependency closure', () => {
  const all = [];
  function collect(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name); entry.isDirectory() ? collect(file) : all.push(file);
  } }
  collect(root);
  for (const mode of ['demo', 'live', 'local-session', 'probe', 'probe-upgrade', 'click-probe']) {
    const include = sourceFilter(root, mode);
    for (const file of all.filter(f => include(f) && /\.(?:js|ux)$/.test(f))) {
      const source = fs.readFileSync(file, 'utf8');
      const imports = [...source.matchAll(/(?:require\(\s*|from\s*)['"](\.[^'"]+)['"]/g)];
      for (const match of imports) {
        const target = path.resolve(path.dirname(file), match[1]);
        const resolved = [target, target + '.js', target + '.ux'].find(f => fs.existsSync(f) && fs.statSync(f).isFile());
        assert(resolved && include(resolved), mode + ': ' + path.relative(root, file) + ' requires excluded ' + match[1]);
      }
    }
  }
});

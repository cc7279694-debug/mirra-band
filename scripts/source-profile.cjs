const path = require('node:path');
const { identity } = require('./build-profiles.cjs');
function sourceFilter(root, mode) {
  const probe = identity(mode).probe === true;
  const files = ['manifest.json', 'profile.js', 'probe-app.ux', 'common/theme.css', 'common/icon.png', 'common/icon.svg',
    'lib/probe-journal.js', 'lib/probe-controller.js', 'platform/probe-storage.js', 'pages/StorageProbe/index.ux'];
  return source => {
    const relative = path.relative(root, source).split(path.sep).join('/');
    if (relative === '') return true;
    if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) return false;
    if (probe) return files.includes(relative) || files.some(file => file.startsWith(relative + '/'));
    if (relative === 'probe-app.ux' || relative === 'pages/StorageProbe' || relative.startsWith('pages/StorageProbe/')) return false;
    if (/^(lib|platform)\/probe-/.test(relative)) return false;
    return !(mode === 'live' && (relative === 'pages/States' || relative.startsWith('pages/States/')));
  };
}
module.exports = { sourceFilter };

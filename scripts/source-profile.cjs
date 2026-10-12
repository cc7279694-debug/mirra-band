const path = require('node:path');
const { identity } = require('./build-profiles.cjs');
function sourceFilter(root, mode) {
  const profile = identity(mode);
  const files = profile.localSession ? ['manifest.json', 'profile.js', 'local-app.ux', 'common/theme.css', 'common/local-session.css',
    'common/icon.png', 'common/icon.svg', 'lib/local-session.js', 'lib/local-codec.js', 'lib/local-journal.js', 'lib/local-owner.js',
    'platform/local-storage.js', 'platform/probe-storage.js', 'pages/LocalSession/index.ux'] :
    ['manifest.json', 'profile.js', 'probe-app.ux', 'common/theme.css', 'common/icon.png', 'common/icon.svg',
      'lib/probe-journal.js', 'lib/probe-controller.js', 'platform/probe-storage.js', 'pages/StorageProbe/index.ux'];
  return source => {
    const relative = path.relative(root, source).split(path.sep).join('/');
    if (relative === '') return true;
    if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) return false;
    if (profile.probe || profile.localSession) return files.includes(relative) || files.some(file => file.startsWith(relative + '/'));
    if (relative.split('/').some(part => part.startsWith('local-')) || relative === 'pages/LocalSession' || relative.startsWith('pages/LocalSession/')) return false;
    if (relative === 'probe-app.ux' || relative === 'pages/StorageProbe' || relative.startsWith('pages/StorageProbe/')) return false;
    if (/^(lib|platform)\/probe-/.test(relative)) return false;
    return !(mode === 'live' && (relative === 'pages/States' || relative.startsWith('pages/States/')));
  };
}
module.exports = { sourceFilter };

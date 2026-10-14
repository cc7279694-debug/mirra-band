const path = require('node:path');
const { identity } = require('./build-profiles.cjs');
function sourceFilter(root, mode) {
  const profile = identity(mode);
  const formalFiles = ['manifest.json', 'profile.js', 'formal-app.ux', 'common/icon.png', 'common/icon.svg', 'common/formal-theme.css',
    'common/local-theme.css', 'ui/local-tokens.js', 'lib/ticker.js', 'lib/interconnect-diagnostic.js',
    'lib/companion-store.js', 'lib/companion-protocol.js', 'lib/companion-timer.js', 'lib/companion-presentation.js',
    'lib/formal-local-runtime.js', 'lib/catalog-owner.js', 'lib/catalog-protocol.js', 'lib/catalog-wire.js',
    'lib/record-archive.js', 'lib/record-history-guard.js', 'lib/record-model.js', 'lib/record-wire.js', 'lib/record-envelope.js', 'lib/record-checksum.js', 'lib/record-sync.js', 'platform/record-digest.js',
    'lib/local-session.js', 'lib/local-codec.js', 'lib/local-journal.js', 'lib/local-owner.js', 'lib/local-performance.js',
    'lib/local-presentation.js', 'lib/local-ui-flow.js', 'platform/interconnect-transport.js', 'platform/probe-storage.js',
    ...['Mode', 'LocalSession', 'Home', 'Detail', 'Connection', 'Control'].map(page => 'pages/' + page + '/index.ux')];
  const files = profile.clickProbe ? ['manifest.json', 'profile.js', 'click-probe-app.ux', 'common/click-probe.css', 'common/local-brand/icon-pending.png', 'pages/ClickProbe/index.ux'] : profile.localSession ? ['manifest.json', 'profile.js', 'local-app.ux',
    'lib/local-session.js', 'lib/local-codec.js', 'lib/local-journal.js', 'lib/local-owner.js', 'lib/record-history-guard.js', 'lib/local-performance.js',
    'lib/local-presentation.js', 'lib/local-ui-flow.js', 'ui/local-tokens.js', 'common/local-theme.css',
    'common/local-brand/icon-pending.png', 'platform/local-storage.js', 'platform/probe-storage.js', 'pages/LocalSession/index.ux'] :
    ['manifest.json', 'profile.js', 'probe-app.ux', 'common/theme.css', 'common/icon.png', 'common/icon.svg',
      'lib/probe-journal.js', 'lib/probe-controller.js', 'platform/probe-storage.js', 'pages/StorageProbe/index.ux'];
  return source => {
    const relative = path.relative(root, source).split(path.sep).join('/');
    if (relative === '') return true;
    if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) return false;
    if (profile.standalone) return formalFiles.includes(relative) || formalFiles.some(file => file.startsWith(relative + '/'));
    if (profile.probe || profile.localSession || profile.clickProbe) return files.includes(relative) || files.some(file => file.startsWith(relative + '/'));
    if (/^(?:lib|platform)\/record-/.test(relative) && !['lib/record-envelope.js', 'lib/record-checksum.js'].includes(relative)) return false;
    if (relative === 'common/formal-theme.css') return false;
    if (relative === 'formal-app.ux' || (/^lib\/(?:formal-|catalog-)/.test(relative) && relative !== 'lib/catalog-wire.js') || relative === 'pages/Mode' || relative.startsWith('pages/Mode/')) return false;
    if (relative === 'click-probe-app.ux' || relative === 'common/click-probe.css' || relative === 'pages/ClickProbe' || relative.startsWith('pages/ClickProbe/')) return false;
    if (relative.split('/').some(part => part.startsWith('local-')) || relative === 'pages/LocalSession' || relative.startsWith('pages/LocalSession/')) return false;
    if (relative === 'probe-app.ux' || relative === 'pages/StorageProbe' || relative.startsWith('pages/StorageProbe/')) return false;
    if (/^(lib|platform)\/probe-/.test(relative)) return false;
    return !(mode === 'live' && (relative === 'pages/States' || relative.startsWith('pages/States/')));
  };
}
module.exports = { sourceFilter };

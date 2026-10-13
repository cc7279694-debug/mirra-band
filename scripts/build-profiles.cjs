const profiles = {
  demo: { package: 'com.guanyi.mirra.band.demo', name: 'Mirra演示', versionName: '0.2.0', versionCode: 2, signDirectory: 'sign', fingerprint: 'B9:AD:5C:30:7A:17:03:1C:3D:19:3F:8E:E2:BA:AB:2A:B5:D1:FE:38:3F:73:84:28:EB:FE:64:9E:9F:67:E9:0B' },
  live: { package: 'com.guanyi.mirra', name: 'Mirra', versionName: '0.3.0', versionCode: 8, signDirectory: 'sign/live', fingerprint: '29:DE:D2:6B:EA:44:F1:AF:E4:FE:38:3A:30:2E:4B:50:74:23:D1:62:23:46:9D:7D:A3:FE:57:8D:9A:7F:83:B9' },
  probe: { package: 'com.guanyi.mirra.band.storageprobe', name: 'Mirra存储实验', versionName: '0.1.0', versionCode: 1, probe: true, signDirectory: 'sign', fingerprint: 'B9:AD:5C:30:7A:17:03:1C:3D:19:3F:8E:E2:BA:AB:2A:B5:D1:FE:38:3F:73:84:28:EB:FE:64:9E:9F:67:E9:0B' },
  'probe-upgrade': { package: 'com.guanyi.mirra.band.storageprobe', name: 'Mirra存储实验', versionName: '0.1.1', versionCode: 2, probe: true, signDirectory: 'sign', fingerprint: 'B9:AD:5C:30:7A:17:03:1C:3D:19:3F:8E:E2:BA:AB:2A:B5:D1:FE:38:3F:73:84:28:EB:FE:64:9E:9F:67:E9:0B' },
  'local-session': { package: 'com.guanyi.mirra.band.localsessiontest', name: 'Mirra独立实验', versionName: '0.1.2', versionCode: 3, localSession: true, storageQualified: true, storageBackend: 'file', signDirectory: 'sign', fingerprint: 'B9:AD:5C:30:7A:17:03:1C:3D:19:3F:8E:E2:BA:AB:2A:B5:D1:FE:38:3F:73:84:28:EB:FE:64:9E:9F:67:E9:0B' },
  'click-probe': { package: 'com.guanyi.mirra.band.clickprobe', name: 'Mirra点击探针', versionName: '0.1.0', versionCode: 1, clickProbe: true, signDirectory: 'sign', fingerprint: 'B9:AD:5C:30:7A:17:03:1C:3D:19:3F:8E:E2:BA:AB:2A:B5:D1:FE:38:3F:73:84:28:EB:FE:64:9E:9F:67:E9:0B' },
};
function identity(mode) { if (!Object.hasOwn(profiles, mode)) throw new Error('Unknown build profile'); return Object.assign({}, profiles[mode]); }
function configureManifest(source, mode) {
  const profile = identity(mode);
  const manifest = JSON.parse(JSON.stringify(source));
  Object.assign(manifest, { package: profile.package, name: profile.name, versionName: profile.versionName, versionCode: profile.versionCode });
  manifest.display = { backgroundColor: profile.localSession || profile.clickProbe ? '#FFFFFF' : '#0B0F14' };
  if (profile.probe || profile.localSession || profile.clickProbe) {
    const entry = profile.clickProbe ? 'pages/ClickProbe' : profile.localSession ? 'pages/LocalSession' : 'pages/StorageProbe';
    if (profile.localSession || profile.clickProbe) manifest.icon = '/common/local-brand/icon-pending.png';
    manifest.features = profile.clickProbe ? [{ name: 'system.router' }] : [{ name: 'system.router' }, { name: 'system.storage' }, { name: 'system.file' }];
    manifest.router = { entry, pages: { [entry]: { component: 'index', launchMode: 'singleTask' } } };
    delete manifest.config.background;
    delete manifest.permissions;
    return manifest;
  }
  manifest.router.pages['pages/Detail'] = { component: 'index' };
  if (mode === 'live') delete manifest.router.pages['pages/States'];
  else manifest.router.pages['pages/States'] = { component: 'index' };
  return manifest;
}
module.exports = { identity, configureManifest };

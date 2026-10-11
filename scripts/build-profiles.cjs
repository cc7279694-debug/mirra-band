const profiles = {
  demo: { package: 'com.guanyi.mirra.band.demo', name: 'Mirra演示', versionName: '0.2.0', versionCode: 2, signDirectory: 'sign', fingerprint: 'B9:AD:5C:30:7A:17:03:1C:3D:19:3F:8E:E2:BA:AB:2A:B5:D1:FE:38:3F:73:84:28:EB:FE:64:9E:9F:67:E9:0B' },
  live: { package: 'com.guanyi.mirra', name: 'Mirra', versionName: '0.2.1', versionCode: 3, signDirectory: 'sign/live', fingerprint: '29:DE:D2:6B:EA:44:F1:AF:E4:FE:38:3A:30:2E:4B:50:74:23:D1:62:23:46:9D:7D:A3:FE:57:8D:9A:7F:83:B9' },
};
function identity(mode) { if (!Object.hasOwn(profiles, mode)) throw new Error('Unknown build profile'); return Object.assign({}, profiles[mode]); }
function configureManifest(source, mode) {
  const profile = identity(mode);
  const manifest = JSON.parse(JSON.stringify(source));
  Object.assign(manifest, { package: profile.package, name: profile.name, versionName: profile.versionName, versionCode: profile.versionCode });
  manifest.display = { backgroundColor: '#0B0F14' };
  manifest.router.pages['pages/Detail'] = { component: 'index' };
  if (mode === 'live') delete manifest.router.pages['pages/States'];
  else manifest.router.pages['pages/States'] = { component: 'index' };
  return manifest;
}
module.exports = { identity, configureManifest };

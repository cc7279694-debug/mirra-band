const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { configureManifest, identity } = require('./build-profiles.cjs');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8'));
const errors = [];
let checked = 0;

function syntax(source, file, moduleMode) {
  const result = spawnSync(process.execPath, ['--check', '--input-type=' + (moduleMode ? 'module' : 'commonjs')], {
    input: source, encoding: 'utf8'
  });
  if (result.status !== 0) errors.push(file + ': ' + result.stderr.trim());
  checked += 1;
}

function walk(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) walk(file);
    else if (file.endsWith('.js') || file.endsWith('.cjs')) syntax(fs.readFileSync(file, 'utf8'), file, false);
    else if (file.endsWith('.ux')) {
      const source = fs.readFileSync(file, 'utf8');
      const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
      if (scripts.length !== 1) errors.push(file + ': expected exactly one script');
      for (const script of scripts) syntax(script[1], file, true);
      const probePage = file.includes(path.sep + 'StorageProbe' + path.sep);
      const localPage = file.includes(path.sep + 'LocalSession' + path.sep);
      if (probePage && !source.includes('隔离测试数据')) errors.push(file + ': missing explicit probe badge');
      if (localPage && !source.includes('隔离实验')) errors.push(file + ': missing explicit local isolation badge');
      if (!probePage && !localPage && file.includes(path.sep + 'pages' + path.sep) && !source.includes('showDemo') && !source.includes('演示数据')) errors.push(file + ': missing conditional or explicit demo badge');
    }
  }
}

walk(path.join(root, 'src'));
walk(path.join(root, 'scripts'));
walk(path.join(root, 'tests'));
if (manifest.package !== identity('live').package) errors.push('Unexpected live source package');
for (const mode of ['demo', 'live', 'probe', 'probe-upgrade', 'local-session']) {
  const profile = identity(mode);
  const selected = configureManifest(manifest, mode);
  if (profile.localSession) {
    const localIcon = fs.readFileSync(path.join(root, 'src', selected.icon));
    if (localIcon.toString('hex', 0, 8) !== '89504e470d0a1a0a' || localIcon.readUInt32BE(16) !== 192 || localIcon.readUInt32BE(20) !== 192) errors.push('Local experiment icon must be 192x192 PNG');
  }
  if (selected.package !== profile.package) errors.push('Unexpected profile identity');
  if (mode === 'live' && selected.router.pages['pages/States']) errors.push('Demo route in live');
  if (profile.probe && (selected.features.some(feature => feature.name === 'system.interconnect') || Object.keys(selected.router.pages).length !== 1)) errors.push('Companion capability in probe');
  if (profile.probe || profile.localSession) {
    const entry = profile.localSession ? 'pages/LocalSession' : 'pages/StorageProbe';
    if (selected.router.entry !== entry || Object.keys(selected.router.pages).join(',') !== entry) errors.push('Unexpected experiment route: ' + mode);
    if (selected.features.map(feature => feature.name).sort().join(',') !== 'system.file,system.router,system.storage') errors.push('Unexpected experiment capability: ' + mode);
    if (selected.config.background || selected.permissions) errors.push('Unexpected experiment permission: ' + mode);
  }
  for (const [page, route] of Object.entries(selected.router.pages)) {
    if (!fs.existsSync(path.join(root, 'src', page, route.component + '.ux'))) errors.push('Missing profile route: ' + mode + '/' + page);
  }
}
if (manifest.config.designWidth !== 168) errors.push('Unexpected design width');
if (manifest.config.background) errors.push('Companion must not request background execution');
if (manifest.features.some(feature => !['system.router', 'system.interconnect'].includes(feature.name))) errors.push('Unexpected capability');
for (const [page, route] of Object.entries(manifest.router.pages)) {
  if (!fs.existsSync(path.join(root, 'src', page, route.component + '.ux'))) errors.push('Missing route: ' + page);
}
const icon = fs.readFileSync(path.join(root, 'src', manifest.icon));
if (icon.toString('hex', 0, 8) !== '89504e470d0a1a0a' || icon.readUInt32BE(16) !== 192 || icon.readUInt32BE(20) !== 192) errors.push('Icon must be 192x192 PNG');
console.log(JSON.stringify({ checkedScripts: checked, pages: Object.keys(manifest.router.pages).length, errors }, null, 2));
process.exitCode = errors.length ? 1 : 0;

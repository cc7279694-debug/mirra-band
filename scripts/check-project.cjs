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
      if (file.includes(path.sep + 'pages' + path.sep) && !source.includes('showDemo') && !source.includes('演示数据')) errors.push(file + ': missing conditional or explicit demo badge');
    }
  }
}

walk(path.join(root, 'src'));
walk(path.join(root, 'scripts'));
walk(path.join(root, 'tests'));
if (manifest.package !== identity('live').package) errors.push('Unexpected live source package');
for (const mode of ['demo', 'live']) {
  const selected = configureManifest(manifest, mode);
  if (selected.package !== identity(mode).package) errors.push('Unexpected profile identity');
  if (mode === 'live' && selected.router.pages['pages/States']) errors.push('Demo route in live');
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

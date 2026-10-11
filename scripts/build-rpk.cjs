'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { inspect } = require('./inspect-rpk.cjs')
const { identity, configureManifest } = require('./build-profiles.cjs')
const root = path.resolve(__dirname, '..')
const local = path.join(root, '.local')
const staging = path.join(local, 'build-project')
const lock = path.join(local, 'build.lock')
const release = process.argv[2] === 'release'
const mode = process.argv[3] || 'demo'
const profile = identity(mode)

async function build() {
  fs.mkdirSync(local, { recursive: true })
  const handle = fs.openSync(lock, 'wx')
  try {
    // aiot 2.0.5 scans the whole working directory. Give it only app inputs;
    // otherwise local emulator binaries and evidence are copied and parsed.
    if (path.dirname(staging) !== local) throw new Error('Unsafe staging directory')
    fs.rmSync(staging, { recursive: true, force: true })
    fs.mkdirSync(staging)
    fs.cpSync(path.join(root, 'src'), path.join(staging, 'src'), { recursive: true })
    const manifest = configureManifest(JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8')), mode)
    fs.writeFileSync(path.join(staging, 'src/manifest.json'), JSON.stringify(manifest, null, 2))
    fs.writeFileSync(path.join(staging, 'src/profile.js'), 'module.exports = ' + JSON.stringify({ mode }) + ';\n')
    if (mode === 'live') fs.rmSync(path.join(staging, 'src/pages/States'), { recursive: true, force: true })
    fs.copyFileSync(path.join(root, 'package.json'), path.join(staging, 'package.json'))
    fs.mkdirSync(path.join(staging, 'sign'))
    for (const name of ['private.pem', 'certificate.pem']) {
      const source = path.join(root, profile.signDirectory, name)
      if (!fs.existsSync(source)) throw new Error('Missing local ' + mode + ' signing file; explicit local conversion authorization is required for live')
      fs.copyFileSync(source, path.join(staging, 'sign', name))
    }
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(staging, 'node_modules'), 'junction')
    const result = spawnSync(process.execPath, [require.resolve('aiot-toolkit/lib/bin.js'), release ? 'release' : 'build'], { cwd: staging, stdio: 'inherit' })
    if (result.error || result.status !== 0) throw result.error || new Error('Vela toolkit exited with status ' + result.status)
    const name = manifest.package + '.' + (release ? 'release' : 'debug') + '.' + manifest.versionName + '.rpk'
    const source = path.join(staging, 'dist', name)
    // The CLI may return zero after a compiler error: verify the fresh staged
    // artifact and independent signature before copying any delivery output.
    const report = await inspect(source, path.join(root, profile.signDirectory, 'certificate.pem'), mode)
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true })
    fs.copyFileSync(source, path.join(root, 'dist', name))
    const runtime = path.join(root, 'build/runtime', mode)
    fs.mkdirSync(runtime, { recursive: true })
    fs.cpSync(path.join(staging, 'build'), runtime, { recursive: true })
    process.stdout.write(JSON.stringify({ artifact: path.join(root, 'dist', name), bytes: report.bytes, sha256: report.sha256, signature: report.signature }, null, 2) + '\n')
  } finally {
    fs.closeSync(handle)
    fs.unlinkSync(lock)
  }
}
build().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1 })

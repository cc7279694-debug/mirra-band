'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { inspect } = require('./inspect-rpk.cjs')
const { identity, configureManifest } = require('./build-profiles.cjs')
const { sourceFilter } = require('./source-profile.cjs')
const { PAGES, transformFormalPage } = require('./formal-theme.cjs')
const { checkRpk } = require('./check-formal-theme.cjs')
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
    fs.cpSync(path.join(root, 'src'), path.join(staging, 'src'), { recursive: true, filter: sourceFilter(path.join(root, 'src'), mode) })
    if (profile.standalone) {
      for (const page of PAGES) {
        const file = path.join(staging, 'src/pages', page, 'index.ux')
        const themed = transformFormalPage(fs.readFileSync(file, 'utf8'), page,
          name => fs.readFileSync(path.join(staging, 'src/common', name), 'utf8'))
        fs.writeFileSync(file, themed)
      }
    }
    if (profile.probe || profile.localSession || profile.clickProbe || profile.standalone) {
      const entry = profile.standalone ? 'formal-app.ux' : profile.clickProbe ? 'click-probe-app.ux' : profile.localSession ? 'local-app.ux' : 'probe-app.ux'
      fs.copyFileSync(path.join(staging, 'src', entry), path.join(staging, 'src/app.ux'))
      fs.unlinkSync(path.join(staging, 'src', entry))
    }
    const manifest = configureManifest(JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8')), mode)
    fs.writeFileSync(path.join(staging, 'src/manifest.json'), JSON.stringify(manifest, null, 2))
    const runtimeProfile = { mode, versionName: profile.versionName, versionCode: profile.versionCode }
    if (profile.standalone) runtimeProfile.standalone = true
    if (profile.localSession) {
      runtimeProfile.storageQualified = profile.storageQualified === true
      runtimeProfile.storageBackend = profile.storageBackend
    }
    fs.writeFileSync(path.join(staging, 'src/profile.js'), 'module.exports = ' + JSON.stringify(runtimeProfile) + ';\n')
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
    if (profile.standalone && (await checkRpk(source)).status !== 'PASS')
      throw new Error('Formal compiled theme readability validation failed; prior delivery preserved')
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

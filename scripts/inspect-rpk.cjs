'use strict'

// Inspect the official toolkit's RPK signing container. Cryptography is provided
// by Node crypto; the container layout follows aiotpack 2.0.5 SignUtil.js.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const { identity } = require('./build-profiles.cjs')
const { createRequire } = require('node:module')
const toolkitRequire = createRequire(require.resolve('aiot-toolkit/package.json'))
const packRequire = createRequire(toolkitRequire.resolve('@aiot-toolkit/aiotpack/package.json'))
const JSZip = packRequire('jszip')
const CRC32 = packRequire('@aiot-toolkit/aiotpack/lib/compiler/javascript/vela/utils/signature/CRC32').default

function reader(buffer) {
  let offset = 0
  function take(length) {
    assert(Number.isSafeInteger(length) && length >= 0 && offset + length <= buffer.length, 'Invalid signing container length')
    const value = buffer.subarray(offset, offset + length)
    offset += length
    return value
  }
  function uint() { return take(4).readUInt32LE() }
  function field() { return take(uint()) }
  function end() { assert.equal(offset, buffer.length, 'Unexpected signing container bytes') }
  function done() { return offset === buffer.length }
  return { take, uint, field, end, done }
}

function verifyBuffer(buffer) {
  assert(buffer.length >= 22 && buffer.readUInt32LE(0) === 0x04034b50, 'Not an RPK ZIP container')
  let eocd = -1
  for (let at = buffer.length - 22; at >= Math.max(0, buffer.length - 65557); at--) {
    if (buffer.readUInt32LE(at) === 0x06054b50 && at + 22 + buffer.readUInt16LE(at + 20) === buffer.length) { eocd = at; break }
  }
  assert(eocd >= 0, 'ZIP end record missing')
  const central = buffer.readUInt32LE(eocd + 16)
  assert(central >= 32 && central < eocd && buffer.readUInt32LE(central) === 0x02014b50, 'Invalid ZIP central directory')
  assert.equal(central + buffer.readUInt32LE(eocd + 12), eocd, 'Invalid central directory size')
  assert.equal(buffer.subarray(central - 16, central).toString(), 'RPK Sig Block 42', 'RPK signing block missing')
  const size64 = buffer.readBigUInt64LE(central - 24)
  assert(size64 <= BigInt(central - 8), 'Invalid signing block size')
  const start = central - Number(size64) - 8
  assert.equal(buffer.readBigUInt64LE(start), size64, 'Signing block lengths differ')
  const pairs = reader(buffer.subarray(start + 8, central - 24))
  let signing = null
  let fileSigning = null
  while (!pairs.done()) {
    const length64 = pairs.take(8).readBigUInt64LE()
    assert(length64 <= BigInt(buffer.length), 'Invalid signing entry size')
    const pair = reader(pairs.take(Number(length64)))
    const id = pair.uint()
    if (id === 0x01000101) { assert.equal(signing, null, 'Duplicate signer entry'); signing = pair.field(); pair.end() }
    else if (id === 0x01000201) { assert.equal(fileSigning, null, 'Duplicate file signer entry'); fileSigning = pair.field(); pair.end() }
    else throw new Error('Unexpected RPK signing entry')
  }
  assert(signing, 'Signer missing')
  const signers = reader(signing)
  const signer = reader(signers.field()); signers.end()
  const signedData = signer.field()
  const signatures = reader(signer.field())
  const signature = reader(signatures.field()); signatures.end()
  assert.equal(signature.uint(), 0x0103, 'Unsupported signature algorithm')
  const signatureBytes = signature.field(); signature.end()
  const publicKeyBytes = signer.field(); signer.end()
  const data = reader(signedData)
  const digests = reader(data.field())
  const digest = reader(digests.field()); digests.end()
  assert.equal(digest.uint(), 0x0103, 'Unsupported digest algorithm')
  const expectedDigest = digest.field(); digest.end()
  const certificates = reader(data.field())
  const certificateBytes = certificates.field(); certificates.end()
  assert.equal(data.uint(), 0, 'Unexpected signer attributes'); data.end()
  const certificate = new crypto.X509Certificate(certificateBytes)
  const publicKey = crypto.createPublicKey({ key: publicKeyBytes, format: 'der', type: 'spki' })
  assert(certificate.publicKey.export({ format: 'der', type: 'spki' }).equals(publicKeyBytes), 'Embedded certificate/public key differ')
  assert(crypto.verify('RSA-SHA256', signedData, publicKey, signatureBytes), 'RSA signature verification failed')
  assert(fileSigning, 'File digest signature missing')
  const fileSigner = reader(fileSigning)
  const fileDigests = fileSigner.field()
  const fileSignature = reader(fileSigner.field()); fileSigner.end()
  assert.equal(fileSignature.uint(), 0x0103, 'Unsupported file signature algorithm')
  const fileSignatureBytes = fileSignature.field(); fileSignature.end()
  assert(crypto.verify('RSA-SHA256', fileDigests, publicKey, fileSignatureBytes), 'File digest signature verification failed')
  const records = reader(fileDigests)
  assert.equal(records.uint(), 0x0103, 'Unsupported file digest algorithm')
  const fileHashes = new Map()
  while (!records.done()) {
    const nameHash = records.uint()
    const digestLength = records.take(2).readUInt16LE()
    assert.equal(digestLength, 32, 'Invalid file SHA-256 length')
    assert(!fileHashes.has(nameHash), 'Duplicate file digest name')
    fileHashes.set(nameHash, records.take(digestLength))
  }
  const footer = Buffer.from(buffer.subarray(eocd))
  footer.writeUInt32LE(start, 16)
  const sections = [buffer.subarray(0, start), buffer.subarray(central, eocd), footer]
  const hashes = sections.map(section => {
    const prefix = Buffer.alloc(5); prefix[0] = 0xa5; prefix.writeUInt32LE(section.length, 1)
    return crypto.createHash('sha256').update(prefix).update(section).digest()
  })
  const prefix = Buffer.alloc(5); prefix[0] = 0x5a; prefix.writeUInt32LE(3, 1)
  const actualDigest = crypto.createHash('sha256').update(Buffer.concat([prefix, ...hashes])).digest()
  assert(actualDigest.equals(expectedDigest), 'Signed RPK content digest differs')
  return {
    certificate, fileHashes,
    unsignedDigest: crypto.createHash('sha256').update(Buffer.concat(sections)).digest(),
    signatureOffset: signatureBytes.byteOffset - buffer.byteOffset,
    fileSignatureOffset: fileSignatureBytes.byteOffset - buffer.byteOffset
  }
}

async function inspect(filePath, certificatePath, mode = 'demo') {
  const profile = identity(mode)
  const buffer = fs.readFileSync(filePath)
  const verified = verifyBuffer(buffer)
  assert.equal(verified.certificate.fingerprint256, profile.fingerprint, 'Unexpected profile signing identity')
  if (certificatePath) assert.equal(verified.certificate.fingerprint256, new crypto.X509Certificate(fs.readFileSync(certificatePath)).fingerprint256, 'Unexpected signing identity')
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
  const names = Object.keys(zip.files).filter(name => !name.endsWith('/'))
  assert.equal(verified.fileHashes.size, names.length, 'Signed file digest count differs')
  for (const name of names) {
    const expected = verified.fileHashes.get(CRC32.digest(name) >>> 0)
    const content = await zip.file(name).async('nodebuffer')
    assert(expected && crypto.createHash('sha256').update(content).digest().equals(expected), 'Signed file digest differs: ' + name)
  }
  const required = ['manifest.json', 'app.js', 'pages/Home/index.js', 'pages/Detail/index.js', 'pages/Connection/index.js', 'pages/Control/index.js', 'common/icon.png', 'META-INF/CERT']
  if (mode === 'demo') required.push('pages/States/index.js')
  else assert(!zip.file('pages/States/index.js'), 'Demo page included in live package')
  for (const name of required) assert(zip.file(name), 'Missing RPK resource: ' + name)
  const metaBuffer = await zip.file('META-INF/CERT').async('nodebuffer')
  const meta = verifyBuffer(metaBuffer)
  assert.equal(meta.certificate.fingerprint256, verified.certificate.fingerprint256, 'Metadata signer differs')
  // The toolkit signs the *unsigned metadata ZIP*, under the name hash.json.
  // It deliberately does not hash only the extracted hash.json content here.
  assert.equal(meta.fileHashes.size, 1, 'Unexpected metadata digest count')
  assert(meta.unsignedDigest.equals(meta.fileHashes.get(CRC32.digest('hash.json') >>> 0)), 'Metadata ZIP digest differs')
  const metaZip = await JSZip.loadAsync(metaBuffer, { checkCRC32: true })
  assert(metaZip.file('hash.json'), 'Metadata hash.json missing')
  const digestManifest = JSON.parse(await metaZip.file('hash.json').async('string'))
  assert.equal(digestManifest.algorithm, 'SHA-256', 'Unexpected metadata hash algorithm')
  const resourceNames = names.filter(name => name !== 'META-INF/CERT')
  assert.deepEqual(Object.keys(digestManifest.digests).sort(), resourceNames.slice().sort(), 'Metadata resource set differs')
  for (const name of resourceNames) {
    const content = await zip.file(name).async('nodebuffer')
    assert.equal(crypto.createHash('sha256').update(content).digest('hex'), digestManifest.digests[name], 'Metadata resource digest differs: ' + name)
  }
  for (const name of required.filter(name => name.startsWith('pages/'))) {
    const script = await zip.file(name).async('string')
    for (const style of ['page', 'badge', 'button']) {
      assert(new RegExp('\\[\\s*0,\\s*["\x27]' + style + '["\x27]').test(script), 'Compiled shared style missing: ' + name + '/' + style)
    }
    assert(script.includes('演示数据'), 'Shared demo badge missing: ' + name)
  }
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'))
  assert.equal(manifest.package, profile.package)
  assert.equal(manifest.versionName, profile.versionName)
  assert.equal(manifest.versionCode, profile.versionCode)
  assert.deepEqual(Object.keys(manifest.router.pages).sort(), (mode === 'live' ? ['pages/Home','pages/Detail','pages/Connection','pages/Control'] : ['pages/Home','pages/Detail','pages/Connection','pages/Control','pages/States']).sort())
  assert.equal(manifest.config.designWidth, 168)
  assert.equal(manifest.router.entry, 'pages/Home')
  assert.deepEqual(manifest.features.map(feature => feature.name).sort(), ['system.interconnect', 'system.router'])
  assert(!manifest.config.background, 'Unexpected background permission')
  const forbidden = Object.keys(zip.files).filter(name => /(?:private|authkey|\.pem$|\.key$|\.env)/i.test(name))
  assert.equal(forbidden.length, 0, 'Sensitive resource filenames in RPK')
  const contentTamper = Buffer.from(buffer); contentTamper[40] ^= 1
  assert.throws(() => verifyBuffer(contentTamper), /content digest/)
  const signatureTamper = Buffer.from(buffer); signatureTamper[verified.signatureOffset] ^= 1
  assert.throws(() => verifyBuffer(signatureTamper), /signature verification/)
  const fileSignatureTamper = Buffer.from(buffer); fileSignatureTamper[verified.fileSignatureOffset] ^= 1
  assert.throws(() => verifyBuffer(fileSignatureTamper), /File digest signature verification/)
  return {
    path: path.resolve(filePath), bytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    package: manifest.package, version: manifest.versionName, versionCode: manifest.versionCode, profile: mode,
    signature: 'RSA-SHA256 verified; content and per-file SHA-256 verified; signed metadata verified',
    certificateSubject: verified.certificate.subject,
    certificateFingerprint256: verified.certificate.fingerprint256,
    certificateValidTo: verified.certificate.validTo,
    zipCRC32: 'verified', sharedStyles: 'present in all compiled pages', tamperChecks: 'payload, primary signature and file digest signature mutations rejected',
    files: Object.keys(zip.files).filter(name => !name.endsWith('/'))
  }
}

if (require.main === module) {
  const file = process.argv[2] || path.join(__dirname, '../dist/com.guanyi.mirra.band.demo.release.0.2.0.rpk')
  inspect(file, process.argv[3], process.argv[4] || 'demo').then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n')).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1 })
}
module.exports = { inspect, verifyBuffer }

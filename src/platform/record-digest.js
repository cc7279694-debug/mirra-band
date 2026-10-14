const { utf8Bytes } = require('../lib/companion-protocol');
// Platform SHA-256 is checked against independent, frozen vectors before use.
// No local hash implementation or CRC fallback can produce an import identity.
const SHA256_VECTORS = [
  { data: 'abc', digest: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' },
  { data: '中文', digest: '72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21' },
  { data: '📖', digest: '4cb948bc5d20694b30ce6383eab9818a946a99e218b6bb7744299458d1fc37ab' }
];
SHA256_VECTORS.forEach(Object.freeze); Object.freeze(SHA256_VECTORS);
function createRecordDigest(loadModule) {
  let crypto = null, verified = false, failed = false;
  function nativeHash(raw) {
    const result = crypto.hashDigest({ data: raw, algo: 'SHA256' });
    if (typeof result !== 'string' || !/^[0-9a-fA-F]{64}$/.test(result)) throw new Error('RECORD_DIGEST_UNAVAILABLE');
    return result.toLowerCase();
  }
  function sha256(raw) {
    utf8Bytes(raw);
    if (failed) throw new Error('RECORD_DIGEST_UNAVAILABLE');
    try {
      if (!verified) {
        const module = loadModule('@system.crypto'); crypto = module && (module.default || module);
        if (!crypto || typeof crypto.hashDigest !== 'function') throw new Error('RECORD_DIGEST_UNAVAILABLE');
        SHA256_VECTORS.forEach(vector => { if (nativeHash(vector.data) !== vector.digest) throw new Error('RECORD_DIGEST_UNAVAILABLE'); });
        verified = true;
      }
      return nativeHash(raw);
    } catch (_) { failed = true; throw new Error('RECORD_DIGEST_UNAVAILABLE'); }
  }
  return { sha256 };
}
module.exports = { SHA256_VECTORS, createRecordDigest };

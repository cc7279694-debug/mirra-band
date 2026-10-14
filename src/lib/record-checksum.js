// Identical UTF8 CRC32 damage detection; never a durable content identity.
function checksum(text) {
  let crc = 0xffffffff;
  function byte(value) { crc ^= value; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  for (let index = 0; index < text.length; index++) {
    let code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) code = 0x10000 + ((code - 0xd800) << 10) + (text.charCodeAt(++index) - 0xdc00);
    if (code < 0x80) byte(code);
    else if (code < 0x800) { byte(0xc0 | (code >> 6)); byte(0x80 | (code & 0x3f)); }
    else if (code < 0x10000) { byte(0xe0 | (code >> 12)); byte(0x80 | ((code >> 6) & 0x3f)); byte(0x80 | (code & 0x3f)); }
    else { byte(0xf0 | (code >> 18)); byte(0x80 | ((code >> 12) & 0x3f)); byte(0x80 | ((code >> 6) & 0x3f)); byte(0x80 | (code & 0x3f)); }
  }
  return ('00000000' + ((crc ^ 0xffffffff) >>> 0).toString(16)).slice(-8);
}
module.exports = { checksum };

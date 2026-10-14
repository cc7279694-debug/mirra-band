const wire = require('./companion-protocol');
const { checksum: reviewedChecksum } = require('./local-codec');
const catalogWire = require('./catalog-wire');
const { CATALOG_VERSION, MAX_CATALOG_BYTES, MAX_BOOKS, MAX_PARTS, MAX_PART_BYTES, TRANSFER_TIMEOUT_MS, TYPES, ERROR_CODES, fields, boundedInteger, identifier, revision, fail } = catalogWire;
function utf8Bytes(value) { return wire.utf8Bytes(value); }
// CRC32 detects accidental corruption, not authentication.
function checksum(value) { utf8Bytes(value); return reviewedChecksum(value); }
function revisionFor(raw) { return 'catalog-' + checksum(raw) + '-' + utf8Bytes(raw); }
function invisible(point) {
  return point === 0xad || point >= 0x600 && point <= 0x605 || point === 0x61c || point === 0x6dd || point === 0x70f
    || point >= 0x890 && point <= 0x891 || point === 0x8e2 || point === 0x180e || point >= 0x200b && point <= 0x200f
    || point >= 0x202a && point <= 0x202e || point >= 0x2060 && point <= 0x206f || point === 0xfeff
    || point >= 0xfff9 && point <= 0xfffb || point === 0x110bd || point === 0x110cd || point >= 0x13430 && point <= 0x1343f
    || point >= 0x1bca0 && point <= 0x1bca3 || point >= 0x1d173 && point <= 0x1d17a || point === 0xe0001 || point >= 0xe0020 && point <= 0xe007f;
}
function text(value, maximum) {
  utf8Bytes(value); let points = 0;
  for (let index = 0; index < value.length; index++, points++) {
    let point = value.charCodeAt(index);
    if (point >= 0xd800 && point <= 0xdbff) point = 0x10000 + ((point - 0xd800) << 10) + (value.charCodeAt(++index) - 0xdc00);
    if (invisible(point)) fail('CATALOG_TEXT');
  }
  // Phone-side FirstActionResolver remains the authority for semantic legality.
  if (!value.trim() || points > maximum || /[\x00-\x1f\x7f-\x9f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(value)) fail('CATALOG_TEXT');
  return value;
}
function validateCatalog(value) {
  fields(value, ['schemaVersion', 'books']);
  if (value.schemaVersion !== 1 || !Array.isArray(value.books) || value.books.length > MAX_BOOKS) fail('CATALOG_SCHEMA');
  const ids = []; let mainlines = 0;
  const books = value.books.map(book => {
    fields(book, ['id', 'title', 'totalPages', 'currentPage', 'firstAction', 'isMainline']);
    identifier(book.id, true); if (ids.indexOf(book.id) >= 0) fail('CATALOG_DUPLICATE'); ids.push(book.id);
    if (book.totalPages !== null && !boundedInteger(book.totalPages, 1, 999999)) fail('CATALOG_PAGE');
    if (!boundedInteger(book.currentPage, 0, 999999) || book.totalPages !== null && book.currentPage > book.totalPages) fail('CATALOG_PAGE');
    if (typeof book.isMainline !== 'boolean' || book.isMainline && ++mainlines > 1) fail('CATALOG_MAINLINE');
    return { id: book.id, title: text(book.title, 120), totalPages: book.totalPages, currentPage: book.currentPage,
      firstAction: book.firstAction === null ? null : text(book.firstAction, 160), isMainline: book.isMainline };
  });
  for (let index = 0; index < value.books.length; index++) if (!Object.prototype.hasOwnProperty.call(value.books, index)) fail('CATALOG_SCHEMA');
  return { schemaVersion: 1, books };
}
function canonicalCatalog(value) { const raw = JSON.stringify(validateCatalog(value)); if (utf8Bytes(raw) > MAX_CATALOG_BYTES) fail('CATALOG_TOO_LARGE'); return raw; }
function validateMessage(message) { return catalogWire.validateMessage(message, wire); }
function decodeMessage(payload, expected) { const message = wire.decodeMessage(payload, expected); return validateMessage(message); }
function encodeMessage(message) { validateMessage(message); return wire.encodeMessage(message); }
function buildTransfer(request, value) {
  validateMessage(request); if (request.type !== 'GET_CATALOG') fail('CATALOG_REQUEST');
  const catalog = validateCatalog(value); const canonical = canonicalCatalog(catalog); const parts = [];
  let offset = 0; let chunk = ''; let bytes = 0;
  while (offset < canonical.length) {
    const high = canonical.charCodeAt(offset); const width = high >= 0xd800 && high <= 0xdbff ? 2 : 1;
    const point = canonical.slice(offset, offset + width); const count = utf8Bytes(point);
    if (bytes + count > MAX_PART_BYTES) { parts.push(chunk); chunk = ''; bytes = 0; }
    chunk += point; bytes += count; offset += width;
  }
  if (chunk) parts.push(chunk); if (parts.length > MAX_PARTS) fail('CATALOG_TOO_LARGE');
  const rev = revisionFor(canonical); const common = { protocolVersion: request.protocolVersion, clientInstanceId: request.clientInstanceId, requestId: request.requestId, streamId: request.streamId };
  const frames = [Object.assign({}, common, { type: 'CATALOG_MANIFEST', revision: rev, schemaVersion: 1, totalBytes: utf8Bytes(canonical), partCount: parts.length, bookCount: catalog.books.length, checksum: checksum(canonical) })];
  parts.forEach((data, index) => frames.push(Object.assign({}, common, { type: 'CATALOG_PART', revision: rev, index, data, checksum: checksum(data) })));
  frames.forEach(encodeMessage); return { revision: rev, catalog, canonical, frames };
}
function createCatalogReceiver(options) {
  if (!options || typeof options.persist !== 'function') fail('CATALOG_PERSIST');
  const now = options.now || (() => Date.now()); let generation = 0;
  let context = null, startedAt = null, manifest = null, parts = [], receivedBytes = 0, status = 'idle', code = null, acknowledgement = null;
  function reply(type, extra) { return Object.assign({}, context, { type }, extra); }
  function rejectTransfer(reason) { status = 'failed'; code = reason; generation++; parts = []; receivedBytes = 0; acknowledgement = null; return reply('CATALOG_ERROR', { code: reason }); }
  function expire() {
    if (status !== 'receiving' && status !== 'persisting') return null;
    const time = now(); return !wire.integer(time) || !wire.integer(startedAt) || time < startedAt || time - startedAt >= TRANSFER_TIMEOUT_MS ? rejectTransfer('TIMEOUT') : null;
  }
  function begin(value) {
    validateMessage(Object.assign({}, value, { type: 'GET_CATALOG', knownRevision: null })); generation++;
    context = { protocolVersion: value.protocolVersion, clientInstanceId: value.clientInstanceId, requestId: value.requestId, streamId: value.streamId };
    startedAt = now(); manifest = null; parts = []; receivedBytes = 0; status = 'receiving'; code = null; acknowledgement = null;
  }
  function cancel() { generation++; context = null; manifest = null; parts = []; receivedBytes = 0; status = 'idle'; code = null; acknowledgement = null; }
  function snapshot() { return { status, code, revision: manifest ? manifest.revision : null, receivedParts: parts.filter(part => part !== undefined).length, partCount: manifest ? manifest.partCount : 0 }; }
  async function receive(message) {
    if (!context || status === 'idle' || status === 'failed') return null;
    if (!message || ['protocolVersion', 'clientInstanceId', 'requestId', 'streamId'].some(key => message[key] !== context[key])) return null;
    const timeout = expire(); if (timeout) return timeout;
    try { validateMessage(message); } catch (_) { return rejectTransfer('INVALID_CATALOG'); }
    if (message.type === 'CATALOG_ERROR') return rejectTransfer(message.code);
    if (message.type === 'CATALOG_MANIFEST') {
      if (manifest) { if (Object.keys(manifest).some(key => message[key] !== manifest[key])) return rejectTransfer('CONFLICT'); return acknowledgement; }
      manifest = Object.assign({}, message); parts = new Array(manifest.partCount); return null;
    }
    if (message.type !== 'CATALOG_PART' || !manifest) return null;
    if (message.revision !== manifest.revision) return null;
    if (message.index >= manifest.partCount || checksum(message.data) !== message.checksum) return rejectTransfer('INVALID_CATALOG');
    if (parts[message.index] !== undefined) return parts[message.index] === message.data ? acknowledgement : rejectTransfer('CONFLICT');
    if (status !== 'receiving') return null;
    if (receivedBytes + utf8Bytes(message.data) > manifest.totalBytes) return rejectTransfer('INVALID_CATALOG');
    parts[message.index] = message.data; receivedBytes += utf8Bytes(message.data);
    if (parts.filter(part => part !== undefined).length !== manifest.partCount) return null;
    const raw = parts.join(''); let catalog;
    try {
      catalog = validateCatalog(JSON.parse(raw));
      if (receivedBytes !== manifest.totalBytes || checksum(raw) !== manifest.checksum || revisionFor(raw) !== manifest.revision
        || catalog.books.length !== manifest.bookCount || canonicalCatalog(catalog) !== raw) return rejectTransfer('INVALID_CATALOG');
    } catch (_) { return rejectTransfer('INVALID_CATALOG'); }
    status = 'persisting'; const captured = generation; const rev = manifest.revision; let saved;
    try { saved = await options.persist({ revision: rev, catalog, canonical: raw }); }
    catch (_) { if (generation !== captured) return null; return rejectTransfer('PERSIST_FAILED'); }
    if (generation !== captured) return null;
    const late = expire(); if (late) return late;
    if (!saved || ['ready', 'recovered'].indexOf(saved.status) < 0) return rejectTransfer(saved && saved.status === 'uncertain' ? 'RESULT_UNKNOWN' : 'PERSIST_FAILED');
    try { if (saved.revision !== rev || saved.canonical !== raw || canonicalCatalog(saved.catalog) !== raw) return rejectTransfer('PERSIST_FAILED'); }
    catch (_) { return rejectTransfer('PERSIST_FAILED'); }
    status = 'persisted'; acknowledgement = reply('CATALOG_ACK', { revision: rev, code: 'PERSISTED' }); return acknowledgement;
  }
  return { begin, receive, cancel, expire, snapshot };
}
module.exports = { CATALOG_VERSION, MAX_CATALOG_BYTES, MAX_BOOKS, MAX_PARTS, MAX_PART_BYTES, TRANSFER_TIMEOUT_MS, TYPES, ERROR_CODES,
  utf8Bytes, checksum, revisionFor, validateCatalog, canonicalCatalog, validateMessage, decodeMessage, encodeMessage, buildTransfer, createCatalogReceiver };

const domain = require('./local-session');
// Only the confirmed archive factory registers its immutable instance and its
// private verifier. UI options and ordinary callbacks are not proof providers.
const registrations = [];
function registerRecordArchive(instance, verifier) {
  if (!instance || typeof verifier !== 'function' || !Object.isFrozen(instance)) throw new Error('ARCHIVE_REGISTRATION');
  if (!registrations.some(value => value.instance === instance)) registrations.push({ instance, verifier });
}
function isRecordArchive(instance) { return registrations.some(value => value.instance === instance); }
async function guardedHistoryError(previous, next, context, archive, requireSealed) {
  const registered = context && context.profile === 'formal' && registrations.find(value => value.instance === archive);
  if (!registered) return domain.historyError(previous, next, context);
  return registered.verifier(previous, next, { requireSealed });
}
module.exports = { registerRecordArchive, isRecordArchive, guardedHistoryError };

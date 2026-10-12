const { createProbeBackend } = require('./probe-storage');
// The namespace is fixed at this boundary and cannot be supplied by UI callers.
function createLocalBackend(options) {
  return createProbeBackend(Object.assign({}, options || {}, { namespace: 'local-session-test' }));
}
module.exports = { createLocalBackend };

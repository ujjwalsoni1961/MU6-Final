// Stub module – resolves dynamic imports for native SDKs
// that aren't installed (e.g. @coinbase/wallet-mobile-sdk).
// Thirdweb dynamically imports these but gracefully handles
// missing exports, so an empty module is safe.
module.exports = {};

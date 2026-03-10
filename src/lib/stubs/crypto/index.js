// Stub for Node.js 'crypto' module in React Native.
// Delegates to globalThis.crypto (Web Crypto API) which is
// available in modern React Native via Hermes.
const webcrypto = typeof globalThis === 'object' && globalThis.crypto ? globalThis.crypto : {};
module.exports = webcrypto;
module.exports.webcrypto = webcrypto;
module.exports.randomBytes = function(size) {
    const bytes = new Uint8Array(size);
    if (webcrypto.getRandomValues) {
        webcrypto.getRandomValues(bytes);
    }
    return bytes;
};

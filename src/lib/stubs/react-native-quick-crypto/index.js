module.exports = {
  randomBytes: (n) => new Uint8Array(n),
  createHash: () => ({ update: () => ({ digest: () => Buffer.alloc(32) }) }),
  createHmac: () => ({ update: () => ({ digest: () => Buffer.alloc(32) }) }),
  pbkdf2: () => Promise.reject(new Error('quick-crypto not available')),
  pbkdf2Sync: () => Buffer.alloc(32),
};

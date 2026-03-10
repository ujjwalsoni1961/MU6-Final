module.exports = {
  encrypt: () => Promise.reject(new Error('AES-GCM not available')),
  decrypt: () => Promise.reject(new Error('AES-GCM not available')),
};

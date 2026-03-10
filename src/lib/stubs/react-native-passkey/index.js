class Passkey {
  static create() { return Promise.reject(new Error('Passkey not supported')); }
  static get() { return Promise.reject(new Error('Passkey not supported')); }
  static isSupported() { return Promise.resolve(false); }
}
module.exports = { Passkey };

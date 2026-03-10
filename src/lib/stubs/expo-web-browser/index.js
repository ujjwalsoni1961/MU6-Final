module.exports = {
  openBrowserAsync: () => Promise.resolve({ type: 'cancel' }),
  openAuthSessionAsync: () => Promise.resolve({ type: 'cancel' }),
  dismissBrowser: () => {},
  WebBrowserResultType: { CANCEL: 'cancel', DISMISS: 'dismiss', OPENED: 'opened' },
};

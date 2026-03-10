/**
 * Stub for thirdweb's wallet-connect/receiver/index.js on React Native.
 *
 * The real module statically imports @walletconnect/sign-client, which triggers
 * a CJS __extends interop crash on mobile (Metro resolves @walletconnect/types
 * incorrectly under react-native conditions). Since MU6 doesn't use the
 * WalletConnect "receiver" API (it uses createWallet('walletConnect') instead,
 * which lazy-imports WC), we stub these exports to prevent the crash.
 */

export const createWalletConnectClient = () => {
  throw new Error(
    'WalletConnect receiver is not available on native. Use createWallet("walletConnect") instead.',
  );
};

export const createWalletConnectSession = () => {
  throw new Error('WalletConnect receiver is not available on native.');
};

export const DefaultWalletConnectRequestHandlers = {};

export const disconnectWalletConnectSession = () => {
  throw new Error('WalletConnect receiver is not available on native.');
};

export const getActiveWalletConnectSessions = () => {
  throw new Error('WalletConnect receiver is not available on native.');
};

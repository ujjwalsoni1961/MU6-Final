const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');
const config = getDefaultConfig(__dirname);

// Required for thirdweb v5 SDK – enables named package exports resolution.
// We deliberately do NOT set `unstable_conditionNames` globally. Expo's
// default already configures `unstable_conditionsByPlatform` correctly:
//   { ios: ['react-native'], android: ['react-native'], web: ['browser'] }
// Setting a global list would force every platform (including web) to match
// the 'react-native' export condition — which makes the web bundle pick
// thirdweb's `.native.js` entry (uses expo-web-browser's openAuthSessionAsync
// popup that bypasses `mode: 'redirect'`). That caused the Google sign-in
// popup-hang bug: the web build was literally running the native OAuth path.
// Trust Expo's per-platform conditions; Metro auto-adds 'default' + 'import'
// or 'require' based on file type, so we don't need to list them manually.
config.resolver.unstable_enablePackageExports = true;

// Stub out native-only modules that thirdweb statically/dynamically imports
// but aren't installed. These are for wallet types we don't use (Coinbase)
// and native crypto modules that thirdweb's in-app wallet code references.
// Without stubs, Metro fails to resolve them and the app crashes.
const stubsDir = path.resolve(__dirname, 'src/lib/stubs');
const stubModules = [
    // Coinbase wallet (removed from supportedWallets but thirdweb still bundles code)
    '@coinbase/wallet-mobile-sdk',
    '@coinbase/wallet-sdk',
    '@mobile-wallet-protocol/client',
    // Native crypto & auth modules (thirdweb in-app wallet internals)
    'react-native-passkey',
    'react-native-aes-gcm-crypto',
    'react-native-quick-crypto',
    // Note: expo-web-browser is now properly installed (needed for social auth)
    // AWS SDK (thirdweb wallet migration/recovery code)
    '@aws-sdk/client-kms',
    '@aws-sdk/client-lambda',
    '@aws-sdk/credential-providers',
    // Node.js built-in crypto (used by ws, @noble/hashes cryptoNode fallback)
    'crypto',
];
const extraNodeModules = { ...config.resolver.extraNodeModules };
for (const mod of stubModules) {
    extraNodeModules[mod] = path.resolve(stubsDir, mod);
}
config.resolver.extraNodeModules = extraNodeModules;

// Path to the WalletConnect receiver stub (prevents __extends crash on mobile).
// The real receiver/index.js statically imports @walletconnect/sign-client which
// triggers CJS interop failure on React Native. We only need this stub on native
// platforms; web uses the real module fine.
const wcReceiverStub = path.resolve(stubsDir, 'walletconnect-receiver-stub.js');

// Handle node: protocol imports AND WalletConnect receiver redirect.
config.resolver.resolveRequest = (context, moduleName, platform) => {
    // ── Fix: Redirect WalletConnect receiver to stub on native platforms ──
    // wallets.native.js does:
    //   export { ... } from "../wallets/wallet-connect/receiver/index.js";
    // That module statically imports @walletconnect/sign-client whose CJS bundle
    // does `class Engine extends IEngine` where IEngine = require("@walletconnect/types").
    // Under Metro's react-native condition this CJS chain breaks (__extends of undefined).
    // Since MU6 doesn't use the WC receiver API, redirect to a no-op stub.
    if (
        (platform === 'ios' || platform === 'android') &&
        moduleName.includes('wallet-connect/receiver')
    ) {
        return { type: 'sourceFile', filePath: wcReceiverStub };
    }

    // ── Strip 'node:' prefix and redirect to stub ──
    if (moduleName.startsWith('node:')) {
        const bare = moduleName.slice(5); // e.g. 'node:crypto' -> 'crypto'
        const stubPath = path.resolve(stubsDir, bare, 'index.js');
        const fs = require('fs');
        if (fs.existsSync(stubPath)) {
            return { type: 'sourceFile', filePath: stubPath };
        }
        // For any other node: built-in, return empty module
        return { type: 'sourceFile', filePath: path.resolve(__dirname, 'src/lib/empty-module.js') };
    }

    // Default resolution for everything else
    return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './src/styles/global.css' });

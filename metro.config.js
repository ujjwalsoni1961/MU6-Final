const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');
const config = getDefaultConfig(__dirname);

// Required for thirdweb v5 SDK – enables named package exports resolution.
// Order matters: react-native first, then browser, then import/require.
// IMPORTANT: Do NOT add 'node' — it causes @noble/hashes/crypto to resolve
// to cryptoNode.js which imports Node's built-in crypto (unavailable in RN).
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = [
    'react-native',
    'browser',
    'import',
    'require',
];

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
    'expo-web-browser',
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

// Handle node: protocol imports (e.g. 'node:crypto', 'node:fs')
// Metro doesn't understand the node: prefix natively.
// Redirect them to our stubs or empty modules.
const nodeBuiltinStub = path.resolve(stubsDir, 'crypto'); // reuse crypto stub
config.resolver.resolveRequest = (context, moduleName, platform) => {
    // Strip 'node:' prefix and redirect to stub
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

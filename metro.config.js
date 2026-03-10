const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');
const config = getDefaultConfig(__dirname);

// Required for thirdweb v5 SDK – enables named package exports resolution
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = [
    'react-native',
    'browser',
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
];
const extraNodeModules = { ...config.resolver.extraNodeModules };
for (const mod of stubModules) {
    extraNodeModules[mod] = path.resolve(stubsDir, mod);
}
config.resolver.extraNodeModules = extraNodeModules;

module.exports = withNativeWind(config, { input: './src/styles/global.css' });

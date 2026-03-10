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

// Stub out native-only modules that thirdweb dynamically imports
// but aren't needed for our auth flow (in-app wallet + MetaMask + Rabby).
// Thirdweb bundles Coinbase wallet code that tries to import these at runtime,
// including deep sub-paths like @coinbase/wallet-mobile-sdk/build/...
// We provide full stub packages with the correct directory structure.
const stubsDir = path.resolve(__dirname, 'src/lib/stubs');
config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    '@coinbase/wallet-mobile-sdk': path.resolve(stubsDir, '@coinbase/wallet-mobile-sdk'),
    '@coinbase/wallet-sdk': path.resolve(stubsDir, '@coinbase/wallet-sdk'),
    '@mobile-wallet-protocol/client': path.resolve(stubsDir, '@mobile-wallet-protocol/client'),
};

module.exports = withNativeWind(config, { input: './src/styles/global.css' });

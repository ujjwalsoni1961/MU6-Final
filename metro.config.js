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
// Thirdweb bundles Coinbase wallet code that tries to import these at runtime.
const emptyModule = path.resolve(__dirname, 'src/lib/empty-module.js');
config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    '@coinbase/wallet-mobile-sdk': emptyModule,
    '@coinbase/wallet-sdk': emptyModule,
    '@mobile-wallet-protocol/client': emptyModule,
};

module.exports = withNativeWind(config, { input: './src/styles/global.css' });

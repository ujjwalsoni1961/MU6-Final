const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const config = getDefaultConfig(__dirname);

// Required for thirdweb v5 SDK – enables named package exports resolution
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = [
    'react-native',
    'browser',
    'require',
];

module.exports = withNativeWind(config, { input: './src/styles/global.css' });

import '../src/styles/global.css';
import React from 'react';
import { View, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ThirdwebProvider, AutoConnect } from 'thirdweb/react';
import AnimatedBackground from '../src/components/shared/AnimatedBackground';
import { thirdwebClient, supportedWallets } from '../src/lib/thirdweb';

import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { AuthProvider } from '../src/context/AuthContext';
import { AdminAuthProvider } from '../src/context/AdminAuthContext';

function MainLayout() {
    const isWeb = Platform.OS === 'web';
    const { colors, isDark } = useTheme();

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg.base }}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            {(!isWeb || isDark) && <AnimatedBackground />}
            <Stack screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: 'transparent' },
            }}>
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(consumer)" />
                <Stack.Screen name="(artist)" />
                <Stack.Screen name="(admin)" />
                <Stack.Screen name="admin-login" />
                <Stack.Screen name="suspended" />
            </Stack>
        </View>
    );
}

export default function RootLayout() {
    return (
        <SafeAreaProvider>
            <ThirdwebProvider>
                <AutoConnect client={thirdwebClient} wallets={supportedWallets} />
                <ThemeProvider>
                    <AuthProvider>
                        <AdminAuthProvider>
                            <MainLayout />
                        </AdminAuthProvider>
                    </AuthProvider>
                </ThemeProvider>
            </ThirdwebProvider>
        </SafeAreaProvider>
    );
}

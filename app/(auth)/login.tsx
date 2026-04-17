import React, { useEffect } from 'react';
import { View, Text, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ConnectEmbed } from 'thirdweb/react';

import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { thirdwebClient, activeChain, supportedWallets } from '../../src/lib/thirdweb';

const isWeb = Platform.OS === 'web';

/* ─── Shared Thirdweb Connect Embed wrapper ─── */
function WalletConnect({ isDark }: { isDark?: boolean }) {
    return (
        <ConnectEmbed
            client={thirdwebClient}
            chain={activeChain}
            wallets={supportedWallets}
            theme={isDark ? 'dark' : 'light'}
            modalSize="compact"
            showThirdwebBranding={false}
            header={{
                title: 'Connect to MU6',
                titleIcon: '',
            }}
        />
    );
}

/* ─── Web Login ─── */
function WebLogin() {
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const { isConnected, isLoading, role } = useAuth();

    // Auto-redirect after wallet connects and profile syncs
    useEffect(() => {
        if (isConnected && !isLoading && role) {
            if (role === 'admin') {
                router.replace('/(admin)/dashboard');
            } else if (role === 'creator') {
                router.replace('/(artist)/dashboard');
            } else {
                router.replace('/(consumer)/home');
            }
        }
    }, [isConnected, isLoading, role]);

    // Show loading while profile is syncing after wallet connection
    if (isConnected && isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030711' }}>
                <ActivityIndicator size="large" color="#38b4ba" />
                <Text style={{ color: '#94a3b8', marginTop: 16, fontSize: 14 }}>
                    Setting up your profile...
                </Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#030711' }}>
            {/* Left side – branding */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 60 }}>
                <Image
                    source={require('../../assets/mu6-logo-white.png')}
                    style={{ width: 120, height: 120, marginBottom: 24 }}
                    contentFit="contain"
                />
                <Text style={{
                    fontSize: 20,
                    color: '#f1f5f9',
                    marginTop: 12,
                    letterSpacing: 4,
                    ...(Platform.OS === 'web' ? { textShadow: '0px 0px 10px rgba(56,180,186,0.5)' } : {}),
                } as any}>
                    MUSIC. OWNED.
                </Text>
            </View>

            {/* Right side – connect */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                <View
                    style={{
                        width: '100%', maxWidth: 420,
                        backgroundColor: 'rgba(255,255,255,0.03)',
                        borderRadius: 24, padding: 36,
                        borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
                    }}
                >
                    <Text style={{ fontSize: 24, fontWeight: '800', color: '#f1f5f9', marginBottom: 4 }}>
                        Welcome
                    </Text>
                    <Text style={{ fontSize: 14, color: '#94a3b8', marginBottom: 28 }}>
                        Connect your wallet to continue.
                    </Text>

                    {/* Thirdweb Connect Embed – auto-creates in-app wallet via email/Google/Apple */}
                    <WalletConnect isDark={isDark} />

                    {/* Artist registration link */}
                    <AnimatedPressable
                        preset="button"
                        onPress={() => router.push('/(auth)/artist-login')}
                        style={{ alignItems: 'center', marginTop: 20 }}
                    >
                        <Text style={{ fontSize: 13, color: '#64748b' }}>
                            Are you an artist?{' '}
                            <Text style={{ color: '#38b4ba', fontWeight: '600' }}>Register here</Text>
                        </Text>
                    </AnimatedPressable>
                </View>
            </View>
        </View>
    );
}

/* ─── Mobile Login ─── */
function MobileLogin() {
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const { isConnected, isLoading, role, signOut } = useAuth();

    // Auto-redirect after wallet connects — consumers and admins only
    useEffect(() => {
        if (isConnected && !isLoading && role) {
            if (role === 'admin') {
                router.replace('/(admin)/dashboard');
            } else if (role === 'listener') {
                router.replace('/(consumer)/home');
            }
            // role === 'creator' → do NOT redirect, show blocked message below
        }
    }, [isConnected, isLoading, role]);

    if (isConnected && isLoading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#38b4ba" />
                <Text style={{ color: colors.text.secondary, marginTop: 16, fontSize: 14 }}>
                    Setting up your profile...
                </Text>
            </SafeAreaView>
        );
    }

    // Artist on mobile — blocked
    if (isConnected && role === 'creator') {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
                <Text style={{ fontSize: 48, marginBottom: 20 }}>🎤</Text>
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, textAlign: 'center', marginBottom: 12 }}>
                    Artist Dashboard{'\n'}Desktop Only
                </Text>
                <Text style={{ fontSize: 15, color: colors.text.secondary, textAlign: 'center', lineHeight: 22, marginBottom: 32, maxWidth: 300 }}>
                    The Artist Dashboard is only available on desktop. Please log in from your computer to manage your music.
                </Text>
                <AnimatedPressable
                    preset="button"
                    onPress={async () => {
                        await signOut();
                        router.replace('/(auth)/login');
                    }}
                    style={{
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        paddingHorizontal: 28, paddingVertical: 14,
                        borderRadius: 14, borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    }}
                >
                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }}>Sign Out</Text>
                </AnimatedPressable>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
            <ScrollView
                contentContainerStyle={{
                    flexGrow: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                    paddingHorizontal: 24,
                    paddingVertical: 40,
                }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <Image
                    source={isDark ? require('../../assets/mu6-logo-white.png') : require('../../assets/mu6-logo.png')}
                    style={{ width: 120, height: 120, marginBottom: 12 }}
                    contentFit="contain"
                />
                <Text style={{
                    fontSize: 16,
                    color: colors.text.primary,
                    letterSpacing: 3,
                    opacity: 0.6,
                    marginBottom: 32,
                }}>
                    MUSIC  OWNED
                </Text>

                {/*
                  Thirdweb ConnectEmbed – matches app theme.
                  The embed's internal root has flex:1 which collapses inside
                  ScrollView. Wrapping with minHeight ensures it renders.
                */}
                <View style={{ width: '100%', maxWidth: 380, minHeight: 400 }}>
                    <WalletConnect isDark={isDark} />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

export default function LoginScreen() {
    return isWeb ? <WebLogin /> : <MobileLogin />;
}

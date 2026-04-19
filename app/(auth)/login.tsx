import React, { useEffect } from 'react';
import { View, Text, Platform, ActivityIndicator, ScrollView, useWindowDimensions } from 'react-native';
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

/* ─── Web Login (responsive) ─── */
function WebLogin() {
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const { isConnected, isLoading, role } = useAuth();
    const { width } = useWindowDimensions();

    // Breakpoint: below 900px viewport → stacked mobile-friendly layout.
    const isNarrow = width < 900;
    const cardPadding = isNarrow ? 24 : 36;
    const logoSize = isNarrow ? 84 : 120;
    const brandSpacing = isNarrow ? 24 : 60;

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

    const BrandBlock = (
        <View
            style={{
                width: '100%',
                flex: isNarrow ? 0 : 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: isNarrow ? 24 : brandSpacing,
                paddingTop: isNarrow ? 48 : brandSpacing,
                paddingBottom: isNarrow ? 24 : brandSpacing,
            }}
        >
            <Image
                source={require('../../assets/mu6-logo-white.png')}
                style={{ width: logoSize, height: logoSize, marginBottom: isNarrow ? 12 : 24 }}
                contentFit="contain"
            />
            <Text
                style={{
                    fontSize: isNarrow ? 14 : 20,
                    color: '#f1f5f9',
                    marginTop: isNarrow ? 4 : 12,
                    letterSpacing: isNarrow ? 3 : 4,
                    ...(Platform.OS === 'web' ? { textShadow: '0px 0px 10px rgba(56,180,186,0.5)' } : {}),
                } as any}
            >
                MUSIC. OWNED.
            </Text>
        </View>
    );

    const CardBlock = (
        <View
            style={{
                flex: isNarrow ? 0 : 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: isNarrow ? 16 : 40,
                paddingBottom: isNarrow ? 40 : 40,
                paddingTop: isNarrow ? 8 : 40,
                width: '100%',
            }}
        >
            <View
                style={{
                    width: '100%',
                    maxWidth: 420,
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    borderRadius: 24,
                    padding: cardPadding,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.06)',
                }}
            >
                <Text style={{ fontSize: 24, fontWeight: '800', color: '#f1f5f9', marginBottom: 4 }}>
                    Welcome
                </Text>
                <Text style={{ fontSize: 14, color: '#94a3b8', marginBottom: 28 }}>
                    Connect your wallet to continue.
                </Text>

                {/*
                  Thirdweb ConnectEmbed – its root uses flex:1 which collapses
                  inside a block container on web. Wrap with explicit minHeight
                  so the embed renders with proper height and doesn't overflow
                  its parent (preventing visual overlap with sibling blocks).
                */}
                <View style={{ width: '100%', minHeight: 430 }}>
                    <WalletConnect isDark={isDark} />
                </View>

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

                {/* E2E test personas — rendered only when E2E mode is enabled */}
                {process.env.EXPO_PUBLIC_E2E_MODE === 'true' ? (
                    <AnimatedPressable
                        preset="button"
                        onPress={() => router.push('/(auth)/e2e-login')}
                        style={{ alignItems: 'center', marginTop: 10 }}
                    >
                        <Text style={{ fontSize: 12, color: '#f59e0b' }}>
                            E2E test mode ·{' '}
                            <Text style={{ color: '#fcd34d', fontWeight: '600' }}>
                                Use a test persona
                            </Text>
                        </Text>
                    </AnimatedPressable>
                ) : null}
            </View>
        </View>
    );

    // Narrow viewport (phone browsers) — render as a plain block-level
    // div (no flex container) so Thirdweb ConnectEmbed's internal flex:1 /
    // absolute-positioned children cannot pull siblings (BrandBlock) on top.
    // Using `display: block` on the outermost web element forces normal
    // document flow for stacking.
    if (isNarrow) {
        return (
            <View
                // @ts-ignore — RNW allows raw style props; we need block layout
                // here so children stack in document flow, immune to any
                // flex/position quirks from ConnectEmbed's internal DOM.
                style={{
                    minHeight: '100%',
                    backgroundColor: '#030711',
                    ...(Platform.OS === 'web' ? { display: 'block' as any } : {}),
                } as any}
            >
                {BrandBlock}
                {CardBlock}
            </View>
        );
    }

    // Desktop / tablet — side-by-side two-column layout.
    return (
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#030711' }}>
            {BrandBlock}
            {CardBlock}
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

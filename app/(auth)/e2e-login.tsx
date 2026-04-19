/**
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ E2E LOGIN — TESTNET + DEV ONLY                                       │
 * │                                                                      │
 * │ Gated behind EXPO_PUBLIC_E2E_MODE === 'true'. When the env flag is   │
 * │ not set, this screen renders nothing and the regular login flow is   │
 * │ the only way in. Used only for end-to-end testing on Polygon Amoy.   │
 * │                                                                      │
 * │ Three buttons (artist / user1 / user2) each instantiate a Thirdweb   │
 * │ account from a configured private key and go through the real        │
 * │ Thirdweb connection manager via createWalletAdapter — the app's      │
 * │ AuthContext then treats the wallet exactly like any other connected  │
 * │ wallet and syncs/creates a Supabase profile by wallet_address.       │
 * │                                                                      │
 * │ ⚠ NEVER ship this with real production keys.                         │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    Platform,
    ActivityIndicator,
    ScrollView,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useConnect } from 'thirdweb/react';
import { createWalletAdapter, privateKeyToAccount } from 'thirdweb/wallets';

import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { thirdwebClient, activeChain } from '../../src/lib/thirdweb';

const E2E_ENABLED = process.env.EXPO_PUBLIC_E2E_MODE === 'true';

type TestPersona = {
    id: 'artist' | 'user1' | 'user2';
    label: string;
    description: string;
    privateKey: string | undefined;
};

const PERSONAS: TestPersona[] = [
    {
        id: 'artist',
        label: 'Test Artist',
        description: 'Creator account — upload, mint, collect primary royalties',
        privateKey: process.env.EXPO_PUBLIC_E2E_TEST_KEY_ARTIST,
    },
    {
        id: 'user1',
        label: 'Test User 1',
        description: 'Listener account — primary purchase + relist',
        privateKey: process.env.EXPO_PUBLIC_E2E_TEST_KEY_USER1,
    },
    {
        id: 'user2',
        label: 'Test User 2',
        description: 'Listener account — secondary purchase',
        privateKey: process.env.EXPO_PUBLIC_E2E_TEST_KEY_USER2,
    },
];

export default function E2ELoginScreen() {
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const { isConnected, isLoading, role } = useAuth();
    const { connect, isConnecting } = useConnect();
    const { width } = useWindowDimensions();

    const [error, setError] = useState<string | null>(null);
    const [loadingPersona, setLoadingPersona] = useState<string | null>(null);

    const isNarrow = width < 700;

    // Redirect away if feature is disabled.
    useEffect(() => {
        if (!E2E_ENABLED) {
            router.replace('/(auth)/login');
        }
    }, [router]);

    // Post-connect routing (same rules as the normal login).
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
    }, [isConnected, isLoading, role, router]);

    const personas = useMemo(() => PERSONAS, []);

    const handleConnect = async (persona: TestPersona) => {
        setError(null);
        if (!persona.privateKey) {
            setError(
                `Missing private key for ${persona.label}. Set EXPO_PUBLIC_E2E_TEST_KEY_${persona.id.toUpperCase()} in your environment.`,
            );
            return;
        }

        setLoadingPersona(persona.id);
        try {
            const account = privateKeyToAccount({
                client: thirdwebClient,
                privateKey: persona.privateKey,
            });

            await connect(async () => {
                // Wrap the private-key account in a Thirdweb wallet so the
                // normal connection manager picks it up. This is the pattern
                // thirdweb documents for programmatic / automated sign-in.
                const wallet = createWalletAdapter({
                    client: thirdwebClient,
                    chain: activeChain,
                    adaptedAccount: account,
                    onDisconnect: async () => {
                        /* no-op; Thirdweb handles cleanup */
                    },
                    switchChain: async () => {
                        /* Amoy is the only chain in testnet mode */
                    },
                });
                return wallet;
            });
        } catch (err: any) {
            console.error('[e2e-login] connect error:', err);
            setError(err?.message || 'Failed to connect test wallet.');
        } finally {
            setLoadingPersona(null);
        }
    };

    if (!E2E_ENABLED) {
        return (
            <View style={{ flex: 1, backgroundColor: isDark ? '#030711' : '#f8fafc' }} />
        );
    }

    if (isConnected && isLoading) {
        return (
            <View
                style={{
                    flex: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                    backgroundColor: isDark ? '#030711' : '#f8fafc',
                }}
            >
                <ActivityIndicator size="large" color="#38b4ba" />
                <Text style={{ color: colors.text.secondary, marginTop: 16, fontSize: 14 }}>
                    Setting up your profile...
                </Text>
            </View>
        );
    }

    return (
        <SafeAreaView
            edges={['top', 'bottom']}
            style={{ flex: 1, backgroundColor: isDark ? '#030711' : '#f8fafc' }}
        >
            <ScrollView
                contentContainerStyle={{
                    flexGrow: 1,
                    justifyContent: 'center',
                    paddingHorizontal: isNarrow ? 20 : 40,
                    paddingVertical: 40,
                }}
            >
                <View
                    style={{
                        maxWidth: 540,
                        alignSelf: 'center',
                        width: '100%',
                        padding: isNarrow ? 24 : 32,
                        borderRadius: 20,
                        backgroundColor: isDark ? '#0b1220' : '#ffffff',
                        borderWidth: 1,
                        borderColor: isDark ? '#1e293b' : '#e2e8f0',
                    }}
                >
                    <View
                        style={{
                            alignSelf: 'flex-start',
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 999,
                            backgroundColor: '#f59e0b22',
                            marginBottom: 12,
                        }}
                    >
                        <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '700' }}>
                            E2E TEST MODE · POLYGON AMOY
                        </Text>
                    </View>

                    <Text
                        style={{
                            color: colors.text.primary,
                            fontSize: isNarrow ? 22 : 26,
                            fontWeight: '700',
                            marginBottom: 8,
                        }}
                    >
                        Pick a test persona
                    </Text>
                    <Text
                        style={{
                            color: colors.text.secondary,
                            fontSize: 14,
                            lineHeight: 20,
                            marginBottom: 24,
                        }}
                    >
                        These accounts use private keys loaded from environment
                        variables and exist only for testing. They behave like any
                        other connected wallet after sign-in.
                    </Text>

                    {error ? (
                        <View
                            style={{
                                backgroundColor: '#7f1d1d33',
                                borderColor: '#ef4444',
                                borderWidth: 1,
                                padding: 12,
                                borderRadius: 10,
                                marginBottom: 16,
                            }}
                        >
                            <Text style={{ color: '#ef4444', fontSize: 13 }}>{error}</Text>
                        </View>
                    ) : null}

                    {personas.map((persona) => {
                        const busy = loadingPersona === persona.id || isConnecting;
                        const disabled = busy || !persona.privateKey;
                        return (
                            <AnimatedPressable
                                key={persona.id}
                                onPress={() => handleConnect(persona)}
                                disabled={disabled}
                                style={{
                                    paddingVertical: 14,
                                    paddingHorizontal: 16,
                                    borderRadius: 12,
                                    backgroundColor: disabled
                                        ? '#38b4ba55'
                                        : '#38b4ba',
                                    marginBottom: 12,
                                    opacity: disabled ? 0.7 : 1,
                                }}
                            >
                                <View
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                    }}
                                >
                                    <View style={{ flex: 1, paddingRight: 12 }}>
                                        <Text
                                            style={{
                                                color: '#ffffff',
                                                fontSize: 15,
                                                fontWeight: '700',
                                                marginBottom: 2,
                                            }}
                                        >
                                            {persona.label}
                                        </Text>
                                        <Text
                                            style={{
                                                color: '#ffffffcc',
                                                fontSize: 12,
                                                lineHeight: 16,
                                            }}
                                        >
                                            {persona.description}
                                        </Text>
                                        {!persona.privateKey ? (
                                            <Text
                                                style={{
                                                    color: '#fcd34d',
                                                    fontSize: 11,
                                                    marginTop: 4,
                                                }}
                                            >
                                                Private key env var not set
                                            </Text>
                                        ) : null}
                                    </View>
                                    {busy ? (
                                        <ActivityIndicator color="#ffffff" />
                                    ) : (
                                        <Text
                                            style={{
                                                color: '#ffffff',
                                                fontSize: 20,
                                                fontWeight: '300',
                                            }}
                                        >
                                            →
                                        </Text>
                                    )}
                                </View>
                            </AnimatedPressable>
                        );
                    })}

                    <AnimatedPressable
                        onPress={() => router.replace('/(auth)/login')}
                        style={{
                            paddingVertical: 12,
                            alignItems: 'center',
                            marginTop: 4,
                        }}
                    >
                        <Text
                            style={{
                                color: colors.text.secondary,
                                fontSize: 13,
                            }}
                        >
                            Back to regular sign-in
                        </Text>
                    </AnimatedPressable>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

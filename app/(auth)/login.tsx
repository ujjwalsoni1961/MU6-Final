import React, { useEffect } from 'react';
import { View, Text, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Brush, Shield } from 'lucide-react-native';
import { ConnectEmbed } from 'thirdweb/react';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';

import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { thirdwebClient, activeChain, supportedWallets } from '../../src/lib/thirdweb';

const isWeb = Platform.OS === 'web';

/* ─── Shared Thirdweb Connect Embed wrapper ─── */
function WalletConnect() {
    return (
        <ConnectEmbed
            client={thirdwebClient}
            chain={activeChain}
            wallets={supportedWallets}
            theme="dark"
            modalSize="compact"
            showThirdwebBranding={false}
            header={{
                title: 'Connect to MU6',
                titleIcon: '',
            }}
        />
    );
}

/* ─── Reusable Role Button ─── */
function RoleButton({ label, icon, color, onPress }: {
    label: string; icon?: React.ReactNode; color: string; onPress: () => void;
}) {
    return (
        <AnimatedPressable
            preset="button"
            onPress={onPress}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                borderRadius: 14,
                paddingVertical: 16,
                paddingHorizontal: 24,
                borderWidth: 1,
                borderColor: color,
                marginBottom: 12,
                width: '100%',
            }}
        >
            {icon}
            <Text style={{
                color: color,
                fontWeight: '700',
                fontSize: 15,
                marginLeft: icon ? 10 : 0
            }}>
                {label}
            </Text>
        </AnimatedPressable>
    );
}

/* ─── Web Login ─── */
function WebLogin() {
    const router = useRouter();
    const { colors } = useTheme();
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
                    source={require('../../assets/mu6-logo.png')}
                    style={{ width: 120, height: 120, marginBottom: 24 }}
                    contentFit="contain"
                />
                <Text style={{
                    fontSize: 20,
                    color: '#f1f5f9',
                    marginTop: 12,
                    letterSpacing: 4,
                    textShadowColor: 'rgba(56,180,186,0.5)',
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: 10
                }}>
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

                    {/* Thirdweb Connect Embed – replaces mock wallet button */}
                    <WalletConnect />

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 20 }}>
                        <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                        <Text style={{ color: '#475569', fontSize: 12, marginHorizontal: 12 }}>or continue as</Text>
                        <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                    </View>

                    <RoleButton
                        label="Creator Dashboard"
                        icon={<Brush size={16} color="#8b5cf6" />}
                        color="#8b5cf6"
                        onPress={() => router.push('/(auth)/creator-register')}
                    />

                    <RoleButton
                        label="Super Admin"
                        icon={<Shield size={16} color="#f59e0b" />}
                        color="#f59e0b"
                        onPress={() => router.replace('/(admin)/dashboard')}
                    />
                </View>
            </View>
        </View>
    );
}

/* ─── Mobile Login ─── */
function MobileLogin() {
    const router = useRouter();
    const { isConnected, isLoading, role } = useAuth();

    // Auto-redirect after wallet connects
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

    if (isConnected && isLoading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#38b4ba" />
                <Text style={{ color: '#94a3b8', marginTop: 16, fontSize: 14 }}>
                    Setting up your profile...
                </Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' }}>
            <Image
                source={require('../../assets/mu6-logo.png')}
                style={{ width: 140, height: 140, marginBottom: 16 }}
                contentFit="contain"
            />
            <Text style={{
                fontSize: 18, color: '#f1f5f9', marginTop: 4, letterSpacing: 2,
                textShadowColor: 'rgba(56,180,186,0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10
            }}>
                MUSIC. OWNED.
            </Text>

            <View style={{ marginTop: 40, width: 320, alignItems: 'center' }}>
                {/* Thirdweb Connect Embed – replaces mock wallet button */}
                <WalletConnect />
            </View>
        </SafeAreaView>
    );
}

export default function LoginScreen() {
    return isWeb ? <WebLogin /> : <MobileLogin />;
}

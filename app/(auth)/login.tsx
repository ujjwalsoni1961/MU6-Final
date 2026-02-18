import React from 'react';
import { View, Text, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Wallet, Shield, Brush } from 'lucide-react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';

const isWeb = Platform.OS === 'web';

import { useTheme } from '../../src/context/ThemeContext';

/* ─── Reusable Login Button ─── */
function LoginButton({ label, icon, color, onPress }: {
    label: string; icon?: React.ReactNode; color: string; onPress: () => void;
}) {
    const { isDark } = useTheme();

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

    return (
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#030711' }}>
            {/* Left side */}
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

            {/* Right side */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                <View
                    style={{
                        width: '100%', maxWidth: 380,
                        backgroundColor: 'rgba(255,255,255,0.03)',
                        borderRadius: 24, padding: 36,
                        borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
                    }}
                >
                    <Text style={{ fontSize: 24, fontWeight: '800', color: '#f1f5f9', marginBottom: 4 }}>Welcome</Text>
                    <Text style={{ fontSize: 14, color: '#94a3b8', marginBottom: 28 }}>Connect your wallet to continue.</Text>

                    <LoginButton
                        label="Connect Wallet"
                        icon={<Wallet size={18} color="#38b4ba" />}
                        color="#38b4ba"
                        onPress={() => router.replace('/(consumer)/home')}
                    />

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 20 }}>
                        <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                        <Text style={{ color: '#475569', fontSize: 12, marginHorizontal: 12 }}>or continue as</Text>
                        <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                    </View>

                    <LoginButton
                        label="Artist Dashboard"
                        icon={<Brush size={16} color="#8b5cf6" />}
                        color="#8b5cf6"
                        onPress={() => router.replace('/(artist)/dashboard')}
                    />
                </View>
            </View>
        </View>
    );
}

/* ─── Mobile Login ─── */
function MobileLogin() {
    const router = useRouter();

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

            <View style={{ marginTop: 60, width: 280 }}>
                <LoginButton
                    label="Connect Wallet"
                    icon={<Wallet size={18} color="#38b4ba" />}
                    color="#38b4ba"
                    onPress={() => router.replace('/(consumer)/home')}
                />
            </View>
        </SafeAreaView>
    );
}

export default function LoginScreen() {
    return isWeb ? <WebLogin /> : <MobileLogin />;
}

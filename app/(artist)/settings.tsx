/**
 * Artist Settings Page
 *
 * Central hub for account & profile management:
 * - Profile editing link
 * - Payout information management
 * - Account info display
 * - Logout
 */
import React, { useState, useEffect } from 'react';
import {
    View, Text, ScrollView, Platform, Alert, ActivityIndicator,
    TextInput,
} from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
    Settings as SettingsIcon, UserCog, CreditCard, LogOut,
    ChevronRight, Wallet, Building, Globe, Shield, Save,
} from 'lucide-react-native';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { SelectField } from '../../src/components/form';
import { COUNTRIES, PAYMENT_METHODS } from '../../src/types/creator';

const isWeb = Platform.OS === 'web';

const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c, label: c }));

/* ─── Section Card wrapper ─── */
function SectionCard({ children, title, subtitle, icon: Icon, style }: {
    children: React.ReactNode; title: string; subtitle?: string; icon: any; style?: any;
}) {
    const { isDark, colors } = useTheme();
    return (
        <View style={{
            backgroundColor: isWeb
                ? (isDark ? colors.bg.card : '#fff')
                : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.5)'),
            borderRadius: 20, padding: isWeb ? 28 : 20, marginBottom: 16,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
            ...style,
        }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <View style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: 'rgba(56,180,186,0.1)',
                    alignItems: 'center', justifyContent: 'center', marginRight: 12,
                }}>
                    <Icon size={18} color="#38b4ba" />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary }}>{title}</Text>
                    {subtitle && (
                        <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>{subtitle}</Text>
                    )}
                </View>
            </View>
            {children}
        </View>
    );
}

export default function SettingsScreen() {
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const { profile, signOut, refreshProfile, walletAddress } = useAuth();

    // Payout form state
    const [paymentMethod, setPaymentMethod] = useState('');
    const [accountHolderName, setAccountHolderName] = useState('');
    const [ibanOrAddress, setIbanOrAddress] = useState('');
    const [taxId, setTaxId] = useState('');
    const [payoutCountry, setPayoutCountry] = useState('');
    const [savingPayout, setSavingPayout] = useState(false);

    const Container = isWeb ? View : SafeAreaView;
    const inputStyle = {
        fontSize: 15, color: colors.text.primary,
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc',
        borderRadius: 12, padding: 14, borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
    };

    const handleLogout = async () => {
        if (Platform.OS === 'web') {
            if (!confirm('Are you sure you want to logout?')) return;
        } else {
            return Alert.alert('Logout', 'Are you sure you want to logout?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Logout', style: 'destructive', onPress: async () => {
                    await signOut();
                    router.replace('/(auth)/login');
                } },
            ]);
        }
        await signOut();
        router.replace('/(auth)/login');
    };

    const handleSavePayout = async () => {
        // TODO: Save payout info to profiles table
        setSavingPayout(true);
        setTimeout(() => {
            setSavingPayout(false);
            const msg = 'Payout information saved!';
            Platform.OS === 'web' ? alert(msg) : Alert.alert('Success', msg);
        }, 800);
    };

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    padding: isWeb ? 40 : 16, paddingBottom: 60,
                    maxWidth: isWeb ? 700 : undefined,
                    width: '100%' as any, alignSelf: 'center' as any,
                }}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 28 }}>
                    <View style={{
                        width: 44, height: 44, borderRadius: 12,
                        backgroundColor: 'rgba(56,180,186,0.1)',
                        alignItems: 'center', justifyContent: 'center', marginRight: 14,
                    }}>
                        <SettingsIcon size={22} color="#38b4ba" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                            Settings
                        </Text>
                        <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 2 }}>
                            Manage your account and preferences
                        </Text>
                    </View>
                </View>

                {/* ─── Profile Section ─── */}
                <SectionCard title="Profile" subtitle="Update your artist information" icon={UserCog}>
                    <AnimatedPressable
                        preset="row"
                        hapticType="light"
                        onPress={() => router.push('/(artist)/edit-artist-profile' as any)}
                        style={{
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                            padding: 14, borderRadius: 12,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
                        }}
                    >
                        <View>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }}>
                                Edit Profile
                            </Text>
                            <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>
                                Stage name, bio, avatar, country
                            </Text>
                        </View>
                        <ChevronRight size={18} color={colors.text.muted} />
                    </AnimatedPressable>
                </SectionCard>

                {/* ─── Account Info ─── */}
                <SectionCard title="Account" subtitle="Your account details" icon={Shield}>
                    <View style={{ gap: 12 }}>
                        <View>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.secondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                Email
                            </Text>
                            <Text style={{ fontSize: 14, color: colors.text.primary, fontWeight: '500' }}>
                                {profile?.email || 'Not set'}
                            </Text>
                        </View>
                        <View>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.secondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                Wallet Address
                            </Text>
                            <Text style={{ fontSize: 14, color: colors.text.primary, fontWeight: '500', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                                {walletAddress || 'Not connected'}
                            </Text>
                        </View>
                        <View>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.secondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                Account Type
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ backgroundColor: 'rgba(139,92,246,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#8b5cf6' }}>CREATOR</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </SectionCard>

                {/* ─── Payout Information ─── */}
                <SectionCard title="Payout Information" subtitle="How you receive payments" icon={CreditCard} style={{ zIndex: 10 }}>
                    <View style={{ gap: 14 }}>
                        <View>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary, marginBottom: 6 }}>
                                Payment Method
                            </Text>
                            <SelectField
                                options={PAYMENT_METHODS.map(m => ({ value: m.value, label: m.label }))}
                                value={paymentMethod}
                                onChange={setPaymentMethod}
                                placeholder="Select payment method"
                            />
                        </View>

                        <View>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary, marginBottom: 6 }}>
                                Account Holder Name
                            </Text>
                            <TextInput
                                value={accountHolderName}
                                onChangeText={setAccountHolderName}
                                placeholder="Name on account"
                                placeholderTextColor={colors.text.muted}
                                style={inputStyle}
                            />
                        </View>

                        <View>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary, marginBottom: 6 }}>
                                {paymentMethod === 'crypto_wallet' ? 'Wallet Address' : 'IBAN'}
                            </Text>
                            <TextInput
                                value={ibanOrAddress}
                                onChangeText={setIbanOrAddress}
                                placeholder={paymentMethod === 'crypto_wallet' ? '0x...' : 'FI00 0000 0000 0000 00'}
                                placeholderTextColor={colors.text.muted}
                                style={inputStyle}
                            />
                        </View>

                        <View>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary, marginBottom: 6 }}>
                                Tax ID (optional)
                            </Text>
                            <TextInput
                                value={taxId}
                                onChangeText={setTaxId}
                                placeholder="Tax identification number"
                                placeholderTextColor={colors.text.muted}
                                style={inputStyle}
                            />
                        </View>

                        <View style={{ zIndex: 5 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary, marginBottom: 6 }}>
                                Payout Country
                            </Text>
                            <SelectField
                                options={COUNTRY_OPTIONS}
                                value={payoutCountry}
                                onChange={setPayoutCountry}
                                placeholder="Select country"
                            />
                        </View>

                        <AnimatedPressable
                            preset="button"
                            onPress={handleSavePayout}
                            disabled={savingPayout}
                            style={{
                                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                backgroundColor: '#38b4ba', borderRadius: 12,
                                paddingVertical: 14, gap: 8, marginTop: 4,
                                opacity: savingPayout ? 0.7 : 1,
                            }}
                        >
                            {savingPayout ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <>
                                    <Save size={16} color="#fff" />
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Save Payout Info</Text>
                                </>
                            )}
                        </AnimatedPressable>
                    </View>
                </SectionCard>

                {/* ─── Logout ─── */}
                <AnimatedPressable
                    preset="button"
                    onPress={handleLogout}
                    style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                        paddingVertical: 16, borderRadius: 14, gap: 10, marginTop: 8,
                        backgroundColor: isDark ? 'rgba(239,68,68,0.06)' : '#fef2f2',
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(239,68,68,0.15)' : '#fecaca',
                    }}
                >
                    <LogOut size={18} color="#ef4444" />
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#ef4444' }}>Logout</Text>
                </AnimatedPressable>
            </ScrollView>
        </Container>
    );
}

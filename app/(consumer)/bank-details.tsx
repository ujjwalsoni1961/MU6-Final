import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, Platform, Alert, TextInput,
    StyleSheet, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ChevronLeft, Building2, User as UserIcon, Hash,
    ArrowRightLeft, CheckCircle,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import * as db from '../../src/services/database';

export default function BankDetailsScreen() {
    const { isDark, colors } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { profile } = useAuth();
    const { isDesktopLayout } = useResponsive();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [saved, setSaved] = useState(false);

    const [bankName, setBankName] = useState('');
    const [accountHolder, setAccountHolder] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [routingCode, setRoutingCode] = useState('');

    useEffect(() => {
        if (!profile?.id) {
            setLoading(false);
            return;
        }
        (async () => {
            const details = await db.getBankDetails(profile.id);
            if (details) {
                setBankName(details.bankName);
                setAccountHolder(details.accountHolderName);
                setAccountNumber(details.accountNumber);
                setRoutingCode(details.routingCode);
            }
            setLoading(false);
        })();
    }, [profile?.id]);

    const handleSave = useCallback(async () => {
        if (!profile?.id) return;
        if (!bankName.trim() || !accountHolder.trim() || !accountNumber.trim() || !routingCode.trim()) {
            Alert.alert('Missing Fields', 'Please fill in all bank details.');
            return;
        }

        setSubmitting(true);
        setSaved(false);
        try {
            const details: db.BankDetails = {
                bankName: bankName.trim(),
                accountHolderName: accountHolder.trim(),
                accountNumber: accountNumber.trim(),
                routingCode: routingCode.trim(),
            };
            const ok = await db.saveBankDetails(profile.id, details);
            if (ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            } else {
                Alert.alert('Error', 'Failed to save bank details. Please try again.');
            }
        } catch (err) {
            console.error('[bank-details] save error:', err);
            Alert.alert('Save Failed', 'Could not save bank details. Please check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    }, [profile?.id, bankName, accountHolder, accountNumber, routingCode]);

    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: isDark ? colors.bg.base : '#f8fafc', justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#38b4ba" />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ flex: 1, backgroundColor: isDark ? colors.bg.base : '#f8fafc' }}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                        maxWidth: isDesktopLayout ? 600 : undefined,
                        width: '100%',
                        alignSelf: 'center',
                        paddingHorizontal: isDesktopLayout ? 32 : 16,
                        paddingTop: Platform.OS === 'web' ? 80 : insets.top + 16,
                        paddingBottom: 100,
                    }}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <AnimatedPressable preset="icon" onPress={() => router.back()} style={[
                            styles.backButton,
                            {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)',
                                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)',
                            }
                        ]}>
                            <ChevronLeft size={20} color={colors.text.primary} />
                        </AnimatedPressable>
                        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Bank Details</Text>
                    </View>

                    <Text style={{ fontSize: 14, color: colors.text.secondary, marginBottom: 24, lineHeight: 20 }}>
                        Manage your bank account details for withdrawals. This information is stored securely and used when processing your payout requests.
                    </Text>

                    <FormField
                        label="Bank Name"
                        icon={<Building2 size={18} color="#38b4ba" />}
                        value={bankName}
                        onChangeText={setBankName}
                        placeholder="e.g. Chase, Revolut, Deutsche Bank"
                        isDark={isDark}
                        colors={colors}
                    />
                    <FormField
                        label="Account Holder Name"
                        icon={<UserIcon size={18} color="#38b4ba" />}
                        value={accountHolder}
                        onChangeText={setAccountHolder}
                        placeholder="Full name on account"
                        isDark={isDark}
                        colors={colors}
                    />
                    <FormField
                        label="Account Number / IBAN"
                        icon={<Hash size={18} color="#38b4ba" />}
                        value={accountNumber}
                        onChangeText={setAccountNumber}
                        placeholder="e.g. DE89 3704 0044 0532 0130 00"
                        isDark={isDark}
                        colors={colors}
                    />
                    <FormField
                        label="Routing / SWIFT Code"
                        icon={<ArrowRightLeft size={18} color="#38b4ba" />}
                        value={routingCode}
                        onChangeText={setRoutingCode}
                        placeholder="e.g. COBADEFFXXX"
                        isDark={isDark}
                        colors={colors}
                    />

                    <AnimatedPressable
                        preset="button"
                        onPress={handleSave}
                        disabled={submitting}
                        style={{ marginTop: 24 }}
                    >
                        <View style={[styles.ctaButton, {
                            backgroundColor: saved ? '#22c55e' : colors.text.primary,
                            opacity: submitting ? 0.7 : 1,
                        }]}>
                            {submitting ? (
                                <ActivityIndicator size="small" color={colors.text.inverse} />
                            ) : saved ? (
                                <>
                                    <CheckCircle size={18} color={colors.text.inverse} style={{ marginRight: 8 }} />
                                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.inverse }}>
                                        Saved
                                    </Text>
                                </>
                            ) : (
                                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.inverse }}>
                                    Save Bank Details
                                </Text>
                            )}
                        </View>
                    </AnimatedPressable>
                </ScrollView>
            </View>
        </KeyboardAvoidingView>
    );
}

function FormField({ label, icon, value, onChangeText, placeholder, isDark, colors }: {
    label: string; icon: React.ReactNode; value: string;
    onChangeText: (text: string) => void; placeholder: string;
    isDark: boolean; colors: any;
}) {
    return (
        <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary, marginBottom: 8 }}>
                {label}
            </Text>
            <View style={[styles.formInputRow, {
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            }]}>
                <View style={{ marginRight: 12 }}>{icon}</View>
                <TextInput
                    style={[styles.formInput, { color: colors.text.primary }]}
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    placeholderTextColor={colors.text.tertiary}
                    autoCapitalize="words"
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    backButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        borderWidth: 1,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    formInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
    },
    formInput: {
        flex: 1,
        fontSize: 15,
        fontWeight: '500',
    },
    ctaButton: {
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
});

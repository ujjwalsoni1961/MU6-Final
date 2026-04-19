import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, Platform, Alert, TextInput,
    StyleSheet, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ChevronLeft, Building2, User as UserIcon, Hash, ArrowRightLeft,
    CheckCircle, AlertCircle, Clock, ChevronRight, Edit3,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { useWalletBalance, useActiveAccount } from 'thirdweb/react';
import { thirdwebClient, activeChain } from '../../src/lib/thirdweb';
import * as db from '../../src/services/database';

type Step = 'loading' | 'bank_form' | 'withdraw_form' | 'success';

export default function WithdrawScreen() {
    const { isDark, colors } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { walletAddress, profile } = useAuth();
    const account = useActiveAccount();
    const { isDesktopLayout } = useResponsive();

    const [step, setStep] = useState<Step>('loading');
    const [bankDetails, setBankDetails] = useState<db.BankDetails | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Bank form fields
    const [bankName, setBankName] = useState('');
    const [accountHolder, setAccountHolder] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [routingCode, setRoutingCode] = useState('');

    // Withdraw form
    const [amount, setAmount] = useState('');

    // Recent payout requests
    const [payoutHistory, setPayoutHistory] = useState<db.PayoutRequest[]>([]);

    // Available balance (accrued earnings minus payouts)
    const [availableBalance, setAvailableBalance] = useState<{ totalEarned: number; totalPaidOut: number; availableBalance: number } | null>(null);

    // Wallet balance (on-chain)
    const { data: balanceData } = useWalletBalance({
        chain: activeChain,
        address: walletAddress || undefined,
        client: thirdwebClient,
    });

    const displayBalance = availableBalance
        ? availableBalance.availableBalance.toFixed(4)
        : '0.00';
    const balanceSymbol = 'POL';

    // Load bank details and balance on mount
    useEffect(() => {
        if (!profile?.id) {
            setStep('bank_form');
            return;
        }

        (async () => {
            const details = await db.getBankDetails(profile.id);
            if (details) {
                setBankDetails(details);
                setBankName(details.bankName);
                setAccountHolder(details.accountHolderName);
                setAccountNumber(details.accountNumber);
                setRoutingCode(details.routingCode);
                setStep('withdraw_form');
            } else {
                setStep('bank_form');
            }

            // Load available balance
            const bal = await db.getArtistBalance(profile.id);
            setAvailableBalance(bal);

            // Load payout history
            const history = await db.getPayoutRequests(profile.id);
            setPayoutHistory(history);
        })();
    }, [profile?.id]);

    // Save bank details
    const handleSaveBankDetails = useCallback(async () => {
        if (!profile?.id) return;
        if (!bankName.trim() || !accountHolder.trim() || !accountNumber.trim() || !routingCode.trim()) {
            Alert.alert('Missing Fields', 'Please fill in all bank details.');
            return;
        }

        setSubmitting(true);
        try {
            const details: db.BankDetails = {
                bankName: bankName.trim(),
                accountHolderName: accountHolder.trim(),
                accountNumber: accountNumber.trim(),
                routingCode: routingCode.trim(),
            };
            const ok = await db.saveBankDetails(profile.id, details);
            if (ok) {
                setBankDetails(details);
                setStep('withdraw_form');
            } else {
                Alert.alert('Error', 'Failed to save bank details. Please try again.');
            }
        } catch (err) {
            console.error('[withdraw] saveBankDetails error:', err);
            Alert.alert('Save Failed', 'Could not save bank details. Please check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    }, [profile?.id, bankName, accountHolder, accountNumber, routingCode]);

    // Submit withdrawal
    const handleSubmitWithdrawal = useCallback(async () => {
        if (!profile?.id || !bankDetails) return;

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            Alert.alert('Invalid Amount', 'Please enter a valid withdrawal amount.');
            return;
        }

        if (!account) {
            Alert.alert('Wallet Required', 'Please connect your wallet before requesting a withdrawal.');
            return;
        }

        setSubmitting(true);
        try {
            const result = await db.createPayoutRequest(
                profile.id,
                numAmount,
                bankDetails,
                bankDetails.paymentMethod,
                account,
            );
            if (result.id) {
                setStep('success');
                // Refresh history
                const history = await db.getPayoutRequests(profile.id, account);
                setPayoutHistory(history);
            } else {
                Alert.alert('Error', result.error || 'Failed to submit withdrawal request. Please try again.');
            }
        } catch (err) {
            console.error('[withdraw] createPayoutRequest error:', err);
            Alert.alert('Withdrawal Failed', 'Could not submit withdrawal request. Please check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    }, [profile?.id, bankDetails, amount, account]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'approved': return colors.status.success;
            case 'rejected': return '#ef4444';
            default: return '#f59e0b';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'approved': return CheckCircle;
            case 'rejected': return AlertCircle;
            default: return Clock;
        }
    };

    if (step === 'loading') {
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
                        <AnimatedPressable preset="icon" onPress={() => {
                            if (step === 'success') {
                                router.back();
                            } else if (step === 'bank_form' && bankDetails) {
                                setStep('withdraw_form');
                            } else {
                                router.back();
                            }
                        }} style={[
                            styles.backButton,
                            {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)',
                                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)',
                            }
                        ]}>
                            <ChevronLeft size={20} color={colors.text.primary} />
                        </AnimatedPressable>
                        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
                            {step === 'bank_form' ? 'Bank Details' : step === 'success' ? 'Request Sent' : 'Withdraw'}
                        </Text>
                    </View>

                    {/* ─── BANK FORM ─── */}
                    {step === 'bank_form' && (
                        <>
                            <Text style={{ fontSize: 14, color: colors.text.secondary, marginBottom: 24, lineHeight: 20 }}>
                                {bankDetails ? 'Update your bank details for withdrawals.' : 'Add your bank details to enable withdrawals.'}
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
                                onPress={handleSaveBankDetails}
                                disabled={submitting}
                                style={{ marginTop: 24 }}
                            >
                                <View style={[styles.ctaButton, { backgroundColor: colors.text.primary, opacity: submitting ? 0.7 : 1 }]}>
                                    {submitting ? (
                                        <ActivityIndicator size="small" color={colors.text.inverse} />
                                    ) : (
                                        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.inverse }}>
                                            Save Bank Details
                                        </Text>
                                    )}
                                </View>
                            </AnimatedPressable>
                        </>
                    )}

                    {/* ─── WITHDRAW FORM ─── */}
                    {step === 'withdraw_form' && (
                        <>
                            {/* Balance Display */}
                            <View style={[styles.balanceCard, {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                                borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                            }]}>
                                <Text style={{ fontSize: 12, color: colors.text.secondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>
                                    Available Balance (Accrued Earnings)
                                </Text>
                                <Text style={{ fontSize: 32, fontWeight: '800', color: colors.text.primary, marginTop: 4 }}>
                                    {displayBalance}{' '}
                                    <Text style={{ fontSize: 18, color: colors.text.muted }}>{balanceSymbol}</Text>
                                </Text>
                            </View>

                            {/* Bank Account Summary */}
                            {bankDetails && (
                                <>
                                    <Text style={[styles.sectionLabel, { color: colors.text.tertiary, marginTop: 24 }]}>
                                        WITHDRAW TO
                                    </Text>
                                    <AnimatedPressable
                                        preset="row"
                                        onPress={() => setStep('bank_form')}
                                        style={[styles.bankSummary, {
                                            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                                            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                                        }]}
                                    >
                                        <View style={[styles.bankIcon, { backgroundColor: isDark ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.06)' }]}>
                                            <Building2 size={20} color="#8b5cf6" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }}>
                                                {bankDetails.bankName}
                                            </Text>
                                            <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>
                                                {bankDetails.accountHolderName} - ****{bankDetails.accountNumber.slice(-4)}
                                            </Text>
                                        </View>
                                        <Edit3 size={16} color={colors.text.muted} />
                                    </AnimatedPressable>
                                </>
                            )}

                            {/* Amount Input */}
                            <Text style={[styles.sectionLabel, { color: colors.text.tertiary, marginTop: 24 }]}>
                                WITHDRAWAL AMOUNT (EUR)
                            </Text>
                            <View style={[styles.amountInputContainer, {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                                borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                            }]}>
                                <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text.muted, marginRight: 8 }}>
                                    EUR
                                </Text>
                                <TextInput
                                    style={[styles.amountInput, { color: colors.text.primary }]}
                                    value={amount}
                                    onChangeText={setAmount}
                                    placeholder="0.00"
                                    placeholderTextColor={colors.text.tertiary}
                                    keyboardType="decimal-pad"
                                    returnKeyType="done"
                                />
                            </View>

                            {/* CTA */}
                            <AnimatedPressable
                                preset="button"
                                onPress={handleSubmitWithdrawal}
                                disabled={submitting || !amount}
                                style={{ marginTop: 32 }}
                            >
                                <View style={[styles.ctaButton, {
                                    backgroundColor: amount ? colors.text.primary : colors.text.muted,
                                    opacity: submitting ? 0.7 : 1,
                                }]}>
                                    {submitting ? (
                                        <ActivityIndicator size="small" color={colors.text.inverse} />
                                    ) : (
                                        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.inverse }}>
                                            Request Withdrawal
                                        </Text>
                                    )}
                                </View>
                            </AnimatedPressable>

                            <Text style={{ fontSize: 12, color: colors.text.tertiary, textAlign: 'center', marginTop: 12, lineHeight: 18 }}>
                                Withdrawal requests are reviewed and processed by the admin team.
                            </Text>

                            {/* Payout History */}
                            {payoutHistory.length > 0 && (
                                <>
                                    <Text style={[styles.sectionLabel, { color: colors.text.tertiary, marginTop: 36 }]}>
                                        RECENT REQUESTS
                                    </Text>
                                    {payoutHistory.map((payout) => {
                                        const StatusIcon = getStatusIcon(payout.status);
                                        return (
                                            <View key={payout.id} style={[styles.historyRow, {
                                                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                                borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                                            }]}>
                                                <StatusIcon size={18} color={getStatusColor(payout.status)} style={{ marginRight: 12 }} />
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }}>
                                                        EUR {payout.amountEur.toFixed(2)}
                                                    </Text>
                                                    <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                                                        {new Date(payout.requestedAt).toLocaleDateString('en-US', {
                                                            month: 'short', day: 'numeric', year: 'numeric',
                                                        })}
                                                    </Text>
                                                </View>
                                                <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(payout.status)}15` }]}>
                                                    <Text style={{ fontSize: 11, fontWeight: '700', color: getStatusColor(payout.status), textTransform: 'capitalize' }}>
                                                        {payout.status}
                                                    </Text>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </>
                            )}
                        </>
                    )}

                    {/* ─── SUCCESS ─── */}
                    {step === 'success' && (
                        <View style={{ alignItems: 'center', paddingTop: 40 }}>
                            <View style={[styles.successCircle, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
                                <CheckCircle size={48} color="#22c55e" />
                            </View>
                            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, marginTop: 24, textAlign: 'center' }}>
                                Withdrawal Requested
                            </Text>
                            <Text style={{ fontSize: 14, color: colors.text.secondary, marginTop: 12, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 }}>
                                Your withdrawal request for EUR {parseFloat(amount).toFixed(2)} has been submitted. It will be reviewed and processed by the admin team.
                            </Text>

                            <AnimatedPressable
                                preset="button"
                                onPress={() => router.back()}
                                style={{ marginTop: 36, width: '100%' }}
                            >
                                <View style={[styles.ctaButton, { backgroundColor: colors.text.primary }]}>
                                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.inverse }}>
                                        Back to Wallet
                                    </Text>
                                </View>
                            </AnimatedPressable>

                            <AnimatedPressable
                                preset="button"
                                onPress={() => {
                                    setAmount('');
                                    setStep('withdraw_form');
                                }}
                                style={{ marginTop: 12, width: '100%' }}
                            >
                                <View style={[styles.ctaButtonSecondary, {
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                                }]}>
                                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary }}>
                                        New Withdrawal
                                    </Text>
                                </View>
                            </AnimatedPressable>
                        </View>
                    )}
                </ScrollView>
            </View>
        </KeyboardAvoidingView>
    );
}

/* ─── Reusable Form Field ─── */
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
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        paddingHorizontal: 4,
        marginBottom: 8,
    },
    balanceCard: {
        padding: 20,
        borderRadius: 20,
        borderWidth: 1,
    },
    bankSummary: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
    },
    bankIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    amountInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
    },
    amountInput: {
        flex: 1,
        fontSize: 24,
        fontWeight: '700',
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
    ctaButtonSecondary: {
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
    historyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        marginBottom: 8,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    successCircle: {
        width: 96,
        height: 96,
        borderRadius: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

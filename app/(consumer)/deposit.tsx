import React, { useState, useCallback } from 'react';
import {
    View, Text, ScrollView, Platform, ActivityIndicator, Linking, Alert,
    TextInput, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ChevronLeft, CreditCard, Wallet, ArrowDownLeft,
    ExternalLink, Copy, CheckCircle, Info, Droplets,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { activeChain } from '../../src/lib/thirdweb';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

const isWeb = Platform.OS === 'web';

const MAINNET_CHAIN_ID = 137; // Polygon mainnet
const THIRDWEB_CLIENT_ID = process.env.EXPO_PUBLIC_THIRDWEB_CLIENT_ID || '64c9d6a04c2edcf1c8b117db980edd41';
const FAUCET_URL = 'https://faucet.polygon.technology/';

function buildPayLink(walletAddress: string, amount?: string): string {
    const params = new URLSearchParams({
        clientId: THIRDWEB_CLIENT_ID,
        chainId: String(activeChain.id),
        toAddress: walletAddress,
        theme: 'dark',
    });
    if (amount) {
        params.set('amount', amount);
    }
    return `https://pay.thirdweb.com/?${params.toString()}`;
}

export default function DepositScreen() {
    const { isDark, colors } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { walletAddress } = useAuth();
    const [copied, setCopied] = useState(false);
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);

    const isTestnet = activeChain.id !== MAINNET_CHAIN_ID;
    const networkName = isTestnet ? `Testnet (${activeChain.id})` : 'Polygon Mainnet';

    const truncatedAddress = walletAddress
        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
        : '';

    const copyAddress = useCallback(async () => {
        if (!walletAddress) return;
        try {
            await Clipboard.setStringAsync(walletAddress);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard not available
        }
    }, [walletAddress]);

    const openFaucet = useCallback(async () => {
        try {
            await Linking.openURL(FAUCET_URL);
        } catch {
            Alert.alert('Error', 'Could not open the faucet page.');
        }
    }, []);

    const openThirdwebPay = useCallback(async () => {
        if (!walletAddress) {
            Alert.alert('Wallet Not Connected', 'Please connect your wallet first.');
            return;
        }

        setLoading(true);
        try {
            const link = buildPayLink(walletAddress, amount || undefined);
            const canOpen = await Linking.canOpenURL(link);
            if (canOpen) {
                await Linking.openURL(link);
            } else {
                Alert.alert('Error', 'Could not open the payment page. Please try again.');
            }
        } catch (err) {
            console.error('[deposit] openThirdwebPay error:', err);
            Alert.alert('Error', 'Something went wrong opening the payment page.');
        } finally {
            setLoading(false);
        }
    }, [walletAddress, amount]);

    const presetAmounts = ['10', '25', '50', '100'];

    return (
        <View style={{ flex: 1, backgroundColor: isDark ? colors.bg.base : '#f8fafc' }}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    maxWidth: isWeb ? 600 : undefined,
                    width: '100%',
                    alignSelf: 'center',
                    paddingHorizontal: isWeb ? 32 : 16,
                    paddingTop: isWeb ? 24 : insets.top + 16,
                    paddingBottom: 100,
                }}
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
                    <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Deposit Funds</Text>
                </View>

                {/* Network Badge */}
                <View style={[styles.networkBadge, {
                    backgroundColor: isTestnet
                        ? (isDark ? 'rgba(251,191,36,0.1)' : 'rgba(251,191,36,0.08)')
                        : (isDark ? 'rgba(16,185,129,0.1)' : 'rgba(16,185,129,0.08)'),
                    borderColor: isTestnet ? 'rgba(251,191,36,0.3)' : 'rgba(16,185,129,0.3)',
                }]}>
                    <View style={[styles.networkDot, {
                        backgroundColor: isTestnet ? '#fbbf24' : '#10b981',
                    }]} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: isTestnet ? '#fbbf24' : '#10b981' }}>
                        {networkName}
                    </Text>
                </View>

                {/* Testnet Info Card */}
                {isTestnet && (
                    <View style={[styles.infoCard, {
                        backgroundColor: isDark ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.05)',
                        borderColor: isDark ? 'rgba(251,191,36,0.2)' : 'rgba(251,191,36,0.15)',
                    }]}>
                        <Info size={18} color="#fbbf24" style={{ marginRight: 12 }} />
                        <Text style={{ flex: 1, fontSize: 13, color: colors.text.secondary, lineHeight: 20 }}>
                            You're on testnet. Use the faucet below to get free test POL, or send crypto to your wallet address from another wallet.
                        </Text>
                    </View>
                )}

                {/* Mainnet Info Card */}
                {!isTestnet && (
                    <View style={[styles.infoCard, {
                        backgroundColor: isDark ? 'rgba(56,180,186,0.08)' : 'rgba(56,180,186,0.05)',
                        borderColor: isDark ? 'rgba(56,180,186,0.2)' : 'rgba(56,180,186,0.15)',
                    }]}>
                        <Info size={18} color="#38b4ba" style={{ marginRight: 12 }} />
                        <Text style={{ flex: 1, fontSize: 13, color: colors.text.secondary, lineHeight: 20 }}>
                            Fund your wallet using credit/debit card, crypto transfer, or cross-chain bridging via Thirdweb Pay.
                        </Text>
                    </View>
                )}

                {/* QR Code Section */}
                {walletAddress && (
                    <View style={[styles.qrSection, {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                    }]}>
                        <Text style={[styles.sectionLabel, { color: colors.text.tertiary, marginBottom: 16 }]}>
                            SCAN TO SEND FUNDS
                        </Text>
                        <View style={styles.qrContainer}>
                            <View style={styles.qrWrapper}>
                                <QRCode
                                    value={walletAddress}
                                    size={180}
                                    backgroundColor="white"
                                    color="#000000"
                                />
                            </View>
                        </View>
                        <Text style={{ fontSize: 12, color: colors.text.muted, textAlign: 'center', marginTop: 12 }}>
                            Scan this QR code from another wallet app to send funds
                        </Text>
                    </View>
                )}

                {/* Wallet Address with Copy */}
                <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>YOUR WALLET ADDRESS</Text>
                <AnimatedPressable preset="row" onPress={copyAddress} style={[styles.walletCard, {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                }]}>
                    <View style={[styles.walletIcon, { backgroundColor: `${colors.accent.purple}15` }]}>
                        <Wallet size={20} color={colors.accent.purple} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }}>MU6 Wallet</Text>
                        <Text style={{
                            fontSize: 12, color: colors.text.secondary, marginTop: 2,
                            fontFamily: isWeb ? 'monospace' : undefined,
                        }}>
                            {walletAddress || 'Not connected'}
                        </Text>
                    </View>
                    <View style={[styles.copyButton, {
                        backgroundColor: copied
                            ? (isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.1)')
                            : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'),
                    }]}>
                        {copied ? (
                            <CheckCircle size={16} color={colors.status.success} />
                        ) : (
                            <Copy size={16} color={colors.text.muted} />
                        )}
                        <Text style={{
                            fontSize: 11, fontWeight: '700', marginLeft: 4,
                            color: copied ? colors.status.success : colors.text.muted,
                        }}>
                            {copied ? 'Copied!' : 'Copy'}
                        </Text>
                    </View>
                </AnimatedPressable>

                {/* Testnet: Get Test Funds Button */}
                {isTestnet && (
                    <>
                        <Text style={[styles.sectionLabel, { color: colors.text.tertiary, marginTop: 28 }]}>
                            GET TEST FUNDS
                        </Text>
                        <AnimatedPressable preset="button" onPress={openFaucet} style={{ marginBottom: 8 }}>
                            <View style={[styles.ctaButton, {
                                backgroundColor: '#fbbf24',
                            }]}>
                                <Droplets size={18} color="#000000" style={{ marginRight: 8 }} />
                                <Text style={{ fontSize: 16, fontWeight: '700', color: '#000000' }}>
                                    Get Test POL from Faucet
                                </Text>
                            </View>
                        </AnimatedPressable>
                        <Text style={{ fontSize: 12, color: colors.text.tertiary, textAlign: 'center', marginTop: 4, lineHeight: 18 }}>
                            Opens the Polygon faucet to receive free testnet POL tokens.
                        </Text>
                    </>
                )}

                {/* Mainnet: Amount + Thirdweb Pay */}
                {!isTestnet && (
                    <>
                        {/* Amount Input */}
                        <Text style={[styles.sectionLabel, { color: colors.text.tertiary, marginTop: 28 }]}>AMOUNT (USD)</Text>
                        <View style={[styles.amountInputContainer, {
                            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                        }]}>
                            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text.muted, marginRight: 8 }}>$</Text>
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

                        {/* Preset Amount Pills */}
                        <View style={styles.presetRow}>
                            {presetAmounts.map((preset) => (
                                <AnimatedPressable
                                    key={preset}
                                    preset="tab"
                                    onPress={() => setAmount(preset)}
                                    style={[styles.presetPill, {
                                        backgroundColor: amount === preset
                                            ? (isDark ? 'rgba(56,180,186,0.15)' : 'rgba(56,180,186,0.1)')
                                            : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                                        borderColor: amount === preset ? '#38b4ba' : 'transparent',
                                    }]}
                                >
                                    <Text style={{
                                        fontSize: 14, fontWeight: '600',
                                        color: amount === preset ? '#38b4ba' : colors.text.secondary,
                                    }}>
                                        ${preset}
                                    </Text>
                                </AnimatedPressable>
                            ))}
                        </View>

                        {/* Payment Methods */}
                        <Text style={[styles.sectionLabel, { color: colors.text.tertiary, marginTop: 28 }]}>PAYMENT METHODS</Text>
                        <View style={[styles.methodsCard, {
                            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                        }]}>
                            {[
                                { icon: CreditCard, label: 'Credit / Debit Card', sub: 'Visa, Mastercard, AMEX' },
                                { icon: Wallet, label: 'Crypto Transfer', sub: 'Send from another wallet' },
                                { icon: ArrowDownLeft, label: 'Cross-Chain Bridge', sub: 'Bridge from other networks' },
                            ].map((method, i) => (
                                <View key={i}>
                                    {i > 0 && <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }]} />}
                                    <View style={styles.methodRow}>
                                        <View style={[styles.methodIcon, {
                                            backgroundColor: isDark ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.06)',
                                        }]}>
                                            <method.icon size={18} color="#8b5cf6" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }}>{method.label}</Text>
                                            <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>{method.sub}</Text>
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </View>

                        {/* CTA Button - Thirdweb Pay (mainnet only) */}
                        <AnimatedPressable
                            preset="button"
                            onPress={openThirdwebPay}
                            disabled={loading || !walletAddress}
                            style={{ marginTop: 32 }}
                        >
                            <View style={[styles.ctaButton, {
                                backgroundColor: walletAddress ? colors.text.primary : colors.text.muted,
                                opacity: loading ? 0.7 : 1,
                            }]}>
                                {loading ? (
                                    <ActivityIndicator size="small" color={colors.text.inverse} />
                                ) : (
                                    <>
                                        <ExternalLink size={18} color={colors.text.inverse} style={{ marginRight: 8 }} />
                                        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.inverse }}>
                                            Open Thirdweb Pay
                                        </Text>
                                    </>
                                )}
                            </View>
                        </AnimatedPressable>

                        <Text style={{ fontSize: 12, color: colors.text.tertiary, textAlign: 'center', marginTop: 12, lineHeight: 18 }}>
                            You will be redirected to Thirdweb's secure payment page to complete your deposit.
                        </Text>
                    </>
                )}
            </ScrollView>
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
    networkBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        marginBottom: 16,
    },
    networkDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    infoCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 28,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        paddingHorizontal: 4,
        marginBottom: 8,
    },
    qrSection: {
        alignItems: 'center',
        padding: 24,
        borderRadius: 20,
        borderWidth: 1,
        marginBottom: 28,
    },
    qrContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    qrWrapper: {
        padding: 16,
        backgroundColor: '#ffffff',
        borderRadius: 16,
    },
    walletCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
    },
    walletIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    copyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
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
    presetRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
    },
    presetPill: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
    },
    methodsCard: {
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
    },
    methodRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    methodIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    divider: {
        height: 1,
        marginHorizontal: 16,
    },
    ctaButton: {
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
});

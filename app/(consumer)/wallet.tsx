import React, { useRef } from 'react';
import { View, Text, ScrollView, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUpRight, ArrowDownLeft, Clock, ShieldCheck, Wallet as WalletIcon, ExternalLink } from 'lucide-react-native';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import { useTheme } from '../../src/context/ThemeContext';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useAdminTransactions } from '../../src/hooks/useData';

const isWeb = Platform.OS === 'web';

export default function WalletScreen() {
    const { isDark, colors } = useTheme();
    const insets = useSafeAreaInsets();
    const scrollY = useRef(new Animated.Value(0)).current;
    const router = useRouter();
    const { walletAddress } = useAuth();

    // Real recent transactions
    const { data: recentTxns } = useAdminTransactions(5);

    const truncatedAddress = walletAddress
        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
        : '0x0000...0000';

    return (
        <ScreenScaffold dominantColor={colors.accent.purple} noScroll scrollY={scrollY}>
            <View style={{ flex: 1, maxWidth: isWeb ? 800 : undefined, width: '100%', alignSelf: 'center' }}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                        paddingHorizontal: isWeb ? 32 : 16,
                        paddingTop: isWeb ? 80 : insets.top + 60,
                        paddingBottom: 100,
                    }}
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                        { useNativeDriver: false }
                    )}
                    scrollEventThrottle={16}
                >
                    {/* Header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 32 }}>
                        <View style={{
                            width: 48, height: 48, borderRadius: 24,
                            backgroundColor: `${colors.accent.purple}15`,
                            alignItems: 'center', justifyContent: 'center', marginRight: 16
                        }}>
                            <WalletIcon size={24} color={colors.accent.purple} />
                        </View>
                        <View>
                            <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                                My Wallet
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                <ShieldCheck size={14} color={colors.status.success} style={{ marginRight: 4 }} />
                                <Text style={{ fontSize: 13, color: colors.status.success, fontWeight: '600' }}>
                                    {walletAddress ? 'Connected' : 'Not Connected'}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Balance Card */}
                    <View style={{
                        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                        borderRadius: 24, padding: 24, marginBottom: 24,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                        shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: isDark ? 0.3 : 0.05, shadowRadius: 24, elevation: 5,
                    }}>
                        <Text style={{ fontSize: 14, color: colors.text.secondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                            Total Balance
                        </Text>
                        <Text style={{ fontSize: 42, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>
                            0.00 <Text style={{ fontSize: 24, color: colors.text.muted }}>POL</Text>
                        </Text>
                        <Text style={{ fontSize: 16, color: colors.text.tertiary, marginTop: 4 }}>
                            Polygon Amoy Testnet
                        </Text>

                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                            <AnimatedPressable preset="button" style={{ flex: 1 }}>
                                <View style={{
                                    backgroundColor: colors.text.primary,
                                    paddingVertical: 14, borderRadius: 16,
                                    alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
                                }}>
                                    <ArrowDownLeft size={18} color={colors.text.inverse} style={{ marginRight: 8 }} />
                                    <Text style={{ color: colors.text.inverse, fontSize: 15, fontWeight: '700' }}>Deposit</Text>
                                </View>
                            </AnimatedPressable>
                            <AnimatedPressable preset="button" style={{ flex: 1 }}>
                                <View style={{
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                                    paddingVertical: 14, borderRadius: 16,
                                    alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
                                }}>
                                    <ArrowUpRight size={18} color={colors.text.primary} style={{ marginRight: 8 }} />
                                    <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '700' }}>Send</Text>
                                </View>
                            </AnimatedPressable>
                        </View>
                    </View>

                    {/* Network Info */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
                        {[
                            { label: 'Network', val: 'Polygon Amoy (80002)' },
                            { label: 'Address', val: truncatedAddress },
                        ].map((item, i) => (
                            <View key={i} style={{
                                flex: 1, minWidth: 150,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                                padding: 16, borderRadius: 16,
                            }}>
                                <Text style={{ fontSize: 12, color: colors.text.tertiary, marginBottom: 4 }}>{item.label}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 14, color: colors.text.primary, fontWeight: '600', fontFamily: item.label === 'Address' ? (isWeb ? 'monospace' : undefined) : undefined }}>
                                        {item.val}
                                    </Text>
                                    {item.label === 'Address' && <ExternalLink size={14} color={colors.text.muted} />}
                                </View>
                            </View>
                        ))}
                    </View>

                    {/* Recent Activity */}
                    <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text.primary, marginBottom: 16 }}>
                        Recent Activity
                    </Text>
                    <View style={{ gap: 12 }}>
                        {recentTxns.length > 0 ? recentTxns.map((tx) => (
                            <View key={tx.id} style={{
                                flexDirection: 'row', alignItems: 'center',
                                paddingVertical: 12, paddingHorizontal: 16,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                                borderRadius: 16,
                            }}>
                                <View style={{
                                    width: 40, height: 40, borderRadius: 20,
                                    backgroundColor: tx.type === 'purchase' ? `${colors.status.success}15` : `${colors.text.primary}10`,
                                    alignItems: 'center', justifyContent: 'center', marginRight: 16
                                }}>
                                    {tx.type === 'purchase' ? (
                                        <ArrowDownLeft size={18} color={colors.status.success} />
                                    ) : (
                                        <Clock size={18} color={colors.text.primary} />
                                    )}
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text.primary }}>{tx.type === 'purchase' ? 'NFT Purchase' : 'Listing'}</Text>
                                    <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 2 }}>{tx.songTitle || 'Unknown'}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text.primary }}>
                                        {tx.price} ETH
                                    </Text>
                                    <Text style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 2 }}>
                                        {tx.status}
                                    </Text>
                                </View>
                            </View>
                        )) : (
                            <View style={{ padding: 20, alignItems: 'center' }}>
                                <Text style={{ color: colors.text.secondary }}>No transactions yet</Text>
                            </View>
                        )}
                    </View>
                </ScrollView>
            </View>
        </ScreenScaffold>
    );
}

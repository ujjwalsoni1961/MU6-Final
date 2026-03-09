import React from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DollarSign, Music, Gem } from 'lucide-react-native';
import TransactionRow from '../../src/components/shared/TransactionRow';
import { useCreatorDashboard, useAdminTransactions } from '../../src/hooks/useData';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

export default function EarningsScreen() {
    const { isDark, colors } = useTheme();
    const { data: dashboard, loading: loadingDashboard } = useCreatorDashboard();
    const { data: transactions, loading: loadingTxns } = useAdminTransactions(20);
    const Container = isWeb ? View : SafeAreaView;

    const totalRevenue = dashboard?.totalRevenueEur || 0;
    // Approximate streaming vs NFT breakdown
    const streamingRevenue = (dashboard?.totalPlays || 0) * 0.003; // €0.003 per stream
    const nftRevenue = Math.max(totalRevenue - streamingRevenue, 0);

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: isWeb ? 32 : 16, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
            >
                <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>
                    Earnings
                </Text>
                <Text style={{ fontSize: 14, color: colors.text.secondary, marginTop: 4, marginBottom: 24 }}>
                    Your revenue breakdown and transaction history.
                </Text>

                {loadingDashboard ? (
                    <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="large" color="#38b4ba" /></View>
                ) : (
                    <>
                        {/* Total Earnings Card */}
                        <View
                            style={{
                                padding: isWeb ? 28 : 20, borderRadius: 16,
                                backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                                borderWidth: 1.5, borderColor: 'rgba(56,180,186,0.2)',
                                alignItems: 'center', marginBottom: 20,
                                shadowColor: '#38b4ba', shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.06, shadowRadius: 16, elevation: 4,
                            }}
                        >
                            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(56,180,186,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                                <DollarSign size={24} color="#38b4ba" />
                            </View>
                            <Text style={{ fontSize: 40, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>€{totalRevenue.toFixed(2)}</Text>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>Total Earnings</Text>
                        </View>

                        {/* Breakdown */}
                        <View style={{ flexDirection: 'row', marginBottom: 28 }}>
                            <View style={{
                                flex: 1, margin: 4, padding: isWeb ? 20 : 16, borderRadius: 14,
                                backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                                borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                                alignItems: 'center',
                            }}>
                                <Music size={20} color="#38b4ba" />
                                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, marginTop: 8 }}>€{streamingRevenue.toFixed(2)}</Text>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>Streaming</Text>
                            </View>
                            <View style={{
                                flex: 1, margin: 4, padding: isWeb ? 20 : 16, borderRadius: 14,
                                backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                                borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                                alignItems: 'center',
                            }}>
                                <Gem size={20} color="#8b5cf6" />
                                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, marginTop: 8 }}>€{nftRevenue.toFixed(2)}</Text>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>NFT Sales</Text>
                            </View>
                        </View>
                    </>
                )}

                {/* Transaction History */}
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, marginBottom: 16 }}>
                    Transaction History
                </Text>
                {loadingTxns ? (
                    <View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator size="small" color="#38b4ba" /></View>
                ) : transactions.length > 0 ? (
                    <View style={{
                        borderRadius: 16,
                        backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                        borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                        overflow: 'hidden',
                    }}>
                        {transactions.map((tx) => (
                            <TransactionRow
                                key={tx.id}
                                type={tx.type}
                                songTitle={tx.songTitle}
                                amount={tx.price}
                                date={tx.date ? new Date(tx.date).toLocaleDateString() : ''}
                                status={tx.status}
                            />
                        ))}
                    </View>
                ) : (
                    <View style={{ padding: 20 }}>
                        <Text style={{ color: colors.text.secondary }}>No transactions yet</Text>
                    </View>
                )}
            </ScrollView>
        </Container>
    );
}

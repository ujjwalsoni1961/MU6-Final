import React from 'react';
import { View, Text, ScrollView, FlatList, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DollarSign, Music, Gem, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react-native';
import TransactionRow from '../../src/components/shared/TransactionRow';
import { transactions } from '../../src/mock/transactions';
import { Transaction } from '../../src/types';

const isWeb = Platform.OS === 'web';

export default function EarningsScreen() {
    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? '#f8fafc' : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: isWeb ? 32 : 16, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
            >
                <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: '#0f172a', letterSpacing: -1 }}>
                    Earnings
                </Text>
                <Text style={{ fontSize: 14, color: '#64748b', marginTop: 4, marginBottom: 24 }}>
                    Your revenue breakdown and transaction history.
                </Text>

                {/* Total Earnings Card */}
                <View
                    style={{
                        padding: isWeb ? 28 : 20,
                        borderRadius: 16,
                        backgroundColor: isWeb ? '#fff' : 'rgba(255,255,255,0.4)',
                        borderWidth: 1.5,
                        borderColor: 'rgba(56,180,186,0.2)',
                        alignItems: 'center',
                        marginBottom: 20,
                        shadowColor: '#38b4ba',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.06,
                        shadowRadius: 16,
                        elevation: 4,
                    }}
                >
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(56,180,186,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                        <DollarSign size={24} color="#38b4ba" />
                    </View>
                    <Text style={{ fontSize: 40, fontWeight: '800', color: '#0f172a', letterSpacing: -1 }}>25.4 ETH</Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>Total Earnings</Text>
                    <Text style={{ fontSize: 13, color: '#38b4ba', fontWeight: '600', marginTop: 8 }}>↑ 12% from last month</Text>
                </View>

                {/* Breakdown Row */}
                <View style={{ flexDirection: 'row', marginBottom: 28 }}>
                    <View
                        style={{
                            flex: 1,
                            margin: 4,
                            padding: isWeb ? 20 : 16,
                            borderRadius: 14,
                            backgroundColor: isWeb ? '#fff' : 'rgba(255,255,255,0.4)',
                            borderWidth: 1,
                            borderColor: isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)',
                            alignItems: 'center',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.03,
                            shadowRadius: 8,
                        }}
                    >
                        <Music size={20} color="#38b4ba" />
                        <Text style={{ fontSize: 22, fontWeight: '800', color: '#0f172a', marginTop: 8 }}>5.2 ETH</Text>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>Streaming</Text>
                    </View>
                    <View
                        style={{
                            flex: 1,
                            margin: 4,
                            padding: isWeb ? 20 : 16,
                            borderRadius: 14,
                            backgroundColor: isWeb ? '#fff' : 'rgba(255,255,255,0.4)',
                            borderWidth: 1,
                            borderColor: isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)',
                            alignItems: 'center',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.03,
                            shadowRadius: 8,
                        }}
                    >
                        <Gem size={20} color="#8b5cf6" />
                        <Text style={{ fontSize: 22, fontWeight: '800', color: '#0f172a', marginTop: 8 }}>20.2 ETH</Text>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>NFT Sales</Text>
                    </View>
                </View>

                {/* Transaction History */}
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5, marginBottom: 16 }}>
                    Transaction History
                </Text>
                <View
                    style={{
                        borderRadius: 16,
                        backgroundColor: isWeb ? '#fff' : 'rgba(255,255,255,0.4)',
                        borderWidth: 1,
                        borderColor: isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)',
                        overflow: 'hidden',
                    }}
                >
                    {transactions.map((tx) => (
                        <TransactionRow
                            key={tx.id}
                            type={tx.type}
                            songTitle={tx.songTitle}
                            amount={tx.price}
                            date={tx.date}
                            status={tx.status}
                        />
                    ))}
                </View>
            </ScrollView>
        </Container>
    );
}

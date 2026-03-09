import React from 'react';
import { View, Text, FlatList, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TransactionRow from '../../src/components/shared/TransactionRow';
import { useAdminTransactions } from '../../src/hooks/useData';
import LoadingState from '../../src/components/shared/LoadingState';
import { useTheme } from '../../src/context/ThemeContext';
import { Transaction } from '../../src/types';

const isWeb = Platform.OS === 'web';

export default function AdminTransactionsScreen() {
    const { isDark, colors } = useTheme();
    const { data: transactions, loading, error, refresh } = useAdminTransactions();
    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
            <View style={{ padding: isWeb ? 32 : 16 }}>
                <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: colors.text.primary, letterSpacing: -1, marginBottom: 4 }}>
                    Transactions
                </Text>
                {!loading && (
                    <Text style={{ fontSize: 14, color: colors.text.secondary, marginBottom: 8 }}>
                        {transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'}
                    </Text>
                )}
            </View>
            <LoadingState loading={loading} error={error} onRetry={refresh}>
                <FlatList
                    data={transactions}
                    renderItem={({ item }: { item: Transaction }) => (
                        <TransactionRow
                            type={item.type}
                            songTitle={item.songTitle}
                            amount={item.price}
                            date={item.date ? new Date(item.date).toLocaleDateString() : ''}
                            status={item.status}
                        />
                    )}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ paddingHorizontal: isWeb ? 32 : 16, paddingBottom: 40 }}
                    showsVerticalScrollIndicator={false}
                />
            </LoadingState>
        </Container>
    );
}

import React from 'react';
import { View, Text, FlatList, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TransactionRow from '../../src/components/shared/TransactionRow';
import { transactions } from '../../src/mock/transactions';
import { Transaction } from '../../src/types';

const isWeb = Platform.OS === 'web';

export default function AdminTransactionsScreen() {
    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? '#f8fafc' : 'transparent' }}>
            <View style={{ padding: isWeb ? 32 : 16 }}>
                <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: '#0f172a', letterSpacing: -1, marginBottom: 16 }}>Transactions</Text>
            </View>
            <FlatList
                data={transactions}
                renderItem={({ item }: { item: Transaction }) => (
                    <TransactionRow type={item.type} songTitle={item.songTitle} amount={item.price} date={item.date} status={item.status} />
                )}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: isWeb ? 32 : 16 }}
                showsVerticalScrollIndicator={false}
            />
        </Container>
    );
}

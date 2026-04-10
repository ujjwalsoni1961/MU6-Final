import React from 'react';
import { View, Text, Platform } from 'react-native';
import { ArrowLeftRight, Flag } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { ActionButton, RowActions } from '../../src/components/admin/AdminActionComponents';
import { useAdminTransactions } from '../../src/hooks/useData';
import { useAdminTransactionActions } from '../../src/hooks/useAdminActions';

const isWeb = Platform.OS === 'web';

export default function AdminTransactionsScreen() {
    const { data: transactions, loading, error, refresh } = useAdminTransactions();
    const actions = useAdminTransactionActions(refresh);

    return (
        <AdminScreen
            title="Transactions"
            subtitle={!loading ? `${transactions.length} transactions` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminDataTable
                headers={['Song', 'Type', 'Price', 'Fee', 'Status', 'Date', 'Actions']}
                data={transactions}
                emptyMessage="No transactions found"
                renderRow={(tx) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <ArrowLeftRight size={16} color="#38b4ba" style={{ marginRight: 10 }} />
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{tx.songTitle || 'Unknown'}</Text>
                                </View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12, textTransform: 'capitalize' }}>{tx.type}</Text>
                                <Text style={{ flex: 1, color: '#38b4ba', fontSize: 12, fontWeight: '600' }}>
                                    {tx.price?.toFixed(4)} POL
                                </Text>
                                <Text style={{ flex: 1, color: '#facc15', fontSize: 12 }}>
                                    {tx.fee ? `${tx.fee.toFixed(4)} POL` : '—'}
                                </Text>
                                <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
                                    <StatusBadge status={tx.status} />
                                    {tx.isFlagged && <StatusBadge status="flagged" />}
                                </View>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                    {tx.date ? new Date(tx.date).toLocaleDateString() : '—'}
                                </Text>
                                <View style={{ flex: 1 }}>
                                    <RowActions>
                                        <ActionButton
                                            icon={<Flag size={12} color={tx.isFlagged ? '#fb923c' : '#64748b'} />}
                                            label={tx.isFlagged ? 'Unflag' : 'Flag'}
                                            color={tx.isFlagged ? '#fb923c' : '#64748b'}
                                            onPress={() => actions.toggleFlagged(tx.id, tx.isFlagged || false)}
                                        />
                                    </RowActions>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <ArrowLeftRight size={18} color="#38b4ba" style={{ marginRight: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{tx.songTitle || 'Unknown'}</Text>
                                        <Text style={{ color: '#38b4ba', fontSize: 12 }}>{tx.price?.toFixed(4)} POL | {tx.type}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 4 }}>
                                        <StatusBadge status={tx.status} />
                                        {tx.isFlagged && <StatusBadge status="flagged" />}
                                    </View>
                                </View>
                                <RowActions>
                                    <ActionButton
                                        icon={<Flag size={12} color={tx.isFlagged ? '#fb923c' : '#64748b'} />}
                                        label={tx.isFlagged ? 'Unflag' : 'Flag'}
                                        color={tx.isFlagged ? '#fb923c' : '#64748b'}
                                        onPress={() => actions.toggleFlagged(tx.id, tx.isFlagged || false)}
                                    />
                                </RowActions>
                            </>
                        )}
                    </View>
                )}
            />
        </AdminScreen>
    );
}

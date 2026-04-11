import React from 'react';
import { View, Text, Platform } from 'react-native';
import { ArrowLeftRight, Flag } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { ActionButton, RowActions } from '../../src/components/admin/AdminActionComponents';
import { useAdminTransactions } from '../../src/hooks/useData';
import { useAdminTransactionActions } from '../../src/hooks/useAdminActions';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

export default function AdminTransactionsScreen() {
    const { data: transactions, loading, error, refresh } = useAdminTransactions();
    const actions = useAdminTransactionActions(refresh);
    const { colors } = useTheme();

    const txColumns = [
        { label: 'Song', flex: 1.2 },
        { label: 'Type', flex: 0.7 },
        { label: 'Price', flex: 0.7 },
        { label: 'Fee', flex: 0.7 },
        { label: 'Status', flex: 1 },
        { label: 'Date', flex: 0.8 },
        { label: 'Actions', flex: 0.8 },
    ];

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
                columns={txColumns}
                data={transactions}
                emptyMessage="No transactions found"
                minTableWidth={850}
                renderRow={(tx) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center' }}>
                                    <ArrowLeftRight size={16} color={colors.accent.cyan} style={{ marginRight: 10 }} />
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{tx.songTitle || 'Unknown'}</Text>
                                </View>
                                <Text style={{ flex: 0.7, color: colors.text.secondary, fontSize: 12, textTransform: 'capitalize' }}>{tx.type}</Text>
                                <Text style={{ flex: 0.7, color: colors.accent.cyan, fontSize: 12, fontWeight: '600' }}>
                                    {tx.price?.toFixed(4)} POL
                                </Text>
                                <Text style={{ flex: 0.7, color: colors.status.warning, fontSize: 12 }}>
                                    {tx.fee ? `${tx.fee.toFixed(4)} POL` : '—'}
                                </Text>
                                <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
                                    <StatusBadge status={tx.status} />
                                    {tx.isFlagged && <StatusBadge status="flagged" />}
                                </View>
                                <Text style={{ flex: 0.8, color: colors.text.muted, fontSize: 12 }}>
                                    {tx.date ? new Date(tx.date).toLocaleDateString() : '—'}
                                </Text>
                                <View style={{ flex: 0.8 }}>
                                    <RowActions>
                                        <ActionButton
                                            icon={<Flag size={12} color={tx.isFlagged ? '#fb923c' : colors.text.secondary} />}
                                            label={tx.isFlagged ? 'Unflag' : 'Flag'}
                                            color={tx.isFlagged ? '#fb923c' : colors.text.secondary}
                                            onPress={() => actions.toggleFlagged(tx.id, tx.isFlagged || false)}
                                        />
                                    </RowActions>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <ArrowLeftRight size={18} color={colors.accent.cyan} style={{ marginRight: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }}>{tx.songTitle || 'Unknown'}</Text>
                                        <Text style={{ color: colors.accent.cyan, fontSize: 12 }}>{tx.price?.toFixed(4)} POL | {tx.type}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 4 }}>
                                        <StatusBadge status={tx.status} />
                                        {tx.isFlagged && <StatusBadge status="flagged" />}
                                    </View>
                                </View>
                                <RowActions>
                                    <ActionButton
                                        icon={<Flag size={12} color={tx.isFlagged ? '#fb923c' : colors.text.secondary} />}
                                        label={tx.isFlagged ? 'Unflag' : 'Flag'}
                                        color={tx.isFlagged ? '#fb923c' : colors.text.secondary}
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

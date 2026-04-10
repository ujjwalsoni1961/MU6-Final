import React from 'react';
import { View, Text, Platform } from 'react-native';
import { ShoppingBag, Flag } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { ToggleSwitch, ActionButton, RowActions } from '../../src/components/admin/AdminActionComponents';
import { useAdminMarketplaceListings } from '../../src/hooks/useAdminData';
import { useAdminMarketplaceActions } from '../../src/hooks/useAdminActions';

const isWeb = Platform.OS === 'web';

export default function AdminMarketplaceScreen() {
    const { data: listings, loading, error, refresh } = useAdminMarketplaceListings();
    const actions = useAdminMarketplaceActions(refresh);

    return (
        <AdminScreen
            title="Marketplace Listings"
            subtitle={!loading ? `${listings.length} listings` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminDataTable
                headers={['Song', 'Seller', 'Price', 'Status', 'Listed', 'Actions']}
                data={listings}
                emptyMessage="No marketplace listings found"
                renderRow={(l) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <ShoppingBag size={16} color={l.isFlagged ? '#fb923c' : '#f87171'} style={{ marginRight: 10 }} />
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{l.songTitle}</Text>
                                </View>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 11, fontFamily: 'monospace' }}>
                                    {l.sellerWallet ? `${l.sellerWallet.slice(0, 6)}...${l.sellerWallet.slice(-4)}` : '—'}
                                </Text>
                                <Text style={{ flex: 1, color: '#38b4ba', fontSize: 12, fontWeight: '600' }}>
                                    {l.priceEth?.toFixed(4)} ETH
                                </Text>
                                <View style={{ flex: 1, flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                                    <StatusBadge status={l.soldAt ? 'completed' : (l.isActive ? 'active' : 'delisted')} />
                                    {l.isFlagged && <StatusBadge status="flagged" />}
                                </View>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                    {l.listedAt ? new Date(l.listedAt).toLocaleDateString() : '—'}
                                </Text>
                                <View style={{ flex: 1 }}>
                                    <RowActions>
                                        {!l.soldAt && (
                                            <ToggleSwitch
                                                value={l.isActive}
                                                onToggle={() => actions.toggleActive(l.id, l.isActive)}
                                                label="Active"
                                                activeColor="#4ade80"
                                            />
                                        )}
                                        <ActionButton
                                            icon={<Flag size={12} color={l.isFlagged ? '#fb923c' : '#64748b'} />}
                                            label={l.isFlagged ? 'Unflag' : 'Flag'}
                                            color={l.isFlagged ? '#fb923c' : '#64748b'}
                                            onPress={() => actions.toggleFlagged(l.id, l.isFlagged)}
                                        />
                                    </RowActions>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <ShoppingBag size={18} color={l.isFlagged ? '#fb923c' : '#f87171'} style={{ marginRight: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{l.songTitle}</Text>
                                        <Text style={{ color: '#38b4ba', fontSize: 12, fontWeight: '600' }}>{l.priceEth?.toFixed(4)} ETH</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 4 }}>
                                        <StatusBadge status={l.soldAt ? 'completed' : (l.isActive ? 'active' : 'delisted')} />
                                        {l.isFlagged && <StatusBadge status="flagged" />}
                                    </View>
                                </View>
                                <RowActions>
                                    {!l.soldAt && (
                                        <ToggleSwitch
                                            value={l.isActive}
                                            onToggle={() => actions.toggleActive(l.id, l.isActive)}
                                            label="Active"
                                        />
                                    )}
                                    <ActionButton
                                        icon={<Flag size={12} color={l.isFlagged ? '#fb923c' : '#64748b'} />}
                                        label={l.isFlagged ? 'Unflag' : 'Flag'}
                                        color={l.isFlagged ? '#fb923c' : '#64748b'}
                                        onPress={() => actions.toggleFlagged(l.id, l.isFlagged)}
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

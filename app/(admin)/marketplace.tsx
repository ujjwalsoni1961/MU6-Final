import React from 'react';
import { View, Text, Platform } from 'react-native';
import { ShoppingBag } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminMarketplaceListings } from '../../src/hooks/useAdminData';

const isWeb = Platform.OS === 'web';

export default function AdminMarketplaceScreen() {
    const { data: listings, loading, error, refresh } = useAdminMarketplaceListings();

    return (
        <AdminScreen
            title="Marketplace Listings"
            subtitle={!loading ? `${listings.length} listings` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminDataTable
                headers={['Song', 'Seller', 'Buyer', 'Price', 'Status', 'Listed', 'Sold']}
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
                                    <ShoppingBag size={16} color="#f87171" style={{ marginRight: 10 }} />
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{l.songTitle}</Text>
                                </View>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 11, fontFamily: 'monospace' }}>
                                    {l.sellerWallet ? `${l.sellerWallet.slice(0, 6)}...${l.sellerWallet.slice(-4)}` : '—'}
                                </Text>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 11, fontFamily: 'monospace' }}>
                                    {l.buyerWallet ? `${l.buyerWallet.slice(0, 6)}...${l.buyerWallet.slice(-4)}` : '—'}
                                </Text>
                                <Text style={{ flex: 1, color: '#38b4ba', fontSize: 12, fontWeight: '600' }}>
                                    {l.priceEth?.toFixed(4)} ETH
                                </Text>
                                <View style={{ flex: 1 }}>
                                    <StatusBadge status={l.soldAt ? 'completed' : (l.isActive ? 'active' : 'pending')} />
                                </View>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                    {l.listedAt ? new Date(l.listedAt).toLocaleDateString() : '—'}
                                </Text>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                    {l.soldAt ? new Date(l.soldAt).toLocaleDateString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <ShoppingBag size={18} color="#f87171" style={{ marginRight: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{l.songTitle}</Text>
                                        <Text style={{ color: '#38b4ba', fontSize: 12, fontWeight: '600' }}>{l.priceEth?.toFixed(4)} ETH</Text>
                                    </View>
                                    <StatusBadge status={l.soldAt ? 'completed' : (l.isActive ? 'active' : 'pending')} />
                                </View>
                            </>
                        )}
                    </View>
                )}
            />
        </AdminScreen>
    );
}

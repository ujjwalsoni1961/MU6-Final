import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Disc3 } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminNFTReleases } from '../../src/hooks/useAdminData';

const isWeb = Platform.OS === 'web';

export default function AdminNFTReleasesScreen() {
    const { data: releases, loading, error, refresh } = useAdminNFTReleases();

    return (
        <AdminScreen
            title="NFT Releases"
            subtitle={!loading ? `${releases.length} releases` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminDataTable
                headers={['Song', 'Artist', 'Tier', 'Rarity', 'Supply', 'Minted', 'Price', 'Status', 'Date']}
                data={releases}
                emptyMessage="No NFT releases found"
                renderRow={(r) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <Disc3 size={16} color="#f59e0b" style={{ marginRight: 10 }} />
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{r.songTitle}</Text>
                                </View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{r.artistName}</Text>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{r.tierName}</Text>
                                <View style={{ flex: 1 }}><StatusBadge status={r.rarity} /></View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{r.totalSupply}</Text>
                                <Text style={{ flex: 1, color: '#38b4ba', fontSize: 12, fontWeight: '600' }}>{r.mintedCount}</Text>
                                <Text style={{ flex: 1, color: '#facc15', fontSize: 12, fontWeight: '600' }}>
                                    {r.priceEth ? `${r.priceEth} ETH` : 'Free'}
                                </Text>
                                <View style={{ flex: 1 }}><StatusBadge status={r.isActive ? 'active' : 'pending'} /></View>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <Disc3 size={18} color="#f59e0b" style={{ marginRight: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{r.songTitle}</Text>
                                        <Text style={{ color: '#64748b', fontSize: 12 }}>{r.artistName} | {r.tierName}</Text>
                                    </View>
                                    <StatusBadge status={r.rarity} />
                                </View>
                                <View style={{ flexDirection: 'row', gap: 12 }}>
                                    <Text style={{ color: '#38b4ba', fontSize: 12 }}>{r.mintedCount}/{r.totalSupply} minted</Text>
                                    <Text style={{ color: '#facc15', fontSize: 12 }}>{r.priceEth ? `${r.priceEth} ETH` : 'Free'}</Text>
                                </View>
                            </>
                        )}
                    </View>
                )}
            />
        </AdminScreen>
    );
}

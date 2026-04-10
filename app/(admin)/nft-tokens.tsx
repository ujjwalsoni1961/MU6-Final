import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Tag } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminNFTTokens } from '../../src/hooks/useAdminData';

const isWeb = Platform.OS === 'web';

export default function AdminNFTTokensScreen() {
    const { data: tokens, loading, error, refresh } = useAdminNFTTokens();

    return (
        <AdminScreen
            title="NFT Tokens"
            subtitle={!loading ? `${tokens.length} minted tokens` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminDataTable
                headers={['Song', 'Tier', 'Rarity', 'Token ID', 'Owner', 'Price Paid', 'Minted']}
                data={tokens}
                emptyMessage="No NFT tokens found"
                renderRow={(t) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <Tag size={16} color="#4ade80" style={{ marginRight: 10 }} />
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{t.songTitle}</Text>
                                </View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{t.tierName}</Text>
                                <View style={{ flex: 1 }}><StatusBadge status={t.rarity} /></View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12, fontFamily: 'monospace' }}>#{t.onChainTokenId || '—'}</Text>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 11, fontFamily: 'monospace' }}>
                                    {t.ownerWallet ? `${t.ownerWallet.slice(0, 6)}...${t.ownerWallet.slice(-4)}` : '—'}
                                </Text>
                                <Text style={{ flex: 1, color: '#facc15', fontSize: 12, fontWeight: '600' }}>
                                    {t.pricePaidEth ? `${t.pricePaidEth} ETH` : '—'}
                                </Text>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                    {t.mintedAt ? new Date(t.mintedAt).toLocaleDateString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <Tag size={18} color="#4ade80" style={{ marginRight: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{t.songTitle}</Text>
                                        <Text style={{ color: '#64748b', fontSize: 12 }}>{t.tierName} | #{t.onChainTokenId}</Text>
                                    </View>
                                    <StatusBadge status={t.rarity} />
                                </View>
                                <Text style={{ color: '#475569', fontSize: 11 }}>
                                    Owner: {t.ownerWallet ? `${t.ownerWallet.slice(0, 8)}...` : '—'} | {t.pricePaidEth ? `${t.pricePaidEth} ETH` : 'Free'}
                                </Text>
                            </>
                        )}
                    </View>
                )}
            />
        </AdminScreen>
    );
}

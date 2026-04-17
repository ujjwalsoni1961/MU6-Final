import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Disc3 } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { ToggleSwitch, RowActions } from '../../src/components/admin/AdminActionComponents';
import { useAdminNFTReleases } from '../../src/hooks/useAdminData';
import { useAdminNFTReleaseActions } from '../../src/hooks/useAdminActions';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

export default function AdminNFTReleasesScreen() {
    const { data: releases, loading, error, refresh } = useAdminNFTReleases();
    const actions = useAdminNFTReleaseActions(refresh);
    const { colors } = useTheme();

    const nftColumns = [
        { label: 'Song', flex: 1.2 },
        { label: 'Artist', flex: 1 },
        { label: 'Tier', flex: 0.7 },
        { label: 'Rarity', flex: 0.7 },
        { label: 'Minted', flex: 0.7 },
        { label: 'Price', flex: 0.7 },
        { label: 'Status', flex: 0.7 },
        { label: 'Actions', flex: 0.8 },
    ];

    return (
        <AdminScreen
            title="NFT Drops (Primary Mint)"
            subtitle={!loading ? `${releases.length} drops configured` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminDataTable
                headers={['Song', 'Artist', 'Tier', 'Rarity', 'Minted', 'Price', 'Status', 'Actions']}
                columns={nftColumns}
                data={releases}
                emptyMessage="No NFT drops configured yet"
                minTableWidth={900}
                renderRow={(r) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center' }}>
                                    <Disc3 size={16} color="#f59e0b" style={{ marginRight: 10 }} />
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{r.songTitle}</Text>
                                </View>
                                <Text style={{ flex: 1, color: colors.text.secondary, fontSize: 12 }} numberOfLines={1}>{r.artistName}</Text>
                                <Text style={{ flex: 0.7, color: colors.text.secondary, fontSize: 12 }}>{r.tierName}</Text>
                                <View style={{ flex: 0.7 }}><StatusBadge status={r.rarity} /></View>
                                <Text style={{ flex: 0.7, color: colors.accent.cyan, fontSize: 12, fontWeight: '600' }}>
                                    {r.mintedCount}/{r.totalSupply}
                                </Text>
                                <Text style={{ flex: 0.7, color: colors.status.warning, fontSize: 12, fontWeight: '600' }}>
                                    {r.priceEth ? `${r.priceEth} POL` : 'Free'}
                                </Text>
                                <View style={{ flex: 0.7 }}>
                                    <StatusBadge status={r.isActive ? 'active' : 'delisted'} />
                                </View>
                                <View style={{ flex: 0.8 }}>
                                    <RowActions>
                                        <ToggleSwitch
                                            value={r.isActive}
                                            onToggle={() => actions.toggleActive(r.id, r.isActive)}
                                            label="Active"
                                            activeColor={colors.status.success}
                                        />
                                    </RowActions>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <Disc3 size={18} color="#f59e0b" style={{ marginRight: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }}>{r.songTitle}</Text>
                                        <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{r.artistName} | {r.tierName}</Text>
                                    </View>
                                    <StatusBadge status={r.rarity} />
                                </View>
                                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                                    <Text style={{ color: colors.accent.cyan, fontSize: 12 }}>{r.mintedCount}/{r.totalSupply} minted</Text>
                                    <Text style={{ color: colors.status.warning, fontSize: 12 }}>{r.priceEth ? `${r.priceEth} POL` : 'Free'}</Text>
                                    <StatusBadge status={r.isActive ? 'active' : 'delisted'} />
                                </View>
                                <RowActions>
                                    <ToggleSwitch
                                        value={r.isActive}
                                        onToggle={() => actions.toggleActive(r.id, r.isActive)}
                                        label="Active"
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

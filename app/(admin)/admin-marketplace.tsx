import React from 'react';
import { View, Text, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ShoppingBag, Flag, Disc3, Tag } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { ToggleSwitch, ActionButton, RowActions } from '../../src/components/admin/AdminActionComponents';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { useAdminMarketplaceListings, useAdminNFTReleases } from '../../src/hooks/useAdminData';
import { useAdminMarketplaceActions } from '../../src/hooks/useAdminActions';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

export default function AdminMarketplaceScreen() {
    const { data: listings, loading, error, refresh } = useAdminMarketplaceListings();
    const { data: releases, loading: releasesLoading } = useAdminNFTReleases();
    const actions = useAdminMarketplaceActions(refresh);
    const { colors } = useTheme();
    const router = useRouter();

    const dropsCount = releases.length;
    const resaleCount = listings.length;

    const marketColumns = [
        { label: 'Song', flex: 1.2 },
        { label: 'Seller', flex: 1 },
        { label: 'Price', flex: 0.7 },
        { label: 'Status', flex: 1 },
        { label: 'Listed', flex: 0.8 },
        { label: 'Actions', flex: 1.2 },
    ];

    return (
        <AdminScreen
            title="Marketplace (Secondary Resale)"
            subtitle={!loading && !releasesLoading
                ? `${resaleCount} resale · ${dropsCount} primary drops`
                : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            {/* Stats pills: make drops vs resale split obvious so admins don't read 0 as "empty marketplace" */}
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 16, flexWrap: 'wrap' }}>
                <AnimatedPressable
                    preset="row"
                    onPress={() => router.push('/(admin)/nft-releases' as any)}
                    style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        backgroundColor: 'rgba(139,92,246,0.12)',
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                        borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)',
                    }}
                >
                    <Disc3 size={14} color="#8b5cf6" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#8b5cf6' }}>
                        {dropsCount} Primary Drops →
                    </Text>
                </AnimatedPressable>
                <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: 'rgba(245,158,11,0.12)',
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
                }}>
                    <Tag size={14} color="#f59e0b" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#f59e0b' }}>
                        {resaleCount} Resale Listings
                    </Text>
                </View>
            </View>
            <Text style={{
                paddingHorizontal: 16, paddingBottom: 12,
                color: colors.text.muted, fontSize: 12, lineHeight: 18,
            }}>
                This screen shows <Text style={{ fontWeight: '700', color: colors.text.secondary }}>secondary-market resale listings only</Text> (users relisting NFTs they already own).
                Primary drops configured by artists appear under <Text style={{ fontWeight: '700', color: colors.text.secondary }}>NFT Drops</Text>.
            </Text>
            <AdminDataTable
                headers={['Song', 'Seller', 'Price', 'Status', 'Listed', 'Actions']}
                columns={marketColumns}
                data={listings}
                emptyMessage={dropsCount > 0
                    ? `No resale listings yet. ${dropsCount} primary drops are live under NFT Drops.`
                    : 'No marketplace listings found'}
                renderRow={(l) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center' }}>
                                    <ShoppingBag size={16} color={l.isFlagged ? '#fb923c' : colors.status.error} style={{ marginRight: 10 }} />
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{l.songTitle}</Text>
                                </View>
                                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 11, fontFamily: 'monospace' }}>
                                    {l.sellerWallet ? `${l.sellerWallet.slice(0, 6)}...${l.sellerWallet.slice(-4)}` : '—'}
                                </Text>
                                <Text style={{ flex: 0.7, color: colors.accent.cyan, fontSize: 12, fontWeight: '600' }}>
                                    {l.priceEth?.toFixed(4)} POL
                                </Text>
                                <View style={{ flex: 1, flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                                    <StatusBadge status={l.soldAt ? 'completed' : (l.isActive ? 'active' : 'delisted')} />
                                    {l.isFlagged && <StatusBadge status="flagged" />}
                                </View>
                                <Text style={{ flex: 0.8, color: colors.text.muted, fontSize: 12 }}>
                                    {l.listedAt ? new Date(l.listedAt).toLocaleDateString() : '—'}
                                </Text>
                                <View style={{ flex: 1.2 }}>
                                    <RowActions>
                                        {!l.soldAt && (
                                            <ToggleSwitch
                                                value={l.isActive}
                                                onToggle={() => actions.toggleActive(l.id, l.isActive)}
                                                label="Active"
                                                activeColor={colors.status.success}
                                            />
                                        )}
                                        <ActionButton
                                            icon={<Flag size={12} color={l.isFlagged ? '#fb923c' : colors.text.secondary} />}
                                            label={l.isFlagged ? 'Unflag' : 'Flag'}
                                            color={l.isFlagged ? '#fb923c' : colors.text.secondary}
                                            onPress={() => actions.toggleFlagged(l.id, l.isFlagged)}
                                        />
                                    </RowActions>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <ShoppingBag size={18} color={l.isFlagged ? '#fb923c' : colors.status.error} style={{ marginRight: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }}>{l.songTitle}</Text>
                                        <Text style={{ color: colors.accent.cyan, fontSize: 12, fontWeight: '600' }}>{l.priceEth?.toFixed(4)} POL</Text>
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
                                        icon={<Flag size={12} color={l.isFlagged ? '#fb923c' : colors.text.secondary} />}
                                        label={l.isFlagged ? 'Unflag' : 'Flag'}
                                        color={l.isFlagged ? '#fb923c' : colors.text.secondary}
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

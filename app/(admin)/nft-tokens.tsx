import React, { useState } from 'react';
import { View, Text, Platform, Pressable, ActivityIndicator } from 'react-native';
import { Tag, Ban, RefreshCw } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { ActionButton, ConfirmModal, RowActions } from '../../src/components/admin/AdminActionComponents';
import { useAdminNFTTokensOnChain } from '../../src/hooks/useAdminData';
import { useAdminNFTTokenActions } from '../../src/hooks/useAdminActions';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

export default function AdminNFTTokensScreen() {
    // Chain-first view: one row per live on-chain copy, DB used only for
    // enrichment (song/tier/rarity) and admin-action UUID. See
    // `useAdminNFTTokensOnChain` for the full rationale.
    const { data: tokens, loading, error, refresh } = useAdminNFTTokensOnChain();
    const actions = useAdminNFTTokenActions(refresh);
    const [voidTarget, setVoidTarget] = useState<{ id: string; tokenId: string } | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [reconciling, setReconciling] = useState(false);
    const { colors } = useTheme();

    const handleReconcile = async () => {
        setReconciling(true);
        await actions.reconcileOnChain();
        setReconciling(false);
    };

    const handleVoid = async () => {
        if (!voidTarget) return;
        setActionLoading(true);
        await actions.voidToken(voidTarget.id);
        setActionLoading(false);
        setVoidTarget(null);
    };

    const tokenColumns = [
        { label: 'Song', flex: 1.2 },
        { label: 'Tier', flex: 0.7 },
        { label: 'Rarity', flex: 0.7 },
        { label: 'Chain ID', flex: 0.7 },
        { label: 'Owner', flex: 1 },
        { label: 'Sync', flex: 0.6 },
        { label: 'Status', flex: 0.7 },
        { label: 'Actions', flex: 0.7 },
    ];

    return (
        <AdminScreen
            title="NFT Tokens"
            subtitle={!loading ? `${tokens.length} minted tokens` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 }}>
                <Pressable
                    onPress={handleReconcile}
                    disabled={reconciling}
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: 'rgba(56,180,186,0.15)',
                        borderWidth: 1,
                        borderColor: '#38b4ba',
                        borderRadius: 8,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        gap: 8,
                        opacity: reconciling ? 0.6 : 1,
                    }}
                >
                    {reconciling
                        ? <ActivityIndicator size="small" color="#38b4ba" />
                        : <RefreshCw size={14} color="#38b4ba" />}
                    <Text style={{ color: '#38b4ba', fontWeight: '600', fontSize: 13 }}>
                        {reconciling ? 'Reconciling…' : 'Sync with chain'}
                    </Text>
                </Pressable>
            </View>
            <AdminDataTable
                headers={['Song', 'Tier', 'Rarity', 'Chain ID', 'Owner', 'Sync', 'Status', 'Actions']}
                columns={tokenColumns}
                data={tokens}
                emptyMessage="No NFT tokens found"
                minTableWidth={950}
                renderRow={(t) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                        opacity: t.isVoided ? 0.5 : 1,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center' }}>
                                    <Tag size={16} color={t.isVoided ? colors.status.error : colors.status.success} style={{ marginRight: 10 }} />
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{t.songTitle}</Text>
                                </View>
                                <Text style={{ flex: 0.7, color: colors.text.secondary, fontSize: 12 }}>{t.tierName}</Text>
                                <View style={{ flex: 0.7 }}><StatusBadge status={t.rarity} /></View>
                                <Text style={{ flex: 0.7, color: colors.text.secondary, fontSize: 12, fontFamily: 'monospace' }}>#{t.onChainTokenId || '—'}</Text>
                                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 11, fontFamily: 'monospace' }}>
                                    {t.ownerWallet ? `${t.ownerWallet.slice(0, 6)}...${t.ownerWallet.slice(-4)}` : '—'}
                                </Text>
                                <View style={{ flex: 0.6 }}>
                                    <StatusBadge status={t.onChainVerifiable ? 'verified' : 'unverified'} />
                                </View>
                                <View style={{ flex: 0.7 }}>
                                    <StatusBadge status={t.isVoided ? 'voided' : 'active'} />
                                </View>
                                <View style={{ flex: 0.7 }}>
                                    <RowActions>
                                        {/* Void is a DB-ledger-only action. The chain-first
                                            view emits rows that may not have a DB row (e.g.
                                            multi-copy wallets, legacy transfers). Only show
                                            Void when we have a real nft_tokens UUID to void. */}
                                        {!t.isVoided && t.hasDbRow && (
                                            <ActionButton
                                                icon={<Ban size={12} color={colors.status.error} />}
                                                label="Void"
                                                color={colors.status.error}
                                                onPress={() => setVoidTarget({ id: t.id, tokenId: t.onChainTokenId })}
                                            />
                                        )}
                                    </RowActions>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <Tag size={18} color={t.isVoided ? colors.status.error : colors.status.success} style={{ marginRight: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }}>{t.songTitle}</Text>
                                        <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                                            {t.tierName} | #{t.onChainTokenId || '—'} {t.onChainVerifiable ? '✓' : '⚠'}
                                        </Text>
                                    </View>
                                    <StatusBadge status={t.isVoided ? 'voided' : t.rarity} />
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={{ color: colors.text.muted, fontSize: 11 }}>
                                        Owner: {t.ownerWallet ? `${t.ownerWallet.slice(0, 8)}...` : '—'}
                                    </Text>
                                    {!t.isVoided && t.hasDbRow && (
                                        <ActionButton
                                            icon={<Ban size={12} color={colors.status.error} />}
                                            label="Void"
                                            color={colors.status.error}
                                            onPress={() => setVoidTarget({ id: t.id, tokenId: t.onChainTokenId })}
                                        />
                                    )}
                                </View>
                            </>
                        )}
                    </View>
                )}
            />

            <ConfirmModal
                visible={!!voidTarget}
                title="Void NFT Token"
                message={`Are you sure you want to void token #${voidTarget?.tokenId}? This will mark the token as invalid. This action cannot be undone.`}
                confirmLabel="Void Token"
                confirmColor="#ef4444"
                onConfirm={handleVoid}
                onCancel={() => setVoidTarget(null)}
                loading={actionLoading}
            />
        </AdminScreen>
    );
}

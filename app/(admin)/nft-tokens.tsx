import React, { useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { Tag, Ban } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { ActionButton, ConfirmModal, RowActions } from '../../src/components/admin/AdminActionComponents';
import { useAdminNFTTokens } from '../../src/hooks/useAdminData';
import { useAdminNFTTokenActions } from '../../src/hooks/useAdminActions';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

export default function AdminNFTTokensScreen() {
    const { data: tokens, loading, error, refresh } = useAdminNFTTokens();
    const actions = useAdminNFTTokenActions(refresh);
    const [voidTarget, setVoidTarget] = useState<{ id: string; tokenId: string } | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const { colors } = useTheme();

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
        { label: 'Token ID', flex: 0.8 },
        { label: 'Owner', flex: 1 },
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
            <AdminDataTable
                headers={['Song', 'Tier', 'Rarity', 'Token ID', 'Owner', 'Status', 'Actions']}
                columns={tokenColumns}
                data={tokens}
                emptyMessage="No NFT tokens found"
                minTableWidth={850}
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
                                <Text style={{ flex: 0.8, color: colors.text.secondary, fontSize: 12, fontFamily: 'monospace' }}>#{t.onChainTokenId || '—'}</Text>
                                <Text style={{ flex: 1, color: colors.text.muted, fontSize: 11, fontFamily: 'monospace' }}>
                                    {t.ownerWallet ? `${t.ownerWallet.slice(0, 6)}...${t.ownerWallet.slice(-4)}` : '—'}
                                </Text>
                                <View style={{ flex: 0.7 }}>
                                    <StatusBadge status={t.isVoided ? 'voided' : 'active'} />
                                </View>
                                <View style={{ flex: 0.7 }}>
                                    <RowActions>
                                        {!t.isVoided && (
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
                                        <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{t.tierName} | #{t.onChainTokenId}</Text>
                                    </View>
                                    <StatusBadge status={t.isVoided ? 'voided' : t.rarity} />
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={{ color: colors.text.muted, fontSize: 11 }}>
                                        Owner: {t.ownerWallet ? `${t.ownerWallet.slice(0, 8)}...` : '—'}
                                    </Text>
                                    {!t.isVoided && (
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

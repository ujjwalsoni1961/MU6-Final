import React, { useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { Tag, Ban } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { ActionButton, ConfirmModal, RowActions } from '../../src/components/admin/AdminActionComponents';
import { useAdminNFTTokens } from '../../src/hooks/useAdminData';
import { useAdminNFTTokenActions } from '../../src/hooks/useAdminActions';

const isWeb = Platform.OS === 'web';

export default function AdminNFTTokensScreen() {
    const { data: tokens, loading, error, refresh } = useAdminNFTTokens();
    const actions = useAdminNFTTokenActions(refresh);
    const [voidTarget, setVoidTarget] = useState<{ id: string; tokenId: string } | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const handleVoid = async () => {
        if (!voidTarget) return;
        setActionLoading(true);
        await actions.voidToken(voidTarget.id);
        setActionLoading(false);
        setVoidTarget(null);
    };

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
                data={tokens}
                emptyMessage="No NFT tokens found"
                renderRow={(t) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                        opacity: t.isVoided ? 0.5 : 1,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <Tag size={16} color={t.isVoided ? '#f87171' : '#4ade80'} style={{ marginRight: 10 }} />
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{t.songTitle}</Text>
                                </View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{t.tierName}</Text>
                                <View style={{ flex: 1 }}><StatusBadge status={t.rarity} /></View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12, fontFamily: 'monospace' }}>#{t.onChainTokenId || '—'}</Text>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 11, fontFamily: 'monospace' }}>
                                    {t.ownerWallet ? `${t.ownerWallet.slice(0, 6)}...${t.ownerWallet.slice(-4)}` : '—'}
                                </Text>
                                <View style={{ flex: 1 }}>
                                    <StatusBadge status={t.isVoided ? 'voided' : 'active'} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <RowActions>
                                        {!t.isVoided && (
                                            <ActionButton
                                                icon={<Ban size={12} color="#f87171" />}
                                                label="Void"
                                                color="#f87171"
                                                onPress={() => setVoidTarget({ id: t.id, tokenId: t.onChainTokenId })}
                                            />
                                        )}
                                    </RowActions>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <Tag size={18} color={t.isVoided ? '#f87171' : '#4ade80'} style={{ marginRight: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{t.songTitle}</Text>
                                        <Text style={{ color: '#64748b', fontSize: 12 }}>{t.tierName} | #{t.onChainTokenId}</Text>
                                    </View>
                                    <StatusBadge status={t.isVoided ? 'voided' : t.rarity} />
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={{ color: '#475569', fontSize: 11 }}>
                                        Owner: {t.ownerWallet ? `${t.ownerWallet.slice(0, 8)}...` : '—'}
                                    </Text>
                                    {!t.isVoided && (
                                        <ActionButton
                                            icon={<Ban size={12} color="#f87171" />}
                                            label="Void"
                                            color="#f87171"
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

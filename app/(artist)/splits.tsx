import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, Platform, ActivityIndicator, Linking,
} from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Users, ExternalLink, ChevronRight, Percent, Wallet, AlertCircle,
    CheckCircle, Music, Upload,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { useCreatorSongs } from '../../src/hooks/useData';
import { getSongSplitSheet } from '../../src/services/splitContracts';
import { supabase } from '../../src/lib/supabase';
import { EXPLORER_BASE as POLYGONSCAN_BASE } from '../../src/config/network';

const isWeb = Platform.OS === 'web';

function coverUrl(path: string | null | undefined): string {
    if (!path) return 'https://placehold.co/400x400/1e293b/94a3b8?text=♪';
    if (path.startsWith('http')) return path;
    const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    return `${SUPABASE_URL}/storage/v1/object/public/covers/${path}`;
}

interface SongSplitData {
    songId: string;
    songTitle: string;
    coverPath: string | null;
    splitContractAddress: string | null;
    splits: Array<{
        id: string;
        party_name: string;
        party_email: string;
        share_percent: number;
        linked_wallet_address: string | null;
    }>;
    allHaveWallets: boolean;
}

/* ─── Split Member Row ─── */
function SplitMemberRow({ member }: {
    member: { party_name: string; share_percent: number; linked_wallet_address: string | null };
}) {
    const { isDark, colors } = useTheme();
    const hasWallet = !!member.linked_wallet_address;
    const truncWallet = member.linked_wallet_address
        ? `${member.linked_wallet_address.slice(0, 6)}...${member.linked_wallet_address.slice(-4)}`
        : null;

    return (
        <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingVertical: 10, paddingHorizontal: 12,
            borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
        }}>
            <View style={{
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: hasWallet ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                alignItems: 'center', justifyContent: 'center', marginRight: 10,
            }}>
                {hasWallet
                    ? <CheckCircle size={13} color="#22c55e" />
                    : <AlertCircle size={13} color="#f59e0b" />
                }
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary }}>{member.party_name}</Text>
                {truncWallet && (
                    <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 1, fontFamily: isWeb ? 'monospace' : undefined }}>
                        {truncWallet}
                    </Text>
                )}
            </View>
            <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: isDark ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.06)',
                paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
            }}>
                <Percent size={10} color="#8b5cf6" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#8b5cf6' }}>{member.share_percent}%</Text>
            </View>
        </View>
    );
}

/* ─── Song Split Card ─── */
function SongSplitCard({ data, onEdit }: {
    data: SongSplitData;
    onEdit: (songId: string, songTitle: string) => void;
}) {
    const { isDark, colors } = useTheme();
    const isDeployed = !!data.splitContractAddress;

    return (
        <View style={{
            borderRadius: 16, overflow: 'hidden', marginBottom: 16,
            backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
            borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
        }}>
            {/* Song Header */}
            <View style={{
                flexDirection: 'row', alignItems: 'center', padding: isWeb ? 16 : 12,
                borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
            }}>
                <Image
                    source={{ uri: coverUrl(data.coverPath) }}
                    style={{ width: 48, height: 48, borderRadius: 12 }}
                    contentFit="cover"
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary }} numberOfLines={1}>{data.songTitle}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <Text style={{ fontSize: 11, color: colors.text.muted }}>
                            {data.splits.length} collaborator{data.splits.length !== 1 ? 's' : ''}
                        </Text>
                        {isDeployed && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <CheckCircle size={9} color="#22c55e" />
                                <Text style={{ fontSize: 9, fontWeight: '700', color: '#22c55e', textTransform: 'uppercase' }}>Deployed</Text>
                            </View>
                        )}
                    </View>
                </View>
                <AnimatedPressable
                    preset="icon"
                    onPress={() => onEdit(data.songId, data.songTitle)}
                    style={{
                        width: 32, height: 32, borderRadius: 16,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f8fafc',
                        alignItems: 'center' as const, justifyContent: 'center' as const,
                    }}
                >
                    <ChevronRight size={16} color={colors.text.muted} />
                </AnimatedPressable>
            </View>

            {/* Split Members */}
            {data.splits.length > 0 ? (
                data.splits.map((split) => (
                    <SplitMemberRow key={split.id} member={split} />
                ))
            ) : (
                <View style={{ padding: 16, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: colors.text.muted }}>No split sheet configured</Text>
                </View>
            )}

            {/* Deployed split contract reference (historical only — new deployments disabled
                since NFT sales now go directly to the creator wallet per PDF Fix #10). */}
            {isDeployed && (
                <View style={{ padding: 12 }}>
                    <AnimatedPressable
                        preset="row"
                        onPress={() => Linking.openURL(`${POLYGONSCAN_BASE}/address/${data.splitContractAddress}`)}
                        style={{
                            flexDirection: 'row', alignItems: 'center', gap: 8,
                            padding: 10, borderRadius: 10,
                            backgroundColor: isDark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.04)',
                            borderWidth: 1, borderColor: isDark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)',
                        }}
                    >
                        <Wallet size={14} color="#22c55e" />
                        <Text style={{ flex: 1, fontSize: 11, color: '#22c55e', fontWeight: '600', fontFamily: isWeb ? 'monospace' : undefined }}>
                            {data.splitContractAddress!.slice(0, 10)}...{data.splitContractAddress!.slice(-8)}
                        </Text>
                        <ExternalLink size={12} color="#22c55e" />
                    </AnimatedPressable>
                </View>
            )}
        </View>
    );
}

/* ─── Main Screen ─── */
export default function SplitsScreen() {
    const { isDark, colors } = useTheme();
    const router = useRouter();
    const { profile } = useAuth();
    const { data: songs, loading: songsLoading, refresh: refreshSongs } = useCreatorSongs();

    const [songSplits, setSongSplits] = useState<SongSplitData[]>([]);
    const [splitsLoading, setSplitsLoading] = useState(false);

    const Container = isWeb ? View : SafeAreaView;

    // Load split data for all songs
    const loadSplits = useCallback(async () => {
        if (!songs || songs.length === 0) return;
        setSplitsLoading(true);
        try {
            const results: SongSplitData[] = [];
            for (const song of songs) {
                // Get split sheet
                const { splits, allHaveWallets } = await getSongSplitSheet(song.id);
                // Get split contract address from DB
                const { data: songRow } = await supabase
                    .from('songs')
                    .select('split_contract_address')
                    .eq('id', song.id)
                    .maybeSingle();

                results.push({
                    songId: song.id,
                    songTitle: song.title,
                    coverPath: song._coverPath || null,
                    splitContractAddress: songRow?.split_contract_address || null,
                    splits,
                    allHaveWallets,
                });
            }
            setSongSplits(results);
        } finally {
            setSplitsLoading(false);
        }
    }, [songs]);

    useEffect(() => {
        loadSplits();
    }, [loadSplits]);

    const handleEdit = (songId: string, songTitle: string) => {
        router.push({
            pathname: '/(artist)/split-editor',
            params: { songId, songTitle },
        });
    };

    const loading = songsLoading || splitsLoading;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: isWeb ? 32 : 16, paddingBottom: 60 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                        <Users size={22} color="#8b5cf6" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>
                            Split Contracts
                        </Text>
                        <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 2 }}>
                            Manage revenue splits for your songs
                        </Text>
                    </View>
                </View>

                {/* Info Banner */}
                <View style={{
                    padding: 14, borderRadius: 12, marginBottom: 20, marginTop: 16,
                    backgroundColor: isDark ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.04)',
                    borderWidth: 1, borderColor: isDark ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.1)',
                }}>
                    <Text style={{ fontSize: 12, color: colors.text.secondary, lineHeight: 18 }}>
                        Split sheets define how streaming royalties are distributed across your collaborators. NFT sale revenue goes directly to the primary creator — it is not split.
                    </Text>
                </View>

                {/* Content */}
                {loading ? (
                    <View style={{ padding: 60, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#8b5cf6" />
                        <Text style={{ color: colors.text.muted, marginTop: 12, fontSize: 13 }}>Loading songs...</Text>
                    </View>
                ) : songSplits.length > 0 ? (
                    songSplits.map((data) => (
                        <SongSplitCard
                            key={data.songId}
                            data={data}
                            onEdit={handleEdit}
                        />
                    ))
                ) : (
                    <View style={{ padding: 60, alignItems: 'center' }}>
                        <Music size={48} color={colors.text.muted} style={{ marginBottom: 16 }} />
                        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text.secondary, marginBottom: 4 }}>
                            No songs yet
                        </Text>
                        <Text style={{ fontSize: 13, color: colors.text.muted, textAlign: 'center', lineHeight: 20, maxWidth: 300 }}>
                            Upload your first song to set up split sheets and deploy on-chain revenue contracts.
                        </Text>
                        <AnimatedPressable
                            preset="button"
                            onPress={() => router.push('/(artist)/upload' as any)}
                            style={{
                                flexDirection: 'row', alignItems: 'center', gap: 8,
                                backgroundColor: '#8b5cf6', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginTop: 20,
                            }}
                        >
                            <Upload size={16} color="#fff" />
                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Upload Song</Text>
                        </AnimatedPressable>
                    </View>
                )}
            </ScrollView>
        </Container>
    );
}

import React, { useState, useEffect } from 'react';
import {
    View, Text, ScrollView, Platform, ActivityIndicator, Linking,
} from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Users, Percent, Wallet, CheckCircle, Music, ExternalLink,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { supabase } from '../../src/lib/supabase';
import { EXPLORER_BASE as POLYGONSCAN_BASE } from '../../src/config/network';

const isWeb = Platform.OS === 'web';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';

function coverUrl(path: string | null | undefined): string {
    if (!path) return 'https://placehold.co/400x400/1e293b/94a3b8?text=♪';
    if (path.startsWith('http')) return path;
    return `${SUPABASE_URL}/storage/v1/object/public/covers/${path}`;
}

interface MySplit {
    id: string;
    role: string;
    sharePercent: number;
    songId: string;
    songTitle: string;
    coverPath: string | null;
    artistName: string;
    splitContractAddress: string | null;
}

/* ─── Split Card ─── */
function MySplitCard({ split }: { split: MySplit }) {
    const { isDark, colors } = useTheme();
    const hasContract = !!split.splitContractAddress;

    return (
        <View style={{
            borderRadius: 16, overflow: 'hidden', marginBottom: 12,
            backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
            borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
        }}>
            <View style={{
                flexDirection: 'row', alignItems: 'center', padding: isWeb ? 16 : 12,
            }}>
                <Image
                    source={{ uri: coverUrl(split.coverPath) }}
                    style={{ width: 56, height: 56, borderRadius: 14 }}
                    contentFit="cover"
                />
                <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary }} numberOfLines={1}>
                        {split.songTitle}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 3 }}>
                        by {split.artistName}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <View style={{
                            flexDirection: 'row', alignItems: 'center', gap: 3,
                            backgroundColor: isDark ? 'rgba(56,180,186,0.12)' : 'rgba(56,180,186,0.06)',
                            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                        }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#38b4ba', textTransform: 'capitalize' }}>
                                {split.role}
                            </Text>
                        </View>
                    </View>
                </View>
                <View style={{
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isDark ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.08)',
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
                    borderWidth: 1, borderColor: isDark ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.12)',
                }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: '#8b5cf6', letterSpacing: -0.5 }}>
                        {split.sharePercent}%
                    </Text>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: 1, marginTop: 1 }}>
                        Share
                    </Text>
                </View>
            </View>

            {/* Contract Address */}
            {hasContract && (
                <AnimatedPressable
                    preset="row"
                    onPress={() => Linking.openURL(`${POLYGONSCAN_BASE}/address/${split.splitContractAddress}`)}
                    style={{
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        paddingHorizontal: 16, paddingVertical: 10,
                        borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                        backgroundColor: isDark ? 'rgba(34,197,94,0.04)' : 'rgba(34,197,94,0.02)',
                    }}
                >
                    <Wallet size={13} color="#22c55e" />
                    <Text style={{ flex: 1, fontSize: 11, color: '#22c55e', fontWeight: '600', fontFamily: isWeb ? 'monospace' : undefined }}>
                        Split Contract: {split.splitContractAddress!.slice(0, 10)}...{split.splitContractAddress!.slice(-6)}
                    </Text>
                    <ExternalLink size={11} color="#22c55e" />
                </AnimatedPressable>
            )}
        </View>
    );
}

/* ─── Main Screen ─── */
export default function MySplitsScreen() {
    const { isDark, colors } = useTheme();
    const { profile } = useAuth();
    const [splits, setSplits] = useState<MySplit[]>([]);
    const [loading, setLoading] = useState(true);

    const Container = isWeb ? View : SafeAreaView;

    useEffect(() => {
        if (!profile?.id) return;
        let cancelled = false;

        (async () => {
            try {
                const { data, error } = await supabase
                    .from('song_rights_splits')
                    .select(`
                        id, role, share_percent, party_name, party_email,
                        song:songs!song_id (
                            id, title, cover_path, split_contract_address, creator_id,
                            creator:profiles!creator_id ( display_name )
                        )
                    `)
                    .or(`linked_profile_id.eq.${profile.id},party_email.ilike.${profile.email}`)
                    .order('share_percent', { ascending: false });

                if (cancelled) return;

                if (!error && data) {
                    const mapped: MySplit[] = data.map((row: any) => ({
                        id: row.id,
                        role: row.role || 'collaborator',
                        sharePercent: row.share_percent,
                        songId: row.song?.id || '',
                        songTitle: row.song?.title || 'Unknown Song',
                        coverPath: row.song?.cover_path || null,
                        artistName: row.song?.creator?.display_name || 'Unknown Artist',
                        splitContractAddress: row.song?.split_contract_address || null,
                    }));
                    setSplits(mapped);
                }
            } catch (err) {
                console.error('[MySplits] Error:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [profile?.id, profile?.email]);

    const totalShare = splits.reduce((sum, s) => sum + s.sharePercent, 0);

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
                            My Splits
                        </Text>
                        <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 2 }}>
                            Songs you collaborate on and your royalty shares
                        </Text>
                    </View>
                </View>

                {/* Summary Banner */}
                {splits.length > 0 && (
                    <View style={{
                        flexDirection: 'row', gap: isWeb ? 16 : 8, marginTop: 16, marginBottom: 20,
                    }}>
                        <View style={{
                            flex: 1, padding: isWeb ? 20 : 14, borderRadius: 14,
                            backgroundColor: isDark ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.05)',
                            borderWidth: 1, borderColor: isDark ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.1)',
                            alignItems: 'center',
                        }}>
                            <Text style={{ fontSize: 28, fontWeight: '800', color: '#8b5cf6', letterSpacing: -1 }}>{splits.length}</Text>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>Songs</Text>
                        </View>
                        <View style={{
                            flex: 1, padding: isWeb ? 20 : 14, borderRadius: 14,
                            backgroundColor: isDark ? 'rgba(56,180,186,0.1)' : 'rgba(56,180,186,0.05)',
                            borderWidth: 1, borderColor: isDark ? 'rgba(56,180,186,0.2)' : 'rgba(56,180,186,0.1)',
                            alignItems: 'center',
                        }}>
                            <Text style={{ fontSize: 28, fontWeight: '800', color: '#38b4ba', letterSpacing: -1 }}>
                                {splits.length > 0 ? (totalShare / splits.length).toFixed(1) : '0'}%
                            </Text>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>Avg Share</Text>
                        </View>
                        <View style={{
                            flex: 1, padding: isWeb ? 20 : 14, borderRadius: 14,
                            backgroundColor: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.05)',
                            borderWidth: 1, borderColor: isDark ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.1)',
                            alignItems: 'center',
                        }}>
                            <Text style={{ fontSize: 28, fontWeight: '800', color: '#22c55e', letterSpacing: -1 }}>
                                {splits.filter(s => !!s.splitContractAddress).length}
                            </Text>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>On-Chain</Text>
                        </View>
                    </View>
                )}

                {/* Content */}
                {loading ? (
                    <View style={{ padding: 60, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#8b5cf6" />
                        <Text style={{ color: colors.text.muted, marginTop: 12, fontSize: 13 }}>Loading your splits...</Text>
                    </View>
                ) : splits.length > 0 ? (
                    splits.map((split) => (
                        <MySplitCard key={split.id} split={split} />
                    ))
                ) : (
                    <View style={{ padding: 60, alignItems: 'center' }}>
                        <Music size={48} color={colors.text.muted} style={{ marginBottom: 16 }} />
                        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text.secondary, marginBottom: 4 }}>
                            No splits yet
                        </Text>
                        <Text style={{ fontSize: 13, color: colors.text.muted, textAlign: 'center', lineHeight: 20, maxWidth: 300 }}>
                            When an artist adds you to a royalty split sheet, your songs and shares will appear here.
                        </Text>
                    </View>
                )}
            </ScrollView>
        </Container>
    );
}

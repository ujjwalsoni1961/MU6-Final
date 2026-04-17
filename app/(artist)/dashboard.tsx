import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrendingUp, DollarSign, Music, Gem, Users, ArrowRight, UserCog, Settings, LogOut, Percent } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useCreatorDashboard, useCreatorSongs, useCreatorRoyalties, adaptSong } from '../../src/hooks/useData';
import { useTheme } from '../../src/context/ThemeContext';
import { useCreatorRole } from '../../src/hooks/useCreatorRole';
import { supabase } from '../../src/lib/supabase';
import ErrorState from '../../src/components/shared/ErrorState';

const isWeb = Platform.OS === 'web';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';

function coverUrl(path: string | null | undefined): string {
    if (!path) return 'https://placehold.co/400x400/1e293b/94a3b8?text=♪';
    if (path.startsWith('http')) return path;
    return `${SUPABASE_URL}/storage/v1/object/public/covers/${path}`;
}

/* ─── Stat Card ─── */
function StatCard({ title, value, subtitle, icon, accent, highlight }: {
    title: string; value: string; subtitle?: string; icon: React.ReactNode; accent?: string; highlight?: boolean;
}) {
    const { isDark, colors } = useTheme();
    return (
        <View
            style={{
                flex: 1, margin: 6, padding: isWeb ? 24 : 16, borderRadius: 16,
                backgroundColor: highlight
                    ? (isDark ? 'rgba(56,180,186,0.15)' : 'rgba(56,180,186,0.08)')
                    : isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                borderWidth: highlight ? 1.5 : 1,
                borderColor: highlight ? 'rgba(56,180,186,0.25)' : (isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)')),
                shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
            }}
        >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                    {title}
                </Text>
                {icon}
            </View>
            <Text style={{ fontSize: isWeb ? 32 : 24, fontWeight: '800', color: accent || colors.text.primary, letterSpacing: -1 }}>
                {value}
            </Text>
            {subtitle && (
                <Text style={{ fontSize: 12, color: '#38b4ba', fontWeight: '600', marginTop: 6 }}>
                    {subtitle}
                </Text>
            )}
        </View>
    );
}

/* ─── Simple Bar Chart ─── */
function BarChart({ data, labels, title }: { data: number[]; labels: string[]; title: string }) {
    const { isDark, colors } = useTheme();
    const maxVal = Math.max(...data, 1);
    return (
        <View
            style={{
                flex: 1, margin: 6, padding: isWeb ? 24 : 16, borderRadius: 16,
                backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
            }}
        >
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary, marginBottom: 20, letterSpacing: -0.3 }}>
                {title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, justifyContent: 'space-around' }}>
                {data.map((val, i) => (
                    <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                        <View style={{ width: isWeb ? 28 : 20, height: Math.max((val / maxVal) * 100, 4), backgroundColor: 'rgba(56,180,186,0.2)', borderRadius: 6, borderWidth: 1, borderColor: 'rgba(56,180,186,0.3)' }} />
                        <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 8, fontWeight: '600' }}>{labels[i]}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

/* ─── Top Song Row ─── */
function TopSongRow({ rank, song }: { rank: number; song: any }) {
    const { isDark, colors } = useTheme();
    return (
        <AnimatedPressable
            preset="row"
            hapticType="none"
            style={{
                flexDirection: 'row', alignItems: 'center',
                paddingVertical: 12, paddingHorizontal: isWeb ? 16 : 12,
                borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
            }}
        >
            <Text style={{ width: 28, fontSize: 14, fontWeight: '600', color: colors.text.muted }}>{rank}</Text>
            <Image source={{ uri: song.coverImage }} style={{ width: 40, height: 40, borderRadius: 8 }} contentFit="cover" />
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }}>{song.title}</Text>
                <Text style={{ fontSize: 12, color: colors.text.secondary }}>{song.plays.toLocaleString()} plays</Text>
            </View>
        </AnimatedPressable>
    );
}

/* ─── Collaborator Split Row ─── */
function CollabSplitRow({ split }: { split: any }) {
    const { isDark, colors } = useTheme();
    return (
        <View
            style={{
                flexDirection: 'row', alignItems: 'center',
                paddingVertical: 14, paddingHorizontal: isWeb ? 16 : 12,
                borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
            }}
        >
            <Image
                source={{ uri: coverUrl(split.cover_path) }}
                style={{ width: 44, height: 44, borderRadius: 10 }}
                contentFit="cover"
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }} numberOfLines={1}>
                    {split.song_title}
                </Text>
                <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>
                    {split.role} · by {split.artist_name}
                </Text>
            </View>
            <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: isDark ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.06)',
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
            }}>
                <Percent size={11} color="#8b5cf6" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#8b5cf6' }}>{split.share_percent}%</Text>
            </View>
        </View>
    );
}

/* ─── Collaborator Dashboard ─── */
function CollaboratorDashboard() {
    const { profile, signOut } = useAuth();
    const { isDark, colors } = useTheme();
    const router = useRouter();
    const [splits, setSplits] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const Container = isWeb ? View : SafeAreaView;

    const fetchSplits = async () => {
        if (!profile?.id) return;
        try {
            const { data, error } = await supabase
                .from('song_rights_splits')
                .select(`
                    id, role, share_percent, party_name, party_email,
                    song:songs!song_id (
                        id, title, cover_path, creator_id,
                        creator:profiles!creator_id ( display_name )
                    )
                `)
                .or(`linked_profile_id.eq.${profile.id},party_email.eq.${profile.email}`);

            if (!error && data) {
                const mapped = data.map((row: any) => ({
                    id: row.id,
                    role: row.role,
                    share_percent: row.share_percent,
                    song_id: row.song?.id,
                    song_title: row.song?.title || 'Unknown Song',
                    cover_path: row.song?.cover_path,
                    artist_name: row.song?.creator?.display_name || 'Unknown Artist',
                    split_contract_address: null,
                }));
                setSplits(mapped);
            }
        } catch (err) {
            console.error('[CollaboratorDashboard] Error loading splits:', err);
        }
    };

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        fetchSplits().finally(() => {
            if (mounted) setLoading(false);
        });
        return () => { mounted = false; };
    }, [profile?.id, profile?.email]);

    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await fetchSplits();
        setRefreshing(false);
    }, [profile?.id, profile?.email]);

    const totalSplits = splits.length;
    const avgShare = totalSplits > 0 ? splits.reduce((sum, s) => sum + s.share_percent, 0) / totalSplits : 0;

    if (loading) {
        return (
            <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color="#38b4ba" />
                </View>
            </Container>
        );
    }

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: isWeb ? 32 : 16, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.accent.cyan}
                        colors={[colors.accent.cyan]}
                    />
                }
            >
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>
                        Welcome back, {profile?.displayName || 'Collaborator'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(56,180,186,0.1)', borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(56,180,186,0.2)' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#38b4ba', textTransform: 'uppercase', letterSpacing: 1 }}>Collaborator</Text>
                    </View>
                </View>
                <Text style={{ fontSize: 14, color: colors.text.secondary, marginTop: 4, marginBottom: 24 }}>
                    Here's your collaborator overview.
                </Text>

                {/* Stat Cards */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 24 }}>
                    <StatCard
                        title="Songs"
                        value={String(totalSplits)}
                        subtitle="Songs you're part of"
                        icon={<Music size={18} color="#38b4ba" />}
                    />
                    <StatCard
                        title="Avg Share"
                        value={`${avgShare.toFixed(1)}%`}
                        icon={<Users size={18} color="#8b5cf6" />}
                        accent="#8b5cf6"
                    />
                </View>

                {/* Songs I'm Part Of */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                        My Splits
                    </Text>
                    {splits.length > 0 && (
                        <AnimatedPressable
                            preset="row"
                            hapticType="light"
                            onPress={() => router.push('/(artist)/my-splits' as any)}
                        >
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#38b4ba' }}>View All</Text>
                        </AnimatedPressable>
                    )}
                </View>

                {splits.length > 0 ? (
                    <View
                        style={{
                            borderRadius: 16, overflow: 'hidden',
                            backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                        }}
                    >
                        {splits.slice(0, 5).map((split) => (
                            <CollabSplitRow key={split.id} split={split} />
                        ))}
                    </View>
                ) : (
                    <View style={{ padding: 32, alignItems: 'center' }}>
                        <Users size={40} color={colors.text.muted} style={{ marginBottom: 12 }} />
                        <Text style={{ fontSize: 14, color: colors.text.secondary, textAlign: 'center' }}>
                            No splits yet. You'll see songs here when an artist adds you to a split sheet.
                        </Text>
                    </View>
                )}

                {/* Quick Actions */}
                <View style={{ marginTop: 24 }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, marginBottom: 16 }}>
                        Quick Actions
                    </Text>
                    <View style={{ flexDirection: isWeb ? 'row' : 'column', gap: 8, flexWrap: 'wrap' }}>
                        <AnimatedPressable
                            preset="row"
                            hapticType="light"
                            onPress={() => router.push('/(artist)/my-splits' as any)}
                            style={{
                                flex: 1, flexDirection: 'row', alignItems: 'center',
                                padding: isWeb ? 18 : 14, borderRadius: 14,
                                backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                                borderWidth: 1,
                                borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                            }}
                        >
                            <View style={{
                                width: 38, height: 38, borderRadius: 10,
                                backgroundColor: 'rgba(139,92,246,0.1)',
                                alignItems: 'center', justifyContent: 'center', marginRight: 12,
                            }}>
                                <Users size={18} color="#8b5cf6" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }}>My Splits</Text>
                                <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>View all songs you collaborate on</Text>
                            </View>
                            <ArrowRight size={16} color={colors.text.muted} />
                        </AnimatedPressable>

                        <AnimatedPressable
                            preset="row"
                            hapticType="light"
                            onPress={() => router.push('/(artist)/earnings' as any)}
                            style={{
                                flex: 1, flexDirection: 'row', alignItems: 'center',
                                padding: isWeb ? 18 : 14, borderRadius: 14,
                                backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                                borderWidth: 1,
                                borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                            }}
                        >
                            <View style={{
                                width: 38, height: 38, borderRadius: 10,
                                backgroundColor: 'rgba(56,180,186,0.1)',
                                alignItems: 'center', justifyContent: 'center', marginRight: 12,
                            }}>
                                <DollarSign size={18} color="#38b4ba" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }}>View Earnings</Text>
                                <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>Detailed royalty breakdown</Text>
                            </View>
                            <ArrowRight size={16} color={colors.text.muted} />
                        </AnimatedPressable>

                        <AnimatedPressable
                            preset="row"
                            hapticType="light"
                            onPress={() => router.push('/(artist)/settings' as any)}
                            style={{
                                flex: 1, flexDirection: 'row', alignItems: 'center',
                                padding: isWeb ? 18 : 14, borderRadius: 14,
                                backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                                borderWidth: 1,
                                borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                            }}
                        >
                            <View style={{
                                width: 38, height: 38, borderRadius: 10,
                                backgroundColor: 'rgba(139,92,246,0.1)',
                                alignItems: 'center', justifyContent: 'center', marginRight: 12,
                            }}>
                                <Settings size={18} color="#8b5cf6" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }}>Settings</Text>
                                <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>Wallet, email & preferences</Text>
                            </View>
                            <ArrowRight size={16} color={colors.text.muted} />
                        </AnimatedPressable>

                        <AnimatedPressable
                            preset="row"
                            hapticType="light"
                            onPress={async () => { await signOut(); router.replace('/(auth)/login'); }}
                            style={{
                                flex: 1, flexDirection: 'row', alignItems: 'center',
                                padding: isWeb ? 18 : 14, borderRadius: 14,
                                backgroundColor: isDark ? 'rgba(239,68,68,0.04)' : '#fef2f2',
                                borderWidth: 1,
                                borderColor: isDark ? 'rgba(239,68,68,0.1)' : '#fecaca',
                            }}
                        >
                            <View style={{
                                width: 38, height: 38, borderRadius: 10,
                                backgroundColor: 'rgba(239,68,68,0.1)',
                                alignItems: 'center', justifyContent: 'center', marginRight: 12,
                            }}>
                                <LogOut size={18} color="#ef4444" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#ef4444' }}>Logout</Text>
                                <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>Sign out of your account</Text>
                            </View>
                        </AnimatedPressable>
                    </View>
                </View>
            </ScrollView>
        </Container>
    );
}

/* ─── Artist Dashboard (Full View) ─── */
function ArtistDashboard() {
    const { profile, signOut } = useAuth();
    const { isDark, colors } = useTheme();
    const router = useRouter();
    const { data: dashboard, loading: loadingDashboard, error: dashboardError, refresh: refreshDashboard } = useCreatorDashboard();
    const { data: creatorSongs, loading: loadingSongs, refresh: refreshSongs } = useCreatorSongs();
    const { data: royalties, refresh: refreshRoyalties } = useCreatorRoyalties();

    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        refreshDashboard();
        refreshSongs();
        refreshRoyalties();
        setTimeout(() => setRefreshing(false), 500);
    }, [refreshDashboard, refreshSongs, refreshRoyalties]);

    const topSongs = [...creatorSongs].sort((a, b) => b.plays - a.plays).slice(0, 6);

    // Use royalty engine total when available, fall back to dashboard estimate
    const totalRevenueEur = royalties?.totalRevenue ?? dashboard?.totalRevenueEur ?? 0;

    const Container = isWeb ? View : SafeAreaView;

    if (loadingDashboard) {
        return (
            <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color="#38b4ba" />
                </View>
            </Container>
        );
    }

    if (dashboardError) {
        return (
            <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
                <ErrorState message={dashboardError} onRetry={refreshDashboard} />
            </Container>
        );
    }

    const formatNumber = (n: number) => {
        if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
        if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
        return String(n);
    };

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: isWeb ? 32 : 16, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.accent.cyan}
                        colors={[colors.accent.cyan]}
                    />
                }
            >
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>
                        Welcome back, {profile?.displayName || 'Creator'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: 1 }}>Creator</Text>
                    </View>
                </View>
                <Text style={{ fontSize: 14, color: colors.text.secondary, marginTop: 4, marginBottom: 24 }}>
                    Here's your creator overview.
                </Text>

                {/* Stat Cards */}
                <View style={{ flexDirection: isWeb ? 'row' : 'row', flexWrap: 'wrap', marginBottom: 24 }}>
                    <StatCard
                        title="Total Streams"
                        value={formatNumber(dashboard?.totalPlays || 0)}
                        icon={<TrendingUp size={18} color="#38b4ba" />}
                    />
                    <StatCard
                        title="Revenue"
                        value={`€${totalRevenueEur.toFixed(2)}`}
                        subtitle={royalties ? `${royalties.streamCount} streams · ${royalties.totalNFTsSold} NFTs sold` : undefined}
                        icon={<DollarSign size={18} color="#38b4ba" />}
                        accent="#38b4ba"
                        highlight
                    />
                    <StatCard
                        title="Total Songs"
                        value={String(dashboard?.totalSongs || 0)}
                        icon={<Music size={18} color={colors.text.muted} />}
                    />
                    <StatCard
                        title="NFTs Minted"
                        value={String(dashboard?.totalNFTsMinted || 0)}
                        icon={<Gem size={18} color={colors.text.muted} />}
                    />
                </View>

                {/* Top Performing Songs */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                        Top Performing Songs
                    </Text>
                </View>
                {loadingSongs ? (
                    <View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator size="small" color="#38b4ba" /></View>
                ) : topSongs.length > 0 ? (
                    <View
                        style={{
                            borderRadius: 16,
                            backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                            overflow: 'hidden',
                        }}
                    >
                        {topSongs.map((song, i) => (
                            <TopSongRow key={song.id} rank={i + 1} song={song} />
                        ))}
                    </View>
                ) : (
                    <View style={{ padding: 20 }}>
                        <Text style={{ color: colors.text.secondary }}>Upload your first song to see stats here</Text>
                    </View>
                )}

                {/* Quick Actions */}
                <View style={{ marginTop: 24 }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, marginBottom: 16 }}>
                        Quick Actions
                    </Text>
                    <View style={{ flexDirection: isWeb ? 'row' : 'column', gap: 8, flexWrap: 'wrap' }}>
                        <AnimatedPressable
                            preset="row"
                            hapticType="light"
                            onPress={() => router.push('/(artist)/edit-artist-profile' as any)}
                            style={{
                                flex: 1, flexDirection: 'row', alignItems: 'center',
                                padding: isWeb ? 18 : 14, borderRadius: 14,
                                backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                                borderWidth: 1,
                                borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                            }}
                        >
                            <View style={{
                                width: 38, height: 38, borderRadius: 10,
                                backgroundColor: 'rgba(56,180,186,0.1)',
                                alignItems: 'center', justifyContent: 'center', marginRight: 12,
                            }}>
                                <UserCog size={18} color="#38b4ba" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }}>Edit Profile</Text>
                                <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>Update your artist info</Text>
                            </View>
                            <ArrowRight size={16} color={colors.text.muted} />
                        </AnimatedPressable>

                        <AnimatedPressable
                            preset="row"
                            hapticType="light"
                            onPress={() => router.push('/(artist)/split-editor' as any)}
                            style={{
                                flex: 1, flexDirection: 'row', alignItems: 'center',
                                padding: isWeb ? 18 : 14, borderRadius: 14,
                                backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                                borderWidth: 1,
                                borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                            }}
                        >
                            <View style={{
                                width: 38, height: 38, borderRadius: 10,
                                backgroundColor: 'rgba(139,92,246,0.1)',
                                alignItems: 'center', justifyContent: 'center', marginRight: 12,
                            }}>
                                <Users size={18} color="#8b5cf6" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }}>Manage Splits</Text>
                                <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>Edit royalty splits for your songs</Text>
                            </View>
                            <ArrowRight size={16} color={colors.text.muted} />
                        </AnimatedPressable>

                        <AnimatedPressable
                            preset="row"
                            hapticType="light"
                            onPress={() => router.push('/(artist)/earnings' as any)}
                            style={{
                                flex: 1, flexDirection: 'row', alignItems: 'center',
                                padding: isWeb ? 18 : 14, borderRadius: 14,
                                backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                                borderWidth: 1,
                                borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                            }}
                        >
                            <View style={{
                                width: 38, height: 38, borderRadius: 10,
                                backgroundColor: 'rgba(56,180,186,0.1)',
                                alignItems: 'center', justifyContent: 'center', marginRight: 12,
                            }}>
                                <DollarSign size={18} color="#38b4ba" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }}>View Earnings</Text>
                                <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>Detailed royalty breakdown</Text>
                            </View>
                            <ArrowRight size={16} color={colors.text.muted} />
                        </AnimatedPressable>

                        <AnimatedPressable
                            preset="row"
                            hapticType="light"
                            onPress={() => router.push('/(artist)/settings' as any)}
                            style={{
                                flex: 1, flexDirection: 'row', alignItems: 'center',
                                padding: isWeb ? 18 : 14, borderRadius: 14,
                                backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                                borderWidth: 1,
                                borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                            }}
                        >
                            <View style={{
                                width: 38, height: 38, borderRadius: 10,
                                backgroundColor: 'rgba(139,92,246,0.1)',
                                alignItems: 'center', justifyContent: 'center', marginRight: 12,
                            }}>
                                <Settings size={18} color="#8b5cf6" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }}>Settings</Text>
                                <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>Payout, account & preferences</Text>
                            </View>
                            <ArrowRight size={16} color={colors.text.muted} />
                        </AnimatedPressable>

                        <AnimatedPressable
                            preset="row"
                            hapticType="light"
                            onPress={async () => { await signOut(); router.replace('/(auth)/login'); }}
                            style={{
                                flex: 1, flexDirection: 'row', alignItems: 'center',
                                padding: isWeb ? 18 : 14, borderRadius: 14,
                                backgroundColor: isDark ? 'rgba(239,68,68,0.04)' : '#fef2f2',
                                borderWidth: 1,
                                borderColor: isDark ? 'rgba(239,68,68,0.1)' : '#fecaca',
                            }}
                        >
                            <View style={{
                                width: 38, height: 38, borderRadius: 10,
                                backgroundColor: 'rgba(239,68,68,0.1)',
                                alignItems: 'center', justifyContent: 'center', marginRight: 12,
                            }}>
                                <LogOut size={18} color="#ef4444" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#ef4444' }}>Logout</Text>
                                <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>Sign out of your account</Text>
                            </View>
                        </AnimatedPressable>
                    </View>
                </View>
            </ScrollView>
        </Container>
    );
}

/* ─── Main Screen ─── */
export default function CreatorDashboardScreen() {
    const { isCollaborator, loading } = useCreatorRole();
    const { isDark, colors } = useTheme();
    const Container = isWeb ? View : SafeAreaView;

    if (loading) {
        return (
            <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color="#38b4ba" />
                </View>
            </Container>
        );
    }

    if (isCollaborator) {
        return <CollaboratorDashboard />;
    }

    return <ArtistDashboard />;
}

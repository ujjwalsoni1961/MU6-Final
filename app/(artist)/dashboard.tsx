import React from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrendingUp, DollarSign, Music, Gem } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useAuth } from '../../src/context/AuthContext';
import { useCreatorDashboard, useCreatorSongs, adaptSong } from '../../src/hooks/useData';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

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

/* ─── Main Screen ─── */
export default function CreatorDashboardScreen() {
    const { profile } = useAuth();
    const { isDark, colors } = useTheme();
    const { data: dashboard, loading: loadingDashboard } = useCreatorDashboard();
    const { data: creatorSongs, loading: loadingSongs } = useCreatorSongs();

    const topSongs = [...creatorSongs].sort((a, b) => b.plays - a.plays).slice(0, 6);

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
                        value={`€${(dashboard?.totalRevenueEur || 0).toFixed(2)}`}
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
            </ScrollView>
        </Container>
    );
}

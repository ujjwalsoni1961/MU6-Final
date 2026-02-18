import React from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrendingUp, DollarSign, Music, Gem } from 'lucide-react-native';
import { Image } from 'expo-image';
import { artists } from '../../src/mock/artists';
import { songs } from '../../src/mock/songs';

const isWeb = Platform.OS === 'web';

/* ─── Stat Card ─── */
function StatCard({ title, value, subtitle, icon, accent, highlight }: {
    title: string; value: string; subtitle?: string; icon: React.ReactNode; accent?: string; highlight?: boolean;
}) {
    return (
        <View
            style={{
                flex: 1,
                margin: 6,
                padding: isWeb ? 24 : 16,
                borderRadius: 16,
                backgroundColor: highlight
                    ? 'rgba(56,180,186,0.08)'
                    : isWeb ? '#fff' : 'rgba(255,255,255,0.4)',
                borderWidth: highlight ? 1.5 : 1,
                borderColor: highlight ? 'rgba(56,180,186,0.25)' : isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.03,
                shadowRadius: 8,
                elevation: 2,
            }}
        >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                    {title}
                </Text>
                {icon}
            </View>
            <Text style={{ fontSize: isWeb ? 32 : 24, fontWeight: '800', color: accent || '#0f172a', letterSpacing: -1 }}>
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

/* ─── Simple Bar Chart (Pure RN — no library needed) ─── */
function BarChart({ data, labels, title }: { data: number[]; labels: string[]; title: string }) {
    const maxVal = Math.max(...data);
    return (
        <View
            style={{
                flex: 1,
                margin: 6,
                padding: isWeb ? 24 : 16,
                borderRadius: 16,
                backgroundColor: isWeb ? '#fff' : 'rgba(255,255,255,0.4)',
                borderWidth: 1,
                borderColor: isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.03,
                shadowRadius: 8,
                elevation: 2,
            }}
        >
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 20, letterSpacing: -0.3 }}>
                {title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, justifyContent: 'space-around' }}>
                {data.map((val, i) => (
                    <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                        <View
                            style={{
                                width: isWeb ? 28 : 20,
                                height: (val / maxVal) * 100,
                                backgroundColor: 'rgba(56,180,186,0.2)',
                                borderRadius: 6,
                                borderWidth: 1,
                                borderColor: 'rgba(56,180,186,0.3)',
                            }}
                        />
                        <Text style={{ fontSize: 10, color: '#94a3b8', marginTop: 8, fontWeight: '600' }}>
                            {labels[i]}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

/* ─── Top Song Row ─── */
function TopSongRow({ rank, song }: { rank: number; song: typeof songs[0] }) {
    const revenue = (song.price * (song.editionsSold || 0)).toFixed(2);
    return (
        <AnimatedPressable
            preset="row"
            hapticType="none"
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 12,
                paddingHorizontal: isWeb ? 16 : 12,
                borderBottomWidth: 1,
                borderBottomColor: '#f8fafc',
            }}
        >
            <Text style={{ width: 28, fontSize: 14, fontWeight: '600', color: '#94a3b8' }}>{rank}</Text>
            <Image source={{ uri: song.coverImage }} style={{ width: 40, height: 40, borderRadius: 8 }} contentFit="cover" />
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#0f172a' }}>{song.title}</Text>
                <Text style={{ fontSize: 12, color: '#64748b' }}>{song.plays.toLocaleString()} plays</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#38b4ba' }}>
                ${revenue}
            </Text>
        </AnimatedPressable>
    );
}

/* ─── Main Screen ─── */
export default function ArtistDashboardScreen() {
    const artist = artists[0];
    const topSongs = [...songs].sort((a, b) => b.plays - a.plays).slice(0, 6);

    const streamData = [2800, 4200, 3600, 5100, 7200, 9500, 6800];
    const streamLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const revenueData = [1200, 1800, 2400, 1600, 3200, 4100];
    const revenueLabels = ['AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'JAN'];

    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? '#f8fafc' : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: isWeb ? 32 : 16, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: '#0f172a', letterSpacing: -1 }}>
                    Welcome back, {artist.name}
                </Text>
                <Text style={{ fontSize: 14, color: '#64748b', marginTop: 4, marginBottom: 24 }}>
                    Here's your overview for this month.
                </Text>

                {/* Stat Cards Row */}
                <View style={{ flexDirection: isWeb ? 'row' : 'row', flexWrap: 'wrap', marginBottom: 24 }}>
                    <StatCard
                        title="Total Streams"
                        value="1.2M"
                        subtitle="+ 12% from last month"
                        icon={<TrendingUp size={18} color="#38b4ba" />}
                    />
                    <StatCard
                        title="Revenue"
                        value="$8,450"
                        subtitle="+ 8% from last month"
                        icon={<DollarSign size={18} color="#38b4ba" />}
                        accent="#38b4ba"
                        highlight
                    />
                    <StatCard
                        title="Total Songs"
                        value={String(artist.totalSongs)}
                        icon={<Music size={18} color="#64748b" />}
                    />
                    <StatCard
                        title="NFTs Sold"
                        value={String(artist.totalNFTsSold)}
                        subtitle="+ 23% from last month"
                        icon={<Gem size={18} color="#64748b" />}
                    />
                </View>

                {/* Charts Row */}
                <View style={{ flexDirection: isWeb ? 'row' : 'column', marginBottom: 24 }}>
                    <BarChart data={streamData} labels={streamLabels} title="Streams (Last 7 Days)" />
                    <BarChart data={revenueData} labels={revenueLabels} title="Revenue (Last 6 Months)" />
                </View>

                {/* Top Performing Songs */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 }}>
                        Top Performing Songs
                    </Text>
                    <AnimatedPressable
                        preset="icon"
                        hapticType="none"
                        style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 20,
                        }}
                    >
                        <Text style={{ color: '#38b4ba', fontWeight: '600', fontSize: 13 }}>View All →</Text>
                    </AnimatedPressable>
                </View>
                <View
                    style={{
                        borderRadius: 16,
                        backgroundColor: isWeb ? '#fff' : 'rgba(255,255,255,0.4)',
                        borderWidth: 1,
                        borderColor: isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)',
                        overflow: 'hidden',
                    }}
                >
                    {topSongs.map((song, i) => (
                        <TopSongRow key={song.id} rank={i + 1} song={song} />
                    ))}
                </View>
            </ScrollView>
        </Container>
    );
}

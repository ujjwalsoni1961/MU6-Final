import React from 'react';
import { View, Text, ScrollView, FlatList, Platform } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BadgeCheck } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GlassCard from '../../src/components/shared/GlassCard';
import SongCard from '../../src/components/shared/SongCard';
import { artists } from '../../src/mock/artists';
import { songs } from '../../src/mock/songs';
import { Song } from '../../src/types';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';

import { useTheme } from '../../src/context/ThemeContext';

function formatFollowers(count: number): string {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
}

export default function ArtistProfileScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const artist = artists.find((a) => a.id === id) || artists[0];
    const artistSongs = songs.filter((s) => s.artistName === artist.name);
    const isWeb = Platform.OS === 'web';
    const { isDark, colors } = useTheme();

    return (
        <ScreenScaffold dominantColor="#74e5ea" contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Gradient Banner */}
            <View style={{ marginHorizontal: 16, marginTop: 16 }}>
                <View style={{ borderRadius: 36, overflow: 'hidden', height: 200 }}>
                    <LinearGradient
                        colors={['#74e5ea', '#8b5cf6'] as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ flex: 1 }}
                    />
                    {/* Glass overlay */}
                    <View
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: isDark ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)',
                        }}
                    />
                    {/* Bleed to background */}
                    {isDark && (
                        <LinearGradient
                            colors={['transparent', colors.bg.base]}
                            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 }}
                        />
                    )}
                </View>
            </View>

            {/* Avatar overlapping banner */}
            <View style={{ alignItems: 'flex-start', marginTop: -60, paddingHorizontal: 32 }}>
                <View
                    style={{
                        width: 120,
                        height: 120,
                        borderRadius: 60,
                        padding: 4,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)',
                        borderWidth: 2,
                        borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.4)',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: 0.15,
                        shadowRadius: 20,
                        elevation: 10,
                    }}
                >
                    <Image
                        source={{ uri: artist.avatar }}
                        style={{ width: 112, height: 112, borderRadius: 56 }}
                        contentFit="cover"
                    />
                    {artist.verified && (
                        <View
                            style={{
                                position: 'absolute',
                                bottom: 4,
                                right: 4,
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                backgroundColor: '#8b5cf6',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderWidth: 3,
                                borderColor: isDark ? colors.bg.card : '#fff',
                            }}
                        >
                            <BadgeCheck size={16} color="#fff" />
                        </View>
                    )}
                </View>
            </View>

            {/* Name + Follow */}
            <View style={{ paddingHorizontal: 32, marginTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View>
                        <Text style={{ fontSize: 32, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>
                            {artist.name}
                        </Text>
                        <Text style={{ fontSize: 15, color: colors.text.secondary, marginTop: 2 }}>
                            {formatFollowers(artist.followers)} Followers
                        </Text>
                    </View>
                    <AnimatedPressable
                        preset="button"
                        style={{
                            backgroundColor: isDark ? '#fff' : '#1e293b',
                            borderRadius: 16,
                            paddingHorizontal: 24,
                            paddingVertical: 10,
                        }}
                    >
                        <Text style={{ color: isDark ? '#000' : '#fff', fontWeight: '700', fontSize: 14 }}>Follow</Text>
                    </AnimatedPressable>
                </View>
            </View>

            {/* Stats Row */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginTop: 20, marginBottom: 20 }}>
                <GlassCard style={{ flex: 1, margin: 4, alignItems: 'center' }}>
                    <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                        {artist.totalSongs}
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>
                        Songs Released
                    </Text>
                </GlassCard>
                <GlassCard style={{ flex: 1, margin: 4, alignItems: 'center' }}>
                    <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                        {artist.totalNFTsSold}
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>
                        NFTs Sold
                    </Text>
                </GlassCard>
                <GlassCard style={{ flex: 1, margin: 4, alignItems: 'center' }}>
                    <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                        {artist.totalEarnings} ETH
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>
                        Trading Volume
                    </Text>
                </GlassCard>
            </View>

            {/* Songs */}
            <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
                    Songs
                </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 16, marginBottom: 32 }}>
                {artistSongs.length > 0 ? (
                    artistSongs.map((song) => (
                        <SongCard
                            key={song.id}
                            cover={song.coverImage}
                            title={song.title}
                            artist={song.artistName}
                            isNFT={song.isNFT}
                            price={song.price}
                            onPress={() => router.push({ pathname: '/(consumer)/song-detail', params: { id: song.id } })}
                        />
                    ))
                ) : (
                    songs.slice(0, 5).map((song) => (
                        <SongCard
                            key={song.id}
                            cover={song.coverImage}
                            title={song.title}
                            artist={song.artistName}
                            isNFT={song.isNFT}
                            price={song.price}
                            onPress={() => router.push({ pathname: '/(consumer)/song-detail', params: { id: song.id } })}
                        />
                    ))
                )}
            </ScrollView>
        </ScreenScaffold>
    );
}

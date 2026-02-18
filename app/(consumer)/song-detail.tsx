import React from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Play, Heart, Clock, ChevronLeft, Share, MoreHorizontal } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GlassCard from '../../src/components/shared/GlassCard';
import GenreTag from '../../src/components/shared/GenreTag';
import SongCard from '../../src/components/shared/SongCard';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import { songs } from '../../src/mock/songs';

import { useTheme } from '../../src/context/ThemeContext';

function formatPlays(count: number): string {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
}

import { usePlayer } from '../../src/context/PlayerContext';

export default function SongDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const song = songs.find((s) => s.id === id) || songs[0];
    const moreSongs = songs.filter((s) => s.artistName === song.artistName && s.id !== song.id);
    const isWeb = Platform.OS === 'web';
    const { isDark, colors } = useTheme();
    const { playSong } = usePlayer();

    return (
        <ScreenScaffold dominantColor="#38b4ba" contentContainerStyle={{ paddingBottom: 120 }}>
            <View style={[
                isWeb ? { maxWidth: 1200, width: '100%', alignSelf: 'center' } : { flex: 1 },
            ]}>
                {/* Back Button */}
                <View style={{ paddingHorizontal: 16 }}>
                    <AnimatedPressable
                        preset="icon"
                        onPress={() => router.back()}
                        style={{
                            width: 40, height: 40, borderRadius: 20, marginTop: isWeb ? 20 : 12, marginBottom: 8,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center',
                            borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)',
                        }}
                    >
                        <ChevronLeft size={22} color={colors.text.primary} />
                    </AnimatedPressable>
                </View>

                {/* Cover Art & Content Wrapper */}
                <View style={[
                    isWeb ? { flexDirection: 'row', gap: 40, paddingVertical: 40, maxWidth: 1200, alignSelf: 'center', width: '100%', paddingHorizontal: 16 } : { paddingHorizontal: 24, alignItems: 'center' },
                ]}>
                    {/* Cover Art */}
                    <View style={[
                        { borderRadius: 32, overflow: 'hidden', marginBottom: 24 },
                        isWeb ? { width: 400, height: 400, flexShrink: 0 } : { width: '100%', aspectRatio: 1, maxWidth: 350, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.3, shadowRadius: 30, elevation: 10, backgroundColor: isDark ? '#000' : '#fff' },
                    ]}>
                        <Image
                            source={{ uri: song.coverImage }}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                        />
                        {!isWeb && (
                            <LinearGradient
                                colors={['transparent', isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)'] as any}
                                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 }}
                            />
                        )}
                    </View>

                    {/* Details Container */}
                    <View style={isWeb ? { flex: 1 } : { width: '100%', alignItems: 'center' }}>
                        <Text style={{ fontSize: isWeb ? 48 : 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, textAlign: isWeb ? 'left' : 'center' }}>{song.title}</Text>
                        <Text style={{ fontSize: isWeb ? 24 : 18, color: colors.text.secondary, marginTop: 4, fontWeight: '500', textAlign: isWeb ? 'left' : 'center' }}>{song.artistName}</Text>

                        <View style={{ marginTop: 12, flexDirection: 'row', marginBottom: 32, justifyContent: isWeb ? 'flex-start' : 'center' }}>
                            <GenreTag genre={song.genre} />
                        </View>

                        {/* Action Row */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 32, justifyContent: isWeb ? 'flex-start' : 'center' }}>
                            <AnimatedPressable
                                preset="button"
                                onPress={() => playSong(song)}
                                style={{
                                    height: 56, paddingHorizontal: 32, borderRadius: 28,
                                    backgroundColor: isDark ? '#22c55e' : '#dcfce7', flexDirection: 'row', alignItems: 'center', gap: 8,
                                    shadowColor: '#22c55e', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.3 : 0.2, shadowRadius: 16, elevation: 6
                                }}
                            >
                                <Play size={24} color={isDark ? '#000' : '#0f172a'} fill={isDark ? '#000' : '#0f172a'} />
                                <Text style={{ fontSize: 17, fontWeight: '700', color: isDark ? '#000' : '#0f172a' }}>Play</Text>
                            </AnimatedPressable>

                            {[Heart, Share, MoreHorizontal].map((Icon, idx) => (
                                <AnimatedPressable
                                    key={idx}
                                    preset="icon"
                                    style={{
                                        width: 56, height: 56, borderRadius: 28,
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#fff',
                                        alignItems: 'center', justifyContent: 'center',
                                        borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#f1f5f9',
                                    }}
                                >
                                    <Icon size={22} color={colors.text.primary} />
                                </AnimatedPressable>
                            ))}
                        </View>

                        {/* Lyrics Section */}
                        {song.lyrics && (
                            <View style={{ marginBottom: 32, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.5)', padding: 24, borderRadius: 16, width: '100%' }}>
                                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text.primary, marginBottom: 12 }}>Lyrics</Text>
                                <Text style={{ fontSize: 16, color: colors.text.secondary, lineHeight: 24, fontStyle: 'italic' }}>
                                    {song.lyrics}
                                </Text>
                            </View>
                        )}

                        {/* Credits Section */}
                        {song.credits && (
                            <View style={{ marginBottom: 32, backgroundColor: isDark ? colors.bg.card : '#fff', padding: 24, borderRadius: 16, width: '100%' }}>
                                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text.primary, marginBottom: 20 }}>Credits</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 40 }}>
                                    {[
                                        { label: 'Performed by', value: song.credits.performedBy },
                                        { label: 'Produced by', value: song.credits.producedBy },
                                        { label: 'Written by', value: song.credits.writtenBy },
                                        { label: 'Release Date', value: song.credits.releaseDate },
                                    ].map((credit, idx) => (
                                        <View key={idx}>
                                            <Text style={{ fontSize: 13, color: colors.text.muted, marginBottom: 4 }}>{credit.label}</Text>
                                            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text.primary }}>{credit.value}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* Stats Row */}
                        <GlassCard style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20, width: '100%' }}>
                            <View style={{ alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Play size={16} color="#38b4ba" />
                                    <Text style={{ color: colors.text.primary, fontWeight: '800', fontSize: 18, marginLeft: 4 }}>{formatPlays(song.plays)}</Text>
                                </View>
                                <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>Plays</Text>
                            </View>
                            <View style={{ alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Heart size={16} color="#ef4444" />
                                    <Text style={{ color: colors.text.primary, fontWeight: '800', fontSize: 18, marginLeft: 4 }}>{formatPlays(song.likes)}</Text>
                                </View>
                                <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>Likes</Text>
                            </View>
                            <View style={{ alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Clock size={16} color={colors.text.secondary} />
                                    <Text style={{ color: colors.text.primary, fontWeight: '800', fontSize: 18, marginLeft: 4 }}>{song.duration}</Text>
                                </View>
                                <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>Duration</Text>
                            </View>
                        </GlassCard>

                        {/* NFT Section */}
                        {song.isNFT && (
                            <GlassCard intensity="heavy" style={{ marginBottom: 20, width: '100%' }}>
                                <Text style={{ fontSize: 36, fontWeight: '800', color: '#8b5cf6', letterSpacing: -1, textAlign: 'center' }}>{song.price} ETH</Text>
                                <Text style={{ color: colors.text.secondary, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
                                    {song.editionsSold} of {song.totalEditions} editions sold
                                </Text>
                                <AnimatedPressable
                                    preset="button"
                                    style={{
                                        backgroundColor: '#8b5cf6', borderRadius: 20, paddingVertical: 16, alignItems: 'center', marginTop: 16,
                                        shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 6 },
                                        shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
                                    }}
                                >
                                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Collect Now</Text>
                                </AnimatedPressable>
                            </GlassCard>
                        )}
                    </View>
                </View>

                {/* More by Artist */}
                {moreSongs.length > 0 && (
                    <View style={isWeb ? { maxWidth: 1200, alignSelf: 'center', width: '100%', marginTop: 40, paddingHorizontal: 16 } : { paddingHorizontal: 16 }}>
                        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, marginBottom: 16 }}>
                            More by {song.artistName}
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 32 }}>
                            {moreSongs.map((s) => (
                                <SongCard
                                    key={s.id}
                                    cover={s.coverImage}
                                    title={s.title}
                                    artist={s.artistName}
                                    isNFT={s.isNFT}
                                    price={s.price}
                                    onPress={() => router.push({ pathname: '/(consumer)/song-detail', params: { id: s.id } })}
                                    onPlay={() => playSong(s)}
                                />
                            ))}
                        </ScrollView>
                    </View>
                )}
                <View style={{ height: 32 }} />
            </View>
        </ScreenScaffold>
    );
}

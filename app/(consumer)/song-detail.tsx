import React, { useState } from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator, Share as RNShare, Alert, ActionSheetIOS } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Play, Heart, Clock, ChevronLeft, Share, MoreHorizontal } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import GlassCard from '../../src/components/shared/GlassCard';
import GenreTag from '../../src/components/shared/GenreTag';
import SongCard from '../../src/components/shared/SongCard';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import { useTheme } from '../../src/context/ThemeContext';
import { usePlayer } from '../../src/context/PlayerContext';
import { useSongById, useArtistSongs, useNFTReleases, useIsLiked } from '../../src/hooks/useData';
import PlaylistSelectionSheet from '../../src/components/shared/PlaylistSelectionSheet';

function formatPlays(count: number): string {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
}

export default function SongDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const isWeb = Platform.OS === 'web';
    const { isDark, colors } = useTheme();
    const { playSong } = usePlayer();
    const [showPlaylistSheet, setShowPlaylistSheet] = useState(false);

    // Real data hooks
    const { data: song, loading: loadingSong, error: songError } = useSongById(id);
    const { data: moreSongs, loading: loadingMore } = useArtistSongs(song?._creatorId);
    const { data: nftReleases } = useNFTReleases(id);
    const { liked, toggle: toggleLike } = useIsLiked(id);

    const filteredMoreSongs = moreSongs.filter((s) => s.id !== id);
    const nftRelease = nftReleases[0]; // first release for this song

    if (loadingSong) {
        return (
            <ScreenScaffold dominantColor="#38b4ba" contentContainerStyle={{ paddingBottom: 120 }}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 }}>
                    <ActivityIndicator size="large" color="#38b4ba" />
                </View>
            </ScreenScaffold>
        );
    }

    if (!song) {
        return (
            <ScreenScaffold dominantColor="#38b4ba" contentContainerStyle={{ paddingBottom: 120 }}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 }}>
                    <Text style={{ color: colors.text.secondary, fontSize: 16 }}>
                        {songError || 'Song not found'}
                    </Text>
                    <AnimatedPressable preset="button" onPress={() => router.back()} style={{ marginTop: 16 }}>
                        <Text style={{ color: '#38b4ba', fontWeight: '700' }}>Go Back</Text>
                    </AnimatedPressable>
                </View>
            </ScreenScaffold>
        );
    }

    return (
    <>
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

                {/* Cover Art & Content */}
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

                    {/* Details */}
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
                                    backgroundColor: '#89d2d6', flexDirection: 'row', alignItems: 'center', gap: 8,
                                    shadowColor: '#89d2d6', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 6
                                }}
                            >
                                <Play size={24} color="#0f172a" fill="#0f172a" />
                                <Text style={{ fontSize: 17, fontWeight: '700', color: '#0f172a' }}>Play</Text>
                            </AnimatedPressable>

                            <AnimatedPressable
                                preset="icon"
                                onPress={toggleLike}
                                style={{
                                    width: 56, height: 56, borderRadius: 28,
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#fff',
                                    alignItems: 'center', justifyContent: 'center',
                                    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#f1f5f9',
                                }}
                            >
                                <Heart size={22} color={liked ? '#ef4444' : colors.text.primary} fill={liked ? '#ef4444' : 'transparent'} />
                            </AnimatedPressable>

                            {/* Share Button */}
                            <AnimatedPressable
                                preset="icon"
                                onPress={async () => {
                                    const shareUrl = `https://mu6.app/song/${song.id}`;
                                    const shareMessage = `🎵 Listen to "${song.title}" by ${song.artistName} on MU6`;
                                    if (Platform.OS === 'web') {
                                        if (navigator.share) {
                                            try { await navigator.share({ title: song.title, text: shareMessage, url: shareUrl }); } catch {}
                                        } else {
                                            await Clipboard.setStringAsync(shareUrl);
                                            alert('Link copied to clipboard!');
                                        }
                                    } else {
                                        try { await RNShare.share({ message: `${shareMessage}\n${shareUrl}` }); } catch {}
                                    }
                                }}
                                style={{
                                    width: 56, height: 56, borderRadius: 28,
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#fff',
                                    alignItems: 'center', justifyContent: 'center',
                                    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#f1f5f9',
                                }}
                            >
                                <Share size={22} color={colors.text.primary} />
                            </AnimatedPressable>

                            {/* More Options Button */}
                            <AnimatedPressable
                                preset="icon"
                                onPress={() => {
                                    const options = ['Add to Playlist', 'View Artist', 'Report', 'Cancel'];
                                    const cancelIdx = 3;
                                    if (Platform.OS === 'ios') {
                                        ActionSheetIOS.showActionSheetWithOptions(
                                            { options, cancelButtonIndex: cancelIdx, destructiveButtonIndex: 2 },
                                            (idx) => {
                                                if (idx === 0) setShowPlaylistSheet(true);
                                                if (idx === 1) router.push({ pathname: '/(consumer)/artist-profile', params: { id: song._creatorId || '' } });
                                                if (idx === 2) Alert.alert('Report Submitted', 'Thank you. We\'ll review this content.');
                                            }
                                        );
                                    } else {
                                        Alert.alert('Options', undefined, [
                                            { text: 'Add to Playlist', onPress: () => setShowPlaylistSheet(true) },
                                            { text: 'View Artist', onPress: () => router.push({ pathname: '/(consumer)/artist-profile', params: { id: song._creatorId || '' } }) },
                                            { text: 'Report', style: 'destructive', onPress: () => Alert.alert('Report Submitted', 'Thank you. We\'ll review this content.') },
                                            { text: 'Cancel', style: 'cancel' },
                                        ]);
                                    }
                                }}
                                style={{
                                    width: 56, height: 56, borderRadius: 28,
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#fff',
                                    alignItems: 'center', justifyContent: 'center',
                                    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#f1f5f9',
                                }}
                            >
                                <MoreHorizontal size={22} color={colors.text.primary} />
                            </AnimatedPressable>
                        </View>

                        {/* Lyrics */}
                        {song.lyrics && (
                            <View style={{ marginBottom: 32, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.5)', padding: 24, borderRadius: 16, width: '100%' }}>
                                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text.primary, marginBottom: 12 }}>Lyrics</Text>
                                <Text style={{ fontSize: 16, color: colors.text.secondary, lineHeight: 24, fontStyle: 'italic' }}>
                                    {song.lyrics}
                                </Text>
                            </View>
                        )}

                        {/* Credits */}
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

                        {/* Stats */}
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
                        {nftRelease && (
                            <GlassCard intensity="heavy" style={{ marginBottom: 20, width: '100%' }}>
                                <Text style={{ fontSize: 36, fontWeight: '800', color: '#8b5cf6', letterSpacing: -1, textAlign: 'center' }}>{nftRelease.price} POL</Text>
                                <Text style={{ color: colors.text.secondary, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
                                    {nftRelease.mintedCount ?? nftRelease.editionNumber} of {nftRelease.totalEditions} editions minted
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
                {filteredMoreSongs.length > 0 && (
                    <View style={isWeb ? { maxWidth: 1200, alignSelf: 'center', width: '100%', marginTop: 40, paddingHorizontal: 16 } : { paddingHorizontal: 16 }}>
                        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, marginBottom: 16 }}>
                            More by {song.artistName}
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 32 }}>
                            {filteredMoreSongs.map((s) => (
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

        <PlaylistSelectionSheet
            visible={showPlaylistSheet}
            songId={id}
            onClose={() => setShowPlaylistSheet(false)}
        />
    </>
    );
}

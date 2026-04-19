import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, Alert, Animated, Platform } from 'react-native';
import { useResponsive } from '../../src/hooks/useResponsive';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Play, Shuffle, Trash2, Edit2, ChevronLeft, MoreVertical } from 'lucide-react-native';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import SongRow from '../../src/components/shared/SongRow';
import { useTheme } from '../../src/context/ThemeContext';
import { usePlayer } from '../../src/context/PlayerContext';
import { useAuth } from '../../src/context/AuthContext';
import { adaptSong } from '../../src/hooks/useData';
import * as db from '../../src/services/database';
import { Song } from '../../src/types';

export default function PlaylistDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { isDesktopLayout } = useResponsive();
    const insets = useSafeAreaInsets();
    const { isDark, colors } = useTheme();
    const { playSong, playQueue } = usePlayer();
    const { profile } = useAuth();
    const scrollY = React.useRef(new Animated.Value(0)).current;

    const [playlist, setPlaylist] = useState<db.PlaylistRow | null>(null);
    const [songs, setSongs] = useState<Song[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchPlaylist = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        const data = await db.getPlaylistById(id);
        if (data) {
            setPlaylist(data);
            const adapted = (data.songs || []).map(s => adaptSong(s));
            setSongs(adapted);
        }
        setLoading(false);
    }, [id]);

    useFocusEffect(useCallback(() => { fetchPlaylist(); }, [fetchPlaylist]));

    const handlePlayAll = () => {
        if (songs.length > 0) {
            playQueue(songs, 0);
        }
    };

    const handleShufflePlay = () => {
        if (songs.length > 0) {
            const shuffled = [...songs].sort(() => Math.random() - 0.5);
            playQueue(shuffled, 0);
        }
    };

    const handleDeletePlaylist = () => {
        if (!playlist) return;
        Alert.alert('Delete Playlist', `Are you sure you want to delete "${playlist.name}"?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    await db.deletePlaylist(playlist.id);
                    router.back();
                },
            },
        ]);
    };

    const handleRemoveSong = async (songId: string) => {
        if (!playlist) return;
        await db.removeSongFromPlaylist(playlist.id, songId);
        setSongs(prev => prev.filter(s => s.id !== songId));
    };

    const isOwner = profile?.id === playlist?.ownerId;

    if (loading) {
        return (
            <ScreenScaffold dominantColor="#38b4ba">
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 }}>
                    <ActivityIndicator size="large" color="#38b4ba" />
                </View>
            </ScreenScaffold>
        );
    }

    if (!playlist) {
        return (
            <ScreenScaffold dominantColor="#38b4ba">
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 }}>
                    <Text style={{ color: colors.text.secondary, fontSize: 16 }}>Playlist not found</Text>
                    <AnimatedPressable preset="button" onPress={() => router.back()} style={{ marginTop: 16 }}>
                        <Text style={{ color: '#38b4ba', fontWeight: '700' }}>Go Back</Text>
                    </AnimatedPressable>
                </View>
            </ScreenScaffold>
        );
    }

    const coverImage = songs.length > 0 ? songs[0].coverImage : undefined;

    const renderHeader = () => (
        <View>
            {/* Back button */}
            <View style={{ paddingHorizontal: isDesktopLayout ? 32 : 16, marginBottom: 16 }}>
                <AnimatedPressable preset="icon" onPress={() => router.back()} style={{ padding: 4, alignSelf: 'flex-start' }}>
                    <ChevronLeft size={24} color={colors.text.primary} />
                </AnimatedPressable>
            </View>

            {/* Playlist Header */}
            <View style={{ paddingHorizontal: isDesktopLayout ? 32 : 16, marginBottom: 24, alignItems: 'center' }}>
                {coverImage && (
                    <Image
                        source={{ uri: coverImage }}
                        style={{ width: 180, height: 180, borderRadius: 16, marginBottom: 20, backgroundColor: isDark ? '#1e293b' : '#e2e8f0' }}
                        contentFit="cover"
                    />
                )}
                <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text.primary, textAlign: 'center', marginBottom: 6 }}>
                    {playlist.name}
                </Text>
                {playlist.description && (
                    <Text style={{ fontSize: 14, color: colors.text.secondary, textAlign: 'center', marginBottom: 8 }}>
                        {playlist.description}
                    </Text>
                )}
                <Text style={{ fontSize: 13, color: colors.text.muted }}>
                    {songs.length} {songs.length === 1 ? 'song' : 'songs'}
                </Text>
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, paddingHorizontal: isDesktopLayout ? 32 : 16, marginBottom: 24 }}>
                <AnimatedPressable
                    preset="button"
                    onPress={handlePlayAll}
                    style={{
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24,
                        backgroundColor: colors.accent.cyan,
                    }}
                >
                    <Play size={18} color="#000" fill="#000" />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#000' }}>Play All</Text>
                </AnimatedPressable>

                <AnimatedPressable
                    preset="button"
                    onPress={handleShufflePlay}
                    style={{
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
                    }}
                >
                    <Shuffle size={18} color={colors.text.primary} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }}>Shuffle</Text>
                </AnimatedPressable>

                {isOwner && (
                    <AnimatedPressable
                        preset="icon"
                        onPress={handleDeletePlaylist}
                        style={{
                            paddingHorizontal: 12, paddingVertical: 12, borderRadius: 24,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
                        }}
                    >
                        <Trash2 size={18} color={colors.text.secondary} />
                    </AnimatedPressable>
                )}
            </View>
        </View>
    );

    return (
        <ScreenScaffold dominantColor="#38b4ba" noScroll scrollY={scrollY}>
            <View style={{ flex: 1, maxWidth: isDesktopLayout ? 800 : undefined, width: '100%' as any, alignSelf: 'center' as any }}>
                <FlatList
                    data={songs}
                    ListHeaderComponent={renderHeader}
                    renderItem={({ item, index }) => (
                        <SongRow
                            cover={item.coverImage}
                            title={item.title}
                            artist={item.artistName}
                            plays={item.plays}
                            likes={item.likes}
                            isNFT={item.isNFT}
                            song={item}
                            onPress={() => playSong(item, { songs, startIndex: index })}
                        />
                    )}
                    keyExtractor={(item) => item.id}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                        paddingHorizontal: isDesktopLayout ? 32 : 16,
                        paddingTop: Platform.OS === 'web' ? 80 : insets.top + 44,
                        paddingBottom: 140,
                    }}
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                        { useNativeDriver: false }
                    )}
                    scrollEventThrottle={16}
                    ListEmptyComponent={() => (
                        <View style={{ alignItems: 'center', paddingTop: 40 }}>
                            <Text style={{ color: colors.text.secondary, fontSize: 16, fontWeight: '600' }}>
                                No songs in this playlist
                            </Text>
                            <Text style={{ color: colors.text.muted, fontSize: 13, marginTop: 4 }}>
                                Use the 3-dot menu on any song to add it here.
                            </Text>
                        </View>
                    )}
                />
            </View>
        </ScreenScaffold>
    );
}

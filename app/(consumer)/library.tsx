import React, { useState, useRef, useCallback } from 'react';
import { View, Text, ScrollView, FlatList, Platform, useWindowDimensions, Animated, ActivityIndicator, Modal } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import AvatarDisplay from '../../src/components/shared/AvatarDisplay';
import { BadgeCheck, X, ListMusic, Plus, Clock } from 'lucide-react-native';
import TabPill from '../../src/components/shared/TabPill';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import SongRow from '../../src/components/shared/SongRow';
import NFTCard from '../../src/components/shared/NFTCard';
import NFTGroupCard from '../../src/components/shared/NFTGroupCard';
import CreatePlaylistModal from '../../src/components/shared/CreatePlaylistModal';
import { Song, NFT, Artist, Playlist } from '../../src/types';
import { useLikedSongs, useArtists, useOwnedNFTs } from '../../src/hooks/useData';
import { usePlayer } from '../../src/context/PlayerContext';
import { useAuth } from '../../src/context/AuthContext';
import * as db from '../../src/services/database';
import ErrorState from '../../src/components/shared/ErrorState';

const isWeb = Platform.OS === 'web';
const tabs = ['Songs', 'Playlists', 'NFTs', 'Creators'];

import { useTheme } from '../../src/context/ThemeContext';

/* ─── Creator Row ─── */
function CreatorRow({ item, onPress }: { item: Artist; onPress: () => void }) {
    const { isDark, colors } = useTheme();

    return (
        <AnimatedPressable
            preset="row"
            onPress={onPress}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 8,
                padding: 14,
                borderRadius: 16,
                backgroundColor: isWeb ? (isDark ? colors.bg.card : '#f8fafc') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)'),
                borderWidth: 1,
                borderColor: isWeb ? (isDark ? colors.border.base : '#f1f5f9') : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)'),
            }}
        >
            <View style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                padding: 2,
                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)',
                borderWidth: 1.5,
                borderColor: isWeb ? (isDark ? colors.border.base : '#e2e8f0') : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.4)'),
            }}>
                <AvatarDisplay uri={item.avatar} size={46} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }}>{item.name}</Text>
                    {item.verified && (
                        <View style={{ marginLeft: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: '#8b5cf6', alignItems: 'center', justifyContent: 'center' }}>
                            <BadgeCheck size={11} color="#fff" />
                        </View>
                    )}
                </View>
                <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 2 }}>
                    {item.followers >= 1000 ? `${(item.followers / 1000).toFixed(1)}K` : item.followers} followers
                </Text>
            </View>
        </AnimatedPressable>
    );
}

export default function LibraryScreen() {
    const [activeTab, setActiveTab] = useState('Songs');
    const router = useRouter();
    const { width } = useWindowDimensions();
    const { isDark, colors } = useTheme();
    const insets = useSafeAreaInsets();
    const scrollY = useRef(new Animated.Value(0)).current;
    const { playSong, playHistory } = usePlayer();
    const { profile } = useAuth();

    // Real data hooks
    const { data: likedSongs, loading: loadingSongs, error: errorSongs, refresh: refreshLiked } = useLikedSongs();
    const { data: artists, loading: loadingArtists, error: errorArtists, refresh: refreshArtists } = useArtists(20);
    const { data: ownedNFTs, loading: loadingNFTs, error: errorNFTs, refresh: refreshNFTs } = useOwnedNFTs();

    // Playlist state
    const [playlists, setPlaylists] = useState<db.PlaylistRow[]>([]);
    const [loadingPlaylists, setLoadingPlaylists] = useState(false);
    const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);

    const [groupModalVisible, setGroupModalVisible] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<NFT[]>([]);

    const groupedNFTs = React.useMemo(() => {
        const groups: Record<string, NFT[]> = {};
        for (const nft of (ownedNFTs || [])) {
            if (!groups[nft.songId]) groups[nft.songId] = [];
            groups[nft.songId].push(nft);
        }
        return Object.values(groups);
    }, [ownedNFTs]);

    const fetchPlaylists = useCallback(async () => {
        if (!profile?.id) return;
        setLoadingPlaylists(true);
        const data = await db.getPlaylists(profile.id);
        setPlaylists(data);
        setLoadingPlaylists(false);
    }, [profile?.id]);

    useFocusEffect(
        useCallback(() => {
            refreshLiked();
            refreshArtists();
            refreshNFTs();
            fetchPlaylists();
        }, [refreshLiked, refreshArtists, refreshNFTs, fetchPlaylists])
    );

    const numCols = isWeb ? (width > 1200 ? 4 : width > 800 ? 3 : 2) : 2;

    const isLoading = (activeTab === 'Songs' && loadingSongs) ||
                      (activeTab === 'Creators' && loadingArtists) ||
                      (activeTab === 'NFTs' && loadingNFTs) ||
                      (activeTab === 'Playlists' && loadingPlaylists);

    const recentlyPlayed = playHistory.slice(0, 20);

    const renderSong = ({ item, index }: { item: Song; index: number }) => (
        <SongRow
            cover={item.coverImage}
            title={item.title}
            artist={item.artistName}
            plays={item.plays}
            likes={item.likes}
            isNFT={item.isNFT}
            song={item}
            onPress={() => playSong(item, { songs: likedSongs, startIndex: index })}
        />
    );

    const renderRecentSong = ({ item, index }: { item: Song; index: number }) => (
        <SongRow
            cover={item.coverImage}
            title={item.title}
            artist={item.artistName}
            plays={item.plays}
            likes={item.likes}
            isNFT={item.isNFT}
            song={item}
            onPress={() => playSong(item, { songs: recentlyPlayed, startIndex: index })}
        />
    );

    const renderCreator = ({ item }: { item: Artist }) => (
        <CreatorRow
            item={item}
            onPress={() => router.push({ pathname: '/(consumer)/artist-profile', params: { id: item.id } })}
        />
    );

    const renderPlaylist = ({ item }: { item: db.PlaylistRow }) => (
        <AnimatedPressable
            preset="row"
            onPress={() => router.push({ pathname: '/(consumer)/playlist-detail', params: { id: item.id } })}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 8,
                padding: 14,
                borderRadius: 16,
                backgroundColor: isWeb ? (isDark ? colors.bg.card : '#f8fafc') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)'),
                borderWidth: 1,
                borderColor: isWeb ? (isDark ? colors.border.base : '#f1f5f9') : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)'),
            }}
        >
            <View style={{
                width: 52, height: 52, borderRadius: 12,
                backgroundColor: isDark ? 'rgba(56,180,186,0.1)' : 'rgba(56,180,186,0.08)',
                alignItems: 'center', justifyContent: 'center',
            }}>
                <ListMusic size={22} color={colors.accent.cyan} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }}>{item.name}</Text>
                <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 2 }}>
                    {item.songCount || 0} songs
                </Text>
            </View>
        </AnimatedPressable>
    );

    const renderHeader = () => (
        <View>
            <View style={{ paddingHorizontal: isWeb ? 32 : 16, marginBottom: 8 }}>
                {!isWeb && (
                    <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>Library</Text>
                )}
            </View>

            {/* Recently Played Section */}
            {recentlyPlayed.length > 0 && activeTab === 'Songs' && (
                <View style={{ paddingHorizontal: isWeb ? 32 : 16, marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <Clock size={16} color={colors.accent.cyan} style={{ marginRight: 8 }} />
                        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary }}>Recently Played</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {recentlyPlayed.slice(0, 10).map((song, i) => (
                            <AnimatedPressable
                                key={`recent-${song.id}-${i}`}
                                preset="card"
                                onPress={() => playSong(song, { songs: recentlyPlayed, startIndex: i })}
                                style={{ width: 120, marginRight: 12 }}
                            >
                                <Image
                                    source={{ uri: song.coverImage }}
                                    style={{ width: 120, height: 120, borderRadius: 12, backgroundColor: isDark ? '#1e293b' : '#e2e8f0' }}
                                    contentFit="cover"
                                />
                                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.primary, marginTop: 6 }} numberOfLines={1}>
                                    {song.title}
                                </Text>
                                <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 1 }} numberOfLines={1}>
                                    {song.artistName}
                                </Text>
                            </AnimatedPressable>
                        ))}
                    </ScrollView>
                </View>
            )}

            <View style={{ paddingHorizontal: isWeb ? 32 : 16, marginBottom: 12 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }}>
                    {tabs.map((tab) => (
                        <TabPill key={tab} label={tab} active={activeTab === tab} onPress={() => setActiveTab(tab)} />
                    ))}
                </ScrollView>
            </View>

            {/* Create Playlist button */}
            {activeTab === 'Playlists' && (
                <View style={{ paddingHorizontal: isWeb ? 32 : 16, marginBottom: 12 }}>
                    <AnimatedPressable
                        preset="button"
                        onPress={() => setShowCreatePlaylist(true)}
                        style={{
                            flexDirection: 'row', alignItems: 'center', gap: 8,
                            paddingVertical: 12, paddingHorizontal: 16,
                            borderRadius: 12,
                            backgroundColor: isDark ? 'rgba(56,180,186,0.1)' : 'rgba(56,180,186,0.08)',
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(56,180,186,0.2)' : 'rgba(56,180,186,0.15)',
                        }}
                    >
                        <Plus size={18} color={colors.accent.cyan} />
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent.cyan }}>
                            Create Playlist
                        </Text>
                    </AnimatedPressable>
                </View>
            )}

            {isLoading && (
                <View style={{ padding: 40, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#38b4ba" />
                </View>
            )}
        </View>
    );

    const getData = () => {
        if (activeTab === 'Songs') return likedSongs;
        if (activeTab === 'Creators') return artists;
        if (activeTab === 'Playlists') return playlists;
        return [];
    };

    const renderItem = ({ item, index }: { item: any; index: number }) => {
        if (activeTab === 'Songs') return renderSong({ item, index });
        if (activeTab === 'Creators') return renderCreator({ item });
        if (activeTab === 'Playlists') return renderPlaylist({ item });
        return null;
    };

    return (
        <ScreenScaffold dominantColor="#38b4ba" noScroll scrollY={scrollY}>
            <View style={{ flex: 1, maxWidth: isWeb ? 1100 : undefined, width: '100%' as any, alignSelf: 'center' as any }}>
                {activeTab === 'NFTs' ? (
                    <FlatList
                        data={loadingNFTs ? [] : groupedNFTs}
                        ListHeaderComponent={renderHeader}
                        renderItem={({ item }: { item: NFT[] }) => {
                            const firstItem = item[0];
                            const badgeText = `${item.length} Owned`;
                            return (
                                <View style={{ width: `${100 / numCols}%` as any, maxWidth: isWeb ? 280 : undefined }}>
                                    <NFTGroupCard
                                        cover={firstItem.coverImage}
                                        title={firstItem.songTitle}
                                        artist={firstItem.artistName}
                                        badgeText={badgeText}
                                        onPress={() => {
                                            setSelectedGroup(item);
                                            setGroupModalVisible(true);
                                        }}
                                    />
                                </View>
                            );
                        }}
                        keyExtractor={(item) => item[0].id}
                        numColumns={numCols}
                        key={`grid-${numCols}`}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{
                            paddingHorizontal: isWeb ? 26 : 10,
                            paddingTop: isWeb ? 80 : insets.top + 44,
                            paddingBottom: 100,
                        }}
                        onScroll={Animated.event(
                            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                            { useNativeDriver: false }
                        )}
                        scrollEventThrottle={16}
                        ListEmptyComponent={() => !isLoading ? (
                            errorNFTs ? (
                                <ErrorState message={errorNFTs} onRetry={refreshNFTs} />
                            ) : (
                                <View style={{ alignItems: 'center', paddingTop: 60 }}>
                                    <Text style={{ color: colors.text.secondary, fontSize: 16, fontWeight: '600' }}>No NFTs in your collection yet</Text>
                                    <Text style={{ color: colors.text.muted, fontSize: 13, marginTop: 4 }}>Mint or buy NFTs from the Marketplace.</Text>
                                </View>
                            )
                        ) : null}
                    />
                ) : (
                    <FlatList
                        data={isLoading ? [] : getData()}
                        ListHeaderComponent={renderHeader}
                        renderItem={renderItem}
                        keyExtractor={(item) => item.id}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{
                            paddingHorizontal: isWeb ? 32 : 16,
                            paddingTop: isWeb ? 80 : insets.top + 44,
                            paddingBottom: 100,
                        }}
                        onScroll={Animated.event(
                            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                            { useNativeDriver: false }
                        )}
                        scrollEventThrottle={16}
                        ListEmptyComponent={() => {
                            if (isLoading) return null;
                            if (activeTab === 'Playlists') {
                                return (
                                    <View style={{ alignItems: 'center', paddingTop: 60 }}>
                                        <Text style={{ color: colors.text.secondary, fontSize: 16, fontWeight: '600' }}>No playlists yet</Text>
                                        <Text style={{ color: colors.text.muted, fontSize: 13, marginTop: 4 }}>Create your first playlist above.</Text>
                                    </View>
                                );
                            }
                            const currentError = activeTab === 'Songs' ? errorSongs : errorArtists;
                            const currentRefresh = activeTab === 'Songs' ? refreshLiked : refreshArtists;
                            if (currentError) return <ErrorState message={currentError} onRetry={currentRefresh} />;
                            return (
                                <View style={{ alignItems: 'center', paddingTop: 60 }}>
                                    <Text style={{ color: colors.text.secondary, fontSize: 16, fontWeight: '600' }}>
                                        {activeTab === 'Songs' ? 'No liked songs yet' : 'No creators to show'}
                                    </Text>
                                    <Text style={{ color: colors.text.muted, fontSize: 13, marginTop: 4 }}>
                                        {activeTab === 'Songs' ? 'Like songs to see them here.' : 'Discover creators on the home page.'}
                                    </Text>
                                </View>
                            );
                        }}
                    />
                )}
            </View>

            {/* ── Group Details Modal ── */}
            <Modal
                visible={groupModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setGroupModalVisible(false)}
            >
                <View style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    justifyContent: 'flex-end',
                }}>
                    <View style={{
                        backgroundColor: isDark ? '#1a1a2e' : '#ffffff',
                        borderTopLeftRadius: 28,
                        borderTopRightRadius: 28,
                        paddingTop: 8,
                        paddingBottom: Math.max(insets.bottom, 20),
                        maxHeight: '85%',
                    }}>
                        <View style={{
                            width: 40, height: 4, borderRadius: 2,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                            alignSelf: 'center', marginBottom: 16,
                        }} />

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
                            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                                {selectedGroup[0]?.songTitle || 'Collection'}
                            </Text>
                            <AnimatedPressable preset="icon" onPress={() => setGroupModalVisible(false)}>
                                <X size={22} color={colors.text.secondary} />
                            </AnimatedPressable>
                        </View>

                        <ScrollView contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 40 }}>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                {selectedGroup.map((item) => (
                                    <View key={item.id} style={{ width: '50%', padding: 6 }}>
                                        <NFTCard
                                            cover={item.coverImage}
                                            title={item.songTitle}
                                            artist={item.artistName}
                                            price={item.price}
                                            editionNumber={item.editionNumber}
                                            totalEditions={item.totalEditions}
                                            rarity={item.rarity}
                                            variant="collection"
                                            onPress={() => {
                                                setGroupModalVisible(false);
                                                router.push({ pathname: '/(consumer)/nft-detail', params: { id: item.id } });
                                            }}
                                        />
                                    </View>
                                ))}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Create Playlist Modal */}
            <CreatePlaylistModal
                visible={showCreatePlaylist}
                onClose={() => setShowCreatePlaylist(false)}
                onCreated={(playlist) => {
                    setPlaylists(prev => [playlist, ...prev]);
                }}
            />
        </ScreenScaffold>
    );
}

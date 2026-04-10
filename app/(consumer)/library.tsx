import React, { useState, useRef, useCallback } from 'react';
import { View, Text, ScrollView, FlatList, Platform, useWindowDimensions, Animated, ActivityIndicator, Modal } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import AvatarDisplay from '../../src/components/shared/AvatarDisplay';
import { BadgeCheck, X } from 'lucide-react-native';
import TabPill from '../../src/components/shared/TabPill';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import SongRow from '../../src/components/shared/SongRow';
import NFTCard from '../../src/components/shared/NFTCard';
import NFTGroupCard from '../../src/components/shared/NFTGroupCard';
import { Song, NFT, Artist } from '../../src/types';
import { useLikedSongs, useArtists, useOwnedNFTs } from '../../src/hooks/useData';
import ErrorState from '../../src/components/shared/ErrorState';

const isWeb = Platform.OS === 'web';
const tabs = ['Songs', 'NFTs', 'Creators'];

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

    // Real data hooks
    const { data: likedSongs, loading: loadingSongs, error: errorSongs, refresh: refreshLiked } = useLikedSongs();
    const { data: artists, loading: loadingArtists, error: errorArtists, refresh: refreshArtists } = useArtists(20);
    const { data: ownedNFTs, loading: loadingNFTs, error: errorNFTs, refresh: refreshNFTs } = useOwnedNFTs();

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

    useFocusEffect(
        useCallback(() => {
            refreshLiked();
            refreshArtists();
            refreshNFTs();
        }, [refreshLiked, refreshArtists, refreshNFTs])
    );

    const numCols = isWeb ? (width > 1200 ? 4 : width > 800 ? 3 : 2) : 2;

    const isLoading = (activeTab === 'Songs' && loadingSongs) ||
                      (activeTab === 'Creators' && loadingArtists) ||
                      (activeTab === 'NFTs' && loadingNFTs);

    const renderSong = ({ item }: { item: Song }) => (
        <SongRow
            cover={item.coverImage}
            title={item.title}
            artist={item.artistName}
            plays={item.plays}
            likes={item.likes}
            isNFT={item.isNFT}
            onPress={() => router.push({ pathname: '/(consumer)/song-detail', params: { id: item.id } })}
        />
    );

    const renderCreator = ({ item }: { item: Artist }) => (
        <CreatorRow
            item={item}
            onPress={() => router.push({ pathname: '/(consumer)/artist-profile', params: { id: item.id } })}
        />
    );

    const renderHeader = () => (
        <View>
            <View style={{ paddingHorizontal: isWeb ? 32 : 16, marginBottom: 8 }}>
                {!isWeb && (
                    <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>Library</Text>
                )}
            </View>
            <View style={{ paddingHorizontal: isWeb ? 32 : 16, marginBottom: 12 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }}>
                    {tabs.map((tab) => (
                        <TabPill key={tab} label={tab} active={activeTab === tab} onPress={() => setActiveTab(tab)} />
                    ))}
                </ScrollView>
            </View>
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
        return [];
    };

    const renderItem = ({ item }: { item: any }) => {
        if (activeTab === 'Songs') return renderSong({ item });
        if (activeTab === 'Creators') return renderCreator({ item });
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
        </ScreenScaffold>
    );
}

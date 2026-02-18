import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, FlatList, Platform, useWindowDimensions, Animated, StyleSheet } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { BadgeCheck } from 'lucide-react-native';
import TabPill from '../../src/components/shared/TabPill';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import SongRow from '../../src/components/shared/SongRow';
import NFTCard from '../../src/components/shared/NFTCard';
import { songs } from '../../src/mock/songs';
import { nfts } from '../../src/mock/nfts';
import { artists } from '../../src/mock/artists';
import { Song, NFT, Artist } from '../../src/types';

const isWeb = Platform.OS === 'web';
const tabs = ['Songs', 'NFTs', 'Artists'];

import { useTheme } from '../../src/context/ThemeContext';

/* ─── Artist Row ─── */
function ArtistRow({ item, onPress }: { item: Artist; onPress: () => void }) {
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
                <Image source={{ uri: item.avatar }} style={{ width: 46, height: 46, borderRadius: 23 }} contentFit="cover" />
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

    const numCols = isWeb ? (width > 1200 ? 4 : width > 800 ? 3 : 2) : 2;

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

    const renderArtist = ({ item }: { item: Artist }) => (
        <ArtistRow
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
        </View>
    );

    const getData = () => {
        if (activeTab === 'Songs') return songs.slice(0, 8);
        if (activeTab === 'Artists') return artists;
        return []; // NFTs handled separately
    };

    const renderItem = ({ item }: { item: any }) => {
        if (activeTab === 'Songs') return renderSong({ item });
        if (activeTab === 'Artists') return renderArtist({ item });
        return null;
    };

    return (
        <ScreenScaffold dominantColor="#38b4ba" noScroll scrollY={scrollY}>
            <View style={{ flex: 1, maxWidth: isWeb ? 1100 : undefined, width: '100%' as any, alignSelf: 'center' as any }}>
                {activeTab === 'NFTs' ? (
                    <FlatList
                        data={nfts}
                        ListHeaderComponent={renderHeader}
                        renderItem={({ item }: { item: NFT }) => (
                            <View style={{ width: `${100 / numCols}%` as any, maxWidth: isWeb ? 280 : undefined }}>
                                <NFTCard
                                    cover={item.coverImage}
                                    title={item.songTitle}
                                    artist={item.artistName}
                                    price={item.price}
                                    editionNumber={item.editionNumber}
                                    totalEditions={item.totalEditions}
                                    rarity={item.rarity}
                                    onPress={() => router.push({ pathname: '/(consumer)/nft-detail', params: { id: item.id } })}
                                />
                            </View>
                        )}
                        keyExtractor={(item) => item.id}
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
                    />
                ) : (
                    <FlatList
                        data={getData()}
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
                    />
                )}
            </View>
        </ScreenScaffold>
    );
}

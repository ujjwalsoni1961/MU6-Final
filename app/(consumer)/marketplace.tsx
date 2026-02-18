import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, FlatList, Platform, useWindowDimensions, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import TabPill from '../../src/components/shared/TabPill';
import NFTCard from '../../src/components/shared/NFTCard';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import { nfts } from '../../src/mock/nfts';
import { NFT } from '../../src/types';

const isWeb = Platform.OS === 'web';
const filters = ['All', 'Trending', 'New', 'Rare', 'Legendary'];

import { useTheme } from '../../src/context/ThemeContext';

export default function MarketplaceScreen() {
    const [activeFilter, setActiveFilter] = useState('All');
    const router = useRouter();
    const { width } = useWindowDimensions();
    const { isDark, colors } = useTheme();
    const insets = useSafeAreaInsets();
    const scrollY = useRef(new Animated.Value(0)).current;

    const filteredNFTs = nfts.filter((nft) => {
        if (activeFilter === 'All' || activeFilter === 'Trending' || activeFilter === 'New') return true;
        if (activeFilter === 'Rare') return nft.rarity === 'rare';
        if (activeFilter === 'Legendary') return nft.rarity === 'legendary';
        return true;
    });

    const numCols = isWeb ? (width > 1200 ? 4 : width > 800 ? 3 : 2) : 2;

    const renderHeader = () => (
        <View>
            {/* Header */}
            <View style={{ paddingHorizontal: isWeb ? 32 : 16, marginBottom: 12 }}>
                {!isWeb && (
                    <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>Marketplace</Text>
                )}
                <Text style={{ fontSize: 14, color: colors.text.secondary, marginTop: isWeb ? 0 : 4 }}>Discover unique music NFTs</Text>
            </View>

            {/* Filter Pills */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 16, flexGrow: 0 }}
                contentContainerStyle={{ paddingHorizontal: isWeb ? 32 : 16, paddingVertical: 4 }}
            >
                {filters.map((filter) => (
                    <TabPill key={filter} label={filter} active={activeFilter === filter} onPress={() => setActiveFilter(filter)} />
                ))}
            </ScrollView>
        </View>
    );

    return (
        <ScreenScaffold dominantColor="#8b5cf6" noScroll scrollY={scrollY}>
            <View style={{ flex: 1, maxWidth: isWeb ? 1100 : undefined, width: '100%' as any, alignSelf: 'center' as any }}>
                <FlatList
                    data={filteredNFTs}
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
                    contentContainerStyle={{
                        paddingHorizontal: isWeb ? 26 : 10,
                        paddingTop: isWeb ? 80 : insets.top + 44,
                        paddingBottom: 100,
                    }}
                    showsVerticalScrollIndicator={false}
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                        { useNativeDriver: false }
                    )}
                    scrollEventThrottle={16}
                />
            </View>
        </ScreenScaffold>
    );
}

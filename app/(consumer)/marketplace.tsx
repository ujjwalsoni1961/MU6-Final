import React, { useState, useRef, useMemo } from 'react';
import { View, Text, ScrollView, FlatList, Platform, useWindowDimensions, Animated, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Zap, Tag } from 'lucide-react-native';
import TabPill from '../../src/components/shared/TabPill';
import NFTCard from '../../src/components/shared/NFTCard';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import { NFT } from '../../src/types';
import { useNFTReleases, useMarketplaceListings } from '../../src/hooks/useData';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';
const filters = ['All', 'Drops', 'Resale', 'Rare', 'Legendary'];

/** Unified marketplace item: either a primary drop (release) or secondary listing */
interface MarketplaceItem extends NFT {
    _type: 'drop' | 'listing';
    _listingId?: string;
    _sellerWallet?: string;
}

export default function MarketplaceScreen() {
    const [activeFilter, setActiveFilter] = useState('All');
    const router = useRouter();
    const { width } = useWindowDimensions();
    const { isDark, colors } = useTheme();
    const insets = useSafeAreaInsets();
    const scrollY = useRef(new Animated.Value(0)).current;

    // Both data sources
    const { data: nftReleases, loading: releasesLoading } = useNFTReleases();
    const { data: listings, loading: listingsLoading } = useMarketplaceListings();
    const loading = releasesLoading || listingsLoading;

    // Merge drops + listings into a unified list
    const allItems: MarketplaceItem[] = useMemo(() => {
        const drops: MarketplaceItem[] = nftReleases.map((r) => ({
            ...r,
            _type: 'drop' as const,
        }));
        const resale: MarketplaceItem[] = listings.map((l) => ({
            ...l,
            _type: 'listing' as const,
            _listingId: l.listingId,
            _sellerWallet: l.sellerWallet,
        }));
        return [...drops, ...resale];
    }, [nftReleases, listings]);

    // Apply filters
    const filteredItems = useMemo(() => {
        return allItems.filter((item) => {
            if (activeFilter === 'All') return true;
            if (activeFilter === 'Drops') return item._type === 'drop';
            if (activeFilter === 'Resale') return item._type === 'listing';
            if (activeFilter === 'Rare') return item.rarity === 'rare';
            if (activeFilter === 'Legendary') return item.rarity === 'legendary';
            return true;
        });
    }, [allItems, activeFilter]);

    const numCols = isWeb ? (width > 1200 ? 4 : width > 800 ? 3 : 2) : 2;

    const dropsCount = allItems.filter((i) => i._type === 'drop').length;
    const resaleCount = allItems.filter((i) => i._type === 'listing').length;

    const handleItemPress = (item: MarketplaceItem) => {
        if (item._type === 'listing' && item._listingId) {
            // Navigate to listing detail (secondary sale)
            router.push({
                pathname: '/(consumer)/nft-detail',
                params: { id: item.id, mode: 'listing', listingId: item._listingId },
            });
        } else {
            // Navigate to release detail (primary sale / mint)
            router.push({
                pathname: '/(consumer)/nft-detail',
                params: { id: item.id, mode: 'release' },
            });
        }
    };

    const renderHeader = () => (
        <View>
            <View style={{ paddingHorizontal: isWeb ? 32 : 16, marginBottom: 12 }}>
                {!isWeb && (
                    <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>Marketplace</Text>
                )}
                <Text style={{ fontSize: 14, color: colors.text.secondary, marginTop: isWeb ? 0 : 4 }}>
                    Discover unique music NFTs
                </Text>
            </View>

            {/* Stats pills */}
            <View style={{ flexDirection: 'row', paddingHorizontal: isWeb ? 32 : 16, gap: 10, marginBottom: 16 }}>
                <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: 'rgba(139,92,246,0.12)',
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                }}>
                    <Zap size={14} color="#8b5cf6" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#8b5cf6' }}>
                        {dropsCount} Drops
                    </Text>
                </View>
                <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: 'rgba(245,158,11,0.12)',
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                }}>
                    <Tag size={14} color="#f59e0b" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#f59e0b' }}>
                        {resaleCount} Resale
                    </Text>
                </View>
            </View>

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

            {loading && (
                <View style={{ padding: 40, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#38b4ba" />
                </View>
            )}
        </View>
    );

    const renderItem = ({ item }: { item: MarketplaceItem }) => (
        <View style={{ width: `${100 / numCols}%` as any, maxWidth: isWeb ? 280 : undefined }}>
            <View>
                <NFTCard
                    cover={item.coverImage}
                    title={item.songTitle}
                    artist={item.artistName}
                    price={item.price}
                    editionNumber={item.editionNumber}
                    totalEditions={item.totalEditions}
                    rarity={item.rarity}
                    onPress={() => handleItemPress(item)}
                />
                {/* Type badge below card */}
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    marginHorizontal: 6,
                    marginBottom: 4,
                    paddingVertical: 4,
                }}>
                    {item._type === 'drop' ? (
                        <>
                            <Zap size={11} color="#8b5cf6" />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                Primary
                            </Text>
                        </>
                    ) : (
                        <>
                            <Tag size={11} color="#f59e0b" />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                Resale
                            </Text>
                        </>
                    )}
                </View>
            </View>
        </View>
    );

    return (
        <ScreenScaffold dominantColor="#8b5cf6" noScroll scrollY={scrollY}>
            <View style={{ flex: 1, maxWidth: isWeb ? 1100 : undefined, width: '100%' as any, alignSelf: 'center' as any }}>
                <FlatList
                    data={loading ? [] : filteredItems}
                    ListHeaderComponent={renderHeader}
                    renderItem={renderItem}
                    keyExtractor={(item, index) => `${item._type}-${item.id}-${index}`}
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
                    ListEmptyComponent={() => !loading ? (
                        <View style={{ alignItems: 'center', paddingTop: 60 }}>
                            <Text style={{ color: colors.text.secondary, fontSize: 16 }}>No NFTs available</Text>
                        </View>
                    ) : null}
                />
            </View>
        </ScreenScaffold>
    );
}

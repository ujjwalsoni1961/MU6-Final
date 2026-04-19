import React, { useState, useRef, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, FlatList, useWindowDimensions, Animated, ActivityIndicator, Modal, RefreshControl, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Zap, Tag, X } from 'lucide-react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import TabPill from '../../src/components/shared/TabPill';
import NFTCard from '../../src/components/shared/NFTCard';
import NFTGroupCard from '../../src/components/shared/NFTGroupCard';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import { NFT } from '../../src/types';
import { useNFTReleases, useMarketplaceListings } from '../../src/hooks/useData';
import { useTheme } from '../../src/context/ThemeContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import ErrorState from '../../src/components/shared/ErrorState';
import { useResponsive } from '../../src/hooks/useResponsive';
const filters = ['All', 'Drops', 'Resale', 'Rare', 'Legendary'];

/** Unified marketplace item: either a primary drop (release) or secondary listing */
interface MarketplaceItem extends NFT {
    _type: 'drop' | 'listing';
    _listingId?: string;
    _sellerWallet?: string;
}

export default function MarketplaceScreen() {
    const [activeFilter, setActiveFilter] = useState('All');
    const [groupModalVisible, setGroupModalVisible] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<MarketplaceItem[]>([]);
    const router = useRouter();
    const { width } = useWindowDimensions();
    const { isDesktopLayout, isPhoneLayout } = useResponsive();
    const { isDark, colors } = useTheme();
    const { fiatCurrency } = useCurrency();
    const insets = useSafeAreaInsets();
    const scrollY = useRef(new Animated.Value(0)).current;

    // Both data sources
    const { data: nftReleases, loading: releasesLoading, error: releasesError, refresh: refreshReleases } = useNFTReleases();
    const { data: listings, loading: listingsLoading, error: listingsError, refresh: refreshListings } = useMarketplaceListings();
    const loading = releasesLoading || listingsLoading;
    const error = releasesError || listingsError;

    useFocusEffect(
        useCallback(() => {
            refreshReleases();
            refreshListings();
        }, [refreshReleases, refreshListings])
    );

    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            refreshReleases(),
            refreshListings(),
        ]);
        setRefreshing(false);
    }, [refreshReleases, refreshListings]);

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

    const groupedItems = useMemo(() => {
        const groups: Record<string, MarketplaceItem[]> = {};
        for (const item of filteredItems) {
            if (!groups[item.songId]) groups[item.songId] = [];
            groups[item.songId].push(item);
        }
        return Object.values(groups);
    }, [filteredItems]);

    const numCols = isDesktopLayout ? (width > 1200 ? 4 : width > 800 ? 3 : 2) : 2;

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
            <View style={{ paddingHorizontal: isDesktopLayout ? 32 : 16, marginBottom: 12 }}>
                {isPhoneLayout && (
                    <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>Marketplace</Text>
                )}
                <Text style={{ fontSize: 14, color: colors.text.secondary, marginTop: isDesktopLayout ? 0 : 4 }}>
                    {loading
                        ? 'Discover unique music NFTs'
                        : `${dropsCount} primary drop${dropsCount === 1 ? '' : 's'} · ${resaleCount} resale listing${resaleCount === 1 ? '' : 's'}`}
                </Text>
            </View>

            {/* Stats pills */}
            <View style={{ flexDirection: 'row', paddingHorizontal: isDesktopLayout ? 32 : 16, gap: 10, marginBottom: 16 }}>
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
                contentContainerStyle={{ paddingHorizontal: isDesktopLayout ? 32 : 16, paddingVertical: 4 }}
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

    const renderItem = ({ item }: { item: MarketplaceItem[] }) => {
        const firstItem = item[0];
        const drops = item.filter((i) => i._type === 'drop').length;
        const resale = item.filter((i) => i._type === 'listing').length;
        
        let badgeText = '';
        if (drops > 0 && resale > 0) badgeText = `${drops} Drop${drops > 1 ? 's' : ''} · ${resale} Resale`;
        else if (drops > 0) badgeText = `${drops} Drop${drops > 1 ? 's' : ''}`;
        else badgeText = `${resale} Resale`;

        return (
            <View style={{ width: `${100 / numCols}%` as any, maxWidth: isDesktopLayout ? 280 : undefined }}>
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
    };

    return (
        <>
            <ScreenScaffold dominantColor="#8b5cf6" noScroll scrollY={scrollY}>
            <View style={{ flex: 1, maxWidth: isDesktopLayout ? 1100 : undefined, width: '100%' as any, alignSelf: 'center' as any }}>
                <FlatList
                    data={loading ? [] : groupedItems}
                    ListHeaderComponent={renderHeader}
                    renderItem={renderItem}
                    keyExtractor={(item, index) => `${item[0].songId}-${index}`}
                    numColumns={numCols}
                    key={`grid-${numCols}`}
                    contentContainerStyle={{
                        paddingHorizontal: isDesktopLayout ? 26 : 10,
                        paddingTop: Platform.OS === 'web' ? 80 : insets.top + 44,
                        paddingBottom: 100,
                    }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={colors.accent.cyan}
                            colors={[colors.accent.cyan]}
                        />
                    }
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                        { useNativeDriver: false }
                    )}
                    scrollEventThrottle={16}
                    ListEmptyComponent={() => !loading ? (
                        error ? (
                            <ErrorState message={error} onRetry={() => { refreshReleases(); refreshListings(); }} />
                        ) : (
                            <View style={{ alignItems: 'center', paddingTop: 60 }}>
                                <Zap size={48} color={colors.text.muted} />
                                <Text style={{ color: colors.text.secondary, fontSize: 16, fontWeight: '600', marginTop: 16 }}>No NFTs available yet</Text>
                                <Text style={{ color: colors.text.muted, fontSize: 13, marginTop: 4, textAlign: 'center', paddingHorizontal: 32 }}>
                                    Music NFT drops and resale listings will appear here.
                                </Text>
                            </View>
                        )
                    ) : null}
                />
            </View>
        </ScreenScaffold>
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
                                {selectedGroup[0]?.songTitle || 'Marketplace'}
                            </Text>
                            <AnimatedPressable preset="icon" onPress={() => setGroupModalVisible(false)}>
                                <X size={22} color={colors.text.secondary} />
                            </AnimatedPressable>
                        </View>

                        <ScrollView contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 40 }}>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                {selectedGroup.map((item, index) => (
                                    <View key={`${item.id}-${index}`} style={{ width: '50%', padding: 6 }}>
                                        <View>
                                            <NFTCard
                                                cover={item.coverImage}
                                                title={item.songTitle}
                                                artist={item.artistName}
                                                price={item.price}
                                                editionNumber={item.editionNumber}
                                                mintedCount={item.mintedCount}
                                                totalEditions={item.totalEditions}
                                                rarity={item.rarity}
                                                fiatCurrency={fiatCurrency}
                                                onPress={() => {
                                                    setGroupModalVisible(false);
                                                    setTimeout(() => handleItemPress(item), 300);
                                                }}
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
                                ))}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </>
    );
}
